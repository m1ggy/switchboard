import { PlansRepository } from '@/db/repositories/plan';
import { UsageRepository } from '@/db/repositories/usage';
import { UsersRepository } from '@/db/repositories/users';
import Stripe from 'stripe';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';
const stripe = new Stripe(process.env.STRIPE_API_KEY as string);

export const subscriptionRouter = t.router({
  subscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await UsersRepository.findByFirebaseUid(ctx.user.uid);
    if (!user) return null;

    const subscription = await stripe.subscriptions.list({
      customer: user.stripe_customer_id as string,
    });
    const userSub = subscription.data[0];
    return userSub.status;
  }),

  getUsageStatistics: protectedProcedure.query(async ({ ctx }) => {
    return await UsageRepository.getCurrentMonthTotalsByUser(ctx.user.uid);
  }),

  getPlanUsageLimits: protectedProcedure.query(async ({ ctx }) => {
    const userInfo = await UsersRepository.findByFirebaseUid(ctx.user.uid);
    if (!userInfo) return [];
    const userPlan = await PlansRepository.findByPlanName(
      userInfo.selected_plan as string
    );
    if (!userPlan) return [];

    const usageLimits = (
      await PlansRepository.getUsageLimitsByPlanId(userPlan.id as string)
    )?.map((plan) => ({
      ...plan,
      included_quantity: parseInt(plan.included_quantity.split('.')[0], 10),
    }));

    return usageLimits;
  }),

  // NEW: get the current plan's features
  getPlanFeatures: protectedProcedure.query(async ({ ctx }) => {
    const userInfo = await UsersRepository.findByFirebaseUid(ctx.user.uid);
    if (!userInfo) return [];
    const userPlan = await PlansRepository.findByPlanName(
      userInfo.selected_plan as string
    );
    if (!userPlan) return [];

    const features = await PlansRepository.getFeaturesByPlanId(
      userPlan.id as string
    );
    return features; // [{ id, key, name, description }]
  }),

  getBillingSummary: protectedProcedure.query(async ({ ctx }) => {
    const user = await UsersRepository.findByFirebaseUid(ctx.user.uid);
    if (!user?.stripe_customer_id) return null;

    // --- 1) Resolve the correct subscription
    let sub: Stripe.Subscription | null = null;

    if (user.stripe_subscription_id) {
      try {
        sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id, {
          expand: ['latest_invoice.payment_intent'],
        });
      } catch {
        sub = null; // fall back to listing below if the stored ID is stale
      }
    }

    if (!sub) {
      // list subscriptions and pick the best candidate
      const all = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        status: 'all',
        limit: 100,
        expand: ['data.latest_invoice.payment_intent'],
      });

      const subs = all.data;

      // exclude incomplete & incomplete_expired from "current" selection
      const usable = subs.filter(
        (s) => s.status !== 'incomplete' && s.status !== 'incomplete_expired'
      );

      // helper to score statuses
      const scoreStatus = (s: Stripe.Subscription['status']) => {
        switch (s) {
          case 'active':
            return 100;
          case 'trialing':
            return 90;
          case 'past_due':
            return 80;
          case 'unpaid':
            return 70;
          case 'canceled':
            return 10;
          default:
            return 0;
        }
      };

      // pick highest score; tie-breaker: most recent (created desc)
      usable.sort((a, b) => {
        const sb = scoreStatus(b.status) - scoreStatus(a.status);
        if (sb !== 0) return sb;
        return (b.created ?? 0) - (a.created ?? 0);
      });

      sub = usable[0] ?? null;
    }

    // --- 2) Customer + default payment method
    const customer = (await stripe.customers.retrieve(
      user.stripe_customer_id
    )) as Stripe.Customer;

    const defaultPmId =
      (customer.invoice_settings?.default_payment_method as string) || null;

    // List card payment methods
    const pms = await stripe.paymentMethods.list({
      customer: user.stripe_customer_id,
      type: 'card',
    });

    const normalizePm = (pm: Stripe.PaymentMethod) => ({
      id: pm.id,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      exp_month: pm.card?.exp_month ?? null,
      exp_year: pm.card?.exp_year ?? null,
      is_default: pm.id === defaultPmId,
    });

    // --- 3) Optional: outstanding invoice (open or uncollectible)
    let outstanding_invoice: null | {
      id: string;
      status: string | null;
      amount_due: number;
      currency: string;
      hosted_invoice_url: string | null;
      created: string | null;
    } = null;

    const openInvs = await stripe.invoices.list({
      customer: user.stripe_customer_id,
      status: 'open',
      limit: 1,
    });
    let inv = openInvs.data[0] ?? null;

    if (!inv) {
      const uncollectible = await stripe.invoices.list({
        customer: user.stripe_customer_id,
        status: 'uncollectible',
        limit: 1,
      });
      inv = uncollectible.data[0] ?? null;
    }

    if (inv) {
      outstanding_invoice = {
        id: inv.id,
        status: inv.status ?? null,
        amount_due: inv.amount_due ?? 0,
        currency: inv.currency,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        created: inv.created
          ? new Date(inv.created * 1000).toISOString()
          : null,
      };
    }

    // --- 4) Shape response
    return {
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            // correct: use current_period_end (seconds) -> ISO
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            // optional: expose cancel_at (when set as a timestamp)
            cancel_at: sub.cancel_at
              ? new Date(sub.cancel_at * 1000).toISOString()
              : null,
            price_id: (sub.items.data[0]?.price?.id ?? null) as string | null,
            plan_name: user.selected_plan ?? null,
          }
        : null,
      payment_methods: pms.data.map(normalizePm),
      default_payment_method_id: defaultPmId,
      outstanding_invoice, // optional helper for UI gating
    };
  }),

  // Cancel subscription: at period end (default) or immediately
  /** Cancel subscription (schedule at period end by default, or immediately).
   *  Handles incomplete/incomplete_expired so the client can react accordingly. */
  cancelSubscription: protectedProcedure
    .input(z.object({ immediately: z.boolean().optional().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const user = await UsersRepository.findByFirebaseUid(ctx.user!.uid);
      if (!user?.stripe_customer_id || !user?.stripe_subscription_id) {
        return { ok: false, reason: 'NO_SUBSCRIPTION' } as const;
      }

      const sub = await stripe.subscriptions.retrieve(
        user.stripe_subscription_id,
        {
          expand: ['latest_invoice.payment_intent'],
        }
      );

      // Stripe forbids updating incomplete_expired
      if (sub.status === 'incomplete_expired') {
        await UsersRepository.updateByStripeCustomerId(
          user.stripe_customer_id,
          {
            subscription_status: 'incomplete_expired',
          }
        );
        return {
          ok: false,
          reason: 'INCOMPLETE_EXPIRED_REACTIVATE',
          message:
            'This subscription cannot be updated. Start a new subscription.',
        } as const;
      }

      // If incomplete, they must pay first (show hosted invoice if available)
      if (sub.status === 'incomplete') {
        const hostedUrl =
          typeof sub.latest_invoice !== 'string'
            ? (sub.latest_invoice?.hosted_invoice_url ?? null)
            : null;
        return {
          ok: false,
          reason: 'INCOMPLETE_REQUIRES_PAYMENT',
          hosted_invoice_url: hostedUrl,
          message:
            'Payment is required before you can cancel or change the subscription.',
        } as const;
      }

      // Already canceled? return current state
      if (sub.status === 'canceled') {
        await UsersRepository.updateByStripeCustomerId(
          user.stripe_customer_id,
          {
            subscription_status: sub.status,
            plan_ends_at: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : new Date().toISOString(),
          }
        );
        return {
          ok: true,
          noop: true,
          subscription: {
            id: sub.id,
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          },
        } as const;
      }

      // Immediate cancellation
      if (input.immediately) {
        const canceled = await stripe.subscriptions.cancel(sub.id);

        await UsersRepository.updateByStripeCustomerId(
          user.stripe_customer_id,
          {
            subscription_status: canceled.status,
            plan_ends_at: canceled.current_period_end
              ? new Date(canceled.current_period_end * 1000).toISOString()
              : new Date().toISOString(),
          }
        );

        return {
          ok: true,
          subscription: {
            id: canceled.id,
            status: canceled.status,
            cancel_at_period_end: canceled.cancel_at_period_end,
            current_period_end: canceled.current_period_end
              ? new Date(canceled.current_period_end * 1000).toISOString()
              : null,
          },
        } as const;
      }

      // Schedule at period end
      if (sub.cancel_at_period_end) {
        // already scheduled
        return {
          ok: true,
          already: true,
          subscription: {
            id: sub.id,
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          },
        } as const;
      }

      const updated = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });

      console.log('UPDATED: ', JSON.stringify(updated, null, 2));

      await UsersRepository.updateByStripeCustomerId(user.stripe_customer_id, {
        subscription_status: updated.status,
        plan_ends_at: updated.current_period_end
          ? new Date(updated.current_period_end * 1000).toISOString()
          : (user.plan_ends_at ?? null),
      });

      return {
        ok: true,
        subscription: {
          id: updated.id,
          status: updated.status,
          cancel_at_period_end: updated.cancel_at_period_end,
          current_period_end: updated.current_period_end
            ? new Date(updated.current_period_end * 1000).toISOString()
            : null,
        },
      } as const;
    }),

  /** Resume a subscription that’s set to cancel at period end.
   *  Handles incomplete/incomplete_expired edge-cases gracefully. */
  resumeSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await UsersRepository.findByFirebaseUid(ctx.user!.uid);
    if (!user?.stripe_customer_id || !user?.stripe_subscription_id) {
      return { ok: false, reason: 'NO_SUBSCRIPTION' } as const;
    }

    // Get live state
    const sub = await stripe.subscriptions.retrieve(
      user.stripe_subscription_id,
      {
        expand: ['latest_invoice.payment_intent'],
      }
    );

    // Cannot update these: must create a new subscription via Checkout
    if (sub.status === 'incomplete_expired') {
      await UsersRepository.updateByStripeCustomerId(user.stripe_customer_id, {
        subscription_status: 'incomplete_expired',
      });
      return {
        ok: false,
        reason: 'INCOMPLETE_EXPIRED_REACTIVATE',
        message:
          'Subscription expired during signup. Create a new subscription.',
      } as const;
    }

    // Needs payment to activate
    if (sub.status === 'incomplete') {
      const hostedUrl =
        typeof sub.latest_invoice !== 'string'
          ? (sub.latest_invoice?.hosted_invoice_url ?? null)
          : null;
      return {
        ok: false,
        reason: 'INCOMPLETE_REQUIRES_PAYMENT',
        hosted_invoice_url: hostedUrl,
        message: 'Payment is required to activate this subscription.',
      } as const;
    }

    // Normal resume
    if (sub.cancel_at_period_end) {
      const updated = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: false,
      });

      await UsersRepository.updateByStripeCustomerId(user.stripe_customer_id, {
        subscription_status: updated.status,
        plan_ends_at: updated.current_period_end
          ? new Date(updated.current_period_end * 1000).toISOString()
          : (user.plan_ends_at ?? null),
      });

      return {
        ok: true,
        subscription: {
          id: updated.id,
          status: updated.status,
          cancel_at_period_end: updated.cancel_at_period_end,
          current_period_end: updated.current_period_end
            ? new Date(updated.current_period_end * 1000).toISOString()
            : null,
        },
      } as const;
    }

    // Nothing to resume
    return {
      ok: false,
      reason: 'NOT_CANCEL_AT_PERIOD_END',
      message: 'Subscription is not scheduled to cancel; nothing to resume.',
    } as const;
  }),
});

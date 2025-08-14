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

    // Subscription
    const subs = await stripe.subscriptions.list({
      customer: user.stripe_customer_id,
      status: 'all',
      limit: 1,
    });
    const sub = subs.data[0] ?? null;

    // Customer + default payment method
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

    return {
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: sub.cancel_at
              ? new Date(sub.cancel_at * 1000).toISOString()
              : null,
            price_id: (sub.items.data[0]?.price?.id ?? null) as string | null,
            plan_name: user.selected_plan ?? null,
          }
        : null,
      payment_methods: pms.data.map(normalizePm),
      default_payment_method_id: defaultPmId,
    };
  }),

  // Cancel subscription: at period end (default) or immediately
  cancelSubscription: protectedProcedure
    .input(z.object({ immediately: z.boolean().optional().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const user = await UsersRepository.findByFirebaseUid(ctx.user.uid);
      if (!user?.stripe_customer_id || !user?.stripe_subscription_id) {
        throw new Error('No active subscription found');
      }

      let updated: Stripe.Subscription;
      if (input.immediately) {
        // Immediate cancellation (prorations depend on your Stripe settings)
        updated = await stripe.subscriptions.cancel(
          user.stripe_subscription_id
        );
      } else {
        // Cancel at period end
        updated = await stripe.subscriptions.update(
          user.stripe_subscription_id,
          {
            cancel_at_period_end: true,
          }
        );
      }

      // Reflect in your DB
      await UsersRepository.updateByStripeCustomerId(user.stripe_customer_id, {
        stripe_subscription_id: updated.id,
        subscription_status: updated.status, // 'active' with cancel_at_period_end=true, or 'canceled'
        plan_ends_at: updated.canceled_at
          ? new Date(updated.canceled_at * 1000).toISOString()
          : undefined,
      });

      return {
        id: updated.id,
        status: updated.status,
        cancel_at_period_end: updated.cancel_at_period_end,
        current_period_end: updated.canceled_at
          ? new Date(updated.canceled_at * 1000).toISOString()
          : null,
      };
    }),

  // Optional: resume if previously set to cancel_at_period_end
  resumeSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await UsersRepository.findByFirebaseUid(ctx.user.uid);
    if (!user?.stripe_subscription_id)
      throw new Error('No subscription to resume');

    const updated = await stripe.subscriptions.update(
      user.stripe_subscription_id,
      {
        cancel_at_period_end: false,
      }
    );

    await UsersRepository.updateByStripeCustomerId(user.stripe_customer_id!, {
      subscription_status: updated.status,
      plan_ends_at: updated.canceled_at
        ? new Date(updated.canceled_at * 1000).toISOString()
        : undefined,
    });

    return {
      id: updated.id,
      status: updated.status,
      cancel_at_period_end: updated.cancel_at_period_end,
      current_period_end: updated.canceled_at
        ? new Date(updated.canceled_at * 1000).toISOString()
        : null,
    };
  }),
});

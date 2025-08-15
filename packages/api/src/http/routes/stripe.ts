import { PlansRepository } from '@/db/repositories/plan';
import { UsageRepository } from '@/db/repositories/usage';
import { PlanUsageLimitsRepository } from '@/db/repositories/usage_limits';
import { UsersRepository } from '@/db/repositories/users';
import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_API_KEY!);

// Centralize how we persist subscription -> Users row
async function saveFromSubscription(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;
  const startedAt = sub.start_date
    ? new Date(sub.start_date * 1000).toISOString()
    : null;

  // Optional: capture active price id (first item)
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;

  // Optional: map price -> plan name in your DB
  // const plan = priceId ? await PlansRepository.findByStripePriceId(priceId) : null;

  await UsersRepository.updateByStripeCustomerId(customerId, {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    plan_started_at: startedAt ?? undefined,
    plan_ends_at: currentPeriodEnd ?? undefined,
    // persist cancel flag so your banner/UI is correct
    cancel_at_period_end: sub.cancel_at_period_end,
    // selected_plan: plan?.name ?? undefined, // <-- enable if you want to sync plan from price
    // last_price_id: priceId ?? undefined,    // <-- or store price id if you keep it
  });
}

async function stripeWebhookRoutes(app: FastifyInstance) {
  app.post('/webhook', async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string;
    const rawBody = await req.rawBody();

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return reply.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }

    switch (event.type) {
      // 🔵 Reactivation via Checkout lands here first
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;

        // If we got a sub id, fetch it and persist
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['latest_invoice.payment_intent'],
          });
          await saveFromSubscription(sub);
        } else if (customerId) {
          // Fallback: pull latest sub for the customer
          const list = await stripe.subscriptions.list({
            customer: customerId,
            status: 'all',
            limit: 1,
            expand: ['data.latest_invoice.payment_intent'],
          });
          if (list.data[0]) await saveFromSubscription(list.data[0]);
        }

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await saveFromSubscription(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const currentPeriodEndISO = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : new Date().toISOString();

        await UsersRepository.updateByStripeCustomerId(customerId, {
          stripe_subscription_id: undefined, // sub is gone
          subscription_status: 'canceled',
          plan_ends_at: currentPeriodEndISO,
          cancel_at_period_end: false,
        });
        break;
      }

      // When invoices get paid, subscriptions typically become 'active'
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subId = invoice.subscription as string | null;

        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await saveFromSubscription(sub);
        } else {
          // No sub on invoice? keep it light: just mark status if you want
          await UsersRepository.updateByStripeCustomerId(customerId, {
            subscription_status: 'active',
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        await UsersRepository.updateByStripeCustomerId(customerId, {
          subscription_status: 'past_due',
        });
        break;
      }

      // ⚠️ Your overage builder (kept as-is, with two tiny nits below)
      case 'invoice.upcoming': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const user = await UsersRepository.findByStripeCustomerId(customerId);
        if (!user) return reply.status(204).send();

        const userPlan = await PlansRepository.findByPlanName(
          user.selected_plan
        );
        if (!userPlan) return reply.status(204).send();

        const periodStart = invoice.period_start;
        const periodEnd = invoice.period_end;
        if (!periodStart || !periodEnd) return reply.status(204).send();
        const periodKey = `${periodStart}-${periodEnd}`;

        const usage = await UsageRepository.getCurrentMonthTotalsByUser(
          user.user_id
        );
        const usedSms = Number(usage?.sms ?? 0);
        const usedMinutes = Number(usage?.call ?? 0);
        const usedFax = Number(usage?.fax ?? 0);

        const planLimits =
          (await PlanUsageLimitsRepository.findByPlanWithOverages(
            userPlan.id
          )) as Array<{
            metric_key: 'sms_sent' | 'minutes_combined' | 'fax_pages';
            included_quantity: string | number;
          }>;

        const toInt = (v: string | number | null | undefined) =>
          Number.isFinite(v)
            ? Number(v)
            : parseInt(String(v ?? '0').split('.')[0], 10) || 0;

        const limits = new Map<string, number>();
        for (const r of planLimits ?? [])
          limits.set(r.metric_key, toInt(r.included_quantity));

        const overSms = Math.max(0, usedSms - (limits.get('sms_sent') ?? 0));
        const overMin = Math.max(
          0,
          usedMinutes - (limits.get('minutes_combined') ?? 0)
        );
        const overFax = Math.max(0, usedFax - (limits.get('fax_pages') ?? 0));

        if (overSms === 0 && overMin === 0 && overFax === 0) {
          return reply.status(200).send({ received: true });
        }

        // Idempotency: skip if we already added items for this period
        const pending = await stripe.invoiceItems.list({
          customer: customerId,
          pending: true,
          limit: 100,
        });
        const already = new Set(
          pending.data
            .filter((li) => li.metadata?.overage_for_period === periodKey)
            .map((li) => li.metadata?.overage_type)
        );

        // Map: plan name + metric -> Stripe price id (your env map)
        let OVERAGE_PRICE_IDS: Record<
          string,
          Record<'sms' | 'minutes' | 'fax', string | undefined>
        > = {};

        if (process.env.NODE_ENV === 'development') {
          OVERAGE_PRICE_IDS = {
            starter: {
              minutes: 'price_1RvEvSR329ZHknhOpBk9kaGK',
              sms: 'price_1RvEuDR329ZHknhOxTEm4Bih',
              fax: undefined,
            },
            professional: {
              minutes: 'price_1RvEyoR329ZHknhOVKxfYjea',
              sms: 'price_1RvExtR329ZHknhOB3oDXsev',
              fax: undefined,
            },
            business: {
              minutes: 'price_1RvFBWR329ZHknhOCsF9pIi4',
              sms: 'price_1RvFArR329ZHknhO5wc0k1wE',
              fax: 'price_1RvFDSR329ZHknhObb59lG0G',
            },
          };
        } else {
          OVERAGE_PRICE_IDS = {
            starter: {
              minutes: 'price_1RvbYRJamzSiZX3vtrzzUzNx',
              sms: 'price_1RvbY2JamzSiZX3vKzYjn4xx',
              fax: undefined,
            },
            professional: {
              minutes: 'price_1RvbZFJamzSiZX3vtJC8RKCz',
              sms: 'price_1RvbYuJamzSiZX3v3gj6NjR8',
              fax: undefined,
            },
            business: {
              minutes: 'price_1Rvba5JamzSiZX3vxQ0jpdpm',
              sms: 'price_1RvbZgJamzSiZX3ve8Nz2QlN',
              fax: 'price_1RvbahJamzSiZX3viMztTk3p',
            },
          };
        }

        const priceMap =
          OVERAGE_PRICE_IDS[userPlan.name as keyof typeof OVERAGE_PRICE_IDS] ||
          {};

        const createOverageLine = async (
          overageType: 'sms' | 'minutes' | 'fax',
          qty: number,
          label: string
        ) => {
          if (qty <= 0) return;
          if (already.has(overageType)) return;

          const price = priceMap[overageType];
          if (!price) {
            console.warn(
              `Missing price ID for ${userPlan.name} ${overageType} overage`
            );
            return;
          }

          // NOTE: In recent Stripe API versions you set `price` at top-level, not `pricing:{price}`
          await stripe.invoiceItems.create({
            customer: customerId,
            pricing: {
              price,
            },
            quantity: qty,
            description: `Overage: ${qty} ${label}`,
            metadata: {
              overage: 'true',
              overage_type: overageType,
              overage_for_period: periodKey,
              period_start: String(periodStart),
              period_end: String(periodEnd),
              user_id: String(user.user_id),
              plan_id: String(userPlan.id),
              plan_name: String(userPlan.name),
            },
          });
        };

        await createOverageLine('sms', overSms, 'SMS');
        await createOverageLine('minutes', overMin, 'call minutes');
        await createOverageLine('fax', overFax, 'fax pages');

        return reply.status(200).send({ received: true });
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return reply.status(200).send({ received: true });
  });
}

export default stripeWebhookRoutes;

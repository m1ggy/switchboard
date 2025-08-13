import { PlansRepository } from '@/db/repositories/plan';
import { UsageRepository } from '@/db/repositories/usage';
import { PlanUsageLimitsRepository } from '@/db/repositories/usage_limits';
import { UsersRepository } from '@/db/repositories/users';
import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_API_KEY!);

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

    // ✅ Handle event types
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;

        const customerId = subscription.customer as string;
        const currentPeriodEnd = (
          subscription as Stripe.Subscription & { current_period_end: string }
        ).current_period_end as unknown as number;

        await UsersRepository.updateByStripeCustomerId(customerId, {
          stripe_subscription_id: subscription.id,
          subscription_status: subscription.status,
          plan_started_at: new Date(
            subscription.start_date * 1000
          ).toISOString(),
          plan_ends_at: new Date(currentPeriodEnd * 1000).toISOString(),
        });

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const currentPeriodEnd = (
          subscription as Stripe.Subscription & { current_period_end: string }
        ).current_period_end as unknown as number;
        await UsersRepository.updateByStripeCustomerId(customerId, {
          stripe_subscription_id: undefined,
          subscription_status: 'canceled',
          plan_ends_at: new Date(currentPeriodEnd * 1000).toISOString(),
        });

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

      case 'invoice.upcoming': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const user = await UsersRepository.findByStripeCustomerId(customerId);
        if (!user) return reply.status(204).send();

        const userPlan = await PlansRepository.findByPlanName(
          user.selected_plan
        );
        if (!userPlan) return reply.status(204).send();

        // Stripe billing window (unix seconds)
        const periodStart = invoice.period_start;
        const periodEnd = invoice.period_end;
        if (!periodStart || !periodEnd) return reply.status(204).send();
        const periodKey = `${periodStart}-${periodEnd}`;

        // Usage (replace with a windowed method later to align exactly with Stripe periods)
        const usage = await UsageRepository.getCurrentMonthTotalsByUser(
          user.user_id
        );
        const usedSms = Number(usage?.sms ?? 0);
        const usedMinutes = Number(usage?.call ?? 0);
        const usedFax = Number(usage?.fax ?? 0); // 0 if you don't track fax yet

        // Limits (with metric keys matching your schema)
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

        // Map: plan name + metric -> Stripe price id
        let OVERAGE_PRICE_IDS: Record<
          string,
          Record<'sms' | 'minutes' | 'fax', string | undefined>
        > = {};

        if (process.env.NODE_ENV === 'development') {
          OVERAGE_PRICE_IDS = {
            starter: {
              minutes: 'price_1RvEvSR329ZHknhOpBk9kaGK', // Starter Calls
              sms: 'price_1RvEuDR329ZHknhOxTEm4Bih', // Starter SMS
              fax: undefined, // no fax overage for Starter
            },
            professional: {
              minutes: 'price_1RvEyoR329ZHknhOVKxfYjea', // Pro Calls
              sms: 'price_1RvExtR329ZHknhOB3oDXsev', // Pro SMS
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
              minutes: 'price_1RvbYRJamzSiZX3vtrzzUzNx', // Starter Calls
              sms: 'price_1RvbY2JamzSiZX3vKzYjn4xx', // Starter SMS
              fax: undefined, // no fax overage for Starter
            },
            professional: {
              minutes: 'price_1RvbZFJamzSiZX3vtJC8RKCz', // Pro Calls
              sms: 'price_1RvbYuJamzSiZX3v3gj6NjR8', // Pro SMS
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

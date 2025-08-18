import { PlansRepository } from '@/db/repositories/plan';
import { UsageRepository } from '@/db/repositories/usage';
import { PlanUsageLimitsRepository } from '@/db/repositories/usage_limits';
import { UsersRepository } from '@/db/repositories/users';
import { FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_API_KEY!);

// ---------- helpers ----------

function toISO(sec?: number | null) {
  return sec ? new Date(sec * 1000).toISOString() : null;
}

function toInt(v: string | number | null | undefined) {
  return Number.isFinite(v)
    ? Number(v)
    : parseInt(String(v ?? '0').split('.')[0], 10) || 0;
}

function isPreferredStatus(status: Stripe.Subscription.Status) {
  return status === 'active' || status === 'trialing';
}

function newer(first?: number | null, second?: number | null) {
  return (first ?? 0) > (second ?? 0);
}

/**
 * Choose the "best" subscription from a list:
 *   1) active/trialing, newest by created
 *   2) otherwise newest by created
 */
function pickBestSubscription(
  list: Stripe.Subscription[]
): Stripe.Subscription | undefined {
  const good = list.filter((s) => isPreferredStatus(s.status));
  const pool = good.length ? good : list;
  return pool.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
}

/**
 * Write the user row from a subscription, but DO NOT let an older/other subscription
 * clobber the current one.
 */
async function saveFromSubscription(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;
  const user = await UsersRepository.findByStripeCustomerId(customerId);
  const currentId = user?.stripe_subscription_id ?? null;

  // If we have a different current subscription, only switch when the incoming one
  // is newer and has a preferred status. Otherwise ignore the event.
  if (currentId && currentId !== sub.id) {
    try {
      const current = await stripe.subscriptions.retrieve(currentId);
      const incomingIsNewerAndGood =
        newer(sub.created, current.created) && isPreferredStatus(sub.status);

      if (!incomingIsNewerAndGood) {
        // Ignore noisy/older events from other subs
        return;
      }
      // Optional: enforce single-sub invariant by canceling the old one here.
      // await stripe.subscriptions.cancel(currentId);
    } catch (e) {
      // If the current sub no longer exists (404), proceed with the new one.
    }
  }

  await UsersRepository.updateByStripeCustomerId(customerId, {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    plan_started_at: toISO(sub.start_date) ?? undefined,
    plan_ends_at: toISO(sub.current_period_end) ?? undefined,
    cancel_at_period_end: sub.cancel_at_period_end,
    // selected_plan / last_price_id if you maintain them
  });
}

/** Fallback: find the best subscription for a customer and persist it. */
async function saveBestSubscriptionForCustomer(customerId: string) {
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  });
  const best = pickBestSubscription(list.data);
  if (best) await saveFromSubscription(best);
}

// ---------- webhook ----------

async function stripeWebhookRoutes(app: FastifyInstance) {
  await app.register(fastifyRawBody, {
    field: 'rawBody', // the property on req
    global: false, // only when we opt-in per route
    encoding: false, // false => give me a Buffer
    runFirst: true, // get raw body before any other parser
  });

  app.post('/webhook', { config: { rawBody: true } }, async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string | undefined;
    const raw = (req as any).rawBody as Buffer | undefined;

    if (!sig || !raw) {
      // This is what Stripe was complaining about
      return reply
        .status(400)
        .send('Webhook Error: No webhook payload was provided.');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        raw,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return reply.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }

    switch (event.type) {
      // Reactivation / new purchase via Checkout
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['latest_invoice.payment_intent'],
          });
          await saveFromSubscription(sub);
        } else if (customerId) {
          await saveBestSubscriptionForCustomer(customerId);
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

        // Only clear the user if the deleted sub matches what we currently store.
        const user = await UsersRepository.findByStripeCustomerId(customerId);
        if (user?.stripe_subscription_id === subscription.id) {
          const currentPeriodEndISO =
            toISO(subscription.current_period_end) ?? new Date().toISOString();
          await UsersRepository.updateByStripeCustomerId(customerId, {
            stripe_subscription_id: undefined,
            subscription_status: 'canceled',
            plan_ends_at: currentPeriodEndISO,
            cancel_at_period_end: false,
          });

          // Optional: if there are other active subs, re-persist the best one.
          await saveBestSubscriptionForCustomer(customerId);
        }
        break;
      }

      // Paid → usually means the sub is active; prefer saving the sub state
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subId = invoice.subscription as string | null;

        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await saveFromSubscription(sub);
        } else {
          await saveBestSubscriptionForCustomer(customerId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subId = invoice.subscription as string | null;

        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          // Only downgrade if this event pertains to the stored subscription
          const user = await UsersRepository.findByStripeCustomerId(customerId);
          if (
            !user?.stripe_subscription_id ||
            user.stripe_subscription_id === sub.id
          ) {
            await UsersRepository.updateByStripeCustomerId(customerId, {
              subscription_status: 'past_due',
            });
          }
        } else {
          // No sub on invoice — keep it minimal
          await UsersRepository.updateByStripeCustomerId(customerId, {
            subscription_status: 'past_due',
          });
        }
        break;
      }

      // Overage preview / builder
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

        if (process.env.STRIPE_API_KEY?.includes('test')) {
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

          await stripe.invoiceItems.create({
            customer: customerId,
            price,
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

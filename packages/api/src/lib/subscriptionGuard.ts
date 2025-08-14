import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_API_KEY!);

export type FrozenReason =
  | 'ADMIN_BYPASS'
  | 'OK'
  | 'NO_USER'
  | 'NO_SUBSCRIPTION'
  | 'CANCELED_ENDED'
  | 'INCOMPLETE_EXPIRED'
  | 'UNPAID_ENDED';

export function isExpiredFromDb(user: {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  plan_ends_at?: string | null;
}): FrozenReason {
  if (user?.stripe_customer_id === 'ADMIN') return 'ADMIN_BYPASS';

  const status = (user?.subscription_status ?? '').toLowerCase();
  const endsAt = user?.plan_ends_at ? new Date(user.plan_ends_at).getTime() : 0;
  const now = Date.now();

  if (!user?.stripe_subscription_id && status !== 'trialing') {
    return 'NO_SUBSCRIPTION';
  }

  if (status === 'incomplete_expired') return 'INCOMPLETE_EXPIRED';
  if (status === 'canceled' && endsAt && endsAt < now) return 'CANCELED_ENDED';
  if (status === 'unpaid' && endsAt && endsAt < now) return 'UNPAID_ENDED';

  return 'OK';
}

/** Stripe fallback when DB is missing/stale */
export async function isExpiredFromStripe(user: {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}): Promise<FrozenReason> {
  if (user?.stripe_customer_id === 'ADMIN') return 'ADMIN_BYPASS';
  if (!user?.stripe_customer_id) return 'NO_USER';

  // Prefer retrieving the specific subscription if you store it
  if (user?.stripe_subscription_id) {
    const sub = await stripe.subscriptions.retrieve(
      user.stripe_subscription_id,
      { expand: ['schedule'] }
    );
    return interpretStripeSubscription(sub);
  }

  // Fallback: list latest subscription
  const subs = await stripe.subscriptions.list({
    customer: user.stripe_customer_id,
    limit: 1,
    status: 'all',
  });
  const sub = subs.data[0];
  if (!sub) return 'NO_SUBSCRIPTION';
  return interpretStripeSubscription(sub);
}

function interpretStripeSubscription(sub: Stripe.Subscription): FrozenReason {
  const status = sub.status;
  const ends = sub.current_period_end ? sub.current_period_end * 1000 : 0;
  const endedAt = (sub as any).ended_at ? (sub as any).ended_at * 1000 : 0;
  const now = Date.now();

  if (status === 'incomplete_expired') return 'INCOMPLETE_EXPIRED';
  if (status === 'canceled') {
    // If ended_at exists or current_period_end passed, treat as expired
    if ((endedAt && endedAt < now) || (ends && ends < now))
      return 'CANCELED_ENDED';
  }
  if (status === 'unpaid' && ends && ends < now) return 'UNPAID_ENDED';

  return 'OK';
}

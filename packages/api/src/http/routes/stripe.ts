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

        // Optional: mark subscription status as 'past_due'
        await UsersRepository.updateByStripeCustomerId(customerId, {
          subscription_status: 'past_due',
        });

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return reply.status(200).send({ received: true });
  });
}

export default stripeWebhookRoutes;

import { UsersRepository } from '@/db/repositories/users';
import Stripe from 'stripe';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const stripeRouter = t.router({
  createSetupIntent: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      const STRIPE_API_KEY = process.env.STRIPE_API_KEY;
      if (!STRIPE_API_KEY) throw new Error('Missing Stripe API key');

      const stripeClient = new Stripe(STRIPE_API_KEY);

      // 1. Look for an existing customer by email
      const existingCustomers = await stripeClient.customers.list({
        email: input.email,
        limit: 1,
      });

      let customer = existingCustomers.data[0];

      // 2. Create customer if not found
      if (!customer) {
        customer = await stripeClient.customers.create({
          name: input.name,
          email: input.email,
        });
      }

      // 3. Create setup intent for the customer
      const setupIntent = await stripeClient.setupIntents.create({
        customer: customer.id,
      });

      return {
        clientSecret: setupIntent.client_secret,
        customerId: customer.id,
      };
    }),
  createSubscription: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        paymentMethodId: z.string(),
        priceId: z.string(), // from your Stripe dashboard for that plan
      })
    )
    .mutation(async ({ input, ctx }) => {
      const stripe = new Stripe(process.env.STRIPE_API_KEY!);

      // Attach the payment method to customer (optional, if not already)
      await stripe.paymentMethods.attach(input.paymentMethodId, {
        customer: input.customerId,
      });

      // Set the default payment method for invoices
      await stripe.customers.update(input.customerId, {
        invoice_settings: {
          default_payment_method: input.paymentMethodId,
        },
      });

      // Check for existing subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: input.customerId,
      });

      let subscription = subscriptions.data[0];

      if (!subscription) {
        // Create the subscription
        subscription = await stripe.subscriptions.create({
          customer: input.customerId,
          items: [{ price: input.priceId }],
          expand: ['latest_invoice.payment_intent'],
        });
      }

      await UsersRepository.update(ctx.user.uid, {
        stripe_customer_id: input.customerId,
        stripe_subscription_id: subscription.id,
        plan_started_at: new Date(subscription.start_date * 1000).toISOString(),
        onboarding_step: 4,
      });

      return {
        subscriptionId: subscription.id,
        status: subscription.status,
      };
    }),
});

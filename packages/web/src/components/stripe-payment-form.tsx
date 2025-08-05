// NOTE: This is a secure Stripe Elements-based replacement for your StripePaymentForm

'use client';

import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';
import { Lock } from 'lucide-react';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!);

interface StripePaymentFormProps {
  selectedPlan: string;
  onPaymentMethodChange: (paymentMethodId: string) => void;
}

function StripeElementsForm({
  selectedPlan,
  onPaymentMethodChange,
}: StripePaymentFormProps) {
  const trpc = useTRPC();
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');

  const createSetupIntent = useMutation(
    trpc.stripe.createSetupIntent.mutationOptions()
  );

  const createSubscription = useMutation(
    trpc.stripe.createSubscription.mutationOptions()
  );

  const getPlanPrice = (plan: string) => {
    switch (plan) {
      case 'starter':
        return '$29';
      case 'professional':
        return '$79';
      case 'business':
        return '$99';
      default:
        return '$0';
    }
  };

  const getPriceId = (plan: string) => {
    switch (plan) {
      case 'business':
        return 'price_1RnzeCR329ZHknhO6LKUSMnZ';
      // Add more plan mappings as needed
      default:
        throw new Error('Unsupported plan selected');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);

    try {
      // Create setup intent on submit
      const setupIntentData = await createSetupIntent.mutateAsync({
        name,
        email,
      });
      const clientSecret = setupIntentData.clientSecret;
      const customerId = setupIntentData.customerId;

      const result = await stripe.confirmCardSetup(clientSecret as string, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: {
            name,
            email,
          },
        },
      });

      if (result.error) {
        console.error(result.error.message);
        setLoading(false);
        return;
      }

      const paymentMethodId = result.setupIntent.payment_method as string;
      onPaymentMethodChange(paymentMethodId);

      const priceId = getPriceId(selectedPlan);
      await createSubscription.mutateAsync({
        customerId,
        paymentMethodId,
        priceId,
      });
    } catch (error) {
      console.error('Failed to complete subscription flow:', error);
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Add Payment Method</h2>
        <p className="text-muted-foreground">
          Secure payment processing powered by Stripe.
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Selected Plan:</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="capitalize">
                {selectedPlan}
              </Badge>
              <span className="font-bold">
                {getPlanPrice(selectedPlan)}/month
              </span>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-medium">Card Details</Label>
              <div className="border rounded-md p-3">
                <CardElement options={{ hidePostalCode: true }} />
              </div>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-2 pt-2 border-t">
              <Lock className="w-3 h-3" />
              <span>
                Secured by Stripe. Your payment information is encrypted and
                secure.
              </span>
            </div>
          </CardContent>
        </Card>

        <button
          type="submit"
          disabled={!stripe || loading}
          className="w-full bg-primary text-white p-2 rounded-md"
        >
          {loading ? 'Processing...' : 'Save & Subscribe'}
        </button>

        <div className="text-center text-xs text-muted-foreground">
          <p>You can cancel your subscription at any time.</p>
          <p>No setup fees or hidden charges.</p>
        </div>
      </div>
    </form>
  );
}

export default function SecureStripePaymentForm(props: StripePaymentFormProps) {
  return (
    <Elements stripe={stripePromise}>
      <StripeElementsForm {...props} />
    </Elements>
  );
}

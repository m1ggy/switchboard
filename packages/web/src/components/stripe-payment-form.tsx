'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Lock } from 'lucide-react';
import * as React from 'react';

interface StripePaymentFormProps {
  selectedPlan: string;
  onPaymentMethodChange: (paymentMethod: any) => void;
}

export function StripePaymentForm({
  selectedPlan,
  onPaymentMethodChange,
}: StripePaymentFormProps) {
  const [cardData, setCardData] = React.useState({
    cardNumber: '',
    expiry: '',
    cvc: '',
    cardName: '',
  });
  const [isProcessing, setIsProcessing] = React.useState(false);

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return `${v.substring(0, 2)}/${v.substring(2, 4)}`;
    }
    return v;
  };

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;

    if (field === 'cardNumber') {
      formattedValue = formatCardNumber(value);
    } else if (field === 'expiry') {
      formattedValue = formatExpiry(value);
    } else if (field === 'cvc') {
      formattedValue = value.replace(/[^0-9]/g, '').substring(0, 4);
    }

    setCardData((prev) => ({ ...prev, [field]: formattedValue }));
    onPaymentMethodChange({ ...cardData, [field]: formattedValue });
  };

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

  return (
    <div className="space-y-6">
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
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5" />
              <span className="font-medium">Payment Details</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card Number</Label>
                <Input
                  id="cardNumber"
                  value={cardData.cardNumber}
                  onChange={(e) =>
                    handleInputChange('cardNumber', e.target.value)
                  }
                  placeholder="1234 5678 9012 3456"
                  className="font-mono"
                  maxLength={19}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiry">Expiry Date</Label>
                  <Input
                    id="expiry"
                    value={cardData.expiry}
                    onChange={(e) =>
                      handleInputChange('expiry', e.target.value)
                    }
                    placeholder="MM/YY"
                    className="font-mono"
                    maxLength={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cvc">CVC</Label>
                  <Input
                    id="cvc"
                    value={cardData.cvc}
                    onChange={(e) => handleInputChange('cvc', e.target.value)}
                    placeholder="123"
                    className="font-mono"
                    maxLength={4}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cardName">Cardholder Name</Label>
                <Input
                  id="cardName"
                  value={cardData.cardName}
                  onChange={(e) =>
                    handleInputChange('cardName', e.target.value)
                  }
                  placeholder="John Doe"
                />
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

        <div className="text-center text-xs text-muted-foreground">
          <p>You can cancel your subscription at any time.</p>
          <p>No setup fees or hidden charges.</p>
        </div>
      </div>
    </div>
  );
}

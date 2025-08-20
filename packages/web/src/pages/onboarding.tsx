'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  LoaderCircle,
  Phone,
  Settings,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import StripePaymentForm from '@/components/stripe-payment-form';
import { TwilioNumberSearch } from '@/components/twilio-number-search';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { auth } from '@/lib/firebase';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

const steps = [
  { id: 1, title: 'Welcome', description: 'Get started with Calliya' },
  { id: 2, title: 'Choose Plan', description: 'Select your subscription plan' },
  { id: 3, title: 'Payment Method', description: 'Add your payment details' },
  { id: 4, title: 'Company Setup', description: 'Set up your company' },
  { id: 5, title: 'Features Tour', description: 'Discover key features' },
  { id: 6, title: 'Ready to Go', description: "You're all set!" },
];

export default function Onboarding() {
  const trpc = useTRPC();
  const navigate = useNavigate();

  const { data: user, refetch: refetchUser } = useQuery(
    trpc.users.getUser.queryOptions()
  );
  const { mutateAsync, isPending } = useMutation(
    trpc.onboarding.finishOnboarding.mutationOptions()
  );
  console.log({ user });
  const [currentStep, setCurrentStep] = React.useState(1);
  const [formData, setFormData] = React.useState({
    selectedPlan: '',
    paymentMethod: '',
    companies: [{ companyName: '', selectedNumber: '', id: 1 }],
  });
  const [companyValidationError, setCompanyValidationError] = React.useState<
    string | null
  >(null);

  const progress = (currentStep / steps.length) * 100;

  const handleNext = async () => {
    if (currentStep === 4) {
      const { companies } = formData;
      const nameSet = new Set<string>();
      const numberSet = new Set<string>();

      for (const company of companies) {
        const name = company.companyName.trim().toLowerCase();
        const number = company.selectedNumber.trim();

        if (!name || !number) {
          setCompanyValidationError(
            'All companies must have a name and a number.'
          );
          return;
        }

        if (nameSet.has(name)) {
          setCompanyValidationError(
            `Duplicate company name found: "${company.companyName}"`
          );
          return;
        }

        if (numberSet.has(number)) {
          setCompanyValidationError(
            `Duplicate phone number found: "${company.selectedNumber}"`
          );
          return;
        }

        nameSet.add(name);
        numberSet.add(number);
      }

      // Clear error if all checks pass
      setCompanyValidationError(null);
    }

    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }

    if (currentStep === steps.length) {
      console.log('END ONBOARDING: ', formData);
      await mutateAsync({
        companies: formData.companies.map((company) => ({
          ...company,
          companyNumber: company.selectedNumber,
        })),
      });

      await refetchUser();
      toast.success('Companies created!');
      navigate('/dashboard');
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 2:
        return formData.selectedPlan !== '';
      case 3:
        return formData.paymentMethod !== '';
      case 4: {
        const { companies } = formData;

        const nameSet = new Set<string>();
        const numberSet = new Set<string>();

        for (const company of companies) {
          const name = company.companyName.trim().toLowerCase();
          const number = company.selectedNumber.trim();

          if (!name || !number) return false;
          if (nameSet.has(name)) return false;
          if (numberSet.has(number)) return false;

          nameSet.add(name);
          numberSet.add(number);
        }

        return true;
      }
      default:
        return true;
    }
  };

  const handleCompanyChange = (
    index: number,
    field: 'companyName' | 'selectedNumber',
    value: string
  ) => {
    const updatedCompanies = [...formData.companies];
    updatedCompanies[index][field] = value;
    setFormData((prev) => ({ ...prev, companies: updatedCompanies }));
  };

  const addCompany = () => {
    const newCompany = { companyName: '', selectedNumber: '', id: Date.now() };
    setFormData((prev) => ({
      ...prev,
      companies: [...prev.companies, newCompany],
    }));
  };

  const removeCompany = (index: number) => {
    const updatedCompanies = [...formData.companies];
    updatedCompanies.splice(index, 1);
    setFormData((prev) => ({ ...prev, companies: updatedCompanies }));
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
              <img
                src={`/calliya-logo.png`}
                alt="Calliya"
                className="w-[160px] h-auto object-contain"
              />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Welcome to Calliya</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Let&apos;s get you set up with everything you need to handle
                customer calls efficiently and professionally.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="text-center space-y-2">
                <Phone className="w-8 h-8 mx-auto text-primary" />
                <p className="text-sm font-medium">
                  SMS, Voice and Video Calls
                </p>
              </div>
              <div className="text-center space-y-2">
                <Users className="w-8 h-8 mx-auto text-primary" />
                <p className="text-sm font-medium">Company Switching</p>
              </div>
              <div className="text-center space-y-2">
                <Settings className="w-8 h-8 mx-auto text-primary" />
                <p className="text-sm font-medium">
                  Realtime Notifications (Powered by Slack)
                </p>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Choose Your Plan</h2>
              <p className="text-muted-foreground">
                Select the plan that best fits your team&apos;s needs.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Starter */}
              <Card
                className={`cursor-pointer transition-all ${
                  formData.selectedPlan === 'starter'
                    ? 'ring-2 ring-primary'
                    : ''
                }`}
                onClick={() => handleInputChange('selectedPlan', 'starter')}
              >
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto">
                    <Star className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Starter</h3>
                    <p className="text-2xl font-bold">
                      $29
                      <span className="text-sm font-normal text-muted-foreground">
                        /month
                      </span>
                    </p>
                  </div>
                  <ul className="text-sm space-y-2 text-left">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />1 company
                      profile
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />1 phone number
                      included
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      300 call minutes
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      500 SMS messages
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Slack notifications
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Basic call queuing
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Email support
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Professional */}
              <Card
                className={`cursor-pointer transition-all relative ${
                  formData.selectedPlan === 'professional'
                    ? 'ring-2 ring-primary'
                    : ''
                }`}
                onClick={() =>
                  handleInputChange('selectedPlan', 'professional')
                }
              >
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                  Most Popular
                </Badge>
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto">
                    <Zap className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Professional</h3>
                    <p className="text-2xl font-bold">
                      $59
                      <span className="text-sm font-normal text-muted-foreground">
                        /month
                      </span>
                    </p>
                  </div>
                  <ul className="text-sm space-y-2 text-left">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Up to 3 company profiles
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />3 phone
                      numbers included
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      1,200 call minutes
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      2,000 SMS messages
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      MMS Feature
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Call logs & queuing
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Priority email support
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Business */}
              <Card
                className={`cursor-pointer transition-all ${
                  formData.selectedPlan === 'business'
                    ? 'ring-2 ring-primary'
                    : ''
                }`}
                onClick={() => handleInputChange('selectedPlan', 'business')}
              >
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto">
                    <Crown className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Business</h3>
                    <p className="text-2xl font-bold">
                      $99
                      <span className="text-sm font-normal text-muted-foreground">
                        /month
                      </span>
                    </p>
                  </div>
                  <ul className="text-sm space-y-2 text-left">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Up to 10 company profiles
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      10 phone numbers included
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      3,000 call minutes
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      5,000 SMS messages
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      MMS Feature
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Fax Feature
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Slack integrations
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Call queue per number
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      On-demand support
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Overage & Add-ons Pricing */}
            <Card className="mt-6">
              <CardContent className="p-6 space-y-4">
                <h4 className="text-lg font-semibold">
                  Additional Usage & Add-ons
                </h4>
                <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                  <div>
                    <h5 className="font-medium text-primary">Starter</h5>
                    <p>$0.02/min overage</p>
                    <p>$0.012/SMS overage</p>
                    <p>Extra company: $15/mo</p>
                    <p>Extra number: $1.50/mo</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-primary">Professional</h5>
                    <p>$0.018/min overage</p>
                    <p>$0.010/SMS overage</p>
                    <p>Extra company: $10/mo</p>
                    <p>Extra number: $1.25/mo</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-primary">Business</h5>
                    <p>$0.015/min overage</p>
                    <p>$0.008/SMS overage</p>
                    <p>Extra company: $8/mo</p>
                    <p>Extra number: $1.25/mo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      case 3:
        return (
          <StripePaymentForm
            selectedPlan={formData.selectedPlan}
            onPaymentMethodChange={(paymentMethod) =>
              handleInputChange('paymentMethod', paymentMethod)
            }
            onPaymentDone={handleNext}
          />
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Set Up Your Company</h2>
              <p className="text-muted-foreground">
                Add all the companies you&apos;d like to manage and assign a
                phone number to each.
              </p>
            </div>
            {companyValidationError && (
              <div className="text-sm text-red-500 font-medium">
                {companyValidationError}
              </div>
            )}
            <div className="space-y-4">
              <Accordion type="multiple" className="w-full">
                {formData.companies.map((company, index) => (
                  <AccordionItem
                    value={`company-${company.id}`}
                    key={company.id}
                  >
                    <AccordionTrigger className="text-left text-base font-medium">
                      <div>
                        Company #{index + 1}: {company.companyName || 'Unnamed'}{' '}
                        {company.selectedNumber && (
                          <Badge>{company.selectedNumber}</Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Card className="mt-2">
                        <CardContent className="p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={`companyName-${index}`}>
                              Company Name
                            </Label>
                            {formData.companies.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeCompany(index)}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                          <Input
                            id={`companyName-${index}`}
                            value={company.companyName}
                            onChange={(e) =>
                              handleCompanyChange(
                                index,
                                'companyName',
                                e.target.value
                              )
                            }
                            placeholder="Enter your company name"
                          />
                          <TwilioNumberSearch
                            selectedNumber={company.selectedNumber}
                            onNumberSelect={(number) => {
                              console.log({ number });
                              handleCompanyChange(
                                index,
                                'selectedNumber',
                                number.phoneNumber
                              );
                            }}
                          />
                        </CardContent>
                      </Card>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              <Button
                variant="outline"
                onClick={addCompany}
                disabled={
                  (formData.selectedPlan === 'starter' &&
                    formData.companies.length >= 1) ||
                  (formData.selectedPlan === 'professional' &&
                    formData.companies.length >= 3) ||
                  (formData.selectedPlan === 'business' &&
                    formData.companies.length >= 10)
                }
              >
                + Add Another Company
              </Button>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">You&apos;re All Set!</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Welcome to Calliya! You&apos;re ready to start handling calls
                and providing excellent customer service.
              </p>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Key Features Overview</h2>
              <p className="text-muted-foreground">
                Here are the main features you&apos;ll be using daily.
              </p>
            </div>
            <div className="grid gap-4">
              <Card>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Phone className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold">Call Management</h3>
                    <p className="text-sm text-muted-foreground">
                      Handle incoming calls and manage call efficiently.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold">Inbox Management</h3>
                    <p className="text-sm text-muted-foreground">
                      Handle SMS and voice logs in the inbox{' '}
                      {formData.selectedPlan === 'business' &&
                        '(and manage your fax and MMS too from the inbox!)'}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Settings className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold">Analytics Dashboard</h3>
                    <p className="text-sm text-muted-foreground">
                      Track your performance metrics and call volumes
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-accent flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant={'outline'}
              onClick={() => {
                console.log('SIGNOUT');
                signOut(auth).then(() => navigate('/sign-in'));
              }}
            >
              Sign Out
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">
                {steps[currentStep - 1].title}
              </CardTitle>
              <CardDescription>
                {steps[currentStep - 1].description}
              </CardDescription>
            </div>
            <div className="text-sm text-muted-foreground">
              {currentStep} of {steps.length}
            </div>
          </div>
          <Progress value={progress} className="w-full" />
        </CardHeader>
        <CardContent className="space-y-6">
          {renderStepContent()}
          <div className="flex justify-between pt-4">
            {currentStep < 4 && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 1}
                className="flex items-center gap-2 bg-transparent"
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isPending}
              className="flex items-center gap-2"
            >
              {isPending && <LoaderCircle className="animate-spin h-4 w-4" />}
              {currentStep === steps.length ? 'Get Started' : 'Next'}
              {currentStep !== steps.length && (
                <ArrowRight className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

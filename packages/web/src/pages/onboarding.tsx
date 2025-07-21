'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Phone,
  Settings,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { StripePaymentForm } from '@/components/stripe-payment-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const steps = [
  { id: 1, title: 'Welcome', description: 'Get started with Calliya' },
  { id: 2, title: 'Profile Setup', description: 'Tell us about yourself' },
  { id: 3, title: 'Preferences', description: 'Customize your experience' },
  { id: 4, title: 'Choose Plan', description: 'Select your subscription plan' },
  { id: 5, title: 'Payment Method', description: 'Add your payment details' },
  { id: 6, title: 'Features Tour', description: 'Discover key features' },
  { id: 7, title: 'Ready to Go', description: "You're all set!" },
];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [formData, setFormData] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
    role: '',
    notifications: true,
    autoAnswer: false,
    availability: 'available',
    selectedPlan: '',
    paymentMethod: {
      cardNumber: '',
      expiry: '',
      cvc: '',
      cardName: '',
    },
  });

  const progress = (currentStep / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleInputChange = (field: string, value: string | boolean | any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 4:
        return formData.selectedPlan !== '';
      case 5:
        return (
          formData.paymentMethod &&
          formData.paymentMethod.cardNumber &&
          formData.paymentMethod.expiry &&
          formData.paymentMethod.cvc &&
          formData.paymentMethod.cardName
        );
      default:
        return true;
    }
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
                Let's get you set up with everything you need to handle customer
                calls efficiently and professionally.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="text-center space-y-2">
                <Phone className="w-8 h-8 mx-auto text-primary" />
                <p className="text-sm font-medium">Smart Routing</p>
              </div>
              <div className="text-center space-y-2">
                <Users className="w-8 h-8 mx-auto text-primary" />
                <p className="text-sm font-medium">Team Collaboration</p>
              </div>
              <div className="text-center space-y-2">
                <Settings className="w-8 h-8 mx-auto text-primary" />
                <p className="text-sm font-medium">Custom Settings</p>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Set Up Your Profile</h2>
              <p className="text-muted-foreground">
                Help your team identify you and route calls appropriately.
              </p>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) =>
                      handleInputChange('firstName', e.target.value)
                    }
                    placeholder="Enter your first name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) =>
                      handleInputChange('lastName', e.target.value)
                    }
                    placeholder="Enter your last name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter your work email"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) =>
                      handleInputChange('department', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="support">Customer Support</SelectItem>
                      <SelectItem value="technical">
                        Technical Support
                      </SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="management">Management</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => handleInputChange('role', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="senior-agent">Senior Agent</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Customize Your Preferences</h2>
              <p className="text-muted-foreground">
                Configure your settings to match your workflow.
              </p>
            </div>
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Desktop Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified about incoming calls and messages
                    </p>
                  </div>
                  <Switch
                    checked={formData.notifications}
                    onCheckedChange={(checked) =>
                      handleInputChange('notifications', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Auto-Answer Calls</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically answer incoming calls after 3 rings
                    </p>
                  </div>
                  <Switch
                    checked={formData.autoAnswer}
                    onCheckedChange={(checked) =>
                      handleInputChange('autoAnswer', checked)
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Default Availability Status</Label>
                <Select
                  value={formData.availability}
                  onValueChange={(value) =>
                    handleInputChange('availability', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Available
                      </div>
                    </SelectItem>
                    <SelectItem value="busy">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        Busy
                      </div>
                    </SelectItem>
                    <SelectItem value="away">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                        Away
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Choose Your Plan</h2>
              <p className="text-muted-foreground">
                Select the plan that best fits your team's needs.
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
                      Slack notifications per profile
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

      case 5:
        return (
          <StripePaymentForm
            selectedPlan={formData.selectedPlan}
            onPaymentMethodChange={(paymentMethod) =>
              handleInputChange('paymentMethod', paymentMethod)
            }
          />
        );

      case 6:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Key Features Overview</h2>
              <p className="text-muted-foreground">
                Here are the main features you'll be using daily.
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
                      Handle incoming calls, transfer to colleagues, and manage
                      call queues efficiently.
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
                    <h3 className="font-semibold">Customer Database</h3>
                    <p className="text-sm text-muted-foreground">
                      Access customer information, call history, and notes
                      instantly during calls.
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
                      Track your performance metrics, call volume, and response
                      times.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">You're All Set!</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Welcome to the team, {formData.firstName}! You're ready to start
                handling calls and providing excellent customer service.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold">Your Profile Summary</h3>
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge variant="secondary">{formData.department}</Badge>
                <Badge variant="secondary">{formData.role}</Badge>
                <Badge variant="secondary" className="capitalize">
                  {formData.availability}
                </Badge>
              </div>
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
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="flex items-center gap-2 bg-transparent"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              onClick={handleNext}
              disabled={currentStep === steps.length || !canProceed()}
              className="flex items-center gap-2"
            >
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

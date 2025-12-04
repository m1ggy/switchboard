'use client';

import { getQueryClient } from '@/App';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import useMainStore from '@/lib/store';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Phone,
  User,
} from 'lucide-react';
import { useState } from 'react';

interface SetupFormProps {
  onSubmit?: (data: any) => void;
}

const INITIAL_FORM_STATE = {
  name: '',
  phoneNumber: '',
  callerName: '',
  // NEW: emergency contact
  emergencyContactName: '',
  emergencyContactPhoneNumber: '',
  scriptType: 'template',
  scriptContent: '',
  nameInScript: 'contact',
  frequency: 'daily',
  frequencyDays: 1,
  frequencyTime: '09:00',
  selectedDays: ['monday'],
  callsPerDay: 1,
  maxAttempts: 3,
  template: 'wellness',
  retryInterval: 30,
};

const ALL_DAYS: (
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'
)[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export default function SetupForm({ onSubmit }: SetupFormProps) {
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);

  const trpc = useTRPC();
  const queryClient = getQueryClient();
  const { activeNumber, activeCompany } = useMainStore();
  const companyId = activeCompany?.id as string;

  const { mutateAsync: createSchedule, isPending: isCreating } = useMutation(
    trpc.reassuranceSchedules.createSchedule.mutationOptions()
  );

  const { refetch: refetchSchedules } = useQuery(
    trpc.reassuranceSchedules.getSchedules.queryOptions({ companyId })
  );

  const getScriptTemplates = (
    contactName: string,
    callerName: string,
    nameInScript: string
  ) => {
    const nameToUse = nameInScript === 'contact' ? contactName : callerName;

    return {
      wellness: `Hello ${nameToUse}, I'm calling from the Reassurance Service to check in and make sure you're doing well. How are you feeling today?`,
      safety: `Good morning ${nameToUse}. This is your daily safety check-in. Is everything okay at home? Do you need any assistance?`,
      medication: `Hi ${nameToUse}, just a friendly reminder to take your medication. Have you taken it today?`,
      social: `Hello ${nameToUse}! Just wanted to say hello and see how your day is going. Any news to share?`,
    };
  };

  const frequencyPresets = {
    daily: { label: 'Daily', description: 'Call every day' },
    weekly: { label: 'Weekly', description: 'Weekly Calls' },
    biweekly: { label: 'Bi-weekly', description: 'Bi-Weekly Calls' },
    monthly: { label: 'Monthly', description: 'Monthly Calls' },
    custom: { label: 'Custom', description: 'Set your own schedule' },
  };

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        selectedDays: checked
          ? [...prev.selectedDays, value]
          : prev.selectedDays.filter((d) => d !== value),
      }));
    } else {
      setFormData({ ...formData, [name]: value });
    }
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const validateStep = (stepNum: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (stepNum === 1) {
      if (!formData.name.trim()) newErrors.name = 'Contact name is required';
      if (!formData.phoneNumber.trim())
        newErrors.phoneNumber = 'Phone number is required';
      if (
        formData.phoneNumber &&
        !formData.phoneNumber.match(/^\+?[\d\s\-()]+$/)
      ) {
        newErrors.phoneNumber = 'Please enter a valid phone number';
      }

      // NEW: emergency contact validation
      if (!formData.emergencyContactName.trim()) {
        newErrors.emergencyContactName = 'Emergency contact name is required';
      }
      if (!formData.emergencyContactPhoneNumber.trim()) {
        newErrors.emergencyContactPhoneNumber =
          'Emergency contact phone number is required';
      } else if (
        !formData.emergencyContactPhoneNumber.match(/^\+?[\d\s\-()]+$/)
      ) {
        newErrors.emergencyContactPhoneNumber =
          'Please enter a valid emergency contact phone number';
      }

      if (formData.nameInScript === 'caller' && !formData.callerName.trim()) {
        newErrors.callerName =
          'Caller name is required when using caller name in script';
      }
    } else if (stepNum === 2) {
      if (formData.scriptType === 'custom' && !formData.scriptContent.trim()) {
        newErrors.scriptContent = 'Custom script is required';
      }
    } else if (stepNum === 3) {
      if (formData.frequency === 'custom' && !formData.frequencyDays) {
        newErrors.frequencyDays = 'Please enter number of days';
      }
      if (
        (formData.frequency === 'weekly' ||
          formData.frequency === 'biweekly' ||
          formData.frequency === 'monthly') &&
        formData.selectedDays.length === 0
      ) {
        newErrors.selectedDays = 'Please select at least one day';
      }
      if (!formData.callsPerDay || formData.callsPerDay < 1) {
        newErrors.callsPerDay = 'Calls per day must be at least 1';
      }
      if (!formData.maxAttempts || formData.maxAttempts < 1) {
        newErrors.maxAttempts = 'Retry attempts must be at least 1';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep(step)) return;

    try {
      const payload = {
        companyId: activeCompany?.id as string,
        numberId: activeNumber?.id as string,
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        callerName: formData.callerName || null,

        // NEW: emergency contact fields
        emergencyContactName: formData.emergencyContactName,
        emergencyContactPhoneNumber: formData.emergencyContactPhoneNumber,

        scriptType: formData.scriptType as 'template' | 'custom',
        template:
          formData.scriptType === 'template'
            ? (formData.template as
                | 'wellness'
                | 'safety'
                | 'medication'
                | 'social')
            : null,
        scriptContent:
          formData.scriptType === 'custom' ? formData.scriptContent : null,
        nameInScript: formData.nameInScript as 'contact' | 'caller',

        frequency: formData.frequency as
          | 'daily'
          | 'weekly'
          | 'biweekly'
          | 'monthly'
          | 'custom',
        frequencyDays:
          formData.frequency === 'custom' ? formData.frequencyDays : null,
        frequencyTime: formData.frequencyTime,
        selectedDays:
          formData.frequency === 'daily'
            ? ALL_DAYS
            : formData.frequency === 'weekly' ||
                formData.frequency === 'biweekly' ||
                formData.frequency === 'monthly'
              ? (formData.selectedDays as (
                  | 'monday'
                  | 'tuesday'
                  | 'wednesday'
                  | 'thursday'
                  | 'friday'
                  | 'saturday'
                  | 'sunday'
                )[])
              : null,

        callsPerDay: formData.callsPerDay,
        maxAttempts: formData.maxAttempts,
        retryInterval: parseInt(formData.retryInterval as unknown as string),
      };

      const schedule = await createSchedule(payload);

      await queryClient.invalidateQueries({
        queryKey: trpc.reassuranceSchedules.getSchedules.queryOptions({
          companyId,
        }).queryKey,
      });
      await refetchSchedules();

      toast.success('Reassurance call schedule created');

      if (onSubmit) {
        onSubmit(schedule);
      }

      setFormData(INITIAL_FORM_STATE);
      setStep(1);
      setErrors({});
    } catch (err) {
      console.error(err);
      toast.error('Failed to create reassurance schedule');
    }
  };

  const scriptTemplates = getScriptTemplates(
    formData.name,
    formData.callerName,
    formData.nameInScript
  );

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Set Up New Reassurance Call</CardTitle>
              <CardDescription>
                Step {step} of 4 -{' '}
                {step === 1
                  ? 'Contact Information'
                  : step === 2
                    ? 'Script Selection'
                    : step === 3
                      ? 'Frequency & Retry'
                      : 'Review & Confirm'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${s <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Basic Information */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg flex gap-3">
                  <User className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    Enter the contact details for the person who will receive
                    the reassurance calls and who to contact in case they cannot
                    be reached after repeated attempts.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Contact Name
                  </label>
                  <Input
                    type="text"
                    name="name"
                    placeholder="e.g., Margaret Smith"
                    value={formData.name}
                    onChange={handleChange}
                    className={errors.name ? 'border-red-500' : ''}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Full name of the person to call
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </label>
                  <Input
                    type="tel"
                    name="phoneNumber"
                    placeholder="+1 (555) 123-4567"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    className={errors.phoneNumber ? 'border-red-500' : ''}
                  />
                  {errors.phoneNumber && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.phoneNumber}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Include country code and area code
                  </p>
                </div>

                {/* NEW: emergency contact section */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <p className="text-sm font-medium">
                    Emergency Contact (if the callee cannot be reached after 3
                    retries)
                  </p>

                  <div>
                    <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Emergency Contact Name
                    </label>
                    <Input
                      type="text"
                      name="emergencyContactName"
                      placeholder="e.g., John Smith (son)"
                      value={formData.emergencyContactName}
                      onChange={handleChange}
                      className={
                        errors.emergencyContactName ? 'border-red-500' : ''
                      }
                    />
                    {errors.emergencyContactName && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.emergencyContactName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Emergency Contact Phone
                    </label>
                    <Input
                      type="tel"
                      name="emergencyContactPhoneNumber"
                      placeholder="+1 (555) 987-6543"
                      value={formData.emergencyContactPhoneNumber}
                      onChange={handleChange}
                      className={
                        errors.emergencyContactPhoneNumber
                          ? 'border-red-500'
                          : ''
                      }
                    />
                    {errors.emergencyContactPhoneNumber && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.emergencyContactPhoneNumber}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      This person will be contacted if the primary callee cannot
                      be reached after 3 call retries.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                  <div>
                    <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Caller Name (Optional)
                    </label>
                    <Input
                      type="text"
                      name="callerName"
                      placeholder="e.g., Sarah, Reassurance Team"
                      value={formData.callerName}
                      onChange={handleChange}
                      className={errors.callerName ? 'border-red-500' : ''}
                    />
                    {errors.callerName && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.callerName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Name or identifier for who is making the call (used in
                      script if selected below)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-3">
                      Name to Use in Script
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition">
                        <input
                          type="radio"
                          name="nameInScript"
                          value="contact"
                          checked={formData.nameInScript === 'contact'}
                          onChange={handleChange}
                          className="w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block">
                            Use Contact's Name
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Script will say "Hello {formData.name || 'Margaret'}
                            ..."
                          </span>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition">
                        <input
                          type="radio"
                          name="nameInScript"
                          value="caller"
                          checked={formData.nameInScript === 'caller'}
                          onChange={handleChange}
                          className="w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block">
                            Use Caller's Name
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Script will say "Hello, I'm{' '}
                            {formData.callerName || 'Sarah'}..."
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Script Selection */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg flex gap-3">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    Choose a pre-made script template or create a custom script
                    for your calls.{' '}
                    {formData.nameInScript === 'contact'
                      ? `The contact's name (${formData.name})`
                      : `Your name (${formData.callerName})`}{' '}
                    will be personalized into the script.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Script Type
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition">
                      <input
                        type="radio"
                        name="scriptType"
                        value="template"
                        checked={formData.scriptType === 'template'}
                        onChange={handleChange}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium block">
                          Use Template
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Choose from pre-written reassurance scripts
                        </span>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition">
                      <input
                        type="radio"
                        name="scriptType"
                        value="custom"
                        checked={formData.scriptType === 'custom'}
                        onChange={handleChange}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium block">
                          Custom Script
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Write your own personalized message
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {formData.scriptType === 'template' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Select Template
                    </label>
                    <select
                      name="template"
                      value={formData.template}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    >
                      <option value="wellness">
                        Wellness Check - General well-being
                      </option>
                      <option value="safety">
                        Safety Check-in - Home safety focus
                      </option>
                      <option value="medication">
                        Medication Reminder - Health reminder
                      </option>
                      <option value="social">
                        Social Check-in - Companionship call
                      </option>
                    </select>
                    <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                      <p className="font-medium text-sm mb-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                        Script Preview:
                      </p>
                      <p className="text-sm text-foreground italic">
                        {
                          scriptTemplates[
                            formData.template as keyof typeof scriptTemplates
                          ]
                        }
                      </p>
                    </div>
                  </div>
                )}

                {formData.scriptType === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Your Custom Script
                    </label>
                    <textarea
                      name="scriptContent"
                      placeholder="Enter your custom script. This should be warm, friendly, and concise..."
                      value={formData.scriptContent}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground min-h-[140px] resize-none ${errors.scriptContent ? 'border-red-500' : 'border-border'}`}
                    />
                    {errors.scriptContent && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.scriptContent}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Tip: Keep scripts between 1-2 minutes when read aloud. You
                      can reference{' '}
                      {formData.nameInScript === 'contact'
                        ? `the contact's name: {${formData.name || 'Contact Name'}}`
                        : `the caller's name: {${formData.callerName || 'Caller Name'}}`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Frequency & Retry Settings */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg flex gap-3">
                  <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    Configure how often calls are made and how the system should
                    handle if someone doesn't answer.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Call Frequency
                  </label>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {Object.entries(frequencyPresets).map(([key, value]) => (
                      <label
                        key={key}
                        className={`p-3 border-2 rounded-lg cursor-pointer transition ${formData.frequency === key ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'}`}
                      >
                        <input
                          type="radio"
                          name="frequency"
                          value={key}
                          checked={formData.frequency === key}
                          onChange={handleChange}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium block mt-1">
                          {value.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {value.description}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {formData.frequency === 'daily' && (
                  <div className="p-4 bg-muted rounded-lg space-y-4 border border-border">
                    <h4 className="font-medium text-sm">Call Time</h4>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Preferred Time for Daily Calls
                      </label>
                      <Input
                        type="time"
                        name="frequencyTime"
                        value={formData.frequencyTime}
                        onChange={handleChange}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Calls will be made at this time every day
                      </p>
                    </div>
                  </div>
                )}

                {(formData.frequency === 'weekly' ||
                  formData.frequency === 'biweekly' ||
                  formData.frequency === 'monthly') && (
                  <div className="p-4 bg-muted rounded-lg space-y-4 border border-border">
                    <h4 className="font-medium text-sm">Day Selection</h4>
                    <p className="text-sm text-muted-foreground">
                      Select which day(s) of the week to make calls
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        'monday',
                        'tuesday',
                        'wednesday',
                        'thursday',
                        'friday',
                        'saturday',
                        'sunday',
                      ].map((day) => (
                        <label
                          key={day}
                          className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-background cursor-pointer transition"
                        >
                          <input
                            type="checkbox"
                            name="selectedDays"
                            value={day}
                            checked={formData.selectedDays.includes(day)}
                            onChange={handleChange}
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium capitalize">
                            {day.slice(0, 3)}
                          </span>
                        </label>
                      ))}
                    </div>
                    {errors.selectedDays && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.selectedDays}
                      </p>
                    )}
                    <div>
                      <label className="block text-sm font-medium mb-2 mt-4">
                        Preferred Time
                      </label>
                      <Input
                        type="time"
                        name="frequencyTime"
                        value={formData.frequencyTime}
                        onChange={handleChange}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Calls will be made at this time on selected days
                      </p>
                    </div>
                  </div>
                )}

                {formData.frequency === 'custom' && (
                  <div className="p-4 bg-muted rounded-lg space-y-4 border border-border">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Every X Days
                        </label>
                        <Input
                          type="number"
                          name="frequencyDays"
                          min="1"
                          max="365"
                          value={formData.frequencyDays}
                          onChange={handleChange}
                          className={
                            errors.frequencyDays ? 'border-red-500' : ''
                          }
                        />
                        {errors.frequencyDays && (
                          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.frequencyDays}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          1 = daily, 7 = weekly, 14 = bi-weekly
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Preferred Time
                        </label>
                        <Input
                          type="time"
                          name="frequencyTime"
                          value={formData.frequencyTime}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-4 bg-muted rounded-lg space-y-4 border border-border">
                  <h4 className="font-medium text-sm">Calls Per Day</h4>
                  <div>
                    <label className="block text-sm mb-2">
                      Number of Calls
                    </label>
                    <Input
                      type="number"
                      name="callsPerDay"
                      min="1"
                      max="10"
                      value={formData.callsPerDay}
                      onChange={handleChange}
                      className={errors.callsPerDay ? 'border-red-500' : ''}
                    />
                    {errors.callsPerDay && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.callsPerDay}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      How many times per day to attempt the call (default: 1)
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg space-y-4 border border-border">
                  <h4 className="font-medium text-sm">
                    If No Answer - Retry Settings
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Max Retry Attempts
                      </label>
                      <Input
                        type="number"
                        name="maxAttempts"
                        min="1"
                        max="10"
                        value={formData.maxAttempts}
                        onChange={handleChange}
                        className={errors.maxAttempts ? 'border-red-500' : ''}
                      />
                      {errors.maxAttempts && (
                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {errors.maxAttempts}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Total tries before giving up
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Retry Interval (minutes)
                      </label>
                      <Input
                        type="number"
                        name="retryInterval"
                        min="5"
                        max="120"
                        value={formData.retryInterval}
                        onChange={handleChange}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Wait time between retries
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                  <p className="text-sm text-green-900 dark:text-green-100">
                    <strong>Summary:</strong> Calls will be made{' '}
                    <strong>{formData.frequency}</strong>
                    {(formData.frequency === 'weekly' ||
                      formData.frequency === 'biweekly' ||
                      formData.frequency === 'monthly') &&
                      ` on ${formData.selectedDays
                        .map((d) => d.slice(0, 3).toUpperCase())
                        .join(', ')}`}
                    {formData.frequency === 'daily' &&
                      ` at ${formData.frequencyTime}`}
                    {formData.frequency === 'custom' &&
                      ` every ${formData.frequencyDays} days at ${formData.frequencyTime}`}
                    , with up to <strong>{formData.maxAttempts}</strong>{' '}
                    attempts every <strong>{formData.retryInterval}</strong>{' '}
                    minutes if unanswered.
                  </p>
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    Review your settings before creating the call schedule.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Contact Name
                    </p>
                    <p className="font-semibold text-sm">{formData.name}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Phone Number
                    </p>
                    <p className="font-semibold text-sm font-mono">
                      {formData.phoneNumber}
                    </p>
                  </div>

                  {/* NEW: emergency review */}
                  <div className="p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Emergency Contact Name
                    </p>
                    <p className="font-semibold text-sm">
                      {formData.emergencyContactName}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Emergency Contact Phone
                    </p>
                    <p className="font-semibold text-sm font-mono">
                      {formData.emergencyContactPhoneNumber}
                    </p>
                  </div>

                  {formData.callerName && (
                    <div className="p-4 bg-muted rounded-lg border border-border">
                      <p className="text-xs text-muted-foreground mb-1">
                        Caller Name
                      </p>
                      <p className="font-semibold text-sm">
                        {formData.callerName}
                      </p>
                    </div>
                  )}
                  <div className="p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Script Type
                    </p>
                    <p className="font-semibold text-sm">
                      {formData.scriptType === 'template'
                        ? `${formData.template} Template`
                        : 'Custom Script'}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Frequency
                    </p>
                    {formData.frequency === 'weekly' ||
                    formData.frequency === 'biweekly' ||
                    formData.frequency === 'monthly' ? (
                      <p className="font-semibold text-sm capitalize">
                        {formData.frequency} on{' '}
                        {formData.selectedDays
                          .map((d) => d.slice(0, 3))
                          .join(', ')}
                      </p>
                    ) : (
                      <p className="font-semibold text-sm capitalize">
                        {formData.frequency}
                      </p>
                    )}
                  </div>
                  <div className="p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Call Time
                    </p>
                    <p className="font-semibold text-sm">
                      {formData.frequencyTime}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Max Attempts
                    </p>
                    <p className="font-semibold text-sm">
                      {formData.maxAttempts} retries every{' '}
                      {formData.retryInterval}m
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground mb-2">
                    Script Preview:
                  </p>
                  <p className="text-sm italic text-foreground">
                    {formData.scriptType === 'template'
                      ? scriptTemplates[
                          formData.template as keyof typeof scriptTemplates
                        ]
                      : formData.scriptContent}
                  </p>
                </div>
              </div>
            )}

            {/* Navigation (unchanged) */}
            <div className="flex gap-3 justify-between pt-4 border-t border-border">
              <div>
                {step > 1 && (
                  <Button
                    variant="outline"
                    onClick={() => setStep(step - 1)}
                    type="button"
                    disabled={isCreating}
                  >
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                {step < 4 ? (
                  <Button
                    onClick={handleNext}
                    type="button"
                    disabled={isCreating}
                  >
                    Next
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setStep(3)}
                      type="button"
                      disabled={isCreating}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="bg-primary text-primary-foreground"
                      disabled={isCreating}
                    >
                      {isCreating ? 'Creating...' : 'Create Call Schedule'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

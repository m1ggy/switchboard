'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Phone,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface EditDialogProps {
  call: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

const defaultFormData = {
  name: '',
  phoneNumber: '',
  callerName: '',
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

export default function EditDialog({
  call,
  isOpen,
  onClose,
  onSave,
}: EditDialogProps) {
  console.log({ call });

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<any>(defaultFormData);

  // Sync incoming call data into the form whenever dialog opens / call changes
  useEffect(() => {
    if (isOpen) {
      if (call) {
        setFormData({ ...defaultFormData, ...call });
      } else {
        setFormData(defaultFormData);
      }
      setStep(1);
      setErrors({});
    }
  }, [call, isOpen]);

  const handleClose = () => {
    setStep(1);
    setErrors({});
    onClose();
  };

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
    weekly: { label: 'Weekly', description: 'Call once per week' },
    biweekly: { label: 'Bi-weekly', description: 'Call every 2 weeks' },
    monthly: { label: 'Monthly', description: 'Call once per month' },
    custom: { label: 'Custom', description: 'Set your own schedule' },
  };

  if (!isOpen) return null;

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setFormData((prev: any) => ({
        ...prev,
        selectedDays: checked
          ? [...prev.selectedDays, value]
          : prev.selectedDays.filter((d: string) => d !== value),
      }));
    } else {
      setFormData((prev: any) => ({ ...prev, [name]: value }));
    }
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
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
      setStep((prev) => prev + 1);
    }
  };

  const handleSave = () => {
    if (validateStep(4)) {
      onSave(formData);
      handleClose();
    }
  };

  const scriptTemplates = getScriptTemplates(
    formData.name,
    formData.callerName,
    formData.nameInScript
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="sticky top-0 bg-background border-b flex items-center justify-between flex-row">
          <div>
            <CardTitle>Edit Call Schedule</CardTitle>
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
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Step 1: Basic Information */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg flex gap-3">
                <User className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  Edit the contact details for this reassurance call.
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
              </div>

              <div className="space-y-4 pt-4 border-t border-border">
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Caller Name
                  </label>
                  <Input
                    type="text"
                    name="callerName"
                    placeholder="e.g., Sarah"
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
                  Modify the script for this call.
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
                    placeholder="Enter your custom script..."
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
                  Update the call frequency and retry settings.
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
                  <Input
                    type="time"
                    name="frequencyTime"
                    value={formData.frequencyTime}
                    onChange={handleChange}
                  />
                </div>
              )}

              {(formData.frequency === 'weekly' ||
                formData.frequency === 'biweekly' ||
                formData.frequency === 'monthly') && (
                <div className="p-4 bg-muted rounded-lg space-y-4 border border-border">
                  <h4 className="font-medium text-sm">Day Selection</h4>
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
                          {day}
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.selectedDays && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.selectedDays}
                    </p>
                  )}
                </div>
              )}

              <div className="p-4 bg-muted rounded-lg space-y-4 border border-border">
                <h4 className="font-medium text-sm">Retry Settings</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Calls Per Day
                    </label>
                    <Input
                      type="number"
                      name="callsPerDay"
                      min="1"
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
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Max Retry Attempts
                    </label>
                    <Input
                      type="number"
                      name="maxAttempts"
                      min="1"
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
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Retry Interval (minutes)
                  </label>
                  <Input
                    type="number"
                    name="retryInterval"
                    min="5"
                    value={formData.retryInterval}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-900 dark:text-green-100">
                  Review your changes before saving.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-border rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    Contact Name
                  </p>
                  <p className="text-sm font-medium">{formData.name}</p>
                </div>
                <div className="p-4 border border-border rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    Phone Number
                  </p>
                  <p className="text-sm font-medium">{formData.phoneNumber}</p>
                </div>
                <div className="p-4 border border-border rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    Script Type
                  </p>
                  <p className="text-sm font-medium">
                    {formData.scriptType === 'template'
                      ? formData.template
                      : 'Custom'}
                  </p>
                </div>
                <div className="p-4 border border-border rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    Frequency
                  </p>
                  <p className="text-sm font-medium">
                    {formData.frequency === 'daily'
                      ? `${formData.frequency} @ ${formData.frequencyTime}`
                      : formData.frequency}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-3 mt-8 pt-6 border-t border-border">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((prev) => prev - 1)}
              >
                Back
              </Button>
            )}
            {step < 4 && (
              <Button type="button" onClick={handleNext} className="ml-auto">
                Next
              </Button>
            )}
            {step === 4 && (
              <Button type="button" onClick={handleSave} className="ml-auto">
                Save Changes
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

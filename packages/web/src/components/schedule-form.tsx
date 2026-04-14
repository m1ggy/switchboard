'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { scheduleSchema } from '@/lib/schemas';
import { AlertCircle } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { ZodError, type z } from 'zod';

const frequencies = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'custom',
] as const;

const scriptTypes = ['template', 'custom'] as const;
const templates = ['wellness', 'safety', 'medication', 'social'] as const;

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const frequencyHelpText: Record<(typeof frequencies)[number], string> = {
  daily: 'Calls happen every day at the selected time.',
  weekly: 'Calls happen on the selected days every week.',
  biweekly: 'Calls happen every 2 weeks on the selected days.',
  monthly: 'Calls happen every 30 days at the selected time.',
  custom: 'Calls happen every N days at the selected time.',
};

type ScheduleFormSubmitData = z.infer<typeof scheduleSchema> & {
  company_id: string;
  number_id: string;
  template?: 'wellness' | 'safety' | 'medication' | 'social' | null;
};

interface ScheduleFormProps {
  contactId: string;
  companyId: string;
  numberId: string;
  initialData?: Partial<ScheduleFormSubmitData>;
  onSubmit: (data: ScheduleFormSubmitData) => void;
  onCancel?: () => void;
}

export default function ScheduleForm({
  contactId,
  companyId,
  numberId,
  initialData,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    contact_id: contactId,
    company_id: companyId,
    number_id: numberId,

    name: initialData?.name || '',
    caller_name: initialData?.caller_name || '',

    script_type: (initialData?.script_type || 'template') as
      | 'template'
      | 'custom',

    template: (initialData?.template || 'wellness') as
      | 'wellness'
      | 'safety'
      | 'medication'
      | 'social',

    script_content: initialData?.script_content || '',
    name_in_script: (initialData?.name_in_script || 'contact') as
      | 'contact'
      | 'caller',

    frequency: (initialData?.frequency || 'weekly') as
      | 'daily'
      | 'weekly'
      | 'biweekly'
      | 'monthly'
      | 'custom',

    frequency_days: initialData?.frequency_days ?? 7,
    frequency_time: initialData?.frequency_time || '10:00',

    selected_days: (initialData?.selected_days?.length
      ? initialData.selected_days.map(
          (d) => d.charAt(0).toUpperCase() + d.slice(1)
        )
      : ['Monday', 'Wednesday', 'Friday']) as (typeof days)[number][],

    calls_per_day: initialData?.calls_per_day || 1,
    max_attempts: initialData?.max_attempts || 3,
    retry_interval: initialData?.retry_interval || 15,

    emergency_contact_name: initialData?.emergency_contact_name || '',
    emergency_contact_phone: initialData?.emergency_contact_phone || '',

    is_active:
      initialData?.is_active !== undefined ? initialData.is_active : true,
  });

  const clearError = (field: string) => {
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const hasErrors = Object.values(errors).some(Boolean);

  const showDayPicker = useMemo(() => {
    return ['weekly', 'biweekly'].includes(formData.frequency);
  }, [formData.frequency]);

  const showCustomDays = useMemo(() => {
    return formData.frequency === 'custom';
  }, [formData.frequency]);

  const toggleDay = (day: (typeof days)[number]) => {
    setFormData((prev) => ({
      ...prev,
      selected_days: prev.selected_days.includes(day)
        ? prev.selected_days.filter((d) => d !== day)
        : [...prev.selected_days, day],
    }));
    clearError('selected_days');
  };

  const buildPayload = (): ScheduleFormSubmitData => {
    const should_send_selected_days = ['weekly', 'biweekly'].includes(
      formData.frequency
    );

    const computed_frequency_days =
      formData.frequency === 'custom'
        ? (formData.frequency_days ?? null)
        : formData.frequency === 'monthly'
          ? 30
          : null;

    return {
      contact_id: formData.contact_id,
      company_id: formData.company_id,
      number_id: formData.number_id,

      name: formData.name,
      caller_name: formData.caller_name || null,

      script_type: formData.script_type,
      template: formData.script_type === 'template' ? formData.template : null,
      script_content:
        formData.script_type === 'custom' ? formData.script_content : null,

      name_in_script: formData.name_in_script,

      frequency: formData.frequency,
      frequency_days: computed_frequency_days,
      frequency_time: formData.frequency_time,

      selected_days: should_send_selected_days
        ? formData.selected_days.map((d) => d.toLowerCase())
        : null,

      calls_per_day: formData.calls_per_day,
      max_attempts: formData.max_attempts,
      retry_interval: formData.retry_interval,

      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,

      is_active: formData.is_active,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const payload = buildPayload();

      const validated = scheduleSchema.parse({
        contact_id: payload.contact_id,
        name: payload.name,
        caller_name: payload.caller_name,
        script_type: payload.script_type,
        template: payload.template,
        script_content: payload.script_content,
        name_in_script: payload.name_in_script,
        frequency: payload.frequency,
        frequency_days: payload.frequency_days,
        frequency_time: payload.frequency_time,
        selected_days: payload.selected_days,
        calls_per_day: payload.calls_per_day,
        max_attempts: payload.max_attempts,
        retry_interval: payload.retry_interval,
        emergency_contact_name: payload.emergency_contact_name,
        emergency_contact_phone: payload.emergency_contact_phone,
        is_active: payload.is_active,
      });

      onSubmit({
        ...validated,
        company_id: payload.company_id,
        number_id: payload.number_id,
        template: payload.template,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach((error) => {
          const fieldName = error.path.join('.');
          fieldErrors[fieldName] = error.message;
        });

        setErrors(fieldErrors);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2"
    >
      {hasErrors && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>Please fix the errors below</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Schedule Name</Label>
          <Input
            id="name"
            placeholder="e.g., Weekly Check-in"
            value={formData.name}
            aria-invalid={!!errors.name}
            className={
              errors.name
                ? 'border-destructive focus-visible:ring-destructive'
                : ''
            }
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, name: e.target.value }));
              clearError('name');
            }}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="callerName">Caller Name</Label>
          <Input
            id="callerName"
            placeholder="Name of person making calls"
            value={formData.caller_name}
            aria-invalid={!!errors.caller_name}
            className={
              errors.caller_name
                ? 'border-destructive focus-visible:ring-destructive'
                : ''
            }
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, caller_name: e.target.value }));
              clearError('caller_name');
            }}
          />
          {errors.caller_name && (
            <p className="text-sm text-destructive">{errors.caller_name}</p>
          )}
        </div>
      </div>

      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-4">Script Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Script Type</Label>
            <Select
              value={formData.script_type}
              onValueChange={(value: 'template' | 'custom') => {
                setFormData((prev) => ({
                  ...prev,
                  script_type: value,
                  template:
                    value === 'template'
                      ? prev.template || 'wellness'
                      : prev.template,
                  script_content: value === 'custom' ? prev.script_content : '',
                }));
                clearError('script_type');
                clearError('template');
                clearError('script_content');
              }}
            >
              <SelectTrigger
                className={
                  errors.script_type
                    ? 'border-destructive focus:ring-destructive'
                    : ''
                }
              >
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {scriptTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.script_type && (
              <p className="text-sm text-destructive">{errors.script_type}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Name Usage in Script</Label>
            <Select
              value={formData.name_in_script}
              onValueChange={(value: 'contact' | 'caller') => {
                setFormData((prev) => ({ ...prev, name_in_script: value }));
                clearError('name_in_script');
              }}
            >
              <SelectTrigger
                className={
                  errors.name_in_script
                    ? 'border-destructive focus:ring-destructive'
                    : ''
                }
              >
                <SelectValue placeholder="Select usage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contact">Contact Name</SelectItem>
                <SelectItem value="caller">Caller Name</SelectItem>
              </SelectContent>
            </Select>
            {errors.name_in_script && (
              <p className="text-sm text-destructive">
                {errors.name_in_script}
              </p>
            )}
          </div>
        </div>

        {formData.script_type === 'template' && (
          <div className="space-y-2 mt-4">
            <Label>Template</Label>
            <Select
              value={formData.template}
              onValueChange={(
                value: 'wellness' | 'safety' | 'medication' | 'social'
              ) => {
                setFormData((prev) => ({ ...prev, template: value }));
                clearError('template');
              }}
            >
              <SelectTrigger
                className={
                  errors.template
                    ? 'border-destructive focus:ring-destructive'
                    : ''
                }
              >
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template} value={template}>
                    {template.charAt(0).toUpperCase() + template.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.template && (
              <p className="text-sm text-destructive">{errors.template}</p>
            )}
          </div>
        )}

        {formData.script_type === 'custom' && (
          <div className="space-y-2 mt-4">
            <Label htmlFor="script_content">Custom Script</Label>
            <Textarea
              id="script_content"
              rows={5}
              placeholder="Write the custom script that should be used for this schedule..."
              value={formData.script_content}
              aria-invalid={!!errors.script_content}
              className={
                errors.script_content
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  script_content: e.target.value,
                }));
                clearError('script_content');
              }}
            />
            {errors.script_content && (
              <p className="text-sm text-destructive">
                {errors.script_content}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-1">Schedule Frequency</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {frequencyHelpText[formData.frequency]}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select
              value={formData.frequency}
              onValueChange={(
                value: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom'
              ) => {
                setFormData((prev) => ({
                  ...prev,
                  frequency: value,
                  frequency_days:
                    value === 'custom' ? prev.frequency_days || 7 : 7,
                }));
                clearError('frequency');
                clearError('frequency_days');
                clearError('selected_days');
              }}
            >
              <SelectTrigger
                className={
                  errors.frequency
                    ? 'border-destructive focus:ring-destructive'
                    : ''
                }
              >
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {frequencies.map((freq) => (
                  <SelectItem key={freq} value={freq}>
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.frequency && (
              <p className="text-sm text-destructive">{errors.frequency}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Time of Day</Label>
            <Input
              type="time"
              value={formData.frequency_time}
              aria-invalid={!!errors.frequency_time}
              className={
                errors.frequency_time
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  frequency_time: e.target.value,
                }));
                clearError('frequency_time');
              }}
            />
            {errors.frequency_time && (
              <p className="text-sm text-destructive">
                {errors.frequency_time}
              </p>
            )}
          </div>
        </div>

        {showCustomDays && (
          <div className="space-y-2 mt-4">
            <Label>Days Between Calls</Label>
            <Input
              type="number"
              min="1"
              value={formData.frequency_days}
              aria-invalid={!!errors.frequency_days}
              className={
                errors.frequency_days
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  frequency_days: Number.parseInt(e.target.value || '0', 10),
                }));
                clearError('frequency_days');
              }}
            />
            {errors.frequency_days && (
              <p className="text-sm text-destructive">
                {errors.frequency_days}
              </p>
            )}
          </div>
        )}

        {showDayPicker && (
          <div className="space-y-3 mt-4">
            <Label>Select Days</Label>

            <div
              className={
                errors.selected_days
                  ? 'rounded-md border border-destructive p-3'
                  : ''
              }
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {days.map((day) => (
                  <label
                    key={day}
                    className="flex items-center space-x-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.selected_days.includes(day)}
                      onChange={() => toggleDay(day)}
                      className="w-4 h-4 rounded border-border"
                    />
                    <span className="text-sm">{day.slice(0, 3)}</span>
                  </label>
                ))}
              </div>
            </div>

            {errors.selected_days && (
              <p className="text-sm text-destructive">{errors.selected_days}</p>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-4">Call Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Calls Per Day</Label>
            <Input
              type="number"
              min="1"
              value={formData.calls_per_day}
              aria-invalid={!!errors.calls_per_day}
              className={
                errors.calls_per_day
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  calls_per_day: Number.parseInt(e.target.value || '0', 10),
                }));
                clearError('calls_per_day');
              }}
            />
            {errors.calls_per_day && (
              <p className="text-sm text-destructive">{errors.calls_per_day}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Max Attempts</Label>
            <Input
              type="number"
              min="1"
              value={formData.max_attempts}
              aria-invalid={!!errors.max_attempts}
              className={
                errors.max_attempts
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  max_attempts: Number.parseInt(e.target.value || '0', 10),
                }));
                clearError('max_attempts');
              }}
            />
            {errors.max_attempts && (
              <p className="text-sm text-destructive">{errors.max_attempts}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Retry Interval (minutes)</Label>
            <Input
              type="number"
              min="1"
              value={formData.retry_interval}
              aria-invalid={!!errors.retry_interval}
              className={
                errors.retry_interval
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  retry_interval: Number.parseInt(e.target.value || '0', 10),
                }));
                clearError('retry_interval');
              }}
            />
            {errors.retry_interval && (
              <p className="text-sm text-destructive">
                {errors.retry_interval}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-4">Emergency Contact</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Emergency Contact Name</Label>
            <Input
              value={formData.emergency_contact_name}
              aria-invalid={!!errors.emergency_contact_name}
              className={
                errors.emergency_contact_name
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  emergency_contact_name: e.target.value,
                }));
                clearError('emergency_contact_name');
              }}
            />
            {errors.emergency_contact_name && (
              <p className="text-sm text-destructive">
                {errors.emergency_contact_name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Emergency Contact Phone</Label>
            <Input
              type="tel"
              value={formData.emergency_contact_phone}
              aria-invalid={!!errors.emergency_contact_phone}
              className={
                errors.emergency_contact_phone
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  emergency_contact_phone: e.target.value,
                }));
                clearError('emergency_contact_phone');
              }}
            />
            {errors.emergency_contact_phone && (
              <p className="text-sm text-destructive">
                {errors.emergency_contact_phone}
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex items-center space-x-2">
        <input
          id="is_active"
          type="checkbox"
          checked={formData.is_active}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, is_active: e.target.checked }));
            clearError('is_active');
          }}
          className="w-4 h-4 rounded border-border"
        />
        <Label htmlFor="is_active" className="cursor-pointer">
          Schedule is Active
        </Label>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading} className="w-full md:w-auto">
          {loading ? 'Saving...' : 'Review & Continue'}
        </Button>
      </div>
    </form>
  );
}

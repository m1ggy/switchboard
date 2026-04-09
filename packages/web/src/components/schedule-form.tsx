'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { scheduleSchema } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AlertCircle, CalendarIcon } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { ZodError } from 'zod';

const frequencies = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'custom',
] as const;

const scriptTypes = ['template', 'custom'] as const;

const templates = [
  'wellness',
  'safety',
  'medication',
  'social',
  'appointment',
] as const;

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const appointmentTimezones = [
  { label: 'Eastern Time (ET)', value: 'America/New_York' },
  { label: 'Central Time (CT)', value: 'America/Chicago' },
  { label: 'Mountain Time (MT)', value: 'America/Denver' },
  { label: 'Mountain Time (MT)', value: 'America/Phoenix' },
  { label: 'Pacific Time (PT)', value: 'America/Los_Angeles' },
  { label: 'Alaska Time (AKT)', value: 'America/Anchorage' },
  { label: 'Hawaii Time (HST)', value: 'Pacific/Honolulu' },
] as const;

const reminderOffsets = [
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '2 hours before', value: 120 },
  { label: '1 day before', value: 1440 },
] as const;

const frequencyHelpText: Record<(typeof frequencies)[number], string> = {
  daily: 'Calls happen every day at the selected time.',
  weekly: 'Calls happen on the selected days every week.',
  biweekly: 'Calls happen every 2 weeks on the selected days.',
  monthly: 'Calls happen every 30 days at the selected time.',
  custom: 'Calls happen every N days at the selected time.',
};

interface ScheduleFormProps {
  contactId: string;
  numberId: string;
  initialData?: Partial<any>;
  onSubmit: (data: any) => void;
  onCancel?: () => void;
}

function getDatePart(dateTime?: string) {
  if (!dateTime) return undefined;

  const [datePart] = dateTime.split('T');
  if (!datePart) return undefined;

  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return undefined;

  return new Date(year, month - 1, day);
}

function getTimePart(dateTime?: string) {
  if (!dateTime) return '';
  if (!dateTime.includes('T')) return '';
  return dateTime.split('T')[1]?.slice(0, 5) || '';
}

function combineDateAndTime(date?: Date, time?: string) {
  if (!date || !time) return '';

  const [hours, minutes] = time.split(':').map(Number);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(hours || 0).padStart(2, '0');
  const mm = String(minutes || 0).padStart(2, '0');

  return `${year}-${month}-${day}T${hh}:${mm}`;
}

function parseLocalDateTime(dateTime?: string) {
  if (!dateTime || !dateTime.includes('T')) return null;

  const [datePart, timePart] = dateTime.split('T');
  if (!datePart || !timePart) return null;

  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);

  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function formatReminderDateTime(
  appointmentDateTime?: string,
  offsetMinutes?: number
) {
  const parsed = parseLocalDateTime(appointmentDateTime);
  if (!parsed || offsetMinutes === undefined || Number.isNaN(offsetMinutes)) {
    return '';
  }

  const reminderDate = new Date(parsed.getTime() - offsetMinutes * 60 * 1000);
  return format(reminderDate, 'PPP p');
}

export default function ScheduleForm({
  contactId,
  numberId,
  initialData,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initialAppointmentDateTime =
    initialData?.appointmentDetails?.appointment_datetime || '';

  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(
    getDatePart(initialAppointmentDateTime)
  );

  const [appointmentTime, setAppointmentTime] = useState(
    getTimePart(initialAppointmentDateTime)
  );

  const [formData, setFormData] = useState({
    contact_id: contactId,
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
      | 'social'
      | 'appointment',

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
      ? initialData.selected_days
      : ['Monday', 'Wednesday', 'Friday']) as (typeof days)[number][],
    calls_per_day: initialData?.calls_per_day || 1,
    max_attempts: initialData?.max_attempts || 3,
    retry_interval: initialData?.retry_interval || 15,

    emergency_contact_name: initialData?.emergency_contact_name || '',
    emergency_contact_phone: initialData?.emergency_contact_phone || '',

    is_active:
      initialData?.is_active !== undefined ? initialData.is_active : true,

    appointmentDetails: {
      appointment_title:
        initialData?.appointmentDetails?.appointment_title || '',
      appointment_datetime: initialAppointmentDateTime,
      appointment_timezone:
        initialData?.appointmentDetails?.appointment_timezone ||
        'America/Chicago',
      provider_name: initialData?.appointmentDetails?.provider_name || '',
      provider_phone: initialData?.appointmentDetails?.provider_phone || '',
      location_name: initialData?.appointmentDetails?.location_name || '',
      location_address: initialData?.appointmentDetails?.location_address || '',
      notes: initialData?.appointmentDetails?.notes || '',
      reminder_offset_minutes:
        initialData?.appointmentDetails?.reminder_offset_minutes ?? 60,
      requires_confirmation:
        initialData?.appointmentDetails?.requires_confirmation ?? true,
    },
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

  const showAppointmentFields = useMemo(() => {
    return (
      formData.script_type === 'template' && formData.template === 'appointment'
    );
  }, [formData.script_type, formData.template]);

  const computedAppointmentDateTime = useMemo(() => {
    return combineDateAndTime(appointmentDate, appointmentTime);
  }, [appointmentDate, appointmentTime]);

  const computedReminderTimeLabel = useMemo(() => {
    return formatReminderDateTime(
      computedAppointmentDateTime,
      formData.appointmentDetails.reminder_offset_minutes
    );
  }, [
    computedAppointmentDateTime,
    formData.appointmentDetails.reminder_offset_minutes,
  ]);

  const toggleDay = (day: (typeof days)[number]) => {
    setFormData((prev) => ({
      ...prev,
      selected_days: prev.selected_days.includes(day)
        ? prev.selected_days.filter((d) => d !== day)
        : [...prev.selected_days, day],
    }));
    clearError('selected_days');
  };

  const buildPayload = () => {
    const should_send_selected_days =
      !showAppointmentFields &&
      ['weekly', 'biweekly'].includes(formData.frequency);

    const computed_frequency_days = showAppointmentFields
      ? null
      : formData.frequency === 'custom'
        ? (formData.frequency_days ?? null)
        : formData.frequency === 'monthly'
          ? 30
          : null;

    return {
      contact_id: formData.contact_id,
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
        : [],

      calls_per_day: formData.calls_per_day,
      max_attempts: formData.max_attempts,
      retry_interval: formData.retry_interval,

      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,

      is_active: formData.is_active,

      appointmentDetails: showAppointmentFields
        ? {
            appointment_title:
              formData.appointmentDetails.appointment_title || '',
            appointment_datetime: computedAppointmentDateTime,
            appointment_timezone:
              formData.appointmentDetails.appointment_timezone || '',
            provider_name: formData.appointmentDetails.provider_name || null,
            provider_phone: formData.appointmentDetails.provider_phone || null,
            location_name: formData.appointmentDetails.location_name || null,
            location_address:
              formData.appointmentDetails.location_address || null,
            notes: formData.appointmentDetails.notes || null,
            reminder_offset_minutes:
              formData.appointmentDetails.reminder_offset_minutes,
            requires_confirmation:
              formData.appointmentDetails.requires_confirmation,
          }
        : null,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const payload = buildPayload();
      const validated = scheduleSchema.parse(payload);
      onSubmit(validated);
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

      <Card className="bg-muted/50 p-4">
        <h3 className="mb-4 font-semibold">Script Settings</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Script Type</Label>
            <Select
              value={formData.script_type}
              onValueChange={(value: any) => {
                setFormData((prev) => ({
                  ...prev,
                  script_type: value,
                }));
                clearError('script_type');
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
          </div>

          {formData.script_type === 'template' && (
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={formData.template}
                onValueChange={(value: any) => {
                  setFormData((prev) => ({
                    ...prev,
                    template: value,
                  }));
                  clearError('template');
                  clearError('appointmentDetails');
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

          <div className="space-y-2">
            <Label>Name Usage in Script</Label>
            <Select
              value={formData.name_in_script}
              onValueChange={(value: any) => {
                setFormData((prev) => ({ ...prev, name_in_script: value }));
                clearError('name_in_script');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select usage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contact">Contact Name</SelectItem>
                <SelectItem value="caller">Caller Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {formData.script_type === 'custom' && (
          <div className="mt-4 space-y-2">
            <Label>Custom Script</Label>
            <textarea
              className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={formData.script_content}
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

      {showAppointmentFields && (
        <>
          <Card className="bg-muted/50 p-4">
            <h3 className="mb-4 font-semibold">Appointment Details</h3>

            {errors.appointmentDetails && (
              <p className="mb-3 text-sm text-destructive">
                {errors.appointmentDetails}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Appointment Title</Label>
                <Input
                  value={formData.appointmentDetails.appointment_title}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      appointmentDetails: {
                        ...prev.appointmentDetails,
                        appointment_title: e.target.value,
                      },
                    }));
                    clearError('appointmentDetails.appointment_title');
                  }}
                />
                {errors['appointmentDetails.appointment_title'] && (
                  <p className="text-sm text-destructive">
                    {errors['appointmentDetails.appointment_title']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Appointment Timezone</Label>
                <Select
                  value={formData.appointmentDetails.appointment_timezone}
                  onValueChange={(value) => {
                    setFormData((prev) => ({
                      ...prev,
                      appointmentDetails: {
                        ...prev.appointmentDetails,
                        appointment_timezone: value,
                      },
                    }));
                    clearError('appointmentDetails.appointment_timezone');
                  }}
                >
                  <SelectTrigger
                    className={
                      errors['appointmentDetails.appointment_timezone']
                        ? 'border-destructive focus:ring-destructive'
                        : ''
                    }
                  >
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {appointmentTimezones.map((tz) => (
                      <SelectItem
                        key={`${tz.value}-${tz.label}`}
                        value={tz.value}
                      >
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors['appointmentDetails.appointment_timezone'] && (
                  <p className="text-sm text-destructive">
                    {errors['appointmentDetails.appointment_timezone']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Appointment Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !appointmentDate && 'text-muted-foreground',
                        errors['appointmentDetails.appointment_datetime'] &&
                          'border-destructive'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {appointmentDate
                        ? format(appointmentDate, 'PPP')
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={appointmentDate}
                      onSelect={(date) => {
                        setAppointmentDate(date);
                        clearError('appointmentDetails.appointment_datetime');
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Appointment Time</Label>
                <Input
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => {
                    setAppointmentTime(e.target.value);
                    clearError('appointmentDetails.appointment_datetime');
                  }}
                  className={
                    errors['appointmentDetails.appointment_datetime']
                      ? 'border-destructive focus-visible:ring-destructive'
                      : ''
                  }
                />
                {errors['appointmentDetails.appointment_datetime'] && (
                  <p className="text-sm text-destructive">
                    {errors['appointmentDetails.appointment_datetime']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Reminder Offset</Label>
                <Select
                  value={String(
                    formData.appointmentDetails.reminder_offset_minutes
                  )}
                  onValueChange={(value) => {
                    setFormData((prev) => ({
                      ...prev,
                      appointmentDetails: {
                        ...prev.appointmentDetails,
                        reminder_offset_minutes: Number(value),
                      },
                    }));
                    clearError('appointmentDetails.reminder_offset_minutes');
                  }}
                >
                  <SelectTrigger
                    className={
                      errors['appointmentDetails.reminder_offset_minutes']
                        ? 'border-destructive focus:ring-destructive'
                        : ''
                    }
                  >
                    <SelectValue placeholder="Select reminder timing" />
                  </SelectTrigger>
                  <SelectContent>
                    {reminderOffsets.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={String(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors['appointmentDetails.reminder_offset_minutes'] && (
                  <p className="text-sm text-destructive">
                    {errors['appointmentDetails.reminder_offset_minutes']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Requires Confirmation</Label>
                <Select
                  value={
                    formData.appointmentDetails.requires_confirmation
                      ? 'yes'
                      : 'no'
                  }
                  onValueChange={(value) => {
                    setFormData((prev) => ({
                      ...prev,
                      appointmentDetails: {
                        ...prev.appointmentDetails,
                        requires_confirmation: value === 'yes',
                      },
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Provider Name</Label>
                <Input
                  value={formData.appointmentDetails.provider_name}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      appointmentDetails: {
                        ...prev.appointmentDetails,
                        provider_name: e.target.value,
                      },
                    }));
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Provider Phone</Label>
                <Input
                  type="tel"
                  value={formData.appointmentDetails.provider_phone}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      appointmentDetails: {
                        ...prev.appointmentDetails,
                        provider_phone: e.target.value,
                      },
                    }));
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Location Name</Label>
                <Input
                  value={formData.appointmentDetails.location_name}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      appointmentDetails: {
                        ...prev.appointmentDetails,
                        location_name: e.target.value,
                      },
                    }));
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Location Address</Label>
                <Input
                  value={formData.appointmentDetails.location_address}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      appointmentDetails: {
                        ...prev.appointmentDetails,
                        location_address: e.target.value,
                      },
                    }));
                  }}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Label>Notes</Label>
              <textarea
                className="min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={formData.appointmentDetails.notes}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    appointmentDetails: {
                      ...prev.appointmentDetails,
                      notes: e.target.value,
                    },
                  }));
                }}
              />
            </div>
          </Card>

          <Card className="bg-muted/50 p-4">
            <h3 className="mb-1 font-semibold">Reminder Schedule</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              This reminder is based on the appointment date and reminder
              offset.
            </p>

            <div className="space-y-2">
              <Label>Reminder Will Be Sent At</Label>
              <div className="rounded-md border bg-background px-3 py-2 text-sm">
                {computedReminderTimeLabel ||
                  'Select appointment date and time'}
              </div>
            </div>
          </Card>
        </>
      )}

      {!showAppointmentFields && (
        <Card className="bg-muted/50 p-4">
          <h3 className="mb-1 font-semibold">Schedule Frequency</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {frequencyHelpText[formData.frequency]}
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={formData.frequency}
                onValueChange={(value: any) => {
                  setFormData((prev) => {
                    const next = { ...prev, frequency: value };

                    if (value === 'custom') {
                      next.frequency_days = 7;
                    }

                    return next;
                  });
                  clearError('frequency');
                }}
              >
                <SelectTrigger>
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
            <div className="mt-4 space-y-2">
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
                    frequency_days: Number.parseInt(e.target.value || '0'),
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
            <div className="mt-4 space-y-3">
              <Label>Select Days</Label>

              <div
                className={
                  errors.selected_days
                    ? 'rounded-md border border-destructive p-3'
                    : ''
                }
              >
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {days.map((day) => (
                    <label
                      key={day}
                      className="flex cursor-pointer items-center space-x-2"
                    >
                      <input
                        type="checkbox"
                        checked={formData.selected_days.includes(day)}
                        onChange={() => toggleDay(day)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span className="text-sm">{day.slice(0, 3)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {errors.selected_days && (
                <p className="text-sm text-destructive">
                  {errors.selected_days}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="bg-muted/50 p-4">
        <h3 className="mb-4 font-semibold">Call Settings</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Calls Per Day</Label>
            <Input
              type="number"
              min="1"
              value={formData.calls_per_day}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  calls_per_day: Number.parseInt(e.target.value || '0'),
                }));
                clearError('calls_per_day');
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Max Attempts</Label>
            <Input
              type="number"
              min="1"
              value={formData.max_attempts}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  max_attempts: Number.parseInt(e.target.value || '0'),
                }));
                clearError('max_attempts');
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Retry Interval (minutes)</Label>
            <Input
              type="number"
              min="1"
              value={formData.retry_interval}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  retry_interval: Number.parseInt(e.target.value || '0'),
                }));
                clearError('retry_interval');
              }}
            />
          </div>
        </div>
      </Card>

      <Card className="bg-muted/50 p-4">
        <h3 className="mb-4 font-semibold">Emergency Contact</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Emergency Contact Name</Label>
            <Input
              value={formData.emergency_contact_name}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  emergency_contact_name: e.target.value,
                }));
                clearError('emergency_contact_name');
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Emergency Contact Phone</Label>
            <Input
              type="tel"
              value={formData.emergency_contact_phone}
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  emergency_contact_phone: e.target.value,
                }));
                clearError('emergency_contact_phone');
              }}
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={formData.is_active}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, is_active: e.target.checked }));
            clearError('is_active');
          }}
          className="h-4 w-4 rounded border-border"
        />
        <Label className="cursor-pointer">Schedule is Active</Label>
      </div>

      <div className="flex justify-end gap-2">
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

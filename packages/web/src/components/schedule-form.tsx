'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { scheduleSchema } from '@/lib/schemas';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const TIMEZONES = [
  { label: 'Eastern (ET)', value: 'America/New_York' },
  { label: 'Central (CT)', value: 'America/Chicago' },
  { label: 'Mountain (MT)', value: 'America/Denver' },
  { label: 'Mountain – AZ (MT)', value: 'America/Phoenix' },
  { label: 'Pacific (PT)', value: 'America/Los_Angeles' },
  { label: 'Alaska (AKT)', value: 'America/Anchorage' },
  { label: 'Hawaii (HST)', value: 'Pacific/Honolulu' },
] as const;

const REMINDER_OFFSETS = [
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '2 hours before', value: 120 },
  { label: '1 day before', value: 1440 },
] as const;

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  wellness: 'Warm check-in asking how they feel today. Up to 3 exchanges.',
  safety: 'Reassurance check-in focused on safety and comfort. Up to 3 exchanges.',
  medication: 'Asks if they've taken their medication. Ends after one response.',
  social: 'Friendly call for connection and companionship. Up to 3 exchanges.',
  appointment: 'Reminds about an upcoming appointment and asks for confirmation.',
};

const FREQUENCY_DESCRIPTIONS: Record<string, string> = {
  daily: 'Every day at the selected time.',
  weekly: 'On the selected days every week.',
  biweekly: 'On the selected days every 2 weeks.',
  monthly: 'Every 30 days at the selected time.',
  custom: 'Every N days at the selected time.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDatePart(dt?: string): Date | undefined {
  if (!dt) return undefined;
  const [datePart] = dt.split('T');
  if (!datePart) return undefined;
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function getTimePart(dt?: string): string {
  if (!dt || !dt.includes('T')) return '';
  return dt.split('T')[1]?.slice(0, 5) ?? '';
}

function combineDateAndTime(date?: Date, time?: string): string {
  if (!date || !time) return '';
  const [h, min] = time.split(':').map(Number);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(h ?? 0).padStart(2, '0');
  const mm = String(min ?? 0).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function parseLocalDateTime(dt?: string): Date | null {
  if (!dt || !dt.includes('T')) return null;
  const [datePart, timePart] = dt.split('T');
  if (!datePart || !timePart) return null;
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return null;
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

function formatReminderLabel(dt?: string, offsetMinutes?: number): string {
  const parsed = parseLocalDateTime(dt);
  if (!parsed || offsetMinutes === undefined) return '';
  const reminder = new Date(parsed.getTime() - offsetMinutes * 60_000);
  return format(reminder, 'PPP p');
}

function normalizeSelectedDays(raw: unknown): string[] {
  if (Array.isArray(raw)) return (raw as string[]).map((d) => d.toLowerCase());
  if (typeof raw === 'string' && raw.length > 0) {
    const t = raw.trim();
    try {
      if (t.startsWith('[')) {
        const p = JSON.parse(t);
        if (Array.isArray(p)) return p.map((d: string) => String(d).toLowerCase());
      } else if (t.startsWith('{') && t.endsWith('}')) {
        return t
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^"|"$/g, '').toLowerCase())
          .filter(Boolean);
      }
      return t.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

export type ScheduleFormSubmitData = ScheduleFormValues & { company_id: string };

interface ScheduleFormProps {
  contactId: string;
  companyId?: string;
  numberId?: string;
  initialData?: Partial<ScheduleFormSubmitData & Record<string, unknown>>;
  onSubmit: (data: ScheduleFormSubmitData) => void;
  onCancel?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduleForm({
  contactId,
  companyId,
  numberId,
  initialData,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const initialApptDt = initialData?.appointmentDetails?.appointment_datetime ?? '';

  const [apptDate, setApptDate] = useState<Date | undefined>(getDatePart(initialApptDt));
  const [apptTime, setApptTime] = useState(getTimePart(initialApptDt));

  const initialDays = (() => {
    const days = normalizeSelectedDays(initialData?.selected_days);
    return days.length > 0 ? days : ['monday', 'wednesday', 'friday'];
  })();

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      contact_id: contactId,
      number_id: numberId || (initialData?.number_id as string) || '',
      name: initialData?.name ?? '',
      caller_name: initialData?.caller_name ?? '',
      script_type: (initialData?.script_type as 'template' | 'custom') ?? 'template',
      template: (initialData?.template as ScheduleFormValues['template']) ?? 'wellness',
      script_content: initialData?.script_content ?? '',
      name_in_script: (initialData?.name_in_script as 'contact' | 'caller') ?? 'contact',
      frequency: (initialData?.frequency as ScheduleFormValues['frequency']) ?? 'weekly',
      frequency_days: initialData?.frequency_days ?? 7,
      frequency_time: initialData?.frequency_time ?? '10:00',
      selected_days: initialDays as ScheduleFormValues['selected_days'],
      calls_per_day: initialData?.calls_per_day ?? 1,
      max_attempts: initialData?.max_attempts ?? 3,
      retry_interval: initialData?.retry_interval ?? 15,
      emergency_contact_name: initialData?.emergency_contact_name ?? '',
      emergency_contact_phone:
        (initialData?.emergency_contact_phone as string) ||
        (initialData?.emergency_contact_phone_number as string) ||
        '',
      is_active: initialData?.is_active ?? true,
      appointmentDetails: {
        appointment_title: initialData?.appointmentDetails?.appointment_title ?? '',
        appointment_datetime: initialApptDt,
        appointment_timezone:
          initialData?.appointmentDetails?.appointment_timezone ?? 'America/Chicago',
        provider_name: initialData?.appointmentDetails?.provider_name ?? '',
        provider_phone: initialData?.appointmentDetails?.provider_phone ?? '',
        location_name: initialData?.appointmentDetails?.location_name ?? '',
        location_address: initialData?.appointmentDetails?.location_address ?? '',
        notes: initialData?.appointmentDetails?.notes ?? '',
        reminder_offset_minutes:
          initialData?.appointmentDetails?.reminder_offset_minutes ?? 60,
        requires_confirmation:
          initialData?.appointmentDetails?.requires_confirmation ?? true,
      },
    },
  });

  const scriptType = useWatch({ control: form.control, name: 'script_type' });
  const template = useWatch({ control: form.control, name: 'template' });
  const frequency = useWatch({ control: form.control, name: 'frequency' });
  const selectedDays = useWatch({ control: form.control, name: 'selected_days' }) ?? [];
  const apptDetails = useWatch({ control: form.control, name: 'appointmentDetails' });
  const reminderOffset = apptDetails?.reminder_offset_minutes;

  const isAppointment = scriptType === 'template' && template === 'appointment';
  const showDayPicker = !isAppointment && (frequency === 'weekly' || frequency === 'biweekly');
  const showCustomDays = !isAppointment && frequency === 'custom';

  const computedApptDt = combineDateAndTime(apptDate, apptTime);
  const reminderLabel = formatReminderLabel(computedApptDt, reminderOffset);

  const toggleDay = (day: string) => {
    const current = (form.getValues('selected_days') ?? []) as string[];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    form.setValue('selected_days', next as ScheduleFormValues['selected_days'], {
      shouldValidate: true,
    });
  };

  const handleSubmit = form.handleSubmit((values) => {
    const effectiveFrequency = isAppointment ? 'daily' : values.frequency;
    // For appointments: lock selected_days to the weekday of the appointment date
    const apptWeekday = apptDate ? DAYS[(apptDate.getDay() + 6) % 7] : null;
    const effectiveSelectedDays = isAppointment
      ? apptWeekday ? [apptWeekday] : []
      : frequency === 'weekly' || frequency === 'biweekly'
        ? (values.selected_days ?? [])
        : [];

    onSubmit({
      ...values,
      frequency: effectiveFrequency,
      selected_days: effectiveSelectedDays,
      frequency_days:
        isAppointment
          ? null
          : effectiveFrequency === 'custom'
            ? values.frequency_days
            : effectiveFrequency === 'monthly'
              ? 30
              : null,
      appointmentDetails: isAppointment
        ? { ...values.appointmentDetails!, appointment_datetime: computedApptDt }
        : null,
      company_id: companyId || (initialData?.company_id as string) || '',
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ── Basic Info ────────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Schedule</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Name this schedule and set the caller identity.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Schedule Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Weekly Check-in" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="caller_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Caller Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Name the AI uses when calling" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* ── Script ────────────────────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Script</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="script_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="template">Template</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scriptType === 'template' && (
              <FormField
                control={form.control}
                name="template"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template</FormLabel>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v === 'appointment') {
                          form.setValue('frequency', 'daily');
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="wellness">Wellness</SelectItem>
                        <SelectItem value="safety">Safety</SelectItem>
                        <SelectItem value="medication">Medication</SelectItem>
                        <SelectItem value="social">Social</SelectItem>
                        <SelectItem value="appointment">Appointment</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="name_in_script"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name in Script</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="contact">Contact's Name</SelectItem>
                      <SelectItem value="caller">Caller's Name</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {scriptType === 'template' && template && TEMPLATE_DESCRIPTIONS[template] && (
            <p className="text-xs text-muted-foreground">{TEMPLATE_DESCRIPTIONS[template]}</p>
          )}

          {scriptType === 'custom' && (
            <FormField
              control={form.control}
              name="script_content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Script Content</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder="Write the custom script the AI will follow..."
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <Separator />

        {/* ── Appointment Details ────────────────────────────────── */}
        {isAppointment && (
          <>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Appointment Details</h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="appointmentDetails.appointment_title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Appointment Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Cardiology Follow-up" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="appointmentDetails.appointment_timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Date picker */}
                <FormItem>
                  <FormLabel>Appointment Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !apptDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {apptDate ? format(apptDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={apptDate}
                        onSelect={setApptDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </FormItem>

                {/* Time input */}
                <FormItem>
                  <FormLabel>Appointment Time</FormLabel>
                  <Input
                    type="time"
                    value={apptTime}
                    onChange={(e) => setApptTime(e.target.value)}
                  />
                </FormItem>

                <FormField
                  control={form.control}
                  name="appointmentDetails.reminder_offset_minutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remind</FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REMINDER_OFFSETS.map((o) => (
                            <SelectItem key={o.value} value={String(o.value)}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="appointmentDetails.requires_confirmation"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>Requires Confirmation</FormLabel>
                        <FormDescription>Ask the contact to confirm the appointment</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {reminderLabel && (
                <p className="text-xs text-muted-foreground">
                  Reminder call scheduled for <span className="font-medium text-foreground">{reminderLabel}</span>
                </p>
              )}

              <Separator />

              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Provider & Location</h4>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="appointmentDetails.provider_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Dr. Smith" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="appointmentDetails.provider_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+1 (555) 000-0000" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="appointmentDetails.location_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Memorial Hospital" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="appointmentDetails.location_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Address</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main St, Suite 4" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="appointmentDetails.notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Any additional notes for the call..."
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
          </>
        )}

        {/* ── Frequency ──────────────────────────────────────────── */}
        {!isAppointment && (
          <>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Frequency</h3>
                {FREQUENCY_DESCRIPTIONS[frequency] && (
                  <p className="text-xs text-muted-foreground mt-0.5">{FREQUENCY_DESCRIPTIONS[frequency]}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repeat</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Biweekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="frequency_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time of Day</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {showCustomDays && (
                <FormField
                  control={form.control}
                  name="frequency_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Days Between Calls</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value || '1', 10))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {showDayPicker && (
                <FormField
                  control={form.control}
                  name="selected_days"
                  render={() => (
                    <FormItem>
                      <FormLabel>Days</FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((day) => (
                          <label
                            key={day}
                            className={cn(
                              'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm cursor-pointer transition-colors select-none',
                              selectedDays.includes(day)
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-border hover:bg-muted'
                            )}
                          >
                            <Checkbox
                              checked={selectedDays.includes(day)}
                              onCheckedChange={() => toggleDay(day)}
                              className="sr-only"
                            />
                            {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                          </label>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <Separator />
          </>
        )}

        {/* ── Call Settings ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Call Settings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Control retry behavior when the contact doesn't answer.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="calls_per_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Calls per Day</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value || '1', 10))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="max_attempts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Attempts</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value || '1', 10))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="retry_interval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Retry Every (min)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value || '1', 10))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* ── Emergency Contact ─────────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Emergency Contact</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="emergency_contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Contact's emergency contact" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="emergency_contact_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+1 (555) 000-0000" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* ── Status ────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel>Active</FormLabel>
                <FormDescription>Schedule calls immediately when saved</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* ── Actions ───────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Save Schedule'}
          </Button>
        </div>

      </form>
    </Form>
  );
}

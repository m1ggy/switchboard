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
import { scheduleSchema, type Schedule } from '@/lib/schemas';
import { AlertCircle } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { ZodError } from 'zod';

const frequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'custom'];
const scriptTypes = ['template', 'custom'];
const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

interface ScheduleFormProps {
  contactId: string;
  initialData?: Partial<Schedule>;
  onSubmit: (data: Schedule) => void;
  onCancel?: () => void;
}

export default function ScheduleForm({
  contactId,
  initialData,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    contact_id: contactId,
    name: initialData?.name || '',
    caller_name: initialData?.caller_name || '',
    script_type: (initialData?.script_type || 'template') as
      | 'template'
      | 'custom',
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
    frequency_days: initialData?.frequency_days || 7,
    frequency_time: initialData?.frequency_time || '10:00',
    selected_days: initialData?.selected_days || [
      'Monday',
      'Wednesday',
      'Friday',
    ],
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const scheduleData = scheduleSchema.parse(formData);
      onSubmit(scheduleData);
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

  const toggleDay = (day: string) => {
    setFormData((prev) => ({
      ...prev,
      selected_days: prev.selected_days.includes(day)
        ? prev.selected_days.filter((d) => d !== day)
        : [...prev.selected_days, day],
    }));
    clearError('selected_days');
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

      {/* Schedule Name + Caller */}
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

      {/* Script Settings */}
      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-4">Script Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="scriptType">Script Type</Label>
            <Select
              value={formData.script_type}
              onValueChange={(value: any) => {
                setFormData((prev) => ({ ...prev, script_type: value }));
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

            {errors.script_type && (
              <p className="text-sm text-destructive">{errors.script_type}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameInScript">Name Usage in Script</Label>
            <Select
              value={formData.name_in_script}
              onValueChange={(value: any) => {
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

        {formData.script_type === 'custom' && (
          <div className="space-y-2 mt-4">
            <Label htmlFor="scriptContent">Script Content</Label>
            <Textarea
              id="scriptContent"
              placeholder="Enter the custom script..."
              rows={4}
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

      {/* Frequency */}
      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-4">Schedule Frequency</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="frequency">Frequency</Label>
            <Select
              value={formData.frequency}
              onValueChange={(value: any) => {
                setFormData((prev) => ({ ...prev, frequency: value }));
                clearError('frequency');
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
            <Label htmlFor="frequencyTime">Time of Day</Label>
            <Input
              id="frequencyTime"
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

        {formData.frequency === 'custom' && (
          <div className="space-y-2 mt-4">
            <Label htmlFor="frequencyDays">Days Between Calls</Label>
            <Input
              id="frequencyDays"
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

        {formData.frequency === 'weekly' && (
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

      {/* Call Settings */}
      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-4">Call Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="callsPerDay">Calls Per Day</Label>
            <Input
              id="callsPerDay"
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
                  calls_per_day: Number.parseInt(e.target.value || '0'),
                }));
                clearError('calls_per_day');
              }}
            />
            {errors.calls_per_day && (
              <p className="text-sm text-destructive">{errors.calls_per_day}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxAttempts">Max Attempts</Label>
            <Input
              id="maxAttempts"
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
                  max_attempts: Number.parseInt(e.target.value || '0'),
                }));
                clearError('max_attempts');
              }}
            />
            {errors.max_attempts && (
              <p className="text-sm text-destructive">{errors.max_attempts}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="retryInterval">Retry Interval (minutes)</Label>
            <Input
              id="retryInterval"
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
                  retry_interval: Number.parseInt(e.target.value || '0'),
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

      {/* Emergency Contact */}
      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-4">Emergency Contact</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="emergencyName">Emergency Contact Name</Label>
            <Input
              id="emergencyName"
              placeholder="Name"
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
            <Label htmlFor="emergencyPhone">Emergency Contact Phone</Label>
            <Input
              id="emergencyPhone"
              type="tel"
              placeholder="+1 (555) 000-0000"
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

      {/* Active */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.is_active}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, is_active: e.target.checked }));
            clearError('is_active');
          }}
          className="w-4 h-4 rounded border-border"
        />
        <Label htmlFor="isActive" className="cursor-pointer">
          Schedule is Active
        </Label>
      </div>

      {/* Buttons */}
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

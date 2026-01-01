'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { profileSchema, type Profile } from '@/lib/schemas';
import { AlertCircle } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { ZodError } from 'zod';

const timezones = [
  'UTC',
  'EST',
  'CST',
  'MST',
  'PST',
  'GMT',
  'CET',
  'IST',
  'JST',
  'AEST',
];

const locales = [
  'en-US',
  'en-GB',
  'es-ES',
  'fr-FR',
  'de-DE',
  'it-IT',
  'ja-JP',
  'zh-CN',
  'pt-BR',
];

const riskOptions = [
  'Isolated',
  'Mobility Issues',
  'Cognitive Concerns',
  'Mental Health',
  'Substance Abuse',
  'Falls Risk',
];

interface ProfileFormProps {
  contactId: string;
  initialData?: Partial<Profile>;
  onSubmit: (data: Profile) => void;
  onCancel?: () => void;
}

export default function ProfileForm({
  contactId,
  initialData,
  onSubmit,
  onCancel,
}: ProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    contact_id: contactId,
    preferred_name: initialData?.preferred_name || '',
    timezone: initialData?.timezone || 'UTC',
    locale: initialData?.locale || 'en-US',
    medical_notes: initialData?.medical_notes || '',
    goals: initialData?.goals || '',
    risk_flags: initialData?.risk_flags || [],
  });

  const clearError = (field: string) => {
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const profileData = profileSchema.parse(formData);
      onSubmit(profileData);
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

  const toggleRiskFlag = (flag: string) => {
    setFormData((prev) => ({
      ...prev,
      risk_flags: prev.risk_flags.includes(flag)
        ? prev.risk_flags.filter((f) => f !== flag)
        : [...prev.risk_flags, flag],
    }));
    clearError('risk_flags');
  };

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {hasErrors && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>Please fix the errors below</AlertDescription>
        </Alert>
      )}

      {/* Preferred Name + Timezone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Preferred Name */}
        <div className="space-y-2">
          <Label htmlFor="preferredName">Preferred Name</Label>
          <Input
            id="preferredName"
            placeholder="How they like to be called"
            value={formData.preferred_name}
            aria-invalid={!!errors.preferred_name}
            className={
              errors.preferred_name
                ? 'border-destructive focus-visible:ring-destructive'
                : ''
            }
            onChange={(e) => {
              setFormData((prev) => ({
                ...prev,
                preferred_name: e.target.value,
              }));
              clearError('preferred_name');
            }}
          />
          {errors.preferred_name && (
            <p className="text-sm text-destructive">{errors.preferred_name}</p>
          )}
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Select
            value={formData.timezone}
            onValueChange={(value) => {
              setFormData((prev) => ({ ...prev, timezone: value }));
              clearError('timezone');
            }}
          >
            <SelectTrigger
              className={
                errors.timezone
                  ? 'border-destructive focus:ring-destructive'
                  : ''
              }
            >
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>

            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {errors.timezone && (
            <p className="text-sm text-destructive">{errors.timezone}</p>
          )}
        </div>
      </div>

      {/* Locale */}
      <div className="space-y-2">
        <Label htmlFor="locale">Language/Locale</Label>
        <Select
          value={formData.locale}
          onValueChange={(value) => {
            setFormData((prev) => ({ ...prev, locale: value }));
            clearError('locale');
          }}
        >
          <SelectTrigger
            className={
              errors.locale ? 'border-destructive focus:ring-destructive' : ''
            }
          >
            <SelectValue placeholder="Select locale" />
          </SelectTrigger>

          <SelectContent>
            {locales.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {errors.locale && (
          <p className="text-sm text-destructive">{errors.locale}</p>
        )}
      </div>

      {/* Medical Notes */}
      <div className="space-y-2">
        <Label htmlFor="medicalNotes">Medical Notes</Label>
        <Textarea
          id="medicalNotes"
          placeholder="Any relevant medical information or conditions..."
          rows={3}
          value={formData.medical_notes}
          aria-invalid={!!errors.medical_notes}
          className={
            errors.medical_notes
              ? 'border-destructive focus-visible:ring-destructive'
              : ''
          }
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, medical_notes: e.target.value }));
            clearError('medical_notes');
          }}
        />
        {errors.medical_notes && (
          <p className="text-sm text-destructive">{errors.medical_notes}</p>
        )}
      </div>

      {/* Goals */}
      <div className="space-y-2">
        <Label htmlFor="goals">Goals</Label>
        <Textarea
          id="goals"
          placeholder="What are the goals for reassurance calls?"
          rows={3}
          value={formData.goals}
          aria-invalid={!!errors.goals}
          className={
            errors.goals
              ? 'border-destructive focus-visible:ring-destructive'
              : ''
          }
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, goals: e.target.value }));
            clearError('goals');
          }}
        />
        {errors.goals && (
          <p className="text-sm text-destructive">{errors.goals}</p>
        )}
      </div>

      {/* Risk Flags */}
      <div className="space-y-3">
        <Label>Risk Flags</Label>
        <div
          className={
            errors.risk_flags ? 'rounded-md border border-destructive p-3' : ''
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {riskOptions.map((flag) => (
              <label
                key={flag}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={formData.risk_flags.includes(flag)}
                  onChange={() => toggleRiskFlag(flag)}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm">{flag}</span>
              </label>
            ))}
          </div>
        </div>

        {errors.risk_flags && (
          <p className="text-sm text-destructive">{errors.risk_flags}</p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="w-full md:w-auto bg-transparent"
        >
          Cancel
        </Button>

        <Button type="submit" disabled={loading} className="w-full md:w-auto">
          {loading ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </form>
  );
}

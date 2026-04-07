import { z } from 'zod';

export const contactSchema = z.object({
  id: z.string().optional(),
  number: z.string().min(1, 'Phone number is required'),
  label: z.string().min(1, 'Label is required'),
  created_at: z.string().optional(),
  company_id: z.string().optional(),
});

export const profileSchema = z.object({
  id: z.string().optional(),
  contact_id: z.string(),
  preferred_name: z.string().min(1, 'Preferred name is required'),
  timezone: z.string(),
  locale: z.string(),
  medical_notes: z.string().optional(),
  goals: z.string().optional(),
  risk_flags: z.array(z.string()),
});

export const appointmentDetailsSchema = z.object({
  appointment_title: z.string().min(1),
  appointment_datetime: z.string().min(1),
  appointment_timezone: z.string().min(1),
  provider_name: z.string().nullable().optional(),
  provider_phone: z.string().nullable().optional(),
  location_name: z.string().nullable().optional(),
  location_address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  reminder_offset_minutes: z.number().int().min(0).default(60),
  requires_confirmation: z.boolean().default(true),
});

export const scheduleSchema = z
  .object({
    contact_id: z.string().uuid(),
    number_id: z.string().uuid(),

    name: z.string().min(1),
    caller_name: z.string().nullable().optional(),

    script_type: z.enum(['template', 'custom']),
    template: z
      .enum(['wellness', 'safety', 'medication', 'social', 'appointment'])
      .nullable()
      .optional(),
    script_content: z.string().nullable().optional(),
    name_in_script: z.enum(['contact', 'caller']),

    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
    frequency_days: z.number().int().positive().nullable().optional(),
    frequency_time: z.string().min(1),

    selected_days: z
      .array(
        z.enum([
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ])
      )
      .optional()
      .default([]),

    calls_per_day: z.number().int().positive(),
    max_attempts: z.number().int().positive(),
    retry_interval: z.number().int().positive(),

    emergency_contact_name: z.string().nullable().optional(),
    emergency_contact_phone: z.string().nullable().optional(),

    is_active: z.boolean().default(true),

    appointmentDetails: appointmentDetailsSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.script_type === 'template' && !data.template) {
      ctx.addIssue({
        path: ['template'],
        code: z.ZodIssueCode.custom,
        message: 'Template is required for template script type',
      });
    }

    if (data.script_type === 'custom') {
      if (!data.script_content || !data.script_content.trim()) {
        ctx.addIssue({
          path: ['script_content'],
          code: z.ZodIssueCode.custom,
          message: 'Custom script content is required',
        });
      }
    }

    if (
      data.script_type === 'template' &&
      data.template === 'appointment' &&
      !data.appointmentDetails
    ) {
      ctx.addIssue({
        path: ['appointmentDetails'],
        code: z.ZodIssueCode.custom,
        message: 'Appointment details are required',
      });
    }

    if (
      (data.frequency === 'weekly' || data.frequency === 'biweekly') &&
      (!data.selected_days || data.selected_days.length === 0)
    ) {
      ctx.addIssue({
        path: ['selected_days'],
        code: z.ZodIssueCode.custom,
        message: 'Please select at least one day',
      });
    }

    if (data.frequency === 'custom' && !data.frequency_days) {
      ctx.addIssue({
        path: ['frequency_days'],
        code: z.ZodIssueCode.custom,
        message: 'Days between calls is required',
      });
    }

    if (
      data.frequency === 'monthly' &&
      data.frequency_days &&
      data.frequency_days !== 30
    ) {
      ctx.addIssue({
        path: ['frequency_days'],
        code: z.ZodIssueCode.custom,
        message: 'Monthly schedules must use 30 days',
      });
    }
  });

export type Schedule = z.infer<typeof scheduleSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Profile = z.infer<typeof profileSchema>;

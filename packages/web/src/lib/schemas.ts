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

export const scheduleSchema = z.object({
  id: z.string().optional(),
  contact_id: z.string(),
  name: z.string().min(1, 'Schedule name is required'),
  caller_name: z.string().optional(),
  script_type: z.enum(['template', 'custom']),
  script_content: z.string().optional().nullable(),
  name_in_script: z.enum(['contact', 'caller']),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
  frequency_days: z.number().min(1).optional().nullable(),
  frequency_time: z.string(),
  selected_days: z.array(z.string()),
  calls_per_day: z.number().min(1),
  max_attempts: z.number().min(1),
  retry_interval: z.number().min(1),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  is_active: z.boolean(),
});

export type Contact = z.infer<typeof contactSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;

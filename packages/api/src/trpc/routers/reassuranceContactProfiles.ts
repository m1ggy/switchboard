// src/server/routers/reassuranceContactProfiles.ts
import pool from '@/lib/pg';
import crypto from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

import { ReassuranceCallLogsRepository } from '@/db/reassurance_call_logs';
import { ContactsRepository } from '@/db/repositories/contacts';
import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceContactProfilesRepository } from '@/db/repositories/reassurance_contact_profiles';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';
import { getNextRunAtForSchedule } from '@/lib/jobs/getNextRunAtForSchedule';
import { ReassuranceCallSchedule } from '@/types/db';

const getCallLogsInput = z.object({
  contactId: z.string().uuid(),
  limit: z.number().int().positive().max(200).optional().default(20),
  includeTranscript: z.boolean().optional().default(false),
  transcriptLimit: z
    .number()
    .int()
    .positive()
    .max(2000)
    .optional()
    .default(200),
});

// Minimal: you can expand these schemas later
const jsonRecord = z.record(z.any());

const upsertInput = z.object({
  contactId: z.string().uuid(),
  // optional fields (patch-like upsert)
  preferredName: z.string().min(1).optional().nullable(),
  locale: z.string().min(2).optional().nullable(),
  timezone: z.string().min(1).optional().nullable(),
  demographics: jsonRecord.optional().nullable(),
  medicalNotes: z.string().optional().nullable(),
  preferences: jsonRecord.optional().nullable(),
  goals: z.string().optional().nullable(),
  riskFlags: jsonRecord.optional().nullable(),
  lastState: jsonRecord.optional().nullable(),
});

const createContactFullInput = z.object({
  // Contact
  label: z.string().min(1, 'Required'),
  number: z.string().min(1, 'Required'),
  companyId: z.string().uuid(),

  // Profile (optional)
  profile: z
    .object({
      preferredName: z.string().optional().nullable(),
      timezone: z.string().optional().nullable(),
      locale: z.string().optional().nullable(),
      medicalNotes: z.string().optional().nullable(),
      goals: z.string().optional().nullable(),
      riskFlags: z.array(z.string()).optional().nullable(),
    })
    .optional()
    .nullable(),

  // Schedule (optional)
  schedule: z
    .object({
      name: z.string().min(1, 'required'),
      caller_name: z.string().optional().nullable(),

      script_type: z.enum(['template', 'custom']),
      template: z
        .enum(['wellness', 'safety', 'medication', 'social'])
        .optional()
        .nullable(),
      script_content: z.string().optional().nullable(),
      name_in_script: z.enum(['contact', 'caller']),

      frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
      frequency_days: z.number().int().positive().optional().nullable(),
      frequency_time: z.string().min(1, 'required'),

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
        .nullable(),

      calls_per_day: z.number().int().positive(),
      max_attempts: z.number().int().positive(),
      retry_interval: z.number().int().positive(),

      emergency_contact_name: z.string().min(1, 'required'),
      emergency_contact_phone: z.string().min(1, 'required'),

      number_id: z.string().uuid(),
    })
    .superRefine((data, ctx) => {
      /**
       * WEEKLY / BIWEEKLY
       * must have selected_days
       */
      if (data.frequency === 'weekly' || data.frequency === 'biweekly') {
        if (!data.selected_days || data.selected_days.length === 0) {
          ctx.addIssue({
            path: ['selected_days'],
            code: z.ZodIssueCode.custom,
            message: 'selected_days is required for weekly/biweekly frequency',
          });
        }
      }

      /**
       * CUSTOM
       * must have frequency_days
       */
      if (data.frequency === 'custom') {
        if (!data.frequency_days || data.frequency_days <= 0) {
          ctx.addIssue({
            path: ['frequency_days'],
            code: z.ZodIssueCode.custom,
            message: 'frequency_days is required for custom frequency',
          });
        }
      }

      /**
       * MONTHLY
       * should always be 30 days (if provided)
       * (we enforce logic so it doesn’t become ambiguous)
       */
      if (data.frequency === 'monthly') {
        if (data.frequency_days && data.frequency_days !== 30) {
          ctx.addIssue({
            path: ['frequency_days'],
            code: z.ZodIssueCode.custom,
            message: 'monthly frequency must use frequency_days = 30',
          });
        }
      }

      /**
       * TEMPLATE SCRIPT
       * must have template
       */
      if (data.script_type === 'template') {
        if (!data.template) {
          ctx.addIssue({
            path: ['template'],
            code: z.ZodIssueCode.custom,
            message: 'template is required when script_type = template',
          });
        }
      }

      /**
       * CUSTOM SCRIPT
       * must have script_content
       */
      if (data.script_type === 'custom') {
        if (!data.script_content || data.script_content.trim().length === 0) {
          ctx.addIssue({
            path: ['script_content'],
            code: z.ZodIssueCode.custom,
            message: 'script_content is required when script_type = custom',
          });
        }
      }
    })
    .optional()
    .nullable(),
});

export const reassuranceContactProfilesRouter = t.router({
  getByContactId: protectedProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ input }) => {
      const profile = await ReassuranceContactProfilesRepository.getByContactId(
        input.contactId
      );
      return profile;
    }),

  upsert: protectedProcedure.input(upsertInput).mutation(async ({ input }) => {
    // Optional: ensure contact exists (safety)
    const contact = await ContactsRepository.findById?.(input.contactId);
    if (contact === null) {
      throw new Error('Contact not found');
    }

    const saved = await ReassuranceContactProfilesRepository.upsert({
      contact_id: input.contactId,
      preferred_name: input.preferredName ?? null,
      locale: input.locale ?? null,
      timezone: input.timezone ?? null,
      demographics: input.demographics ?? null,
      medical_notes: input.medicalNotes ?? null,
      preferences: input.preferences ?? null,
      goals: input.goals ?? null,
      risk_flags: input.riskFlags ?? null,
      last_state: input.lastState ?? null,
    });

    return saved;
  }),

  mergeLastState: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), patch: jsonRecord }))
    .mutation(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.mergeLastState(
        input.contactId,
        input.patch
      );
    }),

  mergeRiskFlags: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), patch: jsonRecord }))
    .mutation(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.mergeRiskFlags(
        input.contactId,
        input.patch
      );
    }),

  /**
   * ✅ Create contact + profile + schedule + job in one transaction
   */
  createContactFull: protectedProcedure
    .input(createContactFullInput) // ✅ snake_case schema
    .mutation(async ({ input }) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // 1️⃣ Contact
        const contact = await ContactsRepository.findOrCreate(
          {
            number: input.number,
            label: input.label,
            companyId: input.companyId,
          },
          client
        );
        const contactId = contact.id;

        // 2️⃣ Profile
        const profile = await ReassuranceContactProfilesRepository.upsert(
          {
            contact_id: contactId,
            preferred_name: input.profile?.preferredName ?? null,
            timezone: input.profile?.timezone ?? null,
            locale: input.profile?.locale ?? null,
            medical_notes: input.profile?.medicalNotes ?? null,
            goals: input.profile?.goals ?? null,
            risk_flags: input.profile?.riskFlags ?? null,
          },
          client
        );

        // 3️⃣ Schedule (+ Job)
        let schedule: ReassuranceCallSchedule | null = null;

        if (input.schedule) {
          schedule = await ReassuranceSchedulesRepository.include(
            {
              name: input.schedule.name,
              phone_number: input.number,
              caller_name: input.schedule.caller_name ?? null,

              emergency_contact_name: input.schedule.emergency_contact_name,
              emergency_contact_phone_number:
                input.schedule.emergency_contact_phone,

              script_type: input.schedule.script_type,
              template: input.schedule.template ?? null,
              script_content: input.schedule.script_content ?? null,
              name_in_script: input.schedule.name_in_script,

              frequency: input.schedule.frequency,
              frequency_days: input.schedule.frequency_days ?? null,
              frequency_time: input.schedule.frequency_time,

              // ✅ only use selected_days if weekly/biweekly, otherwise null
              selected_days:
                input.schedule.frequency === 'weekly' ||
                input.schedule.frequency === 'biweekly'
                  ? (input.schedule.selected_days ?? ['monday'])
                  : null,

              calls_per_day: input.schedule.calls_per_day,
              max_attempts: input.schedule.max_attempts,
              retry_interval: input.schedule.retry_interval,

              company_id: input.companyId,
              number_id: input.schedule.number_id,
            },
            client
          );

          const runAt = getNextRunAtForSchedule(schedule);

          await ReassuranceCallJobsRepository.include(
            {
              id: crypto.randomUUID(),
              schedule_id: schedule.id,
              run_at: runAt,
              attempt: 1,
              status: 'pending',
            },
            client
          );
        }

        await client.query('COMMIT');

        return {
          contact,
          profile,
          schedule,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }),

  getAllByCompanyId: protectedProcedure
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.getAllByCompanyId(
        input.companyId
      );
    }),
  getAllWithSchedulesByCompanyId: protectedProcedure
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.getAllWithSchedulesByCompanyId(
        input.companyId
      );
    }),
  getCallLogsByContactId: protectedProcedure
    .input(getCallLogsInput)
    .query(async ({ input }) => {
      return await ReassuranceCallLogsRepository.listByContactId({
        contactId: input.contactId,
        limit: input.limit,
        includeTranscript: input.includeTranscript,
        transcriptLimit: input.transcriptLimit,
      });
    }),
});

// src/server/routers/reassuranceContactProfiles.ts
import pool from '@/lib/pg';
import crypto from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

import { ContactsRepository } from '@/db/repositories/contacts';
import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceContactProfilesRepository } from '@/db/repositories/reassurance_contact_profiles';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';
import { getNextRunAtForSchedule } from '@/lib/jobs/getNextRunAtForSchedule';
import { ReassuranceCallSchedule } from '@/types/db';

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
      name: z.string().min(1),
      callerName: z.string().optional().nullable(),

      scriptType: z.enum(['template', 'custom']),
      template: z
        .enum(['wellness', 'safety', 'medication', 'social'])
        .optional()
        .nullable(),
      scriptContent: z.string().optional().nullable(),
      nameInScript: z.enum(['contact', 'caller']),

      frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
      frequencyDays: z.number().int().positive().optional().nullable(),
      frequencyTime: z.string().min(1),

      selectedDays: z
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

      callsPerDay: z.number().int().positive(),
      maxAttempts: z.number().int().positive(),
      retryInterval: z.number().int().positive(),

      emergencyContactName: z.string().min(1),
      emergencyContactPhone: z.string().min(1),

      numberId: z.string().uuid(),
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
    .input(createContactFullInput)
    .mutation(async ({ input }) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const contactId = crypto.randomUUID();

        // 1️⃣ Contact
        const contact = await ContactsRepository.create(
          {
            id: contactId,
            number: input.number,
            label: input.label,
            company_id: input.companyId,
          },
          client
        );

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
              caller_name: input.schedule.callerName ?? null,

              emergency_contact_name: input.schedule.emergencyContactName,
              emergency_contact_phone_number:
                input.schedule.emergencyContactPhone,

              script_type: input.schedule.scriptType,
              template: input.schedule.template ?? null,
              script_content: input.schedule.scriptContent ?? null,
              name_in_script: input.schedule.nameInScript,

              frequency: input.schedule.frequency,
              frequency_days: input.schedule.frequencyDays ?? null,
              frequency_time: input.schedule.frequencyTime,
              selected_days: input.schedule.selectedDays ?? ['monday'],

              calls_per_day: input.schedule.callsPerDay,
              max_attempts: input.schedule.maxAttempts,
              retry_interval: input.schedule.retryInterval,

              company_id: input.companyId,
              number_id: input.schedule.numberId,
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
});

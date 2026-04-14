import pool from '@/lib/pg';
import crypto from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

import { ReassuranceCallLogsRepository } from '@/db/reassurance_call_logs';
import { AppointmentReminderDetailsRepository } from '@/db/repositories/appointment_reminder_details';
import { ContactsRepository } from '@/db/repositories/contacts';
import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceContactProfilesRepository } from '@/db/repositories/reassurance_contact_profiles';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';
import { getNextRunAtForSchedule } from '@/lib/jobs/getNextRunAtForSchedule';
import { ReassuranceCallSchedule } from '@/types/db';

const deleteScheduleInput = z.object({
  id: z.number().int(),
});

const getCallLogsInput = z.object({
  contact_id: z.string().uuid(),
  limit: z.number().int().positive().max(200).optional().default(20),
  include_transcript: z.boolean().optional().default(false),
  transcript_limit: z
    .number()
    .int()
    .positive()
    .max(2000)
    .optional()
    .default(200),
});

const reminderTemplateEnum = z.enum([
  'wellness',
  'safety',
  'medication',
  'social',
  'appointment',
]);

const weekdayEnum = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const appointment_details_input = z.object({
  appointment_title: z.string().min(1, 'required'),
  appointment_datetime: z.string().min(1, 'required'),
  appointment_timezone: z.string().min(1, 'required'),
  provider_name: z.string().optional().nullable(),
  provider_phone: z.string().optional().nullable(),
  location_name: z.string().optional().nullable(),
  location_address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  reminder_offset_minutes: z.number().int().min(0).default(60),
  requires_confirmation: z.boolean().default(true),
});

const createScheduleInput = z
  .object({
    contact_id: z.string().uuid(),
    company_id: z.string().uuid(),
    number_id: z.string().uuid(),

    name: z.string().min(1),
    caller_name: z.string().optional().nullable(),

    script_type: z.enum(['template', 'custom']),
    template: reminderTemplateEnum.optional().nullable(),
    script_content: z.string().optional().nullable(),
    name_in_script: z.enum(['contact', 'caller']),

    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
    frequency_days: z.number().int().positive().optional().nullable(),
    frequency_time: z.string().min(1),

    selected_days: z.array(weekdayEnum).optional().nullable(),

    calls_per_day: z.number().int().positive(),
    max_attempts: z.number().int().positive(),
    retry_interval: z.number().int().positive(),

    is_active: z.boolean().optional().nullable(),

    emergency_contact_name: z.string().optional().nullable(),
    emergency_contact_phone: z.string().optional().nullable(),

    appointment_details: appointment_details_input.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.frequency === 'weekly' || data.frequency === 'biweekly') {
      if (!data.selected_days || data.selected_days.length === 0) {
        ctx.addIssue({
          path: ['selected_days'],
          code: z.ZodIssueCode.custom,
          message: 'selected_days is required for weekly/biweekly frequency',
        });
      }
    }

    if (data.frequency === 'custom') {
      if (!data.frequency_days || data.frequency_days <= 0) {
        ctx.addIssue({
          path: ['frequency_days'],
          code: z.ZodIssueCode.custom,
          message: 'frequency_days is required for custom frequency',
        });
      }
    }

    if (data.frequency === 'monthly') {
      if (data.frequency_days && data.frequency_days !== 30) {
        ctx.addIssue({
          path: ['frequency_days'],
          code: z.ZodIssueCode.custom,
          message: 'monthly frequency must use frequency_days = 30',
        });
      }
    }

    if (data.script_type === 'template' && !data.template) {
      ctx.addIssue({
        path: ['template'],
        code: z.ZodIssueCode.custom,
        message: 'template is required when script_type = template',
      });
    }

    if (data.script_type === 'custom') {
      if (!data.script_content || data.script_content.trim().length === 0) {
        ctx.addIssue({
          path: ['script_content'],
          code: z.ZodIssueCode.custom,
          message: 'script_content is required when script_type = custom',
        });
      }
    }

    if (data.script_type === 'template' && data.template === 'appointment') {
      if (!data.appointment_details) {
        ctx.addIssue({
          path: ['appointment_details'],
          code: z.ZodIssueCode.custom,
          message:
            'appointment_details is required when template = appointment',
        });
      }
    }
  });

const updateScheduleInput = z
  .object({
    id: z.number().int(),
    contact_id: z.string().uuid().optional().nullable(),

    name: z.string().min(1),
    caller_name: z.string().optional().nullable(),

    script_type: z.enum(['template', 'custom']),
    template: reminderTemplateEnum.optional().nullable(),
    script_content: z.string().optional().nullable(),
    name_in_script: z.enum(['contact', 'caller']),

    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
    frequency_days: z.number().int().positive().optional().nullable(),
    frequency_time: z.string().min(1),

    selected_days: z.array(weekdayEnum).optional().nullable(),

    calls_per_day: z.number().int().positive(),
    max_attempts: z.number().int().positive(),
    retry_interval: z.number().int().positive(),

    is_active: z.boolean().optional().nullable(),

    emergency_contact_name: z.string().optional().nullable(),
    emergency_contact_phone: z.string().optional().nullable(),

    appointment_details: appointment_details_input.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.frequency === 'weekly' || data.frequency === 'biweekly') {
      if (!data.selected_days || data.selected_days.length === 0) {
        ctx.addIssue({
          path: ['selected_days'],
          code: z.ZodIssueCode.custom,
          message: 'selected_days is required for weekly/biweekly frequency',
        });
      }
    }

    if (data.frequency === 'custom') {
      if (!data.frequency_days || data.frequency_days <= 0) {
        ctx.addIssue({
          path: ['frequency_days'],
          code: z.ZodIssueCode.custom,
          message: 'frequency_days is required for custom frequency',
        });
      }
    }

    if (data.frequency === 'monthly') {
      if (data.frequency_days && data.frequency_days !== 30) {
        ctx.addIssue({
          path: ['frequency_days'],
          code: z.ZodIssueCode.custom,
          message: 'monthly frequency must use frequency_days = 30',
        });
      }
    }

    if (data.script_type === 'template' && !data.template) {
      ctx.addIssue({
        path: ['template'],
        code: z.ZodIssueCode.custom,
        message: 'template is required when script_type = template',
      });
    }

    if (data.script_type === 'custom') {
      if (!data.script_content || data.script_content.trim().length === 0) {
        ctx.addIssue({
          path: ['script_content'],
          code: z.ZodIssueCode.custom,
          message: 'script_content is required when script_type = custom',
        });
      }
    }

    if (data.script_type === 'template' && data.template === 'appointment') {
      if (!data.appointment_details) {
        ctx.addIssue({
          path: ['appointment_details'],
          code: z.ZodIssueCode.custom,
          message:
            'appointment_details is required when template = appointment',
        });
      }
    }
  });

const jsonRecord = z.record(z.any());

const upsertInput = z.object({
  contact_id: z.string().uuid(),
  preferred_name: z.string().min(1).optional().nullable(),
  locale: z.string().min(2).optional().nullable(),
  timezone: z.string().min(1).optional().nullable(),
  demographics: jsonRecord.optional().nullable(),
  medical_notes: z.string().optional().nullable(),
  preferences: jsonRecord.optional().nullable(),
  goals: z.string().optional().nullable(),
  risk_flags: z.array(z.string()).optional().nullable(),
  last_state: jsonRecord.optional().nullable(),
});

const createContactFullInput = z.object({
  label: z.string().min(1, 'Required'),
  number: z.string().min(1, 'Required'),
  company_id: z.string().uuid(),

  profile: z
    .object({
      preferred_name: z.string().optional().nullable(),
      timezone: z.string().optional().nullable(),
      locale: z.string().optional().nullable(),
      medical_notes: z.string().optional().nullable(),
      goals: z.string().optional().nullable(),
      risk_flags: z.array(z.string()).optional().nullable(),
    })
    .optional()
    .nullable(),

  schedule: z
    .object({
      name: z.string().min(1, 'required'),
      caller_name: z.string().optional().nullable(),

      script_type: z.enum(['template', 'custom']),
      template: reminderTemplateEnum.optional().nullable(),
      script_content: z.string().optional().nullable(),
      name_in_script: z.enum(['contact', 'caller']),

      frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
      frequency_days: z.number().int().positive().optional().nullable(),
      frequency_time: z.string().min(1, 'required'),

      selected_days: z.array(weekdayEnum).optional().nullable(),

      calls_per_day: z.number().int().positive(),
      max_attempts: z.number().int().positive(),
      retry_interval: z.number().int().positive(),

      emergency_contact_name: z.string().min(1, 'required'),
      emergency_contact_phone: z.string().min(1, 'required'),

      number_id: z.string().uuid(),
      is_active: z.boolean().optional().nullable(),

      appointment_details: appointment_details_input.optional().nullable(),
    })
    .superRefine((data, ctx) => {
      if (data.frequency === 'weekly' || data.frequency === 'biweekly') {
        if (!data.selected_days || data.selected_days.length === 0) {
          ctx.addIssue({
            path: ['selected_days'],
            code: z.ZodIssueCode.custom,
            message: 'selected_days is required for weekly/biweekly frequency',
          });
        }
      }

      if (data.frequency === 'custom') {
        if (!data.frequency_days || data.frequency_days <= 0) {
          ctx.addIssue({
            path: ['frequency_days'],
            code: z.ZodIssueCode.custom,
            message: 'frequency_days is required for custom frequency',
          });
        }
      }

      if (data.frequency === 'monthly') {
        if (data.frequency_days && data.frequency_days !== 30) {
          ctx.addIssue({
            path: ['frequency_days'],
            code: z.ZodIssueCode.custom,
            message: 'monthly frequency must use frequency_days = 30',
          });
        }
      }

      if (data.script_type === 'template' && !data.template) {
        ctx.addIssue({
          path: ['template'],
          code: z.ZodIssueCode.custom,
          message: 'template is required when script_type = template',
        });
      }

      if (data.script_type === 'custom') {
        if (!data.script_content || data.script_content.trim().length === 0) {
          ctx.addIssue({
            path: ['script_content'],
            code: z.ZodIssueCode.custom,
            message: 'script_content is required when script_type = custom',
          });
        }
      }

      if (data.script_type === 'template' && data.template === 'appointment') {
        if (!data.appointment_details) {
          ctx.addIssue({
            path: ['appointment_details'],
            code: z.ZodIssueCode.custom,
            message:
              'appointment_details is required when template = appointment',
          });
        }
      }
    })
    .optional()
    .nullable(),
});

export const reassuranceContactProfilesRouter = t.router({
  getByContactId: protectedProcedure
    .input(z.object({ contact_id: z.string().uuid() }))
    .query(async ({ input }) => {
      const profile = await ReassuranceContactProfilesRepository.getByContactId(
        input.contact_id
      );
      return profile;
    }),

  upsert: protectedProcedure.input(upsertInput).mutation(async ({ input }) => {
    const contact = await ContactsRepository.findById?.(input.contact_id);
    if (contact === null) {
      throw new Error('Contact not found');
    }

    const saved = await ReassuranceContactProfilesRepository.upsert({
      contact_id: input.contact_id,
      preferred_name: input.preferred_name ?? null,
      locale: input.locale ?? null,
      timezone: input.timezone ?? null,
      demographics: input.demographics ?? null,
      medical_notes: input.medical_notes ?? null,
      preferences: input.preferences ?? null,
      goals: input.goals ?? null,
      risk_flags: input.risk_flags ?? null,
      last_state: input.last_state ?? null,
    });

    return saved;
  }),

  mergeLastState: protectedProcedure
    .input(z.object({ contact_id: z.string().uuid(), patch: jsonRecord }))
    .mutation(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.mergeLastState(
        input.contact_id,
        input.patch
      );
    }),

  mergeRiskFlags: protectedProcedure
    .input(
      z.object({
        contact_id: z.string().uuid(),
        patch: jsonRecord,
      })
    )
    .mutation(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.mergeRiskFlags(
        input.contact_id,
        input.patch
      );
    }),

  createContactFull: protectedProcedure
    .input(createContactFullInput)
    .mutation(async ({ input }) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const contact = await ContactsRepository.findOrCreate(
          {
            number: input.number,
            label: input.label,
            companyId: input.company_id,
          },
          client
        );
        const contact_id = contact.id;

        const profile = await ReassuranceContactProfilesRepository.upsert(
          {
            contact_id,
            preferred_name: input.profile?.preferred_name ?? null,
            timezone: input.profile?.timezone ?? null,
            locale: input.profile?.locale ?? null,
            medical_notes: input.profile?.medical_notes ?? null,
            goals: input.profile?.goals ?? null,
            risk_flags: input.profile?.risk_flags ?? null,
          },
          client
        );

        let schedule: ReassuranceCallSchedule | null = null;
        let appointment_reminder = null;

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

              selected_days:
                input.schedule.frequency === 'weekly' ||
                input.schedule.frequency === 'biweekly'
                  ? (input.schedule.selected_days ?? ['monday'])
                  : null,

              calls_per_day: input.schedule.calls_per_day,
              max_attempts: input.schedule.max_attempts,
              retry_interval: input.schedule.retry_interval,

              company_id: input.company_id,
              number_id: input.schedule.number_id,
              is_active: input.schedule.is_active ?? true,
            },
            client
          );

          if (
            input.schedule.script_type === 'template' &&
            input.schedule.template === 'appointment' &&
            input.schedule.appointment_details
          ) {
            appointment_reminder =
              await AppointmentReminderDetailsRepository.upsert(
                {
                  schedule_id: schedule.id,
                  contact_id,
                  ...input.schedule.appointment_details,
                },
                client
              );
          }

          const runAt = await getNextRunAtForSchedule(schedule);

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
          appointment_reminder,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }),

  getAllByCompanyId: protectedProcedure
    .input(z.object({ company_id: z.string().uuid() }))
    .query(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.getAllByCompanyId(
        input.company_id
      );
    }),

  getAllWithSchedulesByCompanyId: protectedProcedure
    .input(z.object({ company_id: z.string().uuid() }))
    .query(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.getAllWithSchedulesByCompanyId(
        input.company_id
      );
    }),

  getCallLogsByContactId: protectedProcedure
    .input(getCallLogsInput)
    .query(async ({ input }) => {
      return await ReassuranceCallLogsRepository.listByContactId({
        contactId: input.contact_id,
        limit: input.limit,
        includeTranscript: input.include_transcript,
        transcriptLimit: input.transcript_limit,
      });
    }),

  update: protectedProcedure
    .input(updateScheduleInput)
    .mutation(async ({ input }) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const updated = await ReassuranceSchedulesRepository.update(
          {
            id: input.id,
            name: input.name,
            caller_name: input.caller_name ?? null,

            script_type: input.script_type,
            template: input.template ?? null,
            script_content: input.script_content ?? null,
            name_in_script: input.name_in_script,

            frequency: input.frequency,
            frequency_days: input.frequency_days ?? null,
            frequency_time: input.frequency_time,

            selected_days:
              input.frequency === 'weekly' || input.frequency === 'biweekly'
                ? (input.selected_days ?? ['monday'])
                : null,

            calls_per_day: input.calls_per_day,
            max_attempts: input.max_attempts,
            retry_interval: input.retry_interval,

            is_active: input.is_active ?? true,

            emergency_contact_name: input.emergency_contact_name ?? null,
            emergency_contact_phone: input.emergency_contact_phone ?? null,
          },
          client
        );

        let appointment_reminder = null;

        if (
          input.script_type === 'template' &&
          input.template === 'appointment' &&
          input.appointment_details
        ) {
          let contact_id = input.contact_id ?? null;

          if (!contact_id) {
            const existingSchedule = await ReassuranceSchedulesRepository.find(
              input.id
            );

            if (!existingSchedule) {
              throw new Error('Schedule not found');
            }

            const contact = await ContactsRepository.findByNumberAndCompany?.(
              existingSchedule.phone_number,
              existingSchedule.company_id
            );

            if (!contact) {
              throw new Error(
                'Contact not found for appointment reminder update'
              );
            }

            contact_id = contact.id;
          }

          appointment_reminder =
            await AppointmentReminderDetailsRepository.upsert(
              {
                schedule_id: input.id,
                contact_id,
                ...input.appointment_details,
              },
              client
            );
        } else {
          await AppointmentReminderDetailsRepository.deleteByScheduleId(
            input.id,
            client
          );
        }

        await client.query('COMMIT');

        return {
          schedule: updated,
          appointment_reminder,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }),

  createSchedule: protectedProcedure
    .input(createScheduleInput)
    .mutation(async ({ input }) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const contact = await ContactsRepository.findById?.(input.contact_id);
        if (!contact) {
          throw new Error('Contact not found');
        }

        const schedule = await ReassuranceSchedulesRepository.include(
          {
            name: input.name,
            phone_number: contact.number,
            caller_name: input.caller_name ?? null,

            emergency_contact_name: input.emergency_contact_name ?? null,
            emergency_contact_phone_number:
              input.emergency_contact_phone ?? null,

            script_type: input.script_type,
            template: input.template ?? null,
            script_content: input.script_content ?? null,
            name_in_script: input.name_in_script,

            frequency: input.frequency,
            frequency_days: input.frequency_days ?? null,
            frequency_time: input.frequency_time,

            selected_days:
              input.frequency === 'weekly' || input.frequency === 'biweekly'
                ? (input.selected_days ?? ['monday'])
                : null,

            calls_per_day: input.calls_per_day,
            max_attempts: input.max_attempts,
            retry_interval: input.retry_interval,

            company_id: input.company_id,
            number_id: input.number_id,
            is_active: input.is_active ?? true,
          },
          client
        );

        let appointment_reminder = null;

        if (
          input.script_type === 'template' &&
          input.template === 'appointment' &&
          input.appointment_details
        ) {
          appointment_reminder =
            await AppointmentReminderDetailsRepository.upsert(
              {
                schedule_id: schedule.id,
                contact_id: input.contact_id,
                ...input.appointment_details,
              },
              client
            );
        }

        const runAt = await getNextRunAtForSchedule(schedule);

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

        await client.query('COMMIT');
        return {
          schedule,
          appointment_reminder,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }),

  deleteSchedule: protectedProcedure
    .input(deleteScheduleInput)
    .mutation(async ({ input }) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        await client.query(
          `DELETE FROM reassurance_call_jobs WHERE schedule_id = $1`,
          [input.id]
        );

        await AppointmentReminderDetailsRepository.deleteByScheduleId(
          input.id,
          client
        );

        const res = await client.query(
          `DELETE FROM reassurance_call_schedules WHERE id = $1 RETURNING id`,
          [input.id]
        );

        if (res.rowCount === 0) {
          throw new Error('Schedule not found');
        }

        await client.query('COMMIT');
        return { id: input.id };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }),
});

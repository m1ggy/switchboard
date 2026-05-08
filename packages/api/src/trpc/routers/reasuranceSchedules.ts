import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceSchedulesRepository, type UpdateScheduleInput } from '@/db/repositories/reassurance_schedules';
import { getNextRunAtForSchedule } from '@/lib/jobs/getNextRunAtForSchedule';
import { ReassuranceCallSchedule } from '@/types/db';
import crypto from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

const scriptTypeEnum = z.enum(['template', 'custom']);
const nameInScriptEnum = z.enum(['contact', 'caller']);
const frequencyEnum = z.enum([
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'custom',
]);
const templateEnum = z.enum(['wellness', 'safety', 'medication', 'social']);

const baseScheduleInput = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
  callerName: z.string().optional().nullable(),

  // NEW: emergency contact
  emergencyContactName: z.string().min(1),
  emergencyContactPhoneNumber: z.string().min(1),

  scriptType: scriptTypeEnum,
  template: templateEnum.optional().nullable(), // only required when scriptType === 'template'
  scriptContent: z.string().optional().nullable(), // only required when scriptType === 'custom'
  nameInScript: nameInScriptEnum,

  frequency: frequencyEnum,
  frequencyDays: z.number().int().positive().optional().nullable(), // for custom
  frequencyTime: z.string().min(1), // "HH:MM" from frontend
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
  retryInterval: z.number().int().positive(), // minutes
  companyId: z.string().uuid(),
  numberId: z.string().uuid(),
});

export const reassuranceSchedulesRouter = t.router({
  createSchedule: protectedProcedure
    .input(baseScheduleInput)
    .mutation(async ({ input }) => {
      const schedule = await ReassuranceSchedulesRepository.include({
        name: input.name,
        phone_number: input.phoneNumber,
        caller_name: input.callerName ?? null,

        // NEW: emergency contact
        emergency_contact_name: input.emergencyContactName,
        emergency_contact_phone_number: input.emergencyContactPhoneNumber,

        script_type: input.scriptType,
        template: input.template ?? null,
        script_content: input.scriptContent ?? null,
        name_in_script: input.nameInScript,
        frequency: input.frequency,
        frequency_days: input.frequencyDays ?? null,
        frequency_time: input.frequencyTime,
        selected_days: input.selectedDays ?? null,
        calls_per_day: input.callsPerDay,
        max_attempts: input.maxAttempts,
        retry_interval: input.retryInterval,
        company_id: input.companyId,
        number_id: input.numberId,
      });

      const runAt = await getNextRunAtForSchedule(schedule);

      if (runAt) {
        await ReassuranceCallJobsRepository.include({
          id: crypto.randomUUID() as string,
          schedule_id: schedule.id,
          run_at: runAt,
          attempt: 1,
          status: 'pending',
        });
      }

      return schedule as ReassuranceCallSchedule;
    }),

  /**
   * Get all reassurance schedules
   */
  getSchedules: protectedProcedure
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ input }) => {
      const schedules = await ReassuranceSchedulesRepository.getAll(
        input.companyId
      );
      return schedules as ReassuranceCallSchedule[];
    }),

  /**
   * Get a single schedule by ID
   */
  getScheduleById: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        companyId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const schedule = await ReassuranceSchedulesRepository.find(
        input.id,
        input.companyId
      );
      return schedule as ReassuranceCallSchedule | null;
    }),

  /**
   * Delete a schedule by ID
   */
  deleteSchedule: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        companyId: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      await ReassuranceSchedulesRepository.delete(input.id, input.companyId);
      return { success: true };
    }),

  /**
   * Update a schedule by ID (partial)
   */
  updateSchedule: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        data: baseScheduleInput.partial(),
        companyId: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, data } = input;

      // Map camelCase -> snake_case for repository.update
      const updates: Partial<ReassuranceCallSchedule> = {};

      if (data.name !== undefined) updates.name = data.name;
      if (data.phoneNumber !== undefined)
        updates.phone_number = data.phoneNumber;
      if (data.callerName !== undefined) updates.caller_name = data.callerName;

      // NEW: emergency contact mappings
      if (data.emergencyContactName !== undefined)
        updates.emergency_contact_name = data.emergencyContactName;
      if (data.emergencyContactPhoneNumber !== undefined)
        updates.emergency_contact_phone_number =
          data.emergencyContactPhoneNumber;

      if (data.scriptType !== undefined) updates.script_type = data.scriptType;
      if (data.template !== undefined) updates.template = data.template;
      if (data.scriptContent !== undefined)
        updates.script_content = data.scriptContent;
      if (data.nameInScript !== undefined)
        updates.name_in_script = data.nameInScript;
      if (data.frequency !== undefined) updates.frequency = data.frequency;
      if (data.frequencyDays !== undefined)
        updates.frequency_days = data.frequencyDays;
      if (data.frequencyTime !== undefined)
        updates.frequency_time = data.frequencyTime;
      if (data.selectedDays !== undefined)
        updates.selected_days = data.selectedDays;
      if (data.callsPerDay !== undefined)
        updates.calls_per_day = data.callsPerDay;
      if (data.maxAttempts !== undefined)
        updates.max_attempts = data.maxAttempts;
      if (data.retryInterval !== undefined)
        updates.retry_interval = data.retryInterval;

      const existing = await ReassuranceSchedulesRepository.find(id, input.companyId);
      if (!existing) return null;

      const updated = await ReassuranceSchedulesRepository.update({
        id: existing.id,
        name: updates.name ?? existing.name,
        caller_name: updates.caller_name !== undefined ? updates.caller_name : existing.caller_name,
        script_type: updates.script_type ?? existing.script_type,
        template: (updates.template !== undefined ? updates.template : existing.template) as UpdateScheduleInput['template'],
        script_content: updates.script_content !== undefined ? updates.script_content : existing.script_content,
        name_in_script: updates.name_in_script ?? existing.name_in_script,
        frequency: updates.frequency ?? existing.frequency,
        frequency_days: updates.frequency_days !== undefined ? updates.frequency_days : existing.frequency_days,
        frequency_time: updates.frequency_time ?? existing.frequency_time,
        selected_days: updates.selected_days !== undefined ? updates.selected_days : existing.selected_days,
        calls_per_day: updates.calls_per_day ?? existing.calls_per_day,
        max_attempts: updates.max_attempts ?? existing.max_attempts,
        retry_interval: updates.retry_interval ?? existing.retry_interval,
        is_active: updates.is_active !== undefined ? updates.is_active : existing.is_active,
        emergency_contact_name: updates.emergency_contact_name !== undefined ? updates.emergency_contact_name : existing.emergency_contact_name,
        emergency_contact_phone: updates.emergency_contact_phone_number !== undefined ? updates.emergency_contact_phone_number : existing.emergency_contact_phone_number,
      });
      if (!updated) {
        return null;
      }

      const timingFieldsTouched =
        data.frequency !== undefined ||
        data.frequencyDays !== undefined ||
        data.frequencyTime !== undefined ||
        data.selectedDays !== undefined ||
        data.callsPerDay !== undefined ||
        data.retryInterval !== undefined;

      if (timingFieldsTouched && updated.is_active) {
        const runAt = await getNextRunAtForSchedule(
          updated as ReassuranceCallSchedule
        );

        if (runAt) {
          await ReassuranceCallJobsRepository.reschedulePendingForSchedule(
            updated.id,
            runAt
          );
        }
      }

      return updated as ReassuranceCallSchedule | null;
    }),

  /**
   * Enable a schedule (set is_active = true)
   */
  enableSchedule: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        companyId: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      const schedule = await ReassuranceSchedulesRepository.setActive(
        input.id,
        input.companyId,
        true
      );

      if (!schedule) {
        return null;
      }

      // Check if an active job already exists
      const existing =
        await ReassuranceCallJobsRepository.findActiveForSchedule(schedule.id);

      if (!existing) {
        const runAt = await getNextRunAtForSchedule(schedule);

        if (runAt) {
          await ReassuranceCallJobsRepository.include({
            id: crypto.randomUUID(),
            schedule_id: schedule.id,
            run_at: runAt,
            attempt: 1,
            status: 'pending',
          });
        }
      }

      return schedule as ReassuranceCallSchedule;
    }),

  /**
   * Disable a schedule (set is_active = false)
   */
  disableSchedule: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        companyId: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      const updated = await ReassuranceSchedulesRepository.setActive(
        input.id,
        input.companyId,
        false
      );

      return updated as ReassuranceCallSchedule | null;
    }),
  getScheduleCallLogs: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        companyId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 20;

      const result =
        await ReassuranceSchedulesRepository.getPaginatedScheduleCallLogs({
          page,
          pageSize,
          company_id: input.companyId,
        });

      return result;
    }),
});

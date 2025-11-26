import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';
import { ReassuranceCallSchedule } from '@/types/db';
import crypto from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

function getNextRunAtForSchedule(schedule: ReassuranceCallSchedule): Date {
  const now = new Date();

  // frequency_time is 'HH:MM' or 'HH:MM:SS'
  const [hourStr, minuteStr] = schedule.frequency_time.split(':');
  const hour = parseInt(hourStr, 10) || 0;
  const minute = parseInt(minuteStr ?? '0', 10) || 0;

  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);

  // If that time today is already past, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

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
  /**
   * Create a new reassurance schedule
   */
  createSchedule: protectedProcedure
    .input(baseScheduleInput)
    .mutation(async ({ input }) => {
      const schedule = await ReassuranceSchedulesRepository.include({
        name: input.name,
        phone_number: input.phoneNumber,
        caller_name: input.callerName ?? null,
        script_type: input.scriptType,
        template: input.template ?? null,
        script_content: input.scriptContent ?? null,
        name_in_script: input.nameInScript,
        frequency: input.frequency,
        frequency_days: input.frequencyDays ?? null,
        frequency_time: input.frequencyTime,
        selected_days: input.selectedDays ?? ['monday'],
        calls_per_day: input.callsPerDay,
        max_attempts: input.maxAttempts,
        retry_interval: input.retryInterval,
        company_id: input.companyId,
        number_id: input.numberId,
      });

      const runAt = getNextRunAtForSchedule(schedule);

      await ReassuranceCallJobsRepository.include({
        id: crypto.randomUUID() as string,
        schedule_id: schedule.id,
        run_at: runAt,
        attempt: 1,
        status: 'pending',
      });

      return schedule as ReassuranceCallSchedule;
    }),

  /**
   * Get all reassurance schedules
   */
  getSchedules: protectedProcedure.query(async () => {
    const schedules = await ReassuranceSchedulesRepository.getAll();
    return schedules as ReassuranceCallSchedule[];
  }),

  /**
   * Get a single schedule by ID
   */
  getScheduleById: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
      })
    )
    .query(async ({ input }) => {
      const schedule = await ReassuranceSchedulesRepository.find(input.id);
      return schedule as ReassuranceCallSchedule | null;
    }),

  /**
   * Delete a schedule by ID
   */
  deleteSchedule: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
      })
    )
    .mutation(async ({ input }) => {
      await ReassuranceSchedulesRepository.delete(input.id);
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

      const updated = await ReassuranceSchedulesRepository.update(id, updates);

      return updated as ReassuranceCallSchedule | null;
    }),

  /**
   * Enable a schedule (set is_active = true)
   */
  enableSchedule: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
      })
    )
    .mutation(async ({ input }) => {
      const schedule = await ReassuranceSchedulesRepository.update(input.id, {
        is_active: true as any,
      });

      if (!schedule) {
        return null;
      }

      // Check if an active job already exists
      const existing =
        await ReassuranceCallJobsRepository.findActiveForSchedule(schedule.id);

      if (!existing) {
        const runAt = getNextRunAtForSchedule(schedule);

        await ReassuranceCallJobsRepository.include({
          id: crypto.randomUUID(),
          schedule_id: schedule.id,
          run_at: runAt,
          attempt: 1,
          status: 'pending',
        });
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
      })
    )
    .mutation(async ({ input }) => {
      const updated = await ReassuranceSchedulesRepository.update(input.id, {
        is_active: false as boolean,
      });

      return updated as ReassuranceCallSchedule | null;
    }),
  getScheduleCallLogs: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        companyId: z.string().uuid().optional(),
      })
    )
    .query(async ({ input }) => {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 20;

      const result =
        await ReassuranceSchedulesRepository.getPaginatedScheduleCallLogs({
          page,
          pageSize,
          companyId: input.companyId,
        });

      return result;
    }),
});

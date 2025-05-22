import { CallsRepository } from '@/db/repositories/calls';
import { Call, Contact } from '@/types/db';
import crypto from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const logsRouter = t.router({
  createCallLog: protectedProcedure
    .input(
      z.object({
        numberId: z.string(),
        contactId: z.string(),
        initiatedAt: z.date().optional(),
        duration: z.number(),
        meta: z
          .object({
            CallSid: z.string(),
            From: z.string().optional(),
            To: z.string().optional(),
            CallStatus: z.string().optional(),
            Direction: z.string().optional(),
            DeviceType: z.string().optional(),
            UserAgent: z.string().optional(),
            AudioIssues: z.array(z.string()).optional(),
          })
          .passthrough(),
      })
    )
    .mutation(async ({ input }) => {
      const callLog = await CallsRepository.create({
        id: crypto.randomUUID() as string,
        number_id: input.numberId,
        contact_id: input.contactId,
        initiated_at: input.initiatedAt,
        duration: input.duration,
        meta: input.meta,
      });

      return callLog;
    }),
  getNumberCallLogs: protectedProcedure
    .input(
      z.object({
        numberId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const calls = await CallsRepository.findByNumberWithContact(
        input.numberId
      );

      return calls as (Call & { contact: Contact })[];
    }),
});

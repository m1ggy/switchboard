import { CallsRepository } from '@/db/repositories/calls';
import { ContactsRepository } from '@/db/repositories/contacts';
import { InboxesRepository } from '@/db/repositories/inboxes';
import { NumbersRepository } from '@/db/repositories/numbers';
import { app } from '@/index';
import { notifyUser } from '@/lib/helpers';
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
        callSid: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existingCallLog = await CallsRepository.findBySID(input.callSid);

      if (existingCallLog) {
        return await CallsRepository.update(input.callSid, {
          duration: input.duration,
        });
      }
      const callLog = await CallsRepository.create({
        id: crypto.randomUUID() as string,
        number_id: input.numberId,
        contact_id: input.contactId,
        initiated_at: input.initiatedAt,
        duration: input.duration,
        meta: input.meta,
        call_sid: input.callSid,
      });

      const inbox = await InboxesRepository.findOrCreate({
        numberId: input.numberId,
        contactId: input.contactId,
      });

      InboxesRepository.updateLastCall(inbox.id, callLog.id);
      const number = await NumbersRepository.findById(input.numberId);
      const contact = await ContactsRepository.findById(input.contactId);

      notifyUser({
        userId: ctx.user.uid,
        app: app,
        message: `Call with ${contact?.label} ended.`,
        meta: {
          companyId: number?.company_id,
          event: 'refresh',
          target: { contactId: input.contactId },
        },
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

import { InboxesRepository } from '@/db/repositories/inboxes';
import { InboxWithDetails } from '@/types/db';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const inboxesRouter = t.router({
  getNumberInboxes: protectedProcedure
    .input(z.object({ numberId: z.string() }))
    .query(async ({ input }) => {
      const inboxes = await InboxesRepository.findByNumberId(input.numberId);
      return inboxes as InboxWithDetails[];
    }),
  getActivityByContact: protectedProcedure
    .input(
      z.object({
        contactId: z.string(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ input }) => {
      const { contactId, limit, cursor } = input;

      const results = await InboxesRepository.findActivityByContactPaginated(
        contactId,
        { limit: limit + 1, cursor }
      );

      const items = results.slice(0, limit);
      const nextCursor =
        results.length > limit ? items[items.length - 1].createdAt : null;

      return {
        items,
        nextCursor,
      };
    }),
  markAsViewed: protectedProcedure
    .input(z.object({ inboxId: z.string() }))
    .mutation(async ({ input }) => {
      await InboxesRepository.markInboxAsViewed(input.inboxId);
    }),
});

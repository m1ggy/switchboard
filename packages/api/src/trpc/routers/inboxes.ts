import { InboxesRepository } from '@/db/repositories/inboxes';
import { InboxWithDetails } from '@/types/db';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const inboxesRouter = t.router({
  getNumberInboxes: protectedProcedure
    .input(z.object({ numberId: z.string(), search: z.string().optional() }))
    .query(async ({ input }) => {
      const inboxes = await InboxesRepository.findByNumberId(input.numberId, {
        search: input.search,
      });
      return inboxes as InboxWithDetails[];
    }),
  getActivityByContact: protectedProcedure
    .input(
      z.object({
        contactId: z.string(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z
          .object({
            createdAt: z.string(),
            id: z.string(),
          })
          .nullish(),
        numberId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { contactId, limit, cursor } = input;

      const results = await InboxesRepository.findActivityByContactPaginated(
        contactId,
        {
          limit,
          cursorCreatedAt: cursor?.createdAt,
          cursorId: cursor?.id,
          numberId: input.numberId,
        }
      );

      const hasMore = results.length === limit;

      return {
        items: results, // reverse to show oldest first
        nextCursor: hasMore
          ? {
              createdAt: results.at(-1)?.createdAt as string,
              id: results.at(-1)?.id as string,
            }
          : null,
      };
    }),

  markAsViewed: protectedProcedure
    .input(z.object({ inboxId: z.string() }))
    .mutation(async ({ input }) => {
      await InboxesRepository.markInboxAsViewed(input.inboxId);
    }),
  getUnreadInboxesCount: protectedProcedure
    .input(z.object({ numberId: z.string() }))
    .query(async ({ input }) => {
      return await InboxesRepository.findInboxesWithUnreadMessageCounts(
        input.numberId
      );
    }),
  getUnreadCountByInboxId: protectedProcedure
    .input(
      z.object({
        numberId: z.string(),
        inboxId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const count = await InboxesRepository.getUnreadCountForInbox(
        input.numberId,
        input.inboxId
      );

      return count;
    }),
});

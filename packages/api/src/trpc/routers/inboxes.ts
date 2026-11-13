import { InboxesRepository } from '@/db/repositories/inboxes';
import { InboxWithDetails } from '@/types/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  assertContactAccess,
  assertInboxAccess,
  assertNumberAccess,
} from '../authz';
import { protectedProcedure, t } from '../trpc';

export const inboxesRouter = t.router({
  getNumberInboxes: protectedProcedure
    .input(z.object({ numberId: z.string(), search: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      await assertNumberAccess(ctx.user.uid, input.numberId);
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
    .query(async ({ input, ctx }) => {
      const { contactId, limit, cursor } = input;
      await assertContactAccess(ctx.user.uid, contactId);
      await assertNumberAccess(ctx.user.uid, input.numberId);

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
        items: results,
        nextCursor: hasMore
          ? {
              createdAt: results.at(-1)?.createdAt as string,
              id: results.at(-1)?.id as string,
            }
          : null,
      };
    }),

  searchActivityByContact: protectedProcedure
    .input(
      z.object({
        contactId: z.string(),
        numberId: z.string(),
        query: z.string().trim().min(1).max(200),
        limit: z.number().min(1).max(500).default(200),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertContactAccess(ctx.user.uid, input.contactId);
      await assertNumberAccess(ctx.user.uid, input.numberId);
      return InboxesRepository.searchActivityByContact(input.contactId, {
        query: input.query,
        numberId: input.numberId,
        limit: input.limit,
      });
    }),

  createInboxIfNotExists: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        numberId: z.string(),
        contactId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const contact = await assertContactAccess(ctx.user.uid, input.contactId);
      const number = await assertNumberAccess(ctx.user.uid, input.numberId);
      if (
        contact.company_id !== input.companyId ||
        number.company_id !== input.companyId
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Contact and number must belong to the given company.',
        });
      }

      const inbox = await InboxesRepository.findOrCreate({
        numberId: input.numberId,
        contactId: input.contactId,
      });

      return inbox;
    }),

  markAsViewed: protectedProcedure
    .input(z.object({ inboxId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await assertInboxAccess(ctx.user.uid, input.inboxId);
      await InboxesRepository.markInboxAsViewed(input.inboxId);
    }),

  getUnreadInboxesCount: protectedProcedure
    .input(z.object({ numberId: z.string() }))
    .query(async ({ input, ctx }) => {
      await assertNumberAccess(ctx.user.uid, input.numberId);
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
    .query(async ({ input, ctx }) => {
      await assertNumberAccess(ctx.user.uid, input.numberId);
      await assertInboxAccess(ctx.user.uid, input.inboxId);
      const count = await InboxesRepository.getUnreadCountForInbox(
        input.numberId,
        input.inboxId
      );

      return count;
    }),
});

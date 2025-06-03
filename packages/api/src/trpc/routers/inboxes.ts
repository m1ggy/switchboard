import { InboxesRepository } from '@/db/repositories/inboxes';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const inboxesRouter = t.router({
  getNumberInboxes: protectedProcedure
    .input(z.object({ numberId: z.string() }))
    .query(async ({ input }) => {
      const inboxes = await InboxesRepository.findByNumberId(input.numberId);
      return inboxes;
    }),
});

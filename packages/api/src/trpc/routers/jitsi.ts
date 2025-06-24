import { createJitsiToken } from '@/lib/jitsi';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const jitsiRouter = t.router({
  token: protectedProcedure
    .input(z.object({ roomName: z.string() }))
    .query(async ({ ctx, input }) => {
      return createJitsiToken(ctx.user, input.roomName);
    }),
});

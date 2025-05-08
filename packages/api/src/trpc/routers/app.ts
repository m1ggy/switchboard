import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { t } from '../trpc';
import { pingRouter } from './ping';

export const protectedProcedure = t.procedure.use(
  async function isAuthed(opts) {
    const { ctx } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return opts.next({
      ctx: {
        user: ctx.user,
      },
    });
  }
);

export const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return {
        greeting: `Hello, ${input?.name ?? 'world'}!`,
      };
    }),
  ping: pingRouter.ping,
});

// Export type for frontend inference
export type AppRouter = typeof appRouter;

import { z } from 'zod';
import { t } from '../trpc.js';

export const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return {
        greeting: `Hello, ${input?.name ?? 'world'}!`,
      };
    }),
});

// Export type for frontend inference
export type AppRouter = typeof appRouter;

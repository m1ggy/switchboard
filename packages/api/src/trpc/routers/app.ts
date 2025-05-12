import { protectedProcedure, t } from '../trpc';
import { pingRouter } from './ping';

export const appRouter = t.router({
  ping: pingRouter.ping,
  testProtectedRoute: protectedProcedure.query(() => ({ protected: true })),
});

export type AppRouter = typeof appRouter;

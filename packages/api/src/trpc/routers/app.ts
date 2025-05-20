import { protectedProcedure, t } from '../trpc';
import { pingRouter } from './ping';
import { twilioRouter } from './twilio';

export const appRouter = t.router({
  ping: pingRouter.ping,
  testProtectedRoute: protectedProcedure.query(() => ({ protected: true })),
  twilio: twilioRouter,
});

export type AppRouter = typeof appRouter;

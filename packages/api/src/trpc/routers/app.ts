import { protectedProcedure, t } from '../trpc';
import { companiesRouter } from './companies';
import { contactsRouter } from './contacts';
import { numbersRouter } from './numbers';
import { pingRouter } from './ping';
import { twilioRouter } from './twilio';

export const appRouter = t.router({
  ping: pingRouter.ping,
  testProtectedRoute: protectedProcedure.query(() => ({ protected: true })),
  twilio: twilioRouter,
  numbers: numbersRouter,
  companies: companiesRouter,
  contacts: contactsRouter,
});

export type AppRouter = typeof appRouter;

import { protectedProcedure, t } from '../trpc';
import { companiesRouter } from './companies';
import { contactsRouter } from './contacts';
import { logsRouter } from './logs';
import { notificationsRouter } from './notifications';
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
  logs: logsRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;

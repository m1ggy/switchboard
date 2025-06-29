import { protectedProcedure, t } from '../trpc';
import { companiesRouter } from './companies';
import { contactsRouter } from './contacts';
import { inboxesRouter } from './inboxes';
import { logsRouter } from './logs';
import { notificationsRouter } from './notifications';
import { numbersRouter } from './numbers';
import { pingRouter } from './ping';
import { statisticsRouter } from './statistics';
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
  inboxes: inboxesRouter,
  statistics: statisticsRouter,
});

export type AppRouter = typeof appRouter;

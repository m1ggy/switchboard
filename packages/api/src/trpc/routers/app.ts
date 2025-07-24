import { protectedProcedure, t } from '../trpc';
import { companiesRouter } from './companies';
import { contactsRouter } from './contacts';
import { inboxesRouter } from './inboxes';
import { jitsiRouter } from './jitsi';
import { logsRouter } from './logs';
import { notesRouter } from './notes';
import { notificationsRouter } from './notifications';
import { numbersRouter } from './numbers';
import { pingRouter } from './ping';
import { shortUrlRouter } from './shortUrls';
import { statisticsRouter } from './statistics';
import { twilioRouter } from './twilio';
import { usersRouter } from './users';

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
  jitsi: jitsiRouter,
  notes: notesRouter,
  shortenUrl: shortUrlRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = t.createCallerFactory(appRouter);

export const caller = createCaller({ user: null });

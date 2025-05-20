import { t } from '../trpc';

export const contactsRouter = t.router({
  createContact: t.procedure.query(() => 'hello!'),
});

import { protectedProcedure, t } from '../trpc';

const jitsiRouter = t.router({
  token: protectedProcedure.query(async ({ ctx }) => {}),
});

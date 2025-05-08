import { router, t } from '../trpc';

export const pingRouter = router({
  ping: t.procedure.query(() => {
    return 'pong';
  }),
});

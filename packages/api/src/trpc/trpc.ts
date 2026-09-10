import { isAccountDisabled } from '@/lib/subscriptionGuard';
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const procedure = t.procedure;

export const protectedProcedure = t.procedure.use(
  async function isAuthed(opts) {
    const { ctx } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    if (isAccountDisabled(ctx.userInfo)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'ACCOUNT_DISABLED' });
    }
    return opts.next({
      ctx: {
        user: ctx.user,
      },
    });
  }
);

export { t };

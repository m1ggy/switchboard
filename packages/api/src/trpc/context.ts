// src/server/trpc/context.ts
import { UsersRepository } from '@/db/repositories/users';
import { auth } from '@/lib/firebase';
import { isExpiredFromDb, isExpiredFromStripe } from '@/lib/subscriptionGuard';
import { initTRPC } from '@trpc/server';
import * as trpcFastify from '@trpc/server/adapters/fastify';
import type { DecodedIdToken } from 'firebase-admin/auth';

export async function createContext({
  req,
}: trpcFastify.CreateFastifyContextOptions) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  let user: DecodedIdToken | null = null;
  if (token) {
    try {
      user = await auth.verifyIdToken(token);
    } catch (err) {
      console.error('Failed to verify Firebase token', err);
    }
  }

  console.log('FIREBASE USER: ', user);

  const userInfo = user
    ? await UsersRepository.findByFirebaseUid(user.uid)
    : null;

  console.log('USER: ', JSON.stringify({ userInfo }, null, 2));
  if (!user) throw new Error('User does not exist');

  return { user, userInfo };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new Error('UNAUTHORIZED');
  }
  return next();
});

// Paid gate: blocks when expired (admin bypass)
export const paidProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const ui = ctx.userInfo;
  if (!ui) throw new Error('UNAUTHORIZED');

  if (ui.stripe_customer_id === 'ADMIN') {
    return next();
  }

  // DB-first
  let reason = isExpiredFromDb(ui);
  if (reason !== 'OK' && reason !== 'ADMIN_BYPASS') {
    // optional Stripe fallback
    reason = await isExpiredFromStripe(ui);
  }

  if (reason === 'OK' || reason === 'ADMIN_BYPASS') {
    return next();
  }

  throw new Error(`SUBSCRIPTION_EXPIRED:${reason}`);
});

// src/server/http/middlewares.ts
import { UsersRepository } from '@/db/repositories/users';
import { auth } from '@/lib/firebase';
import {
  FrozenReason,
  isExpiredFromDb,
  isExpiredFromStripe,
} from '@/lib/subscriptionGuard';
import { FastifyReply, FastifyRequest } from 'fastify';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply
        .status(401)
        .send({ error: 'Unauthorized - No Token Provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = await auth.verifyIdToken(token);
    request.user = decoded;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized - Invalid Token' });
  }
}

// Paths that should bypass the freeze (billing, settings, webhooks, auth, health)
const BYPASS_PATHS = ['/twilio/presence', '/health'];

export async function subscriptionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const path = request.routerPath || request.url || '';
  if (BYPASS_PATHS.some((p) => path.startsWith(p))) return;

  const user = request.user;
  if (!user) return reply.status(403).send({ error: 'Forbidden' });

  const userInfo = await UsersRepository.findByFirebaseUid(user.uid);
  if (!userInfo) return reply.status(403).send({ error: 'Forbidden' });

  // Admin bypass
  if (userInfo.stripe_customer_id === 'ADMIN') return;

  // 1) DB-first
  let reason: FrozenReason = isExpiredFromDb(userInfo);

  // 2) Stripe fallback if DB inconclusive (NO_SUBSCRIPTION) or you want to be extra safe
  if (reason !== 'OK' && reason !== 'ADMIN_BYPASS') {
    // If you prefer to rely solely on DB values, comment this out.
    // Otherwise, keep for sanity check in rare race conditions.
    const stripeReason = await isExpiredFromStripe(userInfo);
    // choose the stricter outcome
    if (stripeReason !== 'OK' && stripeReason !== 'ADMIN_BYPASS') {
      reason = stripeReason;
    }
  }

  switch (reason) {
    case 'OK':
    case 'ADMIN_BYPASS':
      return;
    case 'NO_USER':
    case 'NO_SUBSCRIPTION':
    case 'CANCELED_ENDED':
    case 'INCOMPLETE_EXPIRED':
    case 'UNPAID_ENDED':
    default:
      return reply.status(403).send({
        error: 'Subscription expired',
        reason,
      });
  }
}

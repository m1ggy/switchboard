import { auth } from '@/lib/firebase';
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

  return { user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

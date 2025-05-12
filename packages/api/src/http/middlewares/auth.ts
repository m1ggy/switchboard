import { auth } from '@/lib/firebase';
import { FastifyReply, FastifyRequest } from 'fastify';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply
        .status(401)
        .send({ error: 'Unauthorized - No Token Provided' });
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await auth.verifyIdToken(token);

    request.user = decodedToken;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized - Invalid Token' });
  }
}

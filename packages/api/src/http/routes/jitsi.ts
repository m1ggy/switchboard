import { createJitsiToken } from '@/lib/jitsi';
import { type FastifyInstance } from 'fastify';
import { authMiddleware } from '../middlewares/auth';

async function jitsiRoutes(app: FastifyInstance) {
  // 🔹 GET /jitsi/token?roomName=ROOM
  app.get('/token', { preHandler: authMiddleware }, async (req, reply) => {
    const { roomName } = req.query as { roomName?: string };

    if (!roomName) {
      return reply.status(400).send({ error: 'Missing roomName' });
    }

    const user = req.user;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const token = createJitsiToken(user, roomName);
      return reply.send({ token });
    } catch (err) {
      console.error('[Jitsi] Token generation failed:', err);
      return reply.status(500).send({ error: 'Failed to generate token' });
    }
  });
}

export default jitsiRoutes;

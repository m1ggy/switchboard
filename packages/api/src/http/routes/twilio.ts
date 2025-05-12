import { TwilioClient } from '@/lib/twilio';
import { type FastifyInstance } from 'fastify';
import { authMiddleware } from '../middlewares/auth';

async function routes(app: FastifyInstance) {
  app.post(
    '/voice-token',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const tw = new TwilioClient(
          process.env.TWILIO_ACCOUNT_SID! as string,
          process.env.TWILIO_AUTH_TOKEN! as string
        );
      } catch (error) {
        app.log.error('Post voice token error: ', error);
        return reply.status(500).send({ message: 'An error occurred!' });
      }
    }
  );
}

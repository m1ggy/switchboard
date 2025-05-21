import { type FastifyInstance } from 'fastify';
import twilio from 'twilio';

const { twiml } = twilio;
async function routes(app: FastifyInstance) {
  app.post('/voice', async (request, reply) => {
    const response = new twiml.VoiceResponse();

    const { To, From, Direction, Caller } = request.body as Record<
      string,
      string
    >;

    if (To?.startsWith('+')) {
      response.say('Connecting your call...');
      response.dial(To);
    } else {
      response.say('You have an incoming call. Connecting to an agent.');
      const dial = response.dial();
      dial.client('client');
    }

    reply
      .header('Content-Type', 'text/xml')
      .status(200)
      .send(response.toString());
  });
}

export default routes;

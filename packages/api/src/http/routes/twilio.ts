import { type FastifyInstance } from 'fastify';
import { twiml } from 'twilio';

async function routes(app: FastifyInstance) {
  app.post('/voice', async (request, reply) => {
    const response = new twiml.VoiceResponse();

    // Parse Twilio's webhook payload
    const { To, From, Direction, Caller } = request.body as Record<
      string,
      string
    >;

    // Case 1: Outbound call (client → number)
    if (To?.startsWith('+')) {
      response.say('Connecting your call...');
      response.dial(To);
    }
    // Case 2: Inbound call (external → your Twilio number)
    else {
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

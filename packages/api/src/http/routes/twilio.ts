import { type FastifyInstance } from 'fastify';
import twilio from 'twilio';

const { twiml } = twilio;
async function routes(app: FastifyInstance) {
  app.post('/voice', async (request, reply) => {
    const response = new twiml.VoiceResponse();

    const { To, From, Direction, Caller, CallerId } = request.body as Record<
      string,
      string
    >;

    if (To?.startsWith('+')) {
      response.say('Connecting your call...');
      response.dial({ callerId: CallerId }, To);
    } else {
      response.say('Connecting your call, please wait...');
      const dial = response.dial({ callerId: From });
      dial.client('client');
    }

    reply
      .header('Content-Type', 'text/xml')
      .status(200)
      .send(response.toString());
  });
}

export default routes;

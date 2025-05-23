import { type FastifyInstance } from 'fastify';
import twilio from 'twilio';

const { twiml } = twilio;
async function routes(app: FastifyInstance) {
  app.post('/voice', async (request, reply) => {
    const response = new twiml.VoiceResponse();
    const { To, From, CallerId } = request.body as Record<string, string>;

    const callerId = CallerId || From;

    console.log({ callerId, To });

    if (!To && !callerId) {
      reply.code(400).send('Missing required fields: To or CallerId/From');
      return;
    }

    if (To.startsWith('+')) {
      response.say('Connecting your call...');
      response.dial({ callerId }, To);
    } else {
      response.say('Connecting your call, please wait...');
      const dial = response.dial({ callerId });
      dial.client(To);
    }

    reply
      .header('Content-Type', 'text/xml')
      .status(200)
      .send(response.toString());
  });

  app.post('/voice/status', async (req, res) => {
    const { CallStatus, From, To, Duration } = req.body as Record<
      string,
      string
    >;

    const isMissed =
      CallStatus === 'completed' && (!Duration || Duration === '0');

    if (isMissed) {
      console.log(`Missed call from ${From} to ${To}`);
    }

    res.status(200).send('OK');
  });
}

export default routes;

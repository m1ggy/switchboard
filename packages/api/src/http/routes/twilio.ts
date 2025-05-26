import { NumbersRepository } from '@/db/repositories/numbers';
import { sendCallAlertToSlack } from '@/lib/slack';
import { type FastifyInstance } from 'fastify';
import twilio from 'twilio';

const { twiml } = twilio;
async function routes(app: FastifyInstance) {
  app.post('/twilio/voice', async (request, reply) => {
    const response = new twiml.VoiceResponse();
    const { To, From, CallerId, Direction, ParentCallSid } =
      request.body as Record<string, string>;

    const matchingInHouseNumber = await NumbersRepository.findByNumber(To);
    const callerId = CallerId || From;

    const isInbound = Direction === 'inbound';
    const isInboundToOwnNumber = isInbound && matchingInHouseNumber;
    const isDialLoop = isInboundToOwnNumber && !!ParentCallSid;

    if (isDialLoop) {
      console.log('⚠️ Detected call loop. Ending call.');
      response.say('Sorry, we could not connect your call.');
      return reply.type('text/xml').status(200).send(response.toString());
    }

    if (isInboundToOwnNumber) {
      console.log('📞 Inbound call to Twilio number — routing to client');
      response.say('Connecting you to support.');
      response.dial().client(To); // same number as identity
      return reply.type('text/xml').status(200).send(response.toString());
    }

    if (To.startsWith('+')) {
      console.log('📤 Outbound dial to PSTN:', To);
      response.say('Connecting your call...');
      response.dial({ callerId }, To);
      await sendCallAlertToSlack({ from: callerId, to: To });
    } else {
      console.log('📤 Outbound dial to client:', To);
      response.say('Connecting your call...');
      response.dial({ callerId }).client(To);
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
  app.post('/voice/bridge', async (req, reply) => {
    const { client } = req.query as Record<string, string>;
    const response = new twiml.VoiceResponse();
    response.say('Connecting you now.');
    const dial = response.dial();
    dial.client(client);
    reply.type('text/xml').send(response.toString());
  });
}

export default routes;

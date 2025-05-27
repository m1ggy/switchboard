import { NumbersRepository } from '@/db/repositories/numbers';
import { sendCallAlertToSlack } from '@/lib/slack';
import { activeCallStore, presenceStore } from '@/lib/store';
import { TwilioClient } from '@/lib/twilio';
import { type FastifyInstance } from 'fastify';
import twilio from 'twilio';

const { twiml } = twilio;

const twilioClient = new TwilioClient(
  process.env.TWILIO_ACCOUNT_SID as string,
  process.env.TWILIO_AUTH_TOKEN as string
);

async function routes(app: FastifyInstance) {
  app.post('/voice', async (request, reply) => {
    const { To, From, CallerId, Direction, ParentCallSid, CallSid } =
      request.body as Record<string, string>;

    console.log('📞 CALL BODY:', request.body);

    const response = new twiml.VoiceResponse();
    const callerId = CallerId || From;
    const isInbound = Direction === 'inbound';

    if (!To) {
      response.say('Invalid destination number.');
      return reply.type('text/xml').status(400).send(response.toString());
    }

    // Lookup internal number mapping (if any)
    const numberRecord = await NumbersRepository.findByNumber(To);
    const agentIdentity = numberRecord?.number as string;

    // Evaluate conditions for outbound PSTN call
    const isFromClient = From?.startsWith('client:');
    const isToPSTN = To.startsWith('+');
    const isOutboundToPSTN = isFromClient && isToPSTN && !numberRecord;

    console.log('🔎 PSTN Call Evaluation:', {
      From,
      To,
      isFromClient,
      isToPSTN,
      numberRecordExists: !!numberRecord,
      isOutboundToPSTN,
      Direction,
    });

    // ✅ Handle outbound PSTN call from Twilio client
    if (isOutboundToPSTN) {
      console.log('📤 Outbound PSTN call from client:', From, '→', To);
      response.say('Connecting your call...');
      response.dial({ callerId }, To);
      return reply.type('text/xml').status(200).send(response.toString());
    }

    // 🔁 Handle inbound to in-house number
    const isInboundToOwnNumber = isInbound && !!numberRecord;
    const isDialLoop = isInboundToOwnNumber && !!ParentCallSid;

    if (isDialLoop) {
      console.log('⚠️ Detected call loop. Ending call.');
      response.say('Sorry, we could not connect your call.');
      return reply.type('text/xml').status(200).send(response.toString());
    }

    // Add to call store
    activeCallStore.add({
      sid: CallSid,
      from: From,
      to: To,
      status: 'initiated',
      startedAt: new Date(),
    });

    // ✅ Handle external inbound calls to internal numbers
    const isExternalInbound =
      isInbound && !!numberRecord && !From.startsWith('client:');
    if (isExternalInbound) {
      const isAgentAvailable = presenceStore.isOnline(agentIdentity);

      if (isAgentAvailable) {
        console.log(
          `📞 External inbound call to ${To}. Bridging to agent ${agentIdentity}`
        );
        await twilioClient.bridgeCallToClient(
          CallSid,
          agentIdentity,
          'https://api.stagingspace.org/twilio/voice/bridge'
        );
        response.say('Connecting you to an agent now.');
      } else {
        const holdRoom = `hold-${CallSid}`;
        console.log(
          `⏳ External caller to ${To}, agent ${agentIdentity} is offline. Holding in ${holdRoom}`
        );
        response.say('All agents are currently busy. Please hold.');
        await sendCallAlertToSlack({ from: callerId, to: To });
        response.dial().conference(
          {
            startConferenceOnEnter: true,
            endConferenceOnExit: false,
          },
          holdRoom
        );
        activeCallStore.updateStatus(CallSid, 'held', agentIdentity);
      }

      return reply.type('text/xml').status(200).send(response.toString());
    }

    // ✅ Handle in-house calls (Twilio client to internal number)
    if (isInboundToOwnNumber && agentIdentity) {
      const isAgentAvailable = presenceStore.isOnline(agentIdentity);

      if (isAgentAvailable) {
        console.log(`✅ Agent ${agentIdentity} is online. Bridging...`);
        await twilioClient.bridgeCallToClient(
          CallSid,
          agentIdentity,
          'https://api.stagingspace.org/twilio/voice/bridge'
        );
        response.say('Connecting you to an agent now.');
      } else {
        const holdRoom = `hold-${CallSid}`;
        console.log(
          `🕒 Agent ${agentIdentity} is offline. Holding in ${holdRoom}`
        );
        await sendCallAlertToSlack({ from: callerId, to: To });

        response.say('All agents are currently busy. Please hold.');
        response.dial().conference(
          {
            startConferenceOnEnter: true,
            endConferenceOnExit: false,
          },
          holdRoom
        );
        activeCallStore.updateStatus(CallSid, 'held', agentIdentity);
      }

      return reply.type('text/xml').status(200).send(response.toString());
    }

    // 🚫 Fallback for unmapped numbers
    console.warn(`🚫 No agent identity mapped for number: ${To}`);
    response.say('We could not route your call at this time.');
    return reply.type('text/xml').status(200).send(response.toString());
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
    let { client } = req.query as Record<string, string>;

    if (client.startsWith('client:')) {
      client = client.replace(/^client:/, '');
    }
    const response = new twiml.VoiceResponse();
    response.say('Connecting you now.');
    const dial = response.dial();
    dial.client(client);
    reply.type('text/xml').send(response.toString());
  });
}

export default routes;

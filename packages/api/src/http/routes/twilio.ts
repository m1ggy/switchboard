import { UserCompaniesRepository } from '@/db/repositories/companies';
import { ContactsRepository } from '@/db/repositories/contacts';
import { NumbersRepository } from '@/db/repositories/numbers';
import { notifyIncomingCall } from '@/lib/helpers';
import { callQueueManager } from '@/lib/queue';
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

const SERVER_DOMAIN = process.env.SERVER_DOMAIN;

async function routes(app: FastifyInstance) {
  // 🔹 Voice Entry Point
  app.post('/voice', async (request, reply) => {
    const { To, From, CallerId, Direction, ParentCallSid, CallSid } =
      request.body as Record<string, string>;

    const callerId = CallerId || From;
    const isInbound = Direction === 'inbound';
    const response = new twiml.VoiceResponse();

    if (!To) {
      response.say('Invalid destination number.');
      return reply.type('text/xml').status(200).send(response.toString());
    }

    const numberRecord = await NumbersRepository.findByNumber(To);

    const isFromClient = From?.startsWith('client:');
    const isToPSTN = To.startsWith('+');
    const isOutboundToPSTN = isFromClient && isToPSTN && !numberRecord;

    if (isOutboundToPSTN) {
      response.say('Connecting your call...');
      response.dial({ callerId }, To);
      return reply.type('text/xml').send(response.toString());
    }

    if (!numberRecord) {
      response.say('We could not route your call at this time.');
      return reply.type('text/xml').status(200).send(response.toString());
    }
    const agentIdentity = numberRecord.number;

    const isDialLoop = isInbound && ParentCallSid;
    if (isDialLoop) {
      response.say('Sorry, we could not connect your call.');
      return reply.type('text/xml').send(response.toString());
    }

    activeCallStore.add({
      sid: CallSid,
      from: From,
      to: To,
      status: 'initiated',
      startedAt: new Date(),
      agent: agentIdentity,
    });

    await notifyIncomingCall({ callerId, toNumber: To, callSid: CallSid, app });

    const agentIsAvailable = presenceStore.isAvailable(agentIdentity);

    if (agentIsAvailable) {
      presenceStore.setStatus(agentIdentity, 'on-call');

      await twilioClient.bridgeCallToClient(
        CallSid,
        agentIdentity,
        `${SERVER_DOMAIN}/twilio/voice/bridge?client=${agentIdentity}`
      );

      response.say('Connecting you to an agent now.');
    } else {
      const queueRoom = `queue-${agentIdentity}`;

      callQueueManager.enqueue(agentIdentity, {
        callSid: CallSid,
        callerId,
        toNumber: To,
        enqueueTime: Date.now(),
        agentId: agentIdentity,
        companyId: numberRecord.company_id,
      });

      let slackMessageToFormatted = To;
      let slackMessageFromFormatted = From;

      const number = await NumbersRepository.findByNumber(agentIdentity);

      if (number) {
        const company = await UserCompaniesRepository.findCompanyById(
          number.company_id
        );

        if (company) {
          slackMessageToFormatted = `${To} (${company.name})`;
          const contact = await ContactsRepository.findByNumber(
            From,
            company.id
          );

          if (contact && contact.label !== From) {
            slackMessageFromFormatted = `${From} (${contact.label})`;
          }
        }
      }

      await sendCallAlertToSlack({
        from: slackMessageFromFormatted,
        to: slackMessageToFormatted,
      });

      response.say('All agents are currently busy. Please hold.');
      response.dial().conference(
        {
          startConferenceOnEnter: false,
          endConferenceOnExit: false,
          statusCallback: `${SERVER_DOMAIN}/twilio/voice/conference-events`,
          statusCallbackEvent: ['leave'],
          statusCallbackMethod: 'POST',
        },
        queueRoom
      );

      activeCallStore.updateStatus(CallSid, 'held', agentIdentity);
    }

    return reply.type('text/xml').status(200).send(response.toString());
  });

  // 🔹 Call Status Updates (e.g., when a call ends)
  app.post('/voice/status', async (req, res) => {
    const { CallSid, CallStatus, To } = req.body as Record<string, string>;

    activeCallStore.remove(CallSid);

    if (CallStatus === 'completed') {
      presenceStore.setStatus(To, 'idle');

      const next = callQueueManager.dequeue(To);
      if (next) {
        console.log(
          `➡️ Bridging next queued caller ${next.callSid} to agent ${To}`
        );

        await twilioClient.client.calls(next.callSid).update({
          url: `${SERVER_DOMAIN}/twilio/voice/bridge?client=${To}`,
          method: 'POST',
        });

        presenceStore.setStatus(To, 'on-call');
      }
    }

    res.status(200).send('OK');
  });

  // 🔹 Bridge Logic
  app.post('/voice/bridge', async (req, reply) => {
    let { client } = req.query as Record<string, string>;
    if (client.startsWith('client:')) {
      client = client.replace(/^client:/, '');
    }

    const response = new twiml.VoiceResponse();
    response.say('Connecting you now.');
    response.dial().client(client);

    return reply.type('text/xml').send(response.toString());
  });

  // 🔹 Caller Leaves Conference (queue abandonment)
  app.post('/voice/conference-events', async (req, reply) => {
    const { EventType, CallSid } = req.body as Record<string, string>;

    if (EventType === 'participant-leave') {
      const wasRemoved = callQueueManager.removeByPredicate(
        (item) => item.callSid === CallSid
      );

      if (wasRemoved) {
        console.log(
          `🗑️ Caller ${CallSid} left the queue. Removed from queueManager.`
        );
      } else {
        console.log(`ℹ️ Caller ${CallSid} left, but was not in queue.`);
      }

      activeCallStore.remove(CallSid);
    }

    return reply.status(200).send('OK');
  });
}

export default routes;

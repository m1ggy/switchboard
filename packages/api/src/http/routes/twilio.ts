import { CallsRepository } from '@/db/repositories/calls';
import { UserCompaniesRepository } from '@/db/repositories/companies';
import { ContactsRepository } from '@/db/repositories/contacts';
import { InboxesRepository } from '@/db/repositories/inboxes';
import { MessagesRepository } from '@/db/repositories/messages';
import { NumbersRepository } from '@/db/repositories/numbers';
import { notifyIncomingCall, notifyNewMessage } from '@/lib/helpers';
import { callQueueManager } from '@/lib/queue';
import { sendCallAlertToSlack } from '@/lib/slack';
import { activeCallStore, presenceStore } from '@/lib/store';
import { TwilioClient } from '@/lib/twilio';
import crypto from 'crypto';
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

    // 🆕 Prevent loop
    const isDialLoop = isInbound && ParentCallSid;
    if (isDialLoop) {
      response.say('Sorry, we could not connect your call.');
      return reply.type('text/xml').send(response.toString());
    }

    // 🆕 Create/find contact and inbox
    if (isInbound) {
      const contact = await ContactsRepository.findOrCreate({
        number: callerId,
        companyId: numberRecord.company_id,
      });

      const inbox = await InboxesRepository.findOrCreate({
        numberId: numberRecord.id,
        contactId: contact.id,
      });

      const call = await CallsRepository.create({
        id: crypto.randomUUID() as string,
        contact_id: contact.id,
        call_sid: CallSid,
        number_id: numberRecord.id,
        meta: { status: 'ONGOING' },
      });

      await InboxesRepository.updateLastCall(inbox.id, call.id);
    }

    // Track active call
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
        `${SERVER_DOMAIN}/twilio/voice/bridge`
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

      console.log('[Slack Alert] Incoming call:', { From, To, agentIdentity });

      const number = await NumbersRepository.findByNumber(agentIdentity);
      if (!number) {
        console.warn(
          '[Slack Alert] No number found for agentIdentity:',
          agentIdentity
        );
      } else {
        console.log('[Slack Alert] Found number:', number);

        const company = await UserCompaniesRepository.findCompanyById(
          number.company_id
        );
        if (!company) {
          console.warn(
            '[Slack Alert] No company found for number.company_id:',
            number.company_id
          );
        } else {
          console.log('[Slack Alert] Found company:', company.name);
          slackMessageToFormatted = `${To} (${company.name})`;

          const contact = await ContactsRepository.findByNumber(
            From,
            company.id
          );
          if (!contact) {
            console.log('[Slack Alert] No contact found for:', From);
          } else {
            console.log('[Slack Alert] Found contact:', contact);

            if (contact.label !== From) {
              slackMessageFromFormatted = `${From} (${contact.label})`;
            }
          }
        }
      }

      console.log('[Slack Alert] Final Slack message formatting:', {
        from: slackMessageFromFormatted,
        to: slackMessageToFormatted,
      });

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
          statusCallbackEvent: ['leave', 'join'],
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

  app.post('/voice/conference-events', async (req, reply) => {
    console.log('[Webhook] /voice/conference-events received:', req.body);

    const {
      StatusCallbackEvent,
      CallSid,
      ConferenceSid: UpperCaseSid,
      conferenceSid: LowerCaseSid, // fallback in case it's lowercase
    } = req.body as Record<string, string>;

    const ConferenceSid = UpperCaseSid || LowerCaseSid;

    if (StatusCallbackEvent === 'participant-join') {
      if (!CallSid) {
        console.warn('⚠️ Missing CallSid in participant-join event');
      }
      if (!ConferenceSid) {
        console.warn('⚠️ Missing ConferenceSid in participant-join event');
      }

      if (CallSid && ConferenceSid) {
        activeCallStore.updateConferenceSid(CallSid, ConferenceSid);
        console.log(`✅ Linked ${CallSid} to conference ${ConferenceSid}`);
      } else {
        console.log(
          '❌ Could not link call to conference due to missing data:',
          {
            CallSid,
            ConferenceSid,
          }
        );
      }
    }

    if (StatusCallbackEvent === 'participant-leave') {
      console.log(`👋 Participant left conference: ${CallSid}`);

      const wasRemoved = callQueueManager.removeByPredicate(
        (item) => item.callSid === CallSid
      );

      if (wasRemoved) {
        console.log(
          `🗑️ Caller ${CallSid} left the queue. Removed from callQueueManager.`
        );
      } else {
        console.log(`ℹ️ Caller ${CallSid} left, but was not found in queue.`);
      }

      activeCallStore.remove(CallSid);
    }

    return reply.status(200).send('OK');
  });

  app.post('/sms', async (req, reply) => {
    const { From, To, Body, MessageSid } = req.body as Record<string, string>;

    const matchingNumber = await NumbersRepository.findByNumber(To);
    if (!matchingNumber) return reply.status(204).send();
    let contact = await ContactsRepository.findByNumber(
      From,
      matchingNumber.company_id
    );

    if (!contact)
      contact = await ContactsRepository.create({
        id: crypto.randomUUID() as string,
        number: From,
        company_id: matchingNumber.company_id,
        label: From,
      });
    const inbox = await InboxesRepository.findOrCreate({
      numberId: matchingNumber.id,
      contactId: contact.id,
    });
    const newMessage = await MessagesRepository.create({
      id: crypto.randomUUID() as string,
      numberId: matchingNumber.id,
      createdAt: new Date(),
      message: Body,
      contactId: contact.id,
      inboxId: inbox.id,
      direction: 'inbound',
      meta: { MessageSid },
    });

    await InboxesRepository.updateLastMessage(inbox.id, newMessage.id);

    notifyNewMessage({
      from: From,
      toNumber: To,
      message: Body,
      app,
      meta: {
        companyId: matchingNumber?.company_id,
        event: 'refresh',
        target: { contactId: contact.id },
      },
    });

    return reply.status(204).send();
  });
}

export default routes;

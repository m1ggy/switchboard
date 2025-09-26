import { CallsRepository } from '@/db/repositories/calls';
import { UserCompaniesRepository } from '@/db/repositories/companies';
import { ContactsRepository } from '@/db/repositories/contacts';
import { FaxForwardLogRepository } from '@/db/repositories/fax_forward';
import { InboxesRepository } from '@/db/repositories/inboxes';
import { MediaAttachmentsRepository } from '@/db/repositories/message_attachments';
import { MessagesRepository } from '@/db/repositories/messages';
import { NumbersRepository } from '@/db/repositories/numbers';
import { UsageRepository } from '@/db/repositories/usage';
import { UsersRepository } from '@/db/repositories/users';
import { VoicemailsRepository } from '@/db/repositories/voicemails';
import { uploadAttachmentBuffer } from '@/lib/google/storage';
import {
  notifyIncomingCall,
  notifyNewMessage,
  notifyNewVoicemail,
} from '@/lib/helpers';
import { callQueueManager } from '@/lib/queue';
import { sendCallAlertToSlack } from '@/lib/slack';
import { activeCallStore, presenceStore } from '@/lib/store';
import { TwilioClient } from '@/lib/twilio';
import axios from 'axios';
import crypto, { randomUUID } from 'crypto';
import { FastifyReply, FastifyRequest, type FastifyInstance } from 'fastify';
import twilio from 'twilio';
import { authMiddleware } from '../middlewares/auth';

const { twiml } = twilio;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID as string;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN as string;

const twilioClient = new TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const SERVER_DOMAIN = process.env.SERVER_DOMAIN;

function fullUrl(req: FastifyRequest) {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (base) return `${base}${req.raw.url}`;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  return `${proto}://${host}${req.raw.url}`;
}

export async function verifyTwilioRequest(
  req: FastifyRequest,
  reply: FastifyReply
) {
  if (process.env.SKIP_TWILIO_VERIFY === 'true') return; // dev shortcut

  const sig = req.headers['x-twilio-signature'] as string | undefined;
  if (!sig) return reply.code(403).send('Missing Twilio signature');

  const url = fullUrl(req);
  const params = (req.body || {}) as Record<string, string>;

  const ok = twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, url, params);
  if (!ok) return reply.code(403).send('Invalid Twilio signature');
}

async function routes(app: FastifyInstance) {
  // 🔹 Voice Entry Point
  app.post(
    '/voice',
    { preHandler: verifyTwilioRequest },
    async (request, reply) => {
      const { To, From, CallerId, Direction, ParentCallSid, CallSid } =
        request.body as Record<string, string>;
      const query = request.query as { ivr: string };

      const callerId = CallerId || From;
      const isInbound = Direction === 'inbound';
      const response = new twiml.VoiceResponse();
      const hasPassedIVR = query.ivr === '1';

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

      if (isInbound && !hasPassedIVR) {
        const company = await UserCompaniesRepository.findCompanyById(
          numberRecord.company_id
        );
        const companyName = company?.name ?? 'our company';

        response
          .gather({
            numDigits: 1,
            timeout: 12,
            action: `${SERVER_DOMAIN}/twilio/voice/handle-gather`,
            method: 'POST',
            actionOnEmptyResult: true,
          })
          .pause({ length: 1 })
          .say(
            { voice: 'Polly.Joanna', language: 'en-US' },
            `Thank you for calling ${companyName}. Press 1 to speak with an agent. Or, if you'd like to send a fax, please stay on the line.`
          );

        return reply.type('text/xml').status(200).send(response.toString());
      }

      if (hasPassedIVR) {
        const existing = await CallsRepository.findBySID(CallSid);
        if (!existing) {
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
      }

      await notifyIncomingCall({
        callerId,
        toNumber: To,
        callSid: CallSid,
        app,
      });

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

        console.log('[Slack Alert] Incoming call:', {
          From,
          To,
          agentIdentity,
        });

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
        const company = await UserCompaniesRepository.findCompanyById(
          number?.company_id as string
        );
        response.say(
          `Welcome to ${company?.name} Hotline, please wait while we connect you to an agent`
        );
        response.dial().conference(
          {
            startConferenceOnEnter: false,
            endConferenceOnExit: false,
            statusCallback: `${SERVER_DOMAIN}/twilio/voice/conference-events`,
            statusCallbackEvent: ['leave', 'join'],
            statusCallbackMethod: 'POST',
            waitUrl: `${SERVER_DOMAIN}/twilio/voice/hold-music?companyId=${encodeURIComponent(numberRecord.company_id)}`,
            waitMethod: 'GET',
          },
          queueRoom
        );

        const VOICEMAIL_TIMEOUT_MS = 120_000; // 2 minutes

        const timerId = setTimeout(async () => {
          try {
            // Only redirect if still held (not bridged yet)
            const held = activeCallStore.isHeld(CallSid);
            if (!held) return;

            // Recheck presence to avoid false positive
            const stillBusy = !presenceStore.isAvailable(agentIdentity);
            if (!stillBusy) return;

            await twilioClient.client.calls(CallSid).update({
              method: 'POST',
              url: `${SERVER_DOMAIN}/twilio/voice/voicemail?to=${encodeURIComponent(To)}`,
            });
          } catch (err) {
            console.error('Voicemail redirect failed', err);
          }
        }, VOICEMAIL_TIMEOUT_MS);

        // track timer in your activeCallStore so you can cancel it
        activeCallStore.attachTimer(CallSid, timerId);

        activeCallStore.updateStatus(CallSid, 'held', agentIdentity);
      }

      return reply.type('text/xml').status(200).send(response.toString());
    }
  );

  app.get('/voice/hold-music', async (req, reply) => {
    const { companyId } = req.query as Record<string, string>;
    const r = new twiml.VoiceResponse();

    const company = (await UserCompaniesRepository.findCompanyById(companyId))!;

    let greetingSound = `${process.env.SERVER_DOMAIN}/audio/marketing_audio.mp3`;

    switch (company.name) {
      case 'Ace Home Care Inc': {
        greetingSound = `${process.env.SERVER_DOMAIN}/audio/marketing_audio_acehomecare.mp3`;
        break;
      }
      case 'Ace Home Care Franchise': {
        greetingSound = `${process.env.SERVER_DOMAIN}/audio/marketing_audio_acehomecarefranchise.mp3`;
        break;
      }
      case 'CTK Advisors': {
        greetingSound = `${process.env.SERVER_DOMAIN}/audio/marketing_audio_ctkadvisors.mp3`;
        break;
      }
      case 'Carejou': {
        greetingSound = `${process.env.SERVER_DOMAIN}/audio/marketing_audio_carejou.mp3`;
        break;
      }
      case 'Calliya': {
        greetingSound = `${process.env.SERVER_DOMAIN}/audio/marketing_audio_calliya.mp3`;
        break;
      }
      case 'Tech Fellow LLC': {
        greetingSound = `${process.env.SERVER_DOMAIN}/audio/marketing_audio_techfellow.mp3`;
        break;
      }
    }

    r.play({ loop: 1 }, greetingSound);
    r.play({ loop: 1 }, `${process.env.SERVER_DOMAIN}/audio/music1.mp3`);

    return reply.type('text/xml').status(200).send(r.toString());
  });

  app.post('/voice/voicemail', async (req, reply) => {
    const response = new twiml.VoiceResponse();

    response.say(
      'Sorry, all our agents are busy. Please leave a message after the tone.'
    );
    response.record({
      playBeep: true,
      maxLength: 120,
      action: `${SERVER_DOMAIN}/twilio/voice/voicemail-done`,
      recordingStatusCallback: `${SERVER_DOMAIN}/twilio/voice/voicemail-status`,
      recordingStatusCallbackMethod: 'POST',
    });
    response.say('We did not receive a recording. Goodbye.');
    response.hangup();

    return reply.type('text/xml').status(200).send(response.toString());
  });

  app.post('/voice/voicemail-done', async (req, reply) => {
    const {
      RecordingSid,
      RecordingUrl, // Twilio gives URL w/o extension
      RecordingDuration,
      From,
      To,
      CallSid,
    } = req.body as Record<string, string>;

    // Resolve number/company/contact for persistence
    const numberRecord = await NumbersRepository.findByNumber(To);
    if (!numberRecord) {
      console.warn('❌ voicemail-done: no number for To:', To);
      const r = new twiml.VoiceResponse();
      r.say('Thanks. Your message has been recorded.');
      r.hangup();
      return reply.type('text/xml').status(200).send(r.toString());
    }

    const company = await UserCompaniesRepository.findCompanyById(
      numberRecord.company_id
    );

    // (Optional) contact + call linkage if you have them
    const contact = await ContactsRepository.findByNumber(From, company?.id);

    // Build Twilio media URL with extension (mp3 is small & convenient)
    const twilioMp3Url = `${RecordingUrl}.mp3`;

    // 1) Download from Twilio, 2) Upload to GCS
    let gcsUrl: string | null = null;
    try {
      const axRes = await axios.get<ArrayBuffer>(twilioMp3Url, {
        responseType: 'arraybuffer',
        // Twilio recordings require Basic Auth unless you’ve made them public
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN,
        },
        // You can bump this if you expect long recordings
        timeout: 25_000,
        // Follow redirects just in case
        maxRedirects: 3,
      });

      const buffer = Buffer.from(axRes.data as ArrayBuffer);

      // Example filename: vm-{company}-{YYYYMMDD}-{RecordingSid}.mp3
      const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeCompany = (company?.name || 'company')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      const filename = `voicemails/vm-${safeCompany}-${yyyymmdd}-${RecordingSid}.mp3`;

      gcsUrl = await uploadAttachmentBuffer(buffer, filename);
    } catch (err) {
      console.error('❌ Failed to download/upload voicemail recording:', err);
      // You can still continue and store the Twilio URL so nothing is lost
    }

    // Choose what you persist as primary URL:
    // Prefer the GCS copy if available; fall back to Twilio URL
    const primaryUrl = gcsUrl ?? twilioMp3Url;

    // Save voicemail
    const voicemail = await VoicemailsRepository.create({
      companyId: numberRecord.company_id,
      numberId: numberRecord.id,
      contactId: contact?.id ?? null,
      callSid: CallSid,
      from: From,
      to: To,
      recordingSid: RecordingSid,
      recordingUrl: primaryUrl,
      durationSecs: Number(RecordingDuration || 0),
      transcriptionText: null,
      transcriptionStatus: 'pending',
    });

    // Notify UI
    await notifyNewVoicemail({
      from: From,
      toNumber: To,
      recordingUrl: primaryUrl,
      durationSecs: Number(RecordingDuration || 0),
      voicemailId: voicemail.id,
      callSid: CallSid,
      transcriptionText: null,
      app,
      meta: {
        storage: gcsUrl ? 'gcs' : 'twilio',
        twilioUrl: twilioMp3Url,
        gcsUrl: gcsUrl ?? null,
      },
    });

    // Close out the call nicely
    const response = new twiml.VoiceResponse();
    response.say('Thanks. Your message has been recorded. Goodbye.');
    response.hangup();
    return reply.type('text/xml').status(200).send(response.toString());
  });

  // POST /twilio/voice/voicemail-status (fires on completed recording)
  app.post('/voice/voicemail-status', async (req, reply) => {
    const { RecordingSid, RecordingUrl, RecordingDuration, CallSid, From, To } =
      req.body as Record<string, string>;

    const number = await NumbersRepository.findByNumber(From);

    VoicemailsRepository.create({
      companyId: number?.company_id as string,
      from: From,
      to: To,
      recordingSid: RecordingSid,
      recordingUrl: RecordingUrl,
      durationSecs: parseInt(RecordingDuration),
      callSid: CallSid,
    });
    return reply.status(204).send();
  });

  app.post('/voice/handle-gather', async (request, reply) => {
    const { Digits, CallSid, From, To } = request.body as Record<
      string,
      string
    >;
    const response = new twiml.VoiceResponse();

    if (Digits === '1') {
      // Caller chose voice support — redirect to main logic, mark IVR passed
      response.redirect({ method: 'POST' }, `/twilio/voice?ivr=1`);
    } else {
      await FaxForwardLogRepository.create({
        call_sid: CallSid,
        from_number: From,
        to_number: To,
        forwarded_to_fax_at: new Date(),
        status: 'forwarded',
        id: randomUUID(),
      });
      response.dial(process.env.TELNYX_FAX_NUMBER);
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
    const { From, To, Body, MessageSid, NumMedia, ...mediaFields } =
      req.body as Record<string, string>;

    const matchingNumber = await NumbersRepository.findByNumber(To);
    if (!matchingNumber) return reply.status(204).send();

    let contact = await ContactsRepository.findByNumber(
      From,
      matchingNumber.company_id
    );

    if (!contact) {
      contact = await ContactsRepository.create({
        id: crypto.randomUUID(),
        number: From,
        company_id: matchingNumber.company_id,
        label: From,
      });
    }

    const inbox = await InboxesRepository.findOrCreate({
      numberId: matchingNumber.id,
      contactId: contact.id,
    });

    const dbMessage = await MessagesRepository.create({
      id: crypto.randomUUID(),
      numberId: matchingNumber.id,
      createdAt: new Date(),
      message: Body,
      contactId: contact.id,
      inboxId: inbox.id,
      direction: 'inbound',
      meta: { MessageSid },
    });

    await InboxesRepository.updateLastMessage(inbox.id, dbMessage.id);

    const mediaCount = parseInt(NumMedia ?? '0', 10);

    if (mediaCount > 0) {
      const uploads = [];

      for (let i = 0; i < mediaCount; i++) {
        const mediaUrl = mediaFields[`MediaUrl${i}`];
        const contentType = mediaFields[`MediaContentType${i}`];

        if (!mediaUrl || !contentType) continue;

        const mediaResp = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID as string,
            password: process.env.TWILIO_AUTH_TOKEN as string,
          },
        });

        const buffer = Buffer.from(mediaResp.data);
        const extension = contentType.split('/')[1]; // crude fallback
        const gcsFilename = `${crypto.randomUUID()}.${extension}`;

        const gcsUrl = await uploadAttachmentBuffer(buffer, gcsFilename);

        uploads.push(
          MediaAttachmentsRepository.create({
            id: crypto.randomUUID(),
            message_id: dbMessage.id,
            media_url: gcsUrl,
            content_type: contentType,
            file_name: gcsFilename,
          })
        );
      }

      await Promise.all(uploads);
    }

    notifyNewMessage({
      from: From,
      toNumber: To,
      message: Body,
      app,
      meta: {
        companyId: matchingNumber.company_id,
        event: 'refresh',
        target: { contactId: contact.id },
      },
    });

    const companyId = matchingNumber.company_id;

    const userCompany = await UserCompaniesRepository.findUserIdById(companyId);

    if (userCompany) {
      const user = await UsersRepository.findByFirebaseUid(
        userCompany?.user_id
      );

      UsageRepository.create({
        subscription_id: user?.stripe_subscription_id as string,
        user_id: user?.user_id as string,
        amount: 1,
        type: mediaCount > 0 ? 'mms' : 'sms',
        id: randomUUID(),
      });
    }

    return reply.status(204).send();
  });

  app.get(
    '/twilio/token',
    { preHandler: authMiddleware },
    async (req, reply) => {
      try {
        const { identity } = req.query as { identity?: string };

        const jwt = twilioClient.generateVoiceToken({
          apiKeySid: process.env.TWILIO_API_KEY_SID as string,
          apiKeySecret: process.env.TWILIO_API_KEY_SECRET as string,
          outgoingApplicationSid: process.env.TWILIO_TWIMIL_APP_SID as string,
          identity: identity ?? 'client',
          ttl: 86400, // Optional: 24 hours
        });

        return reply.send({ token: jwt });
      } catch (error) {
        console.error('Failed to generate Twilio token:', error);
        return reply.status(500).send({ error: 'Failed to generate token' });
      }
    }
  );
}

export default routes;

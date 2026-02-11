import { CallsRepository } from '@/db/repositories/calls';
import { UserCompaniesRepository } from '@/db/repositories/companies';
import { ContactsRepository } from '@/db/repositories/contacts';
import { FaxForwardLogRepository } from '@/db/repositories/fax_forward';
import { InboxesRepository } from '@/db/repositories/inboxes';
import { MediaAttachmentsRepository } from '@/db/repositories/message_attachments';
import { MessagesRepository } from '@/db/repositories/messages';
import { NumbersRepository } from '@/db/repositories/numbers';
import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';
import { UsageRepository } from '@/db/repositories/usage';
import { UsersRepository } from '@/db/repositories/users';
import { VoicemailsRepository } from '@/db/repositories/voicemails';
import { uploadAttachmentBuffer } from '@/lib/google/storage';
import {
  notifyIncomingCall,
  notifyNewMessage,
  notifyNewVoicemail,
} from '@/lib/helpers';
import { sendPushToUser } from '@/lib/push/push';
import { callQueueManager } from '@/lib/queue';
import { sendCallAlertToSlack } from '@/lib/slack';
import { activeCallStore, presenceStore } from '@/lib/store';
import { TwilioClient } from '@/lib/twilio';
import axios from 'axios';
import crypto, { randomUUID } from 'crypto';
import { FastifyReply, FastifyRequest, type FastifyInstance } from 'fastify';
import path from 'path';
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

function getScriptForSchedule(schedule: any): string {
  // 1) If there is a non-empty custom script, use that
  const custom = schedule.script_content?.toString().trim();
  if (custom && custom.length > 0) {
    return custom;
  }

  // 2) Otherwise, build from template if available
  const template = schedule.template as
    | 'wellness'
    | 'safety'
    | 'medication'
    | 'social'
    | null;

  const nameInScript =
    schedule.name_in_script === 'caller' ? 'caller' : 'contact';

  const contactName = (schedule.name ?? '').toString().trim();
  const callerName = (schedule.caller_name ?? '').toString().trim();

  const nameToUse =
    nameInScript === 'contact'
      ? contactName || 'there'
      : callerName || 'your caller';

  switch (template) {
    case 'wellness':
      return `Hello ${nameToUse}, this is an automated reassurance call to check in and make sure you're doing well today.`;
    case 'safety':
      return `Hello ${nameToUse}, this is an automated safety check-in to confirm that everything is okay where you are.`;
    case 'medication':
      return `Hello ${nameToUse}, this is an automated reminder to take your medication as prescribed.`;
    case 'social':
      return `Hello ${nameToUse}, this is an automated reassurance call just to say hello and see how you're doing today.`;
    default:
      // 3) Fallback if template is not set
      return `Hello ${nameToUse}, this is your reassurance call. We are just checking in to see how you are doing.`;
  }
}

const TWILIO_AUDIO_EXTS = new Set([
  '.mp3',
  '.wav',
  '.wave',
  '.aiff',
  '.aifc',
  '.gsm',
  '.ulaw',
]);

function extFromUrlOrName(urlOrName: string) {
  try {
    const u = new URL(urlOrName);
    return path.extname(u.pathname || '').toLowerCase();
  } catch {
    return path.extname(urlOrName || '').toLowerCase();
  }
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

async function getTransferableCallSid(
  childOrParentSid?: string,
  agentIdentity?: string
) {
  if (childOrParentSid) {
    const leg = await twilioClient.client.calls(childOrParentSid).fetch();
    const parentSid = (leg as any).parentCallSid as string | undefined;

    // 🔹 Prefer parent (usually the original inbound caller leg)
    if (parentSid) {
      try {
        const parent = await twilioClient.client.calls(parentSid).fetch();
        if (parent.status === 'in-progress') {
          return parent.sid;
        }
      } catch (e) {
        console.warn('[getTransferableCallSid] Failed to fetch parent leg', {
          parentSid,
          error: e,
        });
      }
    }

    // 🔹 Fall back to the leg we were given if it’s alive
    if (leg.status === 'in-progress') {
      return leg.sid;
    }
  }

  // 🔹 Fallback: use your own store to find the caller leg for this agent
  if (agentIdentity && typeof activeCallStore.findByAgent === 'function') {
    const recs = activeCallStore.findByAgent(agentIdentity);
    // pick any in-progress sid here if you want to be smarter
    const rec = recs[0];
    if (rec?.sid) return rec.sid;
  }

  return null;
}

function warmConferenceNameForCall(callSid: string) {
  return `warm-${callSid}`;
}

async function notifyEmergencyContact({
  app,
  fromNumber,
  schedule,
  job,
  maxAttempts,
}: {
  app: FastifyInstance;
  fromNumber: string;
  schedule: any;
  job: any;
  maxAttempts: number;
}) {
  if (!schedule.emergency_contact_phone_number) {
    app.log.warn(
      { jobId: job.id, scheduleId: schedule.id },
      'No emergency contact phone set; skipping notification'
    );
    return;
  }

  const contactName = schedule.emergency_contact_name || 'Emergency contact';
  const scheduleName = schedule.name || schedule.phone_number || 'the contact';

  const body = `${contactName}, we were unable to reach ${scheduleName} after ${maxAttempts} reassurance call attempt(s). Please check on them.`;

  try {
    const message = await twilioClient.client.messages.create({
      from: fromNumber,
      to: schedule.emergency_contact_phone_number,
      body,
    });

    app.log.info(
      {
        jobId: job.id,
        scheduleId: schedule.id,
        emergencyContactPhone: schedule.emergency_contact_phone_number,
        messageSid: message.sid,
      },
      'Emergency contact SMS sent'
    );
  } catch (err: any) {
    app.log.error(
      {
        err,
        jobId: job.id,
        scheduleId: schedule.id,
        emergencyContactPhone: schedule.emergency_contact_phone_number,
      },
      'Failed to send emergency contact SMS'
    );
  }
}

async function routes(app: FastifyInstance) {
  // 🔹 Voice Entry Point (UPDATED: Option 1 - ring client first)
  app.post(
    '/voice',
    { preHandler: verifyTwilioRequest },
    async (request, reply) => {
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

      // Existing outbound-to-PSTN behavior
      if (isOutboundToPSTN) {
        response.say('Connecting your call...');
        response.dial({ callerId }, To);
        return reply.type('text/xml').send(response.toString());
      }

      if (!numberRecord) {
        response.say('We could not route your call at this time.');
        return reply.type('text/xml').status(200).send(response.toString());
      }

      const agentIdentity = numberRecord.number; // your chosen client identity (E.164)

      // Prevent dial loop (existing)
      const isDialLoop = isInbound && ParentCallSid;
      if (isDialLoop) {
        response.say('Sorry, we could not connect your call.');
        return reply.type('text/xml').send(response.toString());
      }

      // Persist inbound call record (existing)
      if (isInbound) {
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

        // Track active call (initiated)
        activeCallStore.add({
          sid: CallSid,
          from: From,
          to: To,
          status: 'initiated',
          startedAt: new Date(),
          agent: agentIdentity,
        });
      }

      // Keep your notification (optional but fine)
      await notifyIncomingCall({
        callerId,
        toNumber: To,
        callSid: CallSid,
        app,
      });

      /**
       * ✅ OPTION 1: Always ring the browser first.
       * This is what triggers Twilio Voice SDK "incoming" in the UI.
       */
      const dial = response.dial({
        timeout: 20,
        answerOnBridge: true,
        action: `${SERVER_DOMAIN}/twilio/voice/no-answer?agent=${encodeURIComponent(
          agentIdentity
        )}&to=${encodeURIComponent(To)}&from=${encodeURIComponent(callerId)}`,
        method: 'POST',
      });

      dial.client(agentIdentity);

      return reply.type('text/xml').status(200).send(response.toString());
    }
  );

  // 🔹 Fallback when client did not answer / is offline / rejected
  app.post(
    '/voice/no-answer',
    { preHandler: verifyTwilioRequest },
    async (req, reply) => {
      const { DialCallStatus, CallSid } = req.body as Record<string, string>;
      const { agent, to, from } = req.query as Record<string, string>;

      const agentIdentity = agent;
      const To = to;
      const callerId = from;

      // If the dial somehow "worked", do nothing else
      // DialCallStatus values: completed, answered, no-answer, busy, failed, canceled
      if (DialCallStatus === 'completed' || DialCallStatus === 'answered') {
        const r = new twiml.VoiceResponse();
        return reply.type('text/xml').status(200).send(r.toString());
      }

      const response = new twiml.VoiceResponse();

      // Re-load numberRecord/company for hold music + notifications (same as your old branch)
      const numberRecord = await NumbersRepository.findByNumber(To);
      if (!numberRecord) {
        response.say('We could not route your call at this time.');
        response.hangup();
        return reply.type('text/xml').status(200).send(response.toString());
      }

      // Enqueue caller
      const queueRoom = `queue-${agentIdentity}`;

      callQueueManager.enqueue(agentIdentity, {
        callSid: CallSid,
        callerId,
        toNumber: To,
        enqueueTime: Date.now(),
        agentId: agentIdentity,
        companyId: numberRecord.company_id,
      });

      // Slack formatting logic (copied from your existing else branch)
      let slackMessageToFormatted = To;
      let slackMessageFromFormatted = callerId;

      console.log('[Slack Alert] Incoming call (no-answer fallback):', {
        from: callerId,
        to: To,
        agentIdentity,
        dialStatus: DialCallStatus,
      });

      const number = await NumbersRepository.findByNumber(agentIdentity);
      if (!number) {
        console.warn(
          '[Slack Alert] No number found for agentIdentity:',
          agentIdentity
        );
      } else {
        const company = await UserCompaniesRepository.findCompanyById(
          number.company_id
        );
        if (company) {
          slackMessageToFormatted = `${To} (${company.name})`;

          const contact = await ContactsRepository.findByNumber(
            callerId,
            company.id
          );
          if (contact && contact.label !== callerId) {
            slackMessageFromFormatted = `${callerId} (${contact.label})`;
          }
        }
      }

      await sendCallAlertToSlack({
        from: slackMessageFromFormatted,
        to: slackMessageToFormatted,
      });

      const company = await UserCompaniesRepository.findCompanyById(
        numberRecord.company_id
      );

      response.say(
        `Welcome to ${company?.name ?? 'our'} Hotline, please wait while we connect you to an agent`
      );

      // Push notification (copied from your else branch)
      const userCompany = await UserCompaniesRepository.findUserIdById(
        company?.id as string
      );
      if (userCompany) {
        const user = await UsersRepository.findByFirebaseUid(
          userCompany.user_id
        );
        if (user?.user_id) {
          await sendPushToUser(user.user_id, {
            title: 'Incoming call from ' + slackMessageFromFormatted,
            body: `You have an incoming call for ${slackMessageToFormatted}`,
            url: '/dashboard',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: 'call',
          });
        }
      }

      // Put caller into conference queue (same as your else branch)
      response.dial().conference(
        {
          startConferenceOnEnter: false,
          endConferenceOnExit: false,
          statusCallback: `${SERVER_DOMAIN}/twilio/voice/conference-events`,
          statusCallbackEvent: ['join', 'leave'],
          statusCallbackMethod: 'POST',
          waitUrl: `${SERVER_DOMAIN}/twilio/voice/hold-music?companyId=${encodeURIComponent(
            numberRecord.company_id
          )}`,
          waitMethod: 'GET',
        },
        queueRoom
      );

      // Voicemail timeout logic (same as your else branch)
      const VOICEMAIL_TIMEOUT_MS = 120_000; // 2 minutes

      const timerId = setTimeout(async () => {
        try {
          const held = activeCallStore.isHeld(CallSid);
          if (!held) return;

          // Recheck presence (optional; still in-memory)
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

      activeCallStore.attachTimer(CallSid, timerId);
      activeCallStore.updateStatus(CallSid, 'held', agentIdentity);

      return reply.type('text/xml').status(200).send(response.toString());
    }
  );

  app.get('/voice/hold-music', async (req, reply) => {
    const { companyId } = req.query as Record<string, string>;
    const r = new twiml.VoiceResponse();

    if (!companyId) {
      // Fallback if query is missing
      r.play({ loop: 1 }, `${SERVER_DOMAIN}/audio/marketing_audio.mp3`);
      r.play({ loop: 1 }, `${SERVER_DOMAIN}/audio/music1.mp3`);
      return reply.type('text/xml').status(200).send(r.toString());
    }

    // Fetch the company and use its hold_audio_url if present
    const company = await UserCompaniesRepository.findCompanyById(companyId);
    const customUrl = (company as any)?.hold_audio_url as
      | string
      | null
      | undefined;

    let firstTrack = `${SERVER_DOMAIN}/audio/marketing_audio.mp3`;
    if (customUrl && TWILIO_AUDIO_EXTS.has(extFromUrlOrName(customUrl))) {
      firstTrack = customUrl;
    }

    // 1) Play the custom (or default) greeting/marketing audio once
    r.play({ loop: 1 }, firstTrack);

    // 2) Then play your bed music (once, same as your current behavior)
    //    If you prefer infinite loop here, change loop: 1 -> loop: 0
    r.play({ loop: 1 }, `${SERVER_DOMAIN}/audio/music1.mp3`);

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
      const normalize = (s?: string) =>
        s?.startsWith('client:') ? s.slice(7) : s;
      const id = normalize(To) as string;
      presenceStore.setStatus(id, 'idle');

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

      await sendPushToUser(user?.user_id as string, {
        title: 'You have a new message ',
        body: `Message from ${contact.label}`,
        url: '/dashboard',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'message',
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

  // TRANSFER CALLS
  // Cold transfer: redirect a live call to a new number
  app.post(
    '/transfer/cold',
    { preHandler: authMiddleware },
    async (req, reply) => {
      const { callSid, to, agentIdentity } = req.body as {
        callSid?: string;
        to: string;
        agentIdentity?: string;
      };
      if (!to) return reply.code(400).send({ error: 'Missing "to"' });

      const transferableSid = await getTransferableCallSid(
        callSid,
        agentIdentity
      );
      if (!transferableSid)
        return reply
          .code(400)
          .send({ error: 'No in-progress caller leg found' });

      await twilioClient.client.calls(transferableSid).update({
        method: 'POST',
        url: `${SERVER_DOMAIN}/twilio/twiml/forward?to=${encodeURIComponent(to)}`,
      });

      if (agentIdentity) presenceStore.setStatus(agentIdentity, 'idle');
      return reply.send({ ok: true });
    }
  );

  // TwiML responder that actually performs the dial
  app.post('/twiml/forward', async (req, reply) => {
    const { to } = req.query as { to: string };
    const r = new twiml.VoiceResponse();

    // Look up whether "to" is one of our Twilio numbers
    let isInternal = false;
    try {
      const n = await NumbersRepository.findByNumber(to);
      isInternal = Boolean(n);
    } catch (_) {
      isInternal = false;
    }

    if (isInternal) {
      // INTERNAL TRANSFER: do not dial E.164 — redirect into our own TwiML that bypasses IVR
      r.redirect(
        { method: 'POST' },
        `${SERVER_DOMAIN}/twilio/voice/transfer-direct?to=${encodeURIComponent(to)}`
      );
      return reply.type('text/xml').send(r.toString());
    }

    // EXTERNAL TRANSFER: normal PSTN dial
    r.say('Transferring your call, please hold.');

    const dial = r.dial({
      callerId:
        req.body?.To || req.body?.Called || process.env.TWILIO_CALLER_ID,
      timeout: 30,
      answerOnBridge: true,
      action: `${SERVER_DOMAIN}/twilio/transfer/after-dial`, // handle failures cleanly
      method: 'POST',
    });

    if (to.startsWith('sip:')) {
      dial.sip(to);
    } else if (to.startsWith('client:')) {
      dial.client(to.replace(/^client:/, ''));
    } else {
      dial.number(to); // external PSTN number
    }

    return reply.type('text/xml').send(r.toString());
  });

  // Caller is already live on this leg; skip IVR and bridge immediately
  app.post('/voice/transfer-direct', async (req, reply) => {
    const { to } = req.query as { to: string };

    const r = new twiml.VoiceResponse();

    const dial = r.dial({
      callerId:
        req.body?.To || req.body?.Called || process.env.TWILIO_CALLER_ID,
      timeout: 30,
      answerOnBridge: true,
      action: `${SERVER_DOMAIN}/twilio/transfer/after-dial`,
      method: 'POST',
    });
    dial.number(to);

    return reply.type('text/xml').send(r.toString());
  });

  app.post('/transfer/after-dial', async (req, reply) => {
    const { DialCallStatus } = req.body as Record<string, string>;
    const r = new twiml.VoiceResponse();

    if (DialCallStatus === 'completed') {
      return reply.type('text/xml').send(r.toString());
    }

    // fallback on failure/no-answer/busy
    r.say('Sorry, the transfer could not be completed.');
    r.redirect({ method: 'POST' }, `${SERVER_DOMAIN}/twilio/voice/voicemail`);
    return reply.type('text/xml').send(r.toString());
  });

  // Join a call leg into a named warm-transfer conference
  app.post('/voice/warm-join-conference', async (req, reply) => {
    const { name } = req.query as { name: string };

    const r = new twiml.VoiceResponse();

    const dial = r.dial({
      // Keep it generic; Twilio will already know callerId for this leg
      callerId:
        (req.body?.To as string) ||
        (req.body?.Called as string) ||
        process.env.TWILIO_CALLER_ID,
    });

    dial.conference(
      {
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
        statusCallback: `${SERVER_DOMAIN}/twilio/voice/conference-events`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['join', 'leave'],
        waitUrl: `${SERVER_DOMAIN}/twilio/voice/hold-music`,
        waitMethod: 'GET',
      },
      name
    );

    return reply.type('text/xml').status(200).send(r.toString());
  });

  // WARM TRANSFER (step 1): upgrade current call to a conference
  app.post(
    '/transfer/warm/create',
    { preHandler: authMiddleware },
    async (req, reply) => {
      const { callSid, agentIdentity } = req.body as {
        callSid?: string;
        agentIdentity: string;
      };

      if (!agentIdentity) {
        return reply.code(400).send({ error: 'Missing "agentIdentity"' });
      }

      // ✅ now returns the parent (caller) leg when possible
      const callerSid = await getTransferableCallSid(callSid, agentIdentity);
      if (!callerSid) {
        return reply
          .code(400)
          .send({ error: 'No in-progress caller leg found for warm transfer' });
      }

      const conferenceName = warmConferenceNameForCall(callerSid);

      try {
        // Fetch caller leg to derive fromNumber
        const leg = await twilioClient.client.calls(callerSid).fetch();

        let fromNumber = '';
        if (typeof leg.to === 'string' && leg.to.startsWith('+')) {
          fromNumber = leg.to;
        } else if (typeof leg.from === 'string' && leg.from.startsWith('+')) {
          fromNumber = leg.from;
        }
        if (!fromNumber && agentIdentity.startsWith('+')) {
          fromNumber = agentIdentity;
        }

        // 1) Move caller into conference
        await twilioClient.client.calls(callerSid).update({
          method: 'POST',
          url: `${SERVER_DOMAIN}/twilio/voice/warm-join-conference?name=${encodeURIComponent(
            conferenceName
          )}`,
        });

        // 2) Call the agent back into the same conference as a Client
        await twilioClient.client.calls.create({
          from: fromNumber || undefined,
          to: `client:${agentIdentity}`,
          url: `${SERVER_DOMAIN}/twilio/voice/warm-join-conference?name=${encodeURIComponent(
            conferenceName
          )}`,
        });

        presenceStore.setStatus(agentIdentity, 'on-call');

        return reply.send({ ok: true, conferenceName });
      } catch (err) {
        console.error('[warm/create] Failed to create warm conference', err);
        return reply
          .code(500)
          .send({ error: 'Failed to create warm transfer' });
      }
    }
  );

  // WARM TRANSFER (step 2): add a new party into the existing warm conference
  app.post(
    '/transfer/warm/add-party',
    { preHandler: authMiddleware },
    async (req, reply) => {
      const { callSid, to } = req.body as {
        callSid: string; // original caller/transferable CallSid
        to: string; // '+E164', 'sip:..', 'client:identity', or internal number
      };

      if (!callSid || !to) {
        return reply
          .code(400)
          .send({ error: 'Missing "callSid" or "to" for warm add-party' });
      }

      const conferenceName = warmConferenceNameForCall(callSid);

      try {
        // 🔹 Fetch the existing call leg to determine a valid callerId
        const leg = await twilioClient.client.calls(callSid).fetch();

        // For inbound calls: leg.to is your Twilio number
        // For outbound-from-client: leg.from is your Twilio number (usually)
        let fromNumber = '';

        if (typeof leg.to === 'string' && leg.to.startsWith('+')) {
          fromNumber = leg.to;
        } else if (typeof leg.from === 'string' && leg.from.startsWith('+')) {
          fromNumber = leg.from;
        }

        if (!fromNumber) {
          console.error('[warm/add-party] Could not determine fromNumber', {
            legFrom: leg.from,
            legTo: leg.to,
          });
          return reply
            .code(500)
            .send({ error: 'Could not determine callerId for warm add-party' });
        }

        await twilioClient.client.calls.create({
          from: fromNumber, // ✅ now we always send a valid "from"
          to,
          url: `${SERVER_DOMAIN}/twilio/voice/warm-join-conference?name=${encodeURIComponent(
            conferenceName
          )}`,
        });

        return reply.send({ ok: true, conferenceName });
      } catch (err) {
        console.error('[warm/add-party] Failed to add new party', err);
        return reply
          .code(500)
          .send({ error: 'Failed to add party to warm transfer' });
      }
    }
  );

  // WARM TRANSFER (step 3): drop the current agent from the conference
  app.post(
    '/transfer/warm/complete',
    { preHandler: authMiddleware },
    async (req, reply) => {
      const { agentIdentity, callSid } = req.body as {
        agentIdentity: string;
        callSid: string; // original caller callSid used to build conferenceName
      };

      if (!agentIdentity || !callSid) {
        return reply
          .code(400)
          .send({ error: 'Missing "agentIdentity" or "callSid"' });
      }

      try {
        // We expect conferenceSid to have been captured in /voice/conference-events
        const conferenceName = warmConferenceNameForCall(callSid);

        // Look up the conference by friendlyName
        const conferences = await twilioClient.client.conferences.list({
          friendlyName: conferenceName,
          status: 'in-progress',
          limit: 1,
        });

        const conference = conferences[0];
        if (!conference) {
          return reply
            .code(404)
            .send({ error: 'No active warm conference found for this call' });
        }

        const participants = await twilioClient.client
          .conferences(conference.sid)
          .participants.list({ limit: 50 });

        // Heuristic: the agent leg is usually the one whose "to" is client:agentIdentity
        const agentParticipant = participants.find((p) => {
          // p.callSid can be fetched in more detail, but Twilio doesn't expose "to" directly here.
          // If you label your participants on create, you can match that label instead.
          return (p.label && p.label === agentIdentity) || false;
        });

        if (!agentParticipant) {
          console.warn(
            '[warm/complete] Could not find agent participant in conference',
            { agentIdentity, conferenceSid: conference.sid }
          );
          return reply
            .code(404)
            .send({ error: 'Agent not found in conference participants' });
        }

        await twilioClient.client
          .conferences(conference.sid)
          .participants(agentParticipant.accountSid)
          .update(() => ({ status: 'completed' }));

        // Mark the original agent idle again
        presenceStore.setStatus(agentIdentity, 'idle');

        return reply.send({ ok: true });
      } catch (err) {
        console.error(
          '[warm/complete] Failed to remove agent from warm transfer',
          err
        );
        return reply
          .code(500)
          .send({ error: 'Failed to complete warm transfer' });
      }
    }
  );

  app.post(
    '/reassurance/call',
    { preHandler: verifyTwilioRequest },
    async (req, reply) => {
      const { scheduleId, jobId } = req.query as {
        scheduleId?: string;
        jobId?: string;
      };

      const { CallSid, From, To } = req.body as Record<string, string>;

      const r = new twiml.VoiceResponse();

      // If scheduleId missing, you can still stream, but logging will be hard
      if (!scheduleId) {
        r.say('Sorry, this reassurance call is missing schedule details.');
        r.hangup();
        return reply.type('text/xml').status(200).send(r.toString());
      }

      // 1) Load schedule so we can get company_id + number_id + contact label
      const schedule = await ReassuranceSchedulesRepository.find(
        Number(scheduleId)
      );
      if (!schedule) {
        r.say('Sorry, we could not find your reassurance schedule.');
        r.hangup();
        return reply.type('text/xml').status(200).send(r.toString());
      }

      // 2) Resolve (or create) contact (callee)
      const contactLabel =
        schedule.name || schedule.phone_number || To || 'Unknown';
      const contact = await ContactsRepository.findOrCreate({
        number: schedule.phone_number, // or To (should match)
        companyId: schedule.company_id,
        label: contactLabel,
      });

      // 3) Create call log (guard against duplicate webhook retries)
      // Twilio can occasionally hit your TwiML url more than once.
      let callRow = await CallsRepository.findBySID(CallSid);
      if (!callRow) {
        callRow = await CallsRepository.create({
          id: crypto.randomUUID(),
          number_id: schedule.number_id,
          contact_id: contact.id,
          initiated_at: new Date(),
          duration: undefined,
          meta: {
            scheduleId: String(schedule.id),
            jobId: jobId ?? null,
            from: From,
            to: To,
            kind: 'reassurance_stream',
          },
          call_sid: CallSid,
        });
      }

      // 4) Stream (NO query strings). Pass params via <Parameter>.
      const wsUrl = `wss://api.calliya.com/twilio/reassurance/stream`;
      const stream = r.connect().stream({ url: wsUrl });

      stream.parameter({ name: 'scheduleId', value: String(schedule.id) });
      if (jobId) stream.parameter({ name: 'jobId', value: String(jobId) });
      stream.parameter({ name: 'callId', value: String(callRow.id) });

      return reply.type('text/xml').status(200).send(r.toString());
    }
  );

  app.post(
    '/reassurance/response',
    { preHandler: verifyTwilioRequest },
    async (req, reply) => {
      const { Digits, From, To, CallSid } = req.body as Record<string, string>;
      const { scheduleId } = req.query as { scheduleId?: string };

      const r = new twiml.VoiceResponse();

      // You can persist this somewhere: job result, schedule stats, etc.
      // e.g. ReassuranceResponsesRepository.create({ scheduleId, from: From, digits: Digits, callSid: CallSid })

      if (Digits === '1') {
        r.say(
          { voice: 'Polly.Amy', language: 'en-US' },
          'Thank you for confirming. We are glad you received the message. Goodbye.'
        );
      } else {
        r.say({ voice: 'Polly.Amy', language: 'en-US' }, 'Thank you. Goodbye.');
      }

      r.hangup();
      return reply.type('text/xml').status(200).send(r.toString());
    }
  );

  app.post(
    '/reassurance/status',
    { preHandler: verifyTwilioRequest },
    async (req, reply) => {
      const { CallSid, CallStatus, CallDuration, To, From } =
        req.body as Record<string, string>;
      const { jobId } = req.query as { jobId?: string };

      app.log.info(
        { jobId, CallSid, CallStatus, CallDuration, To, From },
        '[Reassurance Status] Callback received'
      );

      if (jobId) {
        try {
          const job = await ReassuranceCallJobsRepository.findById(jobId);
          if (!job) {
            app.log.error({ jobId }, '[Reassurance Status] Job not found');
          } else {
            const schedule = await ReassuranceSchedulesRepository.find(
              job.schedule_id
            );

            if (!schedule) {
              app.log.error(
                { jobId, scheduleId: job.schedule_id },
                '[Reassurance Status] Schedule not found'
              );
              await ReassuranceCallJobsRepository.markFailed(
                jobId,
                'Schedule not found during status callback'
              );
            } else {
              const maxAttempts =
                typeof schedule.max_attempts === 'number'
                  ? schedule.max_attempts
                  : 3;
              const currentAttempt = job.attempt ?? 1;

              app.log.info(
                {
                  jobId,
                  scheduleId: schedule.id,
                  currentAttempt,
                  maxAttempts,
                  callStatus: CallStatus,
                },
                '[Reassurance Status] Handling job attempt'
              );

              if (CallStatus === 'completed') {
                // Success: mark completed, no retries
                await ReassuranceCallJobsRepository.markCompleted(jobId);
              } else {
                // Failure / no-answer / busy
                if (currentAttempt >= maxAttempts) {
                  // Final failed attempt → mark failed + SMS emergency contact
                  await ReassuranceCallJobsRepository.markFailed(
                    jobId,
                    `Twilio call status: ${CallStatus}`
                  );

                  // Resolve from-number for SMS
                  const numberEntry = await NumbersRepository.findById(
                    schedule.number_id
                  );
                  const fromNumber = numberEntry?.number;

                  if (fromNumber) {
                    await notifyEmergencyContact({
                      app,
                      fromNumber,
                      schedule,
                      job,
                      maxAttempts,
                    });
                  } else {
                    app.log.error(
                      {
                        jobId,
                        scheduleId: schedule.id,
                        numberId: schedule.number_id,
                      },
                      '[Reassurance Status] Could not resolve from-number for emergency SMS'
                    );
                  }
                } else {
                  // Not yet at max attempts → reschedule
                  const retryMinutes =
                    typeof schedule.retry_interval === 'number'
                      ? schedule.retry_interval
                      : 5; // fallback

                  const nextRunAt = new Date(
                    Date.now() + retryMinutes * 60 * 1000
                  );

                  const nextAttempt = currentAttempt + 1;

                  const updatedJob =
                    await ReassuranceCallJobsRepository.reschedule(jobId, {
                      run_at: nextRunAt,
                      attempt: nextAttempt,
                    });

                  app.log.info(
                    {
                      jobId,
                      scheduleId: schedule.id,
                      previousAttempt: currentAttempt,
                      nextAttempt,
                      retryMinutes,
                      nextRunAt: nextRunAt.toISOString(),
                      callStatus: CallStatus,
                    },
                    '[Reassurance Status] Job rescheduled for retry'
                  );
                }
              }
            }
          }
        } catch (err: any) {
          app.log.error(
            { jobId, err },
            '[Reassurance Status] Failed to process job'
          );
        }
      }

      // Update call record with duration/status (your existing logic)
      try {
        if (CallSid && CallDuration) {
          const durationSeconds = Number(CallDuration);
          await CallsRepository.update(CallSid, {
            duration: durationSeconds,
            meta: { status: CallStatus },
          });
        }
      } catch (err: any) {
        app.log.error(
          { CallSid, err },
          '[Reassurance Status] Failed to update call record'
        );
      }

      return reply.status(204).send();
    }
  );

  app.post(
    '/voice/test-stream',
    { preHandler: verifyTwilioRequest },
    async (request, reply) => {
      const r = new twiml.VoiceResponse();

      const { From, CallSid } = request.body as Record<string, string>;

      if (!From) {
        r.say('Missing caller number.');
        return reply.type('text/xml').status(200).send(r.toString());
      }

      // ✅ scheduleId derived strictly from FROM number using DB join
      const sched =
        await ReassuranceSchedulesRepository.findByFromNumber('+13094855324');

      if (!sched) {
        r.say('No reassurance schedule found for this caller.');
        return reply.type('text/xml').status(200).send(r.toString());
      }

      const q = (request.query ?? {}) as Record<string, any>;
      const b = (request.body ?? {}) as Record<string, any>;

      // ✅ correlate with Twilio call
      const callId = '678437c8-c926-4c86-8c66-0a4c52550f00';
      const jobId = '37c1737e-2100-482a-9368-9210e55245f8';

      const wsUrl = 'wss://api.calliya.com/twilio/reassurance/stream';

      const stream = r.connect().stream({ url: wsUrl });

      stream.parameter({ name: 'test', value: '1' });
      stream.parameter({ name: 'scheduleId', value: String(sched.id) });
      stream.parameter({ name: 'jobId', value: jobId });
      stream.parameter({ name: 'callId', value: callId });
      stream.parameter({ name: 'numberId', value: String(sched.number_id) });

      r.say(
        'Starting media stream test now. Please say something after the beep.'
      );
      r.connect().stream({ url: wsUrl.toString() });
      r.pause({ length: 5 });

      return reply.type('text/xml').status(200).send(r.toString());
    }
  );
}

export default routes;

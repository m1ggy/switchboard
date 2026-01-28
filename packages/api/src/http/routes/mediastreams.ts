import { ContactsRepository } from '@/db/repositories/contacts';
import { NumbersRepository } from '@/db/repositories/numbers';
import { ReassuranceContactProfilesRepository } from '@/db/repositories/reassurance_contact_profiles';
import { TwilioClient } from '@/lib/twilio';
import type { FastifyInstance } from 'fastify';
import { OpenAIClient } from '../../lib/ai/openai_client';
import {
  ScriptGeneratorAgent,
  type CallContext,
  type ScriptPayload,
} from '../../lib/ai/script_agent';
import { DeepgramLiveTranscriber } from '../../lib/transcription/deepgram-live';
import { FinalUtteranceBuffer } from '../../lib/transcription/final-utterance-buffer';
import { ElevenLabsMulawTTS } from '../../lib/tts/elevenlabs';
export async function twilioMediaStreamRoutes(app: FastifyInstance) {
  const openai = new OpenAIClient(process.env.OPENAI_API_KEY!);
  const scriptAgent = new ScriptGeneratorAgent(openai);
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID as string;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN as string;

  const twilioClient = new TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    .client;

  const elevenlabsTts = new ElevenLabsMulawTTS({
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID!, // required
    modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2',
    stability: 0.4,
    similarityBoost: 0.8,
  });

  app.get('/voice/stream', { websocket: true }, (socket, req) => {
    let streamSid: string | null = null;
    let callSid: string | null = null;
    let mediaCount = 0;

    const dgApiKey = process.env.DEEPGRAM_API_KEY;
    if (!dgApiKey) {
      app.log.error('[MediaStream] Missing DEEPGRAM_API_KEY');
      socket.close();
      return;
    }

    let busyGenerating = false;
    let runningSummary = '';

    // ✅ late-bound
    let context: CallContext | null = null;

    // ✅ Deepgram will be created after context is known
    let deepgram: DeepgramLiveTranscriber | null = null;

    // ----- server -> Twilio helpers -----
    function sendAudioToTwilio(mulawBase64: string) {
      if (!streamSid) return;
      socket.send(
        JSON.stringify({
          event: 'media',
          streamSid,
          media: { payload: mulawBase64 },
        })
      );
    }

    function clearTwilioAudio() {
      if (!streamSid) return;
      socket.send(JSON.stringify({ event: 'clear', streamSid }));
    }

    async function speakPayload(payload: ScriptPayload) {
      clearTwilioAudio();
      for (const seg of payload.segments) {
        const mulawB64 = await elevenlabsTts.ttsToMulawBase64(seg.text);
        sendAudioToTwilio(mulawB64);
      }
    }

    // ✅ helper that resolves call context from Twilio + DB
    async function buildContextFromCall(callSid: string): Promise<CallContext> {
      // Fetch call metadata from Twilio (From/To are what you need)
      const call = await twilioClient.calls(callSid).fetch();
      const from = (call.from || '').trim();
      const to = (call.to || '').trim();

      if (!to || !from) {
        throw new Error(`Missing call metadata: from="${from}", to="${to}"`);
      }

      // 1) Find company via inbound number (To)
      const numberEntry = await NumbersRepository.findByNumber(to);
      if (!numberEntry) {
        throw new Error(`No company number entry found for To="${to}"`);
      }

      // 2) Find/create contact in that company via From
      const contact = await ContactsRepository.findOrCreate({
        number: from,
        companyId: numberEntry.company_id,
        label: from,
      });

      // 3) Pull reassurance profile
      const profile = await ReassuranceContactProfilesRepository.getByContactId(
        contact.id
      );

      // 4) Map profile -> CallContext
      const preferredName =
        profile?.preferred_name?.trim() || contact.label?.trim() || 'there';

      const locale = profile?.locale || 'en-US';

      // You can decide how to infer riskLevel.
      const riskFlags = profile?.risk_flags ?? null;
      const riskLevel: CallContext['riskLevel'] =
        riskFlags?.level === 'high'
          ? 'high'
          : riskFlags?.level === 'medium'
            ? 'medium'
            : 'low';

      return {
        userProfile: {
          id: contact.id,
          preferredName,
          locale,
          ageRange: profile?.demographics?.ageRange ?? 'adult',
          relationshipToCaller: 'care agency',
          // if you want, you can stash more info in your CallContext type
          // e.g., timezone: profile?.timezone ?? null
        },
        riskLevel,
        ...profile,
      };
    }

    // ✅ (re)initialize deepgram once you know locale
    function initDeepgram(locale: string) {
      deepgram?.finish();

      deepgram = new DeepgramLiveTranscriber({
        apiKey: dgApiKey!,
        model: 'nova-3',
        language: locale ?? 'en-US',
        encoding: 'mulaw',
        sampleRate: 8000,
        interimResults: true,
        smartFormat: true,
        punctuate: true,
        endpointingMs: 300, // less aggressive than 50 for testing
      });

      deepgram.connect((text, info) => {
        if (!info.isFinal) return;
        utteranceBuffer.addFinal(text);
      });
    }

    const utteranceBuffer = new FinalUtteranceBuffer(
      700,
      async (finalUtterance) => {
        if (busyGenerating) {
          app.log.debug(
            { callSid, streamSid },
            '[ScriptGen] Busy; skipping utterance'
          );
          return;
        }

        if (!context) {
          app.log.warn(
            { callSid, streamSid },
            '[ScriptGen] No context yet; skipping utterance'
          );
          return;
        }

        if (finalUtterance.trim().length < 3) return;

        busyGenerating = true;
        try {
          app.log.info(
            { callSid, streamSid, finalUtterance },
            '[Deepgram] FINAL UTTERANCE (flushed)'
          );

          const payload = await scriptAgent.generateFollowupScript({
            context,
            lastUserUtterance: finalUtterance,
            runningSummary,
          });

          app.log.info(
            { callSid, streamSid },
            '[ScriptGen] followup script generated'
          );
          await speakPayload(payload);

          runningSummary = (
            runningSummary + `\nUser: ${finalUtterance}`
          ).trim();
        } catch (err) {
          app.log.error(
            { err, callSid, streamSid },
            '[ScriptGen] error generating followup'
          );
        } finally {
          busyGenerating = false;
        }
      }
    );

    app.log.info({ ip: req.ip, url: req.url }, '[MediaStream] WS connected');

    socket.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        app.log.warn({ raw: raw.toString() }, '[MediaStream] Non-JSON message');
        return;
      }

      switch (msg.event) {
        case 'connected':
          app.log.info('[MediaStream] connected event');
          break;

        case 'start': {
          streamSid = msg.start?.streamSid ?? null;
          callSid = msg.start?.callSid ?? null;
          app.log.info({ streamSid, callSid }, '[MediaStream] start');

          // ✅ Build DB-backed context now that we have callSid
          if (callSid) {
            try {
              context = await buildContextFromCall(callSid);
              app.log.info(
                {
                  callSid,
                  streamSid,
                  contactId: context.userProfile.id,
                  locale: context.userProfile.locale,
                },
                '[MediaStream] Context resolved'
              );

              initDeepgram(context.userProfile.locale ?? 'en-US');
            } catch (err) {
              app.log.error(
                { err, callSid, streamSid },
                '[MediaStream] Failed to resolve context'
              );

              // fallback so system still works
              context = {
                userProfile: {
                  id: 'unknown',
                  preferredName: 'there',
                  locale: 'en-US',
                  ageRange: 'adult',
                  relationshipToCaller: 'care agency',
                },
                riskLevel: 'low',
              };

              initDeepgram('en-US');
            }
          } else {
            // no callSid (rare) -> fallback
            context = {
              userProfile: {
                id: 'unknown',
                preferredName: 'there',
                locale: 'en-US',
                ageRange: 'adult',
                relationshipToCaller: 'care agency',
              },
              riskLevel: 'low',
            };
            initDeepgram('en-US');
          }

          break;
        }

        case 'media': {
          mediaCount++;
          if (mediaCount % 50 === 0) {
            app.log.info(
              { streamSid: msg.streamSid, mediaCount },
              '[MediaStream] receiving media'
            );
          }

          const b64 = msg.media?.payload;
          if (!b64) return;

          const audio = Buffer.from(b64, 'base64');
          deepgram?.sendAudio(audio);
          break;
        }

        case 'stop':
          app.log.info({ streamSid: msg.streamSid }, '[MediaStream] stop');
          utteranceBuffer.flushNow();
          deepgram?.finish();
          socket.close();
          break;

        default:
          break;
      }
    });

    socket.on('close', (code, reason) => {
      app.log.info(
        { streamSid, callSid, code, reason: reason?.toString() },
        '[MediaStream] WS closed'
      );
      utteranceBuffer.flushNow();
      deepgram?.finish();
    });

    socket.on('error', (err) => {
      app.log.error({ err, streamSid, callSid }, '[MediaStream] WS error');
      utteranceBuffer.flushNow();
      deepgram?.finish();
    });
  });
}

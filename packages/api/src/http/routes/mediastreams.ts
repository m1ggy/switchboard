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

    // Placeholder context (keep yours or replace with real one)
    const context: CallContext = {
      userProfile: {
        id: 'unknown',
        preferredName: 'there',
        locale: 'en-US',
        ageRange: 'adult',
        relationshipToCaller: 'care agency',
      },
      riskLevel: 'low',
    };

    let busyGenerating = false;
    let runningSummary = '';

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
      // optional: stop any queued audio before speaking
      clearTwilioAudio();

      for (const seg of payload.segments) {
        const mulawB64 = await elevenlabsTts.ttsToMulawBase64(seg.text);
        sendAudioToTwilio(mulawB64);
      }
    }

    // ----- Deepgram -----
    const deepgram = new DeepgramLiveTranscriber({
      apiKey: dgApiKey,
      model: 'nova-3',
      language: context.userProfile.locale ?? 'en-US',
      encoding: 'mulaw',
      sampleRate: 8000,
      interimResults: true,
      smartFormat: true,
      punctuate: true,
      endpointingMs: 50,
    });

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

    socket.on('message', (raw) => {
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

          deepgram.connect((text, info) => {
            if (!info.isFinal) return;
            utteranceBuffer.addFinal(text);
          });

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
          deepgram.sendAudio(audio);
          break;
        }

        case 'stop':
          app.log.info({ streamSid: msg.streamSid }, '[MediaStream] stop');
          utteranceBuffer.flushNow();
          deepgram.finish();
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
      deepgram.finish();
    });

    socket.on('error', (err) => {
      app.log.error({ err, streamSid, callSid }, '[MediaStream] WS error');
      utteranceBuffer.flushNow();
      deepgram.finish();
    });
  });
}

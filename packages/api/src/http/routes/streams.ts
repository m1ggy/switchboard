// src/routes/twilio/reassurance_stream.ts
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { OpenAIClient } from '@/lib/ai/openai_client';
import {
  ScriptGeneratorAgent,
  type CallContext,
  type ScriptPayload,
} from '@/lib/ai/script_agent';
import { uploadAttachmentBuffer } from '@/lib/google/storage';
import { DeepgramLiveTranscriber } from '@/lib/transcription/deepgram-live';
import { FinalUtteranceBuffer } from '@/lib/transcription/final-utterance-buffer';
import { ElevenLabsMulawTTS } from '@/lib/tts/elevenlabs';

import { ContactsRepository } from '@/db/repositories/contacts';
import { ReassuranceCallSessionsRepository } from '@/db/repositories/reassurance_call_sessions';
import { ReassuranceCallTurnsRepository } from '@/db/repositories/reassurance_call_turns';
import { ReassuranceContactMemoryChunksRepository } from '@/db/repositories/reassurance_contact_memory_chunks';
import { ReassuranceContactMemorySummaryRepository } from '@/db/repositories/reassurance_contact_memory_summary';
import { ReassuranceContactProfilesRepository } from '@/db/repositories/reassurance_contact_profiles';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';

// ---- tiny helpers ----
function tmpFile(name: string) {
  return path.join(os.tmpdir(), name);
}

async function embedText(
  openai: OpenAIClient,
  input: string
): Promise<number[]> {
  const resp = await (openai as any).client.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  });
  return resp.data[0].embedding;
}

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return '{}';
  }
}

export async function twilioReassuranceStreamRoutes(app: FastifyInstance) {
  const openai = new OpenAIClient(process.env.OPENAI_API_KEY!);
  const scriptAgent = new ScriptGeneratorAgent(openai);

  const elevenlabsTts = new ElevenLabsMulawTTS({
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID!,
    modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2',
    stability: 0.4,
    similarityBoost: 0.8,
  });

  app.get('/reassurance/stream', { websocket: true }, (socket, req) => {
    let { scheduleId, jobId, callId } = req.query as Record<
      string,
      string | undefined
    >;

    let streamSid: string | null = null;
    let callSid: string | null = null;

    let sessionId: string | null = null;
    let contactId: string | null = null;

    // contact profile cached for this socket lifetime
    let contactProfile: any | null = null;

    let runningSummary = '';
    let busyGenerating = false;

    // audio sinks (raw mulaw frames)
    const inboundPath = tmpFile(`reassurance-in-${crypto.randomUUID()}.mulaw`);
    const outboundPath = tmpFile(
      `reassurance-out-${crypto.randomUUID()}.mulaw`
    );
    const inboundStream = fs.createWriteStream(inboundPath);
    const outboundStream = fs.createWriteStream(outboundPath);

    // prevent double-finalize (close + stop + error can all happen)
    let finalized = false;

    const dgApiKey = process.env.DEEPGRAM_API_KEY;
    if (!dgApiKey) {
      app.log.error('[ReassuranceStream] Missing DEEPGRAM_API_KEY');
      socket.close();
      return;
    }

    // ---- server -> Twilio helpers ----
    function sendAudioToTwilio(mulawBase64: string) {
      if (!streamSid) return;

      socket.send(
        JSON.stringify({
          event: 'media',
          streamSid,
          media: { payload: mulawBase64 },
        })
      );

      // record outbound mulaw
      outboundStream.write(Buffer.from(mulawBase64, 'base64'));
    }

    function clearTwilioAudio() {
      if (!streamSid) return;
      socket.send(JSON.stringify({ event: 'clear', streamSid }));
    }

    async function speakText(text: string) {
      clearTwilioAudio();
      const mulawB64 = await elevenlabsTts.ttsToMulawBase64(text);
      sendAudioToTwilio(mulawB64);
    }

    async function speakScriptPayload(
      payload: Pick<ScriptPayload, 'segments'>
    ) {
      clearTwilioAudio();
      for (const seg of payload.segments) {
        const mulawB64 = await elevenlabsTts.ttsToMulawBase64(seg.text);
        sendAudioToTwilio(mulawB64);
      }
    }

    // ---- Deepgram ----
    const deepgram = new DeepgramLiveTranscriber({
      apiKey: dgApiKey,
      model: 'nova-3',
      language: 'en-US',
      encoding: 'mulaw',
      sampleRate: 8000,
      interimResults: true,
      smartFormat: true,
      punctuate: true,
      endpointingMs: 50,
    });

    function buildContextBlock(args: {
      profile: any | null;
      memSummaryText: string | null;
      similar: any[];
      recentTurns: { role: string; content: string }[];
    }) {
      const { profile, memSummaryText, similar, recentTurns } = args;

      const profileBlock = profile
        ? `CONTACT PROFILE:\n${safeJson({
            preferred_name: profile.preferred_name,
            locale: profile.locale,
            timezone: profile.timezone,
            goals: profile.goals,
            medical_notes: profile.medical_notes,
            preferences: profile.preferences,
            risk_flags: profile.risk_flags,
            last_state: profile.last_state,
            updated_at: profile.updated_at,
          })}`
        : `CONTACT PROFILE:\n(none)`;

      const summaryBlock = memSummaryText
        ? `ROLLING MEMORY SUMMARY:\n${memSummaryText}`
        : `ROLLING MEMORY SUMMARY:\n(none)`;

      const similarBlock =
        similar?.length > 0
          ? `RELEVANT MEMORIES (vector recall):\n${similar
              .slice(0, 8)
              .map(
                (m) =>
                  `- [${m.source_type ?? 'memory'}|imp=${m.importance ?? 1}] ${
                    m.chunk_text
                  }`
              )
              .join('\n')}`
          : `RELEVANT MEMORIES (vector recall):\n(none)`;

      const recentTurnsBlock =
        recentTurns?.length > 0
          ? `RECENT TURNS (this call):\n${recentTurns
              .slice(-12)
              .map((t) => `${t.role}: ${t.content}`)
              .join('\n')}`
          : `RECENT TURNS (this call):\n(none)`;

      return [profileBlock, summaryBlock, similarBlock, recentTurnsBlock]
        .filter(Boolean)
        .join('\n\n');
    }

    const utteranceBuffer = new FinalUtteranceBuffer(
      700,
      async (finalUtterance) => {
        if (!sessionId || !contactId) return;
        if (busyGenerating) return;
        if (finalUtterance.trim().length < 2) return;

        busyGenerating = true;

        try {
          // 1) Save user turn
          await ReassuranceCallTurnsRepository.createTurn({
            id: crypto.randomUUID(),
            session_id: sessionId,
            role: 'user',
            content: finalUtterance,
            meta: { callSid, streamSid },
          } as any);

          // 2) Embed + store as memory chunk
          const userEmb = await embedText(openai, finalUtterance);
          await ReassuranceContactMemoryChunksRepository.insert({
            id: crypto.randomUUID(),
            contact_id: contactId,
            session_id: sessionId,
            source_type: 'user_utterance',
            chunk_text: finalUtterance,
            embedding: userEmb,
            importance: 1,
          });

          // 3) Load rolling summary
          const memSummary =
            await ReassuranceContactMemorySummaryRepository.getByContactId(
              contactId
            );

          // 4) Vector recall
          const similar =
            await ReassuranceContactMemoryChunksRepository.searchSimilar({
              contactId,
              queryEmbedding: userEmb,
              limit: 8,
              minImportance: 1,
            });

          // 5) Short-term history (this session)
          const recentTurnsRaw =
            await ReassuranceCallTurnsRepository.listBySessionIdWithLimit(
              sessionId,
              40
            );

          const recentTurns = recentTurnsRaw.map((t) => ({
            role: t.role,
            content: t.content,
          }));

          // 6) Rich context block -> use as lastCheckInSummary for the agent
          const contextBlock = buildContextBlock({
            profile: contactProfile,
            memSummaryText: memSummary?.summary_text ?? null,
            similar,
            recentTurns,
          });

          const preferredName =
            contactProfile?.preferred_name ||
            contactProfile?.last_state?.preferred_name ||
            'there';

          const locale = contactProfile?.locale || 'en-US';

          const riskLevel: 'low' | 'medium' | 'high' =
            contactProfile?.risk_flags?.high_risk === true
              ? 'high'
              : contactProfile?.risk_flags?.medium_risk === true
                ? 'medium'
                : 'low';

          const context: CallContext = {
            userProfile: {
              id: contactId,
              preferredName,
              locale,
              ageRange: 'adult',
              relationshipToCaller: 'reassurance system',
            },
            riskLevel,
            lastCheckInSummary: contextBlock, // ✅ inject memory/profile here
          };

          // 7) Generate reply
          const payload = await scriptAgent.generateFollowupScript({
            context,
            lastUserUtterance: finalUtterance,
            runningSummary,
          });

          await speakScriptPayload(payload);

          const assistantText = payload.segments
            .map((s) => s.text)
            .join(' ')
            .trim();

          // 8) Save assistant turn
          await ReassuranceCallTurnsRepository.createTurn({
            id: crypto.randomUUID(),
            session_id: sessionId,
            role: 'assistant',
            content: assistantText,
            meta: {
              callSid,
              streamSid,
              intent: payload.intent,
              notesForHumanSupervisor: payload.notesForHumanSupervisor,
            },
          } as any);

          // 9) Save assistant as memory chunk too
          const assistantEmb = await embedText(openai, assistantText);
          await ReassuranceContactMemoryChunksRepository.insert({
            id: crypto.randomUUID(),
            contact_id: contactId,
            session_id: sessionId,
            source_type: 'other',
            chunk_text: assistantText,
            embedding: assistantEmb,
            importance: 1,
          });

          // update last_state
          try {
            await ReassuranceContactProfilesRepository.mergeLastState(
              contactId,
              {
                last_checkin_at: new Date().toISOString(),
                last_user_utterance: finalUtterance.slice(0, 500),
              }
            );
          } catch {}

          runningSummary = (
            runningSummary +
            `\nUser: ${finalUtterance}\nAssistant: ${assistantText}`
          ).trim();
        } catch (err) {
          app.log.error(
            { err, sessionId, contactId },
            '[ReassuranceStream] followup generation failed'
          );
        } finally {
          busyGenerating = false;
        }
      }
    );

    async function bootstrapSessionAndOpening() {
      if (!scheduleId) throw new Error('Missing scheduleId');

      const schedule = await ReassuranceSchedulesRepository.find(
        Number(scheduleId)
      );
      if (!schedule) throw new Error('Schedule not found');

      const contactLabel = schedule.name || schedule.phone_number || 'Unknown';
      const contact = await ContactsRepository.findOrCreate({
        number: schedule.phone_number,
        companyId: schedule.company_id,
        label: contactLabel,
      });

      contactId = contact.id;

      // load or initialize profile
      contactProfile =
        await ReassuranceContactProfilesRepository.getByContactId(contact.id);

      if (!contactProfile) {
        contactProfile = await ReassuranceContactProfilesRepository.upsert({
          contact_id: contact.id,
          preferred_name: schedule.name ?? null,
          locale: 'en-US',
          timezone: null,
          goals: 'Reassurance check-ins',
          preferences: { tone: 'calm', pace: 'slow' },
          last_state: { created_from: 'reassurance_stream' },
        });
      }

      // rolling summary for opening context
      const memSummary =
        await ReassuranceContactMemorySummaryRepository.getByContactId(
          contact.id
        );

      const preferredName =
        contactProfile?.preferred_name ||
        schedule.name ||
        contact.label ||
        undefined;

      const locale = contactProfile?.locale || 'en-US';

      const riskLevel: 'low' | 'medium' | 'high' =
        contactProfile?.risk_flags?.high_risk === true
          ? 'high'
          : contactProfile?.risk_flags?.medium_risk === true
            ? 'medium'
            : 'low';

      sessionId = crypto.randomUUID();

      await ReassuranceCallSessionsRepository.createSession({
        id: sessionId,
        schedule_id: schedule.id,
        job_id: jobId ?? null,
        call_id: callId ?? (crypto.randomUUID() as any),
        contact_id: contact.id,
        started_at: new Date(),
        risk_level: riskLevel,
        ai_model: 'reassurance-stream-v1',
      });

      // ✅ opening generated via ScriptGeneratorAgent.generateOpeningScript
      let openingPayload: ScriptPayload;
      const openingContext: CallContext = {
        userProfile: {
          id: contact.id,
          name: contact.label ?? undefined,
          preferredName,
          ageRange: 'adult',
          relationshipToCaller: 'reassurance system',
          locale,
        },
        lastCheckInSummary: memSummary?.summary_text ?? undefined,
        riskLevel,
      };

      try {
        openingPayload =
          await scriptAgent.generateOpeningScript(openingContext);
      } catch (err) {
        app.log.error(
          { err, sessionId, contactId: contact.id },
          '[ReassuranceStream] Failed to generate opening script; using fallback'
        );

        openingPayload = {
          intent: 'opening',
          segments: [
            {
              id: crypto.randomUUID(),
              text: `Hi ${preferredName || 'there'}. This is your reassurance call. How are you feeling today?`,
              tone: 'reassuring',
              maxDurationSeconds: 10,
            },
          ],
          notesForHumanSupervisor: null,
        };
      }

      // Save opening turns (one per segment)
      for (const seg of openingPayload.segments) {
        await ReassuranceCallTurnsRepository.createTurn({
          id: crypto.randomUUID(),
          session_id: sessionId,
          role: 'assistant',
          content: seg.text,
          meta: {
            phase: 'opening',
            intent: openingPayload.intent,
            tone: seg.tone,
            maxDurationSeconds: seg.maxDurationSeconds,
            notesForHumanSupervisor: openingPayload.notesForHumanSupervisor,
          },
        } as any);
      }

      await speakScriptPayload(openingPayload);

      runningSummary = `Opening delivered.`;
    }

    async function finalizeAndUpload(
      status: 'completed' | 'user_hung_up' | 'failed'
    ) {
      if (finalized) return;
      finalized = true;

      try {
        utteranceBuffer.flushNow();
        deepgram.finish();

        await new Promise<void>((resolve) =>
          inboundStream.end(() => resolve())
        );
        await new Promise<void>((resolve) =>
          outboundStream.end(() => resolve())
        );

        // upload audio
        let inboundUrl: string | null = null;
        let outboundUrl: string | null = null;

        try {
          const inBuf = fs.readFileSync(inboundPath);
          const outBuf = fs.readFileSync(outboundPath);

          if (sessionId) {
            inboundUrl = await uploadAttachmentBuffer(
              inBuf,
              `reassurance/audio/inbound-${sessionId}.mulaw`
            );
            outboundUrl = await uploadAttachmentBuffer(
              outBuf,
              `reassurance/audio/outbound-${sessionId}.mulaw`
            );
          }
        } catch (e) {
          app.log.error(
            { e, sessionId },
            '[ReassuranceStream] audio upload failed'
          );
        }

        if (sessionId) {
          await ReassuranceCallSessionsRepository.finalizeSession(sessionId, {
            status,
            ended_at: new Date(),
          });

          // stash last audio urls into profile last_state (until you add session columns)
          if (contactId && (inboundUrl || outboundUrl)) {
            try {
              await ReassuranceContactProfilesRepository.mergeLastState(
                contactId,
                {
                  last_session_id: sessionId,
                  last_audio: {
                    inbound_url: inboundUrl,
                    outbound_url: outboundUrl,
                  },
                }
              );
            } catch {}
          }

          app.log.info(
            { sessionId, inboundUrl, outboundUrl, status },
            '[ReassuranceStream] finalized'
          );
        }
      } catch (err) {
        app.log.error(
          { err, sessionId },
          '[ReassuranceStream] finalize failed'
        );
      } finally {
        try {
          fs.unlinkSync(inboundPath);
        } catch {}
        try {
          fs.unlinkSync(outboundPath);
        } catch {}
      }
    }

    socket.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        app.log.warn(
          { raw: raw.toString() },
          '[ReassuranceStream] Non-JSON message'
        );
        return;
      }

      switch (msg.event) {
        case 'start': {
          streamSid = msg.start?.streamSid ?? null;
          callSid = msg.start?.callSid ?? null;

          // ✅ Twilio-supported place for your params
          const cp = (msg.start?.customParameters ?? {}) as Record<
            string,
            string
          >;

          // ✅ fallback to req.query only if needed
          const q = (req.query ?? {}) as Record<string, any>;

          scheduleId = cp.scheduleId ?? q.scheduleId ?? null;
          jobId = cp.jobId ?? q.jobId ?? null;
          callId = cp.callId ?? q.callId ?? callSid ?? null;

          app.log.info(
            {
              scheduleId,
              jobId,
              callId,
              callSid,
              streamSid,
              customParameters: cp,
              query: q,
            },
            '[ReassuranceStream] start received / params resolved'
          );

          deepgram.connect((text, info) => {
            if (!info.isFinal) return;
            utteranceBuffer.addFinal(text);
          });

          try {
            await bootstrapSessionAndOpening();
          } catch (err) {
            app.log.error(
              JSON.stringify(
                { err, scheduleId, jobId, callId, callSid },
                null,
                2
              ),
              '[ReassuranceStream] bootstrap failed'
            );
            socket.close();
          }
          break;
        }

        case 'media': {
          const b64 = msg.media?.payload;
          if (!b64) return;

          const audio = Buffer.from(b64, 'base64');

          inboundStream.write(audio);
          deepgram.sendAudio(audio);
          break;
        }

        case 'stop':
          await finalizeAndUpload('user_hung_up');
          socket.close();
          break;

        default:
          break;
      }
    });

    socket.on('close', async () => {
      await finalizeAndUpload('user_hung_up');
    });

    socket.on('error', async (err) => {
      app.log.error(
        { err, sessionId, callSid },
        '[ReassuranceStream] WS error'
      );
      await finalizeAndUpload('failed');
    });
  });
}

// src/routes/twilio/reassurance_stream.ts

import { spawn } from 'child_process';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import os from 'os';
import path from 'path';
import twilio from 'twilio';

import { OpenAIClient } from '@/lib/ai/openai_client';
import {
  type CallContext,
  type ScriptPayload,
  ScriptGeneratorAgent,
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

import { UserCompaniesRepository } from '@/db/repositories/companies';
import { NumbersRepository } from '@/db/repositories/numbers';
import { ReassuranceCallRecordingsRepository } from '@/db/repositories/reassurance_call_recordings';
import { ReassuranceCallTranscriptsRepository } from '@/db/repositories/reassurance_call_transcripts';

// -------------------- ffmpeg helpers --------------------
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}

function classifyMedAnswer(text: string) {
  const t = (text || '').toLowerCase();

  const neg = /\b(no|not|haven't|have not|didn't|did not)\b/.test(t);
  const took = /\b(took|taken|already|i did)\b/.test(t);
  const will = /\b(will|gonna|going to|i'll|i will|soon|later)\b/.test(t);

  if (took && !neg) return 'took';
  if (neg && will) return 'will_take';
  if (neg && !will) return 'not_taking';
  // fallback: if unclear, treat as will_take (safer for reminder UX)
  return 'will_take';
}

async function generateRollingMemorySummary(args: {
  openai: OpenAIClient;
  priorSummary: string | null;
  callTranscriptSummary: string;
  callMode: 'reassurance' | 'medication_reminder';
}): Promise<string> {
  const { openai, priorSummary, callTranscriptSummary, callMode } = args;

  const styleHint =
    callMode === 'medication_reminder'
      ? `This was a quick medication reminder call. Keep the summary extremely short.`
      : `This was a reassurance call. Keep the summary short and practical.`;

  const input = [
    {
      role: 'system',
      content:
        'You write a concise rolling memory summary about a person for future phone calls. ' +
        'Output plain text only. No bullet points. No headings.',
    },
    {
      role: 'user',
      content: [
        styleHint,
        '',
        `Prior rolling summary (may be empty):`,
        priorSummary ?? '(none)',
        '',
        `New call notes:`,
        callTranscriptSummary || '(none)',
        '',
        `Write an updated rolling summary (2–5 sentences max).`,
      ].join('\n'),
    },
  ];

  const resp = await (openai as any).client.responses.create({
    model: 'gpt-4.1-mini',
    input,
    temperature: 0.3,
    max_output_tokens: 220,
  });

  const text =
    resp.output_text ??
    resp.output
      ?.map((o: any) => o?.content?.map((c: any) => c?.text).join(''))
      .join('') ??
    '';

  return (text || '').trim().slice(0, 2000);
}

async function generateSessionAiSummary(args: {
  openai: OpenAIClient;
  transcriptText: string;
  callMode: 'reassurance' | 'medication_reminder';
}): Promise<string> {
  const { openai, transcriptText, callMode } = args;

  const styleHint =
    callMode === 'medication_reminder'
      ? `This was a medication reminder call. Keep it extremely short.`
      : `This was a reassurance check-in. Keep it short and practical.`;

  const input = [
    {
      role: 'system',
      content:
        'You write a concise call summary for internal call logs. ' +
        'Plain text only. No bullet points. No headings. No PHI beyond what is in the transcript.',
    },
    {
      role: 'user',
      content: [
        styleHint,
        '',
        'Transcript (user + assistant, chronological):',
        transcriptText || '(none)',
        '',
        'Write a 2–4 sentence summary focusing on: how the person is doing, key concerns, actions/next steps, and any risk signals mentioned.',
      ].join('\n'),
    },
  ];

  const resp = await (openai as any).client.responses.create({
    model: 'gpt-4.1-mini',
    input,
    temperature: 0.2,
    max_output_tokens: 220,
  });

  const text =
    resp.output_text ??
    resp.output
      ?.map((o: any) => o?.content?.map((c: any) => c?.text).join(''))
      .join('') ??
    '';

  return (text || '').trim().slice(0, 2000);
}

function formatTranscriptForSummary(
  rows: Array<{ speaker: string; transcript: string }>
) {
  return rows
    .map(
      (r) =>
        `${r.speaker === 'user' ? 'User' : r.speaker === 'assistant' ? 'Assistant' : 'System'}: ${r.transcript}`
    )
    .join('\n');
}

/**
 * Convert Twilio Media Stream μ-law raw file -> mp3
 * Twilio μ-law: 8000 Hz, mono
 */
async function mulawToMp3(inputMulawPath: string, outputMp3Path: string) {
  await runFfmpeg([
    '-y',
    '-f',
    'mulaw',
    '-ar',
    '8000',
    '-ac',
    '1',
    '-i',
    inputMulawPath,
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '64k',
    '-ar',
    '44100',
    '-ac',
    '1',
    outputMp3Path,
  ]);
}

// -------------------- tiny helpers --------------------
function tmpFile(name: string) {
  return path.join(os.tmpdir(), name);
}

function safeStatBytes(p: string): number | null {
  try {
    return fs.statSync(p).size;
  } catch {
    return null;
  }
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasMedicationReminderGoal(goals: unknown): boolean {
  return (goals ?? '').toString().toLowerCase().includes('medication reminder');
}

function wordTimesToMs(
  words?: any[] | null
): { start_ms: number; end_ms: number } | null {
  if (!Array.isArray(words) || words.length === 0) return null;

  const starts = words
    .map((w) => (typeof w?.start === 'number' ? w.start : null))
    .filter((v): v is number => typeof v === 'number');

  const ends = words
    .map((w) => (typeof w?.end === 'number' ? w.end : null))
    .filter((v): v is number => typeof v === 'number');

  if (!starts.length || !ends.length) return null;

  const startS = Math.min(...starts);
  const endS = Math.max(...ends);

  const start_ms = Math.max(0, Math.round(startS * 1000));
  const end_ms = Math.max(start_ms + 1, Math.round(endS * 1000));

  return { start_ms, end_ms };
}

function clamp(s: string | null | undefined, maxLen: number) {
  const t = (s ?? '').toString();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + '…';
}

function nowMs() {
  const [s, ns] = process.hrtime();
  return s * 1000 + ns / 1e6;
}

// -------------------- routes --------------------
export async function twilioReassuranceStreamRoutes(app: FastifyInstance) {
  const openai = new OpenAIClient(process.env.OPENAI_API_KEY!);
  const scriptAgent = new ScriptGeneratorAgent(openai);

  const elevenlabsTts = new ElevenLabsMulawTTS({
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID!,
    modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_turbo_v2_5',
    stability: 0.4,
    similarityBoost: 0.8,
  });

  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

  const twilioClient =
    twilioAccountSid && twilioAuthToken
      ? twilio(twilioAccountSid, twilioAuthToken)
      : null;

  app.get('/reassurance/stream', { websocket: true }, (socket, req) => {
    let { scheduleId, jobId, callId, numberId } = req.query as Record<
      string,
      string | undefined
    >;

    let streamSid: string | null = null;
    let callSid: string | null = null;

    let sessionId: string | null = null;
    let contactId: string | null = null;
    let companyId: string | null = null;
    let companyName: string | null = null;
    let callbackNumber: string | null = null;

    let contactProfile: any | null = null;

    let runningSummary = '';
    let busyGenerating = false;
    let callMode: 'reassurance' | 'medication_reminder' = 'reassurance';

    // ✅ cap responses per call
    let assistantReplyCount = 0;
    let MAX_ASSISTANT_REPLIES = 3;

    // transcript state
    let transcriptSeq = 0;
    let recordingId: string | null = null;
    const pendingFinals: Array<{ text: string; info: any }> = [];
    let openingDelivered = false;
    let isSpeaking = false;
    const finalsWhileSpeaking: string[] = [];

    // ✅ Prevent any repeated generation while we're hanging up
    let isEnding = false;

    // ✅ Track outbound audio position for assistant transcript timings
    let outboundByteCursor = 0;
    function bytesToMs(bytes: number) {
      return Math.max(0, Math.round((bytes / 8000) * 1000)); // 8kHz ulaw: 8000 bytes/sec
    }

    // audio sinks (raw mulaw frames)
    const inboundPath = tmpFile(`reassurance-in-${crypto.randomUUID()}.mulaw`);
    const outboundPath = tmpFile(
      `reassurance-out-${crypto.randomUUID()}.mulaw`
    );
    const inboundStream = fs.createWriteStream(inboundPath);
    const outboundStream = fs.createWriteStream(outboundPath);

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

      const buf = Buffer.from(mulawBase64, 'base64');
      outboundStream.write(buf);

      // ✅ advance cursor for assistant transcript timing
      outboundByteCursor += buf.length;
    }

    function clearTwilioAudio() {
      if (!streamSid) return;
      socket.send(JSON.stringify({ event: 'clear', streamSid }));
    }

    // ✅ Insert assistant/outbound into transcript timeline
    async function saveOutboundTranscript(args: {
      text: string;
      start_ms: number;
      end_ms: number;
    }) {
      const { text, start_ms, end_ms } = args;
      if (!sessionId || !contactId) return;

      transcriptSeq += 1;

      await ReassuranceCallTranscriptsRepository.create({
        session_id: sessionId,
        recording_id: recordingId,
        contact_id: contactId,
        seq: transcriptSeq,
        speaker: 'assistant',
        channel: 'outbound',
        transcript: text,
        start_ms,
        end_ms: Math.max(end_ms, start_ms + 1),
        confidence: null,
        language: 'en-US',
        words: null,
        raw: null,
      });
    }

    // ✅ STREAMING: speak + return timing (based on outbound bytes)
    async function speakTextStreamingWithTiming(text: string): Promise<{
      start_ms: number;
      end_ms: number;
    }> {
      isSpeaking = true;
      try {
        const startBytes = outboundByteCursor;

        const chunks = await (elevenlabsTts as any).ttsToMulawChunks(text);
        for await (const chunk of chunks as any) {
          if (!chunk) continue;
          const b64 = Buffer.from(chunk).toString('base64');
          sendAudioToTwilio(b64);
        }

        const endBytes = outboundByteCursor;

        return {
          start_ms: bytesToMs(startBytes),
          end_ms: bytesToMs(endBytes),
        };
      } finally {
        isSpeaking = false;

        // ✅ flush anything the user said while we were speaking
        if (finalsWhileSpeaking.length) {
          const queued = finalsWhileSpeaking.splice(
            0,
            finalsWhileSpeaking.length
          );
          for (const q of queued) utteranceBuffer.addFinal(q);
        }
      }
    }

    // ✅ Speak all segments, and insert each assistant segment into transcripts
    async function speakScriptPayload(
      payload: Pick<ScriptPayload, 'segments'>
    ) {
      clearTwilioAudio();
      isSpeaking = true;
      try {
        for (const seg of payload.segments) {
          const timing = await speakTextStreamingWithTiming(seg.text);
          await saveOutboundTranscript({
            text: seg.text,
            start_ms: timing.start_ms,
            end_ms: timing.end_ms,
          });
        }
      } finally {
        isSpeaking = false;

        if (finalsWhileSpeaking.length) {
          const queued = finalsWhileSpeaking.splice(
            0,
            finalsWhileSpeaking.length
          );
          for (const q of queued) utteranceBuffer.addFinal(q);
        }
      }
    }

    async function speakScriptPayloadNoClearWithDuration(
      payload: Pick<ScriptPayload, 'segments'>
    ): Promise<number> {
      let totalMs = 0;

      isSpeaking = true;
      try {
        for (const seg of payload.segments) {
          const timing = await speakTextStreamingWithTiming(seg.text);
          totalMs += Math.max(0, timing.end_ms - timing.start_ms);

          await saveOutboundTranscript({
            text: seg.text,
            start_ms: timing.start_ms,
            end_ms: timing.end_ms,
          });
        }
      } finally {
        isSpeaking = false;

        if (finalsWhileSpeaking.length) {
          const queued = finalsWhileSpeaking.splice(
            0,
            finalsWhileSpeaking.length
          );
          for (const q of queued) utteranceBuffer.addFinal(q);
        }
      }

      return totalMs;
    }

    // ---- End-of-conversation detection + hangup ----
    function shouldEndConversation(text: string) {
      const t = (text || '').trim().toLowerCase();

      const negation = /\b(don't|do not|not|never)\b/.test(t);
      if (negation && /\b(hang up|end the call|goodbye|bye)\b/.test(t))
        return false;

      const strong =
        /\b(hang up|end (the )?call|disconnect|terminate|stop calling|goodbye|bye\b|bye bye|talk to you later|that's all|no(,)? (thank you|thanks)|i'?m done|we'?re done|you can go now|see you|see ya)\b/.test(
          t
        );

      const haveToGo =
        /\b(i (have|got) to go|i need to go|i should go|i must go|gotta go)\b/.test(
          t
        );

      const thatsIt =
        /\b(that'?s it|that is it|all good|all set)\b/.test(t) &&
        t.length <= 40;

      return strong || haveToGo || thatsIt;
    }

    async function endTwilioCall(reason: string) {
      if (!twilioClient) {
        app.log.warn(
          { reason, callSid, streamSid },
          '[ReassuranceStream] TWILIO_* env missing; cannot end call via REST'
        );
        return;
      }
      if (!callSid) {
        app.log.warn(
          { reason, callSid, streamSid },
          '[ReassuranceStream] No callSid; cannot end call'
        );
        return;
      }

      try {
        await twilioClient.calls(callSid).update({ status: 'completed' });
        app.log.info(
          { reason, callSid, streamSid },
          '[ReassuranceStream] Twilio call ended'
        );
      } catch (err) {
        app.log.error(
          { err, reason, callSid, streamSid },
          '[ReassuranceStream] Failed to end call'
        );
      }
    }

    /**
     * IMPORTANT FIX:
     * We were accidentally speaking TWO closings on medication reminders because:
     * - medication branch generated a closingText and passed it as goodbyeText
     * - gracefulHangupAfterGoodbye ALSO generated & spoke a closing when context was provided
     *
     * So: add `skipAiClosing` and set it true for med reminders.
     */
    async function gracefulHangupAfterGoodbye(opts?: {
      goodbyeText?: string;
      context?: CallContext;
      skipAiClosing?: boolean;
    }) {
      if (isEnding) return;
      isEnding = true;
      busyGenerating = true;

      let estimatedPlaybackMs = 0;

      try {
        if (!opts?.skipAiClosing && opts?.context) {
          const closing = await scriptAgent.generateClosingScript({
            context: opts.context,
            runningSummary,
          });

          estimatedPlaybackMs +=
            await speakScriptPayloadNoClearWithDuration(closing);

          const closingText = closing.segments
            .map((s) => s.text)
            .join(' ')
            .trim();
          await ReassuranceCallTurnsRepository.createTurn({
            id: crypto.randomUUID(),
            session_id: sessionId!,
            role: 'assistant',
            content: closingText,
            meta: {
              callSid,
              streamSid,
              intent: closing.intent,
              phase: 'closing',
            },
          } as any);
        }
      } catch (err) {
        app.log.warn(
          { err, callSid, streamSid },
          '[ReassuranceStream] closing gen/speak failed; continuing'
        );
      }

      const goodbye =
        opts?.goodbyeText ??
        "Okay — thanks for chatting. I'll let you go now. Goodbye.";

      try {
        const timing = await speakTextStreamingWithTiming(goodbye);
        estimatedPlaybackMs += Math.max(0, timing.end_ms - timing.start_ms);

        await saveOutboundTranscript({
          text: goodbye,
          start_ms: timing.start_ms,
          end_ms: timing.end_ms,
        });
      } catch (err) {
        app.log.warn(
          { err, callSid, streamSid },
          '[ReassuranceStream] Failed to speak goodbye; continuing hangup'
        );
      }

      await sleep(Math.min(15000, estimatedPlaybackMs + 750));

      await finalizeAndUpload('completed');
      await endTwilioCall('user_end_intent');

      try {
        socket.close();
      } catch {}
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
      endpointingMs: 30,
    });

    function buildContextBlock(args: {
      profile: any | null;
      memSummaryText: string | null;
      recentTurns: { role: string; content: string }[];
    }) {
      const { profile, memSummaryText, recentTurns } = args;

      const profileLite = profile
        ? {
            preferred_name: profile.preferred_name,
            locale: profile.locale,
            timezone: profile.timezone,
            goals: profile.goals,
            preferences: profile.preferences,
            risk_flags: profile.risk_flags,
            last_state: profile.last_state,
          }
        : null;

      const profileBlock = profileLite
        ? `CONTACT PROFILE (compact):\n${safeJson(profileLite)}`
        : `CONTACT PROFILE:\n(none)`;

      const summaryBlock = memSummaryText
        ? `ROLLING MEMORY SUMMARY (trimmed):\n${clamp(memSummaryText, 1000)}`
        : `ROLLING MEMORY SUMMARY:\n(none)`;

      const recentTurnsBlock =
        recentTurns?.length > 0
          ? `RECENT TURNS (this call):\n${recentTurns
              .slice(-10)
              .map((t) => `${t.role}: ${clamp(t.content, 280)}`)
              .join('\n')}`
          : `RECENT TURNS (this call):\n(none)`;

      return [profileBlock, summaryBlock, recentTurnsBlock]
        .filter(Boolean)
        .join('\n\n');
    }

    async function saveInboundTranscript(text: string, info: any) {
      if (!sessionId || !contactId) return;

      transcriptSeq += 1;

      const timing = wordTimesToMs(info?.words) ?? { start_ms: 0, end_ms: 1 };

      await ReassuranceCallTranscriptsRepository.create({
        session_id: sessionId,
        recording_id: recordingId,
        contact_id: contactId,
        seq: transcriptSeq,
        speaker: 'user',
        channel: 'inbound',
        transcript: text,
        start_ms: timing.start_ms,
        end_ms: timing.end_ms,
        confidence: info?.confidence ?? null,
        language: 'en-US',
        words: info?.words ?? null,
        raw: info?.raw ?? info ?? null,
      });
    }

    async function drainPendingFinals() {
      if (!sessionId || !contactId) return;
      if (!pendingFinals.length) return;

      const items = pendingFinals.splice(0, pendingFinals.length);
      for (const item of items) {
        try {
          await saveInboundTranscript(item.text, item.info);
          utteranceBuffer.addFinal(item.text);
        } catch (err) {
          app.log.error(
            { err, sessionId, contactId },
            '[ReassuranceStream] failed draining pending transcript'
          );
        }
      }
    }

    const utteranceBuffer = new FinalUtteranceBuffer(
      300,
      async (finalUtterance) => {
        if (!sessionId || !contactId) return;
        if (busyGenerating) return;
        if (isEnding) return; // ✅ NEW
        if (finalUtterance.trim().length < 2) return;
        if (!openingDelivered) return;

        if (isSpeaking) {
          // ✅ prevent overlap: user answered while assistant is talking
          finalsWhileSpeaking.push(finalUtterance);
          return;
        }

        if (shouldEndConversation(finalUtterance)) {
          try {
            await ReassuranceCallTurnsRepository.createTurn({
              id: crypto.randomUUID(),
              session_id: sessionId,
              role: 'user',
              content: finalUtterance,
              meta: { callSid, streamSid, end_intent: true },
            } as any);
          } catch {}

          const context: CallContext = {
            userProfile: {
              id: contactId,
              preferredName:
                contactProfile?.preferred_name ||
                contactProfile?.last_state?.preferred_name ||
                'there',
              locale: contactProfile?.locale || 'en-US',
              ageRange: 'adult',
              relationshipToCaller: 'reassurance system',
            },
            riskLevel:
              contactProfile?.risk_flags?.high_risk === true
                ? 'high'
                : contactProfile?.risk_flags?.medium_risk === true
                  ? 'medium'
                  : 'low',
            callMode,
            companyName: companyName ?? undefined,
            callbackNumber: callbackNumber ?? undefined,
          };

          await gracefulHangupAfterGoodbye({ context });
          return;
        }

        busyGenerating = true;
        const tAll = nowMs();

        try {
          const userTurnPromise = ReassuranceCallTurnsRepository.createTurn({
            id: crypto.randomUUID(),
            session_id: sessionId,
            role: 'user',
            content: finalUtterance,
            meta: { callSid, streamSid },
          } as any);

          const memSummaryPromise =
            ReassuranceContactMemorySummaryRepository.getByContactId(contactId);

          const recentTurnsPromise =
            ReassuranceCallTurnsRepository.listBySessionIdWithLimit(
              sessionId,
              15
            );

          await userTurnPromise;

          const [memSummary, recentTurnsRaw] = await Promise.all([
            memSummaryPromise,
            recentTurnsPromise,
          ]);

          const recentTurns = recentTurnsRaw.map((t) => ({
            role: t.role,
            content: t.content,
          }));

          const contextBlock = buildContextBlock({
            profile: contactProfile,
            memSummaryText: memSummary?.summary_text ?? null,
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
            lastCheckInSummary: contextBlock,
            callMode,
            companyName: companyName ?? undefined,
            callbackNumber: callbackNumber ?? undefined,
          };

          const tAi = nowMs();
          const payload = await scriptAgent.generateFollowupScript({
            context,
            lastUserUtterance: finalUtterance,
            runningSummary,
          });
          app.log.info(
            { ms: Math.round(nowMs() - tAi) },
            '[ReassuranceStream] AI followup generated'
          );

          const tSpeak = nowMs();
          await speakScriptPayload(payload);
          app.log.info(
            { ms: Math.round(nowMs() - tSpeak) },
            '[ReassuranceStream] TTS spoken + transcript saved'
          );

          const assistantText = payload.segments
            .map((s) => s.text)
            .join(' ')
            .trim();

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

          // ✅ Medication reminders: generate ONE closing, speak it ONCE, then hang up.
          if (callMode === 'medication_reminder') {
            const kind = classifyMedAnswer(finalUtterance);
            const ttsNumber = phoneForTts(callbackNumber);

            let reply = '';
            if (kind === 'took') {
              reply = `Thank you for letting me know. I'm glad you've taken your medication.`;
            } else if (kind === 'will_take') {
              reply = `Thank you for letting me know. Please take your medication when you can.`;
            } else {
              reply = `Okay, thanks for telling me. If you need help or have questions, you can call us back.`;
            }

            const closing = ttsNumber
              ? `Thank you for your time, ${preferredName}. Do you need anything else at all? If you need to reach us, please call ${ttsNumber}. Have a great day!`
              : `Thank you for your time, ${preferredName}. Have a great day!`;

            // speak reply + closing as two segments (so you keep your timing + transcript inserts)
            await speakScriptPayload({
              segments: [
                {
                  id: crypto.randomUUID(),
                  text: reply,
                  tone: 'reassuring',
                } as any,
                {
                  id: crypto.randomUUID(),
                  text: closing,
                  tone: 'reassuring',
                } as any,
              ],
            });

            // log turn text
            try {
              await ReassuranceCallTurnsRepository.createTurn({
                id: crypto.randomUUID(),
                session_id: sessionId,
                role: 'assistant',
                content: `${reply} ${closing}`.trim(),
                meta: {
                  callSid,
                  streamSid,
                  intent: 'medication_reminder_closing',
                },
              } as any);
            } catch {}

            // now end
            await gracefulHangupAfterGoodbye({
              goodbyeText: '', // already said goodbye-ish in closing
              context,
              skipAiClosing: true,
            });
            return;
          }

          // ---- reassurance normal flow ----
          ReassuranceContactProfilesRepository.mergeLastState(contactId, {
            last_checkin_at: new Date().toISOString(),
            last_user_utterance: finalUtterance.slice(0, 500),
          }).catch(() => {});

          runningSummary = (
            runningSummary +
            `\nUser: ${finalUtterance}\nAssistant: ${assistantText}`
          ).trim();

          assistantReplyCount += 1;
          if (assistantReplyCount >= MAX_ASSISTANT_REPLIES) {
            try {
              const closing = await scriptAgent.generateClosingScript({
                context,
                runningSummary,
              });

              await speakScriptPayload(closing);

              const closingText = closing.segments
                .map((s) => s.text)
                .join(' ')
                .trim();

              await ReassuranceCallTurnsRepository.createTurn({
                id: crypto.randomUUID(),
                session_id: sessionId,
                role: 'assistant',
                content: closingText,
                meta: {
                  callSid,
                  streamSid,
                  intent: closing.intent,
                  notesForHumanSupervisor: closing.notesForHumanSupervisor,
                  phase: 'closing',
                },
              } as any);

              await finalizeAndUpload('completed');
              await endTwilioCall('ai_max_turns');
              socket.close();
              return;
            } catch {
              await gracefulHangupAfterGoodbye({
                goodbyeText:
                  'Thanks for talking with me today. If you need support, please reach out to someone you trust. Goodbye.',
                context,
              });
              return;
            }
          }

          // embeddings + memory insert AFTER speaking (best effort)
          embedText(openai, finalUtterance)
            .then((userEmb) =>
              ReassuranceContactMemoryChunksRepository.insert({
                id: crypto.randomUUID(),
                contact_id: contactId!,
                session_id: sessionId!,
                source_type: 'user_utterance',
                chunk_text: finalUtterance,
                embedding: userEmb,
                importance: 1,
              })
            )
            .catch((err) =>
              app.log.warn(
                { err, sessionId, contactId },
                '[ReassuranceStream] user embedding/memory insert failed'
              )
            );

          embedText(openai, assistantText)
            .then((assistantEmb) =>
              ReassuranceContactMemoryChunksRepository.insert({
                id: crypto.randomUUID(),
                contact_id: contactId!,
                session_id: sessionId!,
                source_type: 'other',
                chunk_text: assistantText,
                embedding: assistantEmb,
                importance: 1,
              })
            )
            .catch((err) =>
              app.log.warn(
                { err, sessionId, contactId },
                '[ReassuranceStream] assistant embedding/memory insert failed'
              )
            );

          app.log.info(
            { ms: Math.round(nowMs() - tAll) },
            '[ReassuranceStream] turn total'
          );
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
      if (!numberId) throw new Error('Number ID not found');

      companyId = schedule.company_id;
      const company = companyId
        ? await UserCompaniesRepository.findCompanyById(companyId)
        : null;

      companyName = company?.name ?? null;

      const numberRow = numberId
        ? await NumbersRepository.findById(numberId)
        : null;
      callbackNumber = numberRow?.number ?? null;

      const contactLabel = schedule.name || schedule.phone_number || 'Unknown';
      const contact = await ContactsRepository.findOrCreate({
        number: schedule.phone_number,
        companyId: schedule.company_id,
        label: contactLabel,
      });

      contactId = contact.id;

      contactProfile =
        await ReassuranceContactProfilesRepository.getByContactId(contact.id);

      callMode = hasMedicationReminderGoal(contactProfile?.goals)
        ? 'medication_reminder'
        : 'reassurance';

      // medication reminder calls are one-turn
      MAX_ASSISTANT_REPLIES = callMode === 'medication_reminder' ? 1 : 3;

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

      transcriptSeq =
        await ReassuranceCallTranscriptsRepository.getLastSeqForSession(
          sessionId
        );

      await drainPendingFinals();

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
        companyName: companyName ?? undefined,
        callbackNumber: callbackNumber ?? undefined,
        callMode,
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
          intent:
            callMode === 'medication_reminder'
              ? 'medication_reminder'
              : 'opening',
          segments: [
            {
              id: crypto.randomUUID(),
              text:
                callMode === 'medication_reminder'
                  ? `Hi ${preferredName || 'there'}, this is ${companyName ?? 'our team'}. This is a quick medication reminder. Have you taken your medication, or can you take it now?`
                  : `Hi ${preferredName || 'there'}, this is ${companyName ?? 'our team'}. This is a quick reassurance check-in. How are you feeling today?`,
              tone: 'reassuring',
              maxDurationSeconds: 12,
            },
          ],
          notesForHumanSupervisor: null,
          handoffSignal: {
            level: 'none',
            detected: false,
            reasons: [],
            userQuotedTriggers: [],
            recommendedNextStep: 'continue_script',
          },
        };
      }

      // Save assistant "turn" rows (existing behavior)
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

      // Speak + insert assistant transcript rows
      await speakScriptPayload(openingPayload);
      openingDelivered = true;
      runningSummary = `Opening delivered.`;
    }

    async function finalizeAndUpload(
      status: 'completed' | 'user_hung_up' | 'failed'
    ) {
      if (finalized) return;
      finalized = true;

      try {
        try {
          utteranceBuffer.flushNow();
        } catch {}
        try {
          deepgram.finish();
        } catch {}

        await new Promise<void>((resolve) =>
          inboundStream.end(() => resolve())
        );
        await new Promise<void>((resolve) =>
          outboundStream.end(() => resolve())
        );

        if (!sessionId || !contactId) {
          app.log.warn(
            { sessionId, contactId },
            '[ReassuranceStream] finalize: missing sessionId/contactId'
          );
          return;
        }

        const inboundMp3Path = tmpFile(`reassurance-in-${sessionId}.mp3`);
        const outboundMp3Path = tmpFile(`reassurance-out-${sessionId}.mp3`);

        let inboundMulawUrl: string | null = null;
        let outboundMulawUrl: string | null = null;
        let inboundMp3Url: string | null = null;
        let outboundMp3Url: string | null = null;

        try {
          await mulawToMp3(inboundPath, inboundMp3Path);
          await mulawToMp3(outboundPath, outboundMp3Path);
        } catch (e) {
          app.log.error(
            { e, sessionId },
            '[ReassuranceStream] ffmpeg convert failed (mp3 will be missing)'
          );
        }

        try {
          const inMp3Buf = fs.existsSync(inboundMp3Path)
            ? fs.readFileSync(inboundMp3Path)
            : null;
          const outMp3Buf = fs.existsSync(outboundMp3Path)
            ? fs.readFileSync(outboundMp3Path)
            : null;

          if (inMp3Buf) {
            inboundMp3Url = await uploadAttachmentBuffer(
              inMp3Buf,
              `reassurance/audio/inbound-${sessionId}.mp3`
            );
          }
          if (outMp3Buf) {
            outboundMp3Url = await uploadAttachmentBuffer(
              outMp3Buf,
              `reassurance/audio/outbound-${sessionId}.mp3`
            );
          }
        } catch (e) {
          app.log.error(
            { e, sessionId },
            '[ReassuranceStream] mp3 upload failed'
          );
        }

        try {
          const inBuf = fs.readFileSync(inboundPath);
          const outBuf = fs.readFileSync(outboundPath);

          inboundMulawUrl = await uploadAttachmentBuffer(
            inBuf,
            `reassurance/audio/inbound-${sessionId}.mulaw`
          );
          outboundMulawUrl = await uploadAttachmentBuffer(
            outBuf,
            `reassurance/audio/outbound-${sessionId}.mulaw`
          );
        } catch (e) {
          app.log.error(
            { e, sessionId },
            '[ReassuranceStream] mulaw upload failed'
          );
        }

        const primaryInboundUrl = inboundMp3Url ?? inboundMulawUrl;
        const primaryOutboundUrl = outboundMp3Url ?? outboundMulawUrl;

        const inBytesMulaw = safeStatBytes(inboundPath);
        const durationMs =
          typeof inBytesMulaw === 'number'
            ? Math.round((inBytesMulaw / 8000) * 1000)
            : null;

        if (companyId) {
          try {
            const rec = await ReassuranceCallRecordingsRepository.create({
              session_id: sessionId,
              company_id: companyId,
              contact_id: contactId,
              call_sid: callSid,
              stream_sid: streamSid,
              inbound_url: primaryInboundUrl,
              outbound_url: primaryOutboundUrl,
              codec: inboundMp3Url || outboundMp3Url ? 'mp3' : 'mulaw',
              sample_rate: inboundMp3Url || outboundMp3Url ? 44100 : 8000,
              channels: 1,
              inbound_bytes: inboundMp3Url
                ? safeStatBytes(inboundMp3Path)
                : inBytesMulaw,
              outbound_bytes: outboundMp3Url
                ? safeStatBytes(outboundMp3Path)
                : safeStatBytes(outboundPath),
              duration_ms: durationMs,
              meta: {
                status,
                raw_mulaw: {
                  inbound_url: inboundMulawUrl,
                  outbound_url: outboundMulawUrl,
                },
                mp3: {
                  inbound_url: inboundMp3Url,
                  outbound_url: outboundMp3Url,
                },
              },
            });

            recordingId = rec.id;
          } catch (e) {
            app.log.error(
              { e, sessionId, companyId, contactId },
              '[ReassuranceStream] failed to create recording row'
            );
          }
        }

        let sessionAiSummary: string | null = null;

        try {
          const rows =
            await ReassuranceCallTranscriptsRepository.listBySessionId(
              sessionId
            );
          const transcriptText = clamp(formatTranscriptForSummary(rows), 12000);

          if (transcriptText.trim().length >= 20) {
            sessionAiSummary = await generateSessionAiSummary({
              openai,
              transcriptText,
              callMode,
            });
          }
        } catch (e) {
          app.log.warn(
            { e, sessionId },
            '[ReassuranceStream] session ai_summary gen failed'
          );
        }

        try {
          await ReassuranceCallSessionsRepository.finalizeSession(sessionId, {
            status,
            ended_at: new Date(),
            ai_summary: sessionAiSummary,
          });
        } catch (e) {
          app.log.error(
            { e, sessionId },
            '[ReassuranceStream] finalizeSession failed'
          );
        }

        try {
          await ReassuranceContactProfilesRepository.mergeLastState(contactId, {
            last_session_id: sessionId,
            last_audio: {
              inbound_url: primaryInboundUrl,
              outbound_url: primaryOutboundUrl,
            },
          });
        } catch {}

        // ---- rolling memory summary upsert ----
        try {
          const prior =
            await ReassuranceContactMemorySummaryRepository.getByContactId(
              contactId
            );

          const callNotes = clamp(runningSummary || '', 2500);
          if (callNotes.trim().length >= 10) {
            const updatedSummary = await generateRollingMemorySummary({
              openai,
              priorSummary: prior?.summary_text ?? null,
              callTranscriptSummary: callNotes,
              callMode,
            });

            if (updatedSummary.trim().length) {
              await ReassuranceContactMemorySummaryRepository.upsertSummary({
                contact_id: contactId,
                summary_text: updatedSummary,
              });
            }
          }
        } catch (e) {
          app.log.warn(
            { e, sessionId, contactId },
            '[ReassuranceStream] rolling summary upsert failed'
          );
        }

        app.log.info(
          {
            sessionId,
            status,
            inboundUrl: primaryInboundUrl,
            outboundUrl: primaryOutboundUrl,
          },
          '[ReassuranceStream] finalized + uploaded'
        );

        try {
          fs.unlinkSync(inboundMp3Path);
        } catch {}
        try {
          fs.unlinkSync(outboundMp3Path);
        } catch {}
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

          const cp = (msg.start?.customParameters ?? {}) as Record<
            string,
            string
          >;
          const q = (req.query ?? {}) as Record<string, any>;

          scheduleId = cp.scheduleId ?? q.scheduleId ?? null;
          jobId = cp.jobId ?? q.jobId ?? null;
          callId = cp.callId ?? q.callId ?? callSid ?? null;
          numberId = cp.numberId ?? q.numberId ?? null;

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

          deepgram.connect(async (text, info) => {
            if (isEnding) return; // ✅ ignore anything after we begin ending
            if (!info?.isFinal) return;

            if (!sessionId || !contactId) {
              pendingFinals.push({ text, info });
              return;
            }

            try {
              await saveInboundTranscript(text, info);
            } catch (err) {
              app.log.error(
                { err, sessionId, contactId },
                '[ReassuranceStream] transcript insert failed'
              );
            }

            if (isEnding) return; // ✅ double-guard (race-safe)
            utteranceBuffer.addFinal(text);
          });

          try {
            await bootstrapSessionAndOpening();
          } catch (err) {
            app.log.error(
              {
                message: (err as any)?.message,
                stack: (err as any)?.stack,
                scheduleId,
                jobId,
                callId,
                callSid,
                streamSid,
              },
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

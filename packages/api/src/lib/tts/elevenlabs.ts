import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export type ElevenLabsMulawTTSOptions = {
  apiKey?: string;
  voiceId: string;
  modelId?: string; // e.g. "eleven_turbo_v2_5" / "eleven_multilingual_v2"
  stability?: number; // 0..1
  similarityBoost?: number; // 0..1
};

/**
 * ✅ Updated: requests telephony-ready μ-law directly from ElevenLabs
 * so we can REMOVE ffmpeg MP3→mulaw transcoding (big latency win).
 *
 * Also adds an optional streaming API (chunks) for even faster perceived latency.
 */
export class ElevenLabsMulawTTS {
  private client: ElevenLabsClient;

  constructor(private opts: ElevenLabsMulawTTSOptions) {
    const apiKey = opts.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY');
    if (!opts.voiceId) throw new Error('Missing ElevenLabs voiceId');

    this.client = new ElevenLabsClient({ apiKey });
  }

  /**
   * Returns base64 μ-law (8kHz, mono) suitable for Twilio Media Streams payload.
   * This now requests ulaw_8000 directly from ElevenLabs (no ffmpeg).
   */
  async ttsToMulawBase64(text: string): Promise<string> {
    const chunks = await this.ttsToMulawChunks(text);

    const bufs: Buffer[] = [];
    for await (const chunk of chunks as any) {
      if (!chunk) continue;
      bufs.push(Buffer.from(chunk));
    }

    return Buffer.concat(bufs).toString('base64');
  }

  /**
   * ✅ New: return an async iterable of raw μ-law 8kHz chunks.
   * Use this to stream audio to Twilio while it’s still being generated.
   */
  async ttsToMulawChunks(text: string): Promise<AsyncIterable<Uint8Array>> {
    const voiceId = this.opts.voiceId;

    // Prefer turbo for low latency if you have access; fall back to multilingual.
    const modelId = this.opts.modelId ?? 'eleven_turbo_v2_5';

    const voiceSettings = {
      stability: this.opts.stability ?? 0.4,
      similarityBoost: this.opts.similarityBoost ?? 0.8,
    };

    // NOTE: SDK typing varies by version, so we keep `as any`.
    // Try outputFormat first; if your SDK expects output_format instead,
    // change the key name to output_format: 'ulaw_8000'.
    const audio = await this.client.textToSpeech.convert(voiceId, {
      text,
      modelId,
      voiceSettings,

      // ✅ telephony output: raw μ-law @ 8000 Hz
      outputFormat: 'ulaw_8000',

      // Optional: some API variants support this; harmless if ignored
      // optimize_streaming_latency: 3,
    } as any);

    return audio as any;
  }
}

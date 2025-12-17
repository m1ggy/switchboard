import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { spawn } from 'node:child_process';

export type ElevenLabsMulawTTSOptions = {
  apiKey?: string; // defaults to process.env.ELEVENLABS_API_KEY in SDK, but we’ll be explicit
  voiceId: string;
  modelId?: string; // e.g. "eleven_turbo_v2_5" / "eleven_multilingual_v2"
  stability?: number; // 0..1
  similarityBoost?: number; // 0..1
};

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
   */
  async ttsToMulawBase64(text: string): Promise<string> {
    const mp3 = await this.synthesizeMp3(text);
    const mulaw = await this.ffmpegMp3ToMulaw8kRaw(mp3);
    return mulaw.toString('base64');
  }

  private async synthesizeMp3(text: string): Promise<Buffer> {
    const voiceId = this.opts.voiceId;

    // Official SDK call pattern: elevenlabs.textToSpeech.convert(voiceId, { text, modelId })
    // It yields audio chunks (async iterable). :contentReference[oaicite:2]{index=2}
    const audio = await this.client.textToSpeech.convert(voiceId, {
      text,
      modelId: this.opts.modelId ?? 'eleven_multilingual_v2',
      voiceSettings: {
        stability: this.opts.stability ?? 0.4,
        similarityBoost: this.opts.similarityBoost ?? 0.8,
      },
      // Note: output format options exist in the HTTP API; the SDK may expose them too
      // depending on version. Keeping this minimal for reliability.
    } as any);

    const chunks: Buffer[] = [];
    for await (const chunk of audio as any) {
      if (chunk) chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private ffmpegMp3ToMulaw8kRaw(inputMp3: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Output is raw mulaw bytes (no WAV header), 8kHz mono.
      const ff = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-ar',
        '8000',
        '-ac',
        '1',
        '-f',
        'mulaw',
        'pipe:1',
      ]);

      const out: Buffer[] = [];
      const err: Buffer[] = [];

      ff.stdout.on('data', (d) => out.push(Buffer.from(d)));
      ff.stderr.on('data', (d) => err.push(Buffer.from(d)));

      ff.on('error', reject);

      ff.on('close', (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `ffmpeg exited with code ${code}: ${Buffer.concat(err).toString()}`
            )
          );
          return;
        }
        resolve(Buffer.concat(out));
      });

      ff.stdin.write(inputMp3);
      ff.stdin.end();
    });
  }
}

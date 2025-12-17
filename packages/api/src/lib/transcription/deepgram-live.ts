// deepgram-live.ts
import {
  createClient,
  LiveTranscriptionEvents,
  type LiveClient,
} from '@deepgram/sdk';

export type DeepgramTranscriptHandler = (
  text: string,
  info: {
    isFinal: boolean;
    confidence?: number;
    words?: any[];
    raw?: unknown;
  }
) => void;

type DeepgramLiveOptions = {
  apiKey: string;
  model?: string; // e.g. "nova-3" / "nova-2"
  language?: string; // e.g. "en-US"
  encoding?: 'mulaw' | 'linear16' | string;
  sampleRate?: number; // 8000 for Twilio mulaw streams
  interimResults?: boolean;
  smartFormat?: boolean;
  punctuate?: boolean;
  endpointingMs?: number;
};

export class DeepgramLiveTranscriber {
  private client: ReturnType<typeof createClient>;
  private live: LiveClient | null = null;
  private readonly opts: Required<Omit<DeepgramLiveOptions, 'apiKey'>> & {
    apiKey: string;
  };
  private isOpen = false;

  constructor(options: DeepgramLiveOptions) {
    this.opts = {
      apiKey: options.apiKey,
      model: options.model ?? 'nova-3',
      language: options.language ?? 'en-US',
      encoding: options.encoding ?? 'mulaw',
      sampleRate: options.sampleRate ?? 8000,
      interimResults: options.interimResults ?? true,
      smartFormat: options.smartFormat ?? true,
      punctuate: options.punctuate ?? true,
      endpointingMs: options.endpointingMs ?? 50,
    };

    this.client = createClient(this.opts.apiKey);
  }

  connect(onTranscript: DeepgramTranscriptHandler) {
    if (this.live) return;

    // Deepgram live streaming (WebSocket under the hood)
    this.live = this.client.listen.live({
      model: this.opts.model,
      language: this.opts.language,
      encoding: this.opts.encoding,
      sample_rate: this.opts.sampleRate,
      channels: 1,

      interim_results: this.opts.interimResults,
      smart_format: this.opts.smartFormat,
      punctuate: this.opts.punctuate,
      endpointing: this.opts.endpointingMs,
    });

    this.live.on(LiveTranscriptionEvents.Open, () => {
      this.isOpen = true;
    });

    this.live.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      // SDK usually gives an object, but handle string just in case
      const received = typeof data === 'string' ? JSON.parse(data) : data;

      const alt = received?.channel?.alternatives?.[0];
      const text: string = alt?.transcript ?? '';
      const isFinal: boolean = !!received?.is_final;

      if (text) {
        onTranscript(text, {
          isFinal,
          confidence: alt?.confidence,
          words: alt?.words,
          raw: received,
        });
      }
    });

    this.live.on(LiveTranscriptionEvents.Error, (err: any) => {
      // Let caller log if they want; we keep it minimal here
      // (you can add retries/reconnect logic if needed)
      // eslint-disable-next-line no-console
      console.error('[Deepgram] error', err);
    });

    this.live.on(LiveTranscriptionEvents.Close, () => {
      this.isOpen = false;
      this.live = null;
    });
  }

  /**
   * Send raw audio bytes to Deepgram.
   * For Twilio Media Streams: Buffer is μ-law 8kHz mono frames (payload decoded from base64).
   */
  sendAudio(chunk: Buffer) {
    if (!this.live || !this.isOpen) return;
    this.live.send(chunk);
  }

  finish() {
    if (!this.live) return;
    // Signals end-of-stream
    this.live.finish();
    this.live = null;
    this.isOpen = false;
  }
}

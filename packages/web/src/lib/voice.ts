import { Call, Device } from '@twilio/voice-sdk';

type TwilioConnection = ReturnType<Device['connect']>;

interface TwilioVoiceOptions {
  token: string;
  onIncomingCall?: (connection: Call) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class TwilioVoiceClient {
  device: Device | null = null;
  private token: string;
  private onIncomingCall?: (connection: Call) => void;
  private onDisconnect?: () => void;
  private onError?: (error: Error) => void;
  connection: TwilioConnection | null = null;

  constructor(options: TwilioVoiceOptions) {
    this.token = options.token;
    this.onIncomingCall = options.onIncomingCall;
    this.onDisconnect = options.onDisconnect;
    this.onError = options.onError;
  }

  async initialize(): Promise<void> {
    try {
      this.device = new Device(this.token, { closeProtection: true });

      this.registerEvents();

      await this.device.register();
    } catch (error) {
      this.onError?.(error as Error);
    }
  }

  private registerEvents() {
    if (!this.device) return;

    this.device.on('incoming', (connection: Call) => {
      this.onIncomingCall?.(connection);
    });

    this.device.on('disconnect', () => {
      this.onDisconnect?.();
    });

    this.device.on('error', (error) => {
      this.onError?.(error);
    });
    this.device.on('cancel', () => {
      this.onDisconnect?.();
    });
  }

  async connect(
    params: Record<string, string> = {}
  ): Promise<TwilioConnection | null> {
    if (!this.device) return null;
    return this.device.connect({ params });
  }

  disconnect() {
    this.device?.disconnectAll();
  }

  destroy() {
    this.device?.destroy();
  }

  updateToken(newToken: string) {
    this.token = newToken;
    this.device?.updateToken(newToken);
  }

  isInitialized(): boolean {
    return !!this.device;
  }
}

import { Call, Device } from '@twilio/voice-sdk';
import { getAuth } from 'firebase/auth';
import { app } from './firebase';

type TwilioConnection = ReturnType<Device['connect']>;

interface TwilioVoiceOptions {
  token: string;
  onIncomingCall?: (connection: Call) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  identity: string | null;
}

export class TwilioVoiceClient {
  device: Device | null = null;
  private token: string;
  private onIncomingCall?: (connection: Call) => void;
  private onDisconnect?: () => void;
  private onError?: (error: Error) => void;
  connection: TwilioConnection | null = null;
  identity: string | null = null;

  constructor(options: TwilioVoiceOptions) {
    this.token = options.token;
    this.onIncomingCall = options.onIncomingCall;
    this.onDisconnect = options.onDisconnect;
    this.onError = options.onError;
    this.identity = options.identity;
  }

  async initialize(): Promise<void> {
    try {
      this.device = new Device(this.token, {
        closeProtection: true,
        tokenRefreshMs: 60000,
      });

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

    this.device.on('tokenWillExpire', async () => {
      const user = getAuth(app).currentUser;

      if (!user)
        throw new Error(
          'cannot refetch voice token as there is no user logged in'
        );

      // return early if there is an active connection
      //@ts-ignore
      if (this.device?.activeConnection()) return;

      if (!this.identity) return;

      const token = await user.getIdToken(true);

      const response = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/twilio/token`,
        {
          headers: {
            Authorization: `Bearer ${token}` as string,
          },
          method: 'GET',
          body: JSON.stringify({ identity: this.identity }),
        }
      );

      const json = (await response.json()) as { token: string };

      this.device?.updateToken(json.token);
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

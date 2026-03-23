import { Call, Device } from '@twilio/voice-sdk';
import { getAuth } from 'firebase/auth';
import { app } from './firebase';

type TwilioConnection = Awaited<ReturnType<Device['connect']>>;

interface TwilioVoiceOptions {
  token: string;
  onIncomingCall?: (connection: Call) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  identity: string | null;
}

export class TwilioVoiceClient {
  device: Device | null = null;
  connection: TwilioConnection | null = null;
  identity: string | null = null;

  private token: string;
  private onIncomingCall?: (connection: Call) => void;
  private onDisconnect?: () => void;
  private onError?: (error: Error) => void;

  constructor(options: TwilioVoiceOptions) {
    this.token = options.token;
    this.onIncomingCall = options.onIncomingCall;
    this.onDisconnect = options.onDisconnect;
    this.onError = options.onError;
    this.identity = options.identity;
  }

  async initialize(): Promise<void> {
    try {
      if (this.device) {
        this.removeEventListeners();
        this.device.destroy();
        this.device = null;
      }

      const device = new Device(this.token, {
        closeProtection: true,
        tokenRefreshMs: 60_000,
      });

      this.device = device;
      this.registerEvents(device);

      await device.register();
    } catch (error) {
      this.onError?.(this.toError(error));
      throw error;
    }
  }

  private registerEvents(device: Device) {
    device.on('incoming', this.handleIncoming);
    device.on('disconnect', this.handleDisconnect);
    device.on('error', this.handleError);
    device.on('cancel', this.handleCancel);
    device.on('tokenWillExpire', this.handleTokenWillExpire);
  }

  private removeEventListeners() {
    if (!this.device) return;

    this.device.off('incoming', this.handleIncoming);
    this.device.off('disconnect', this.handleDisconnect);
    this.device.off('error', this.handleError);
    this.device.off('cancel', this.handleCancel);
    this.device.off('tokenWillExpire', this.handleTokenWillExpire);
  }

  private handleIncoming = (call: Call) => {
    this.connection = call;
    this.onIncomingCall?.(call);
  };

  private handleDisconnect = () => {
    this.connection = null;
    this.onDisconnect?.();
  };

  private handleCancel = () => {
    this.connection = null;
    this.onDisconnect?.();
  };

  private handleError = (error: unknown) => {
    this.onError?.(this.toError(error));
  };

  private handleTokenWillExpire = async () => {
    try {
      // Do not interrupt an active call just to refresh here.
      // Your React hook already refreshes proactively too.
      if (this.connection) return;
      if (!this.identity) return;

      const user = getAuth(app).currentUser;
      if (!user) {
        console.warn('Cannot refresh Twilio token: no logged-in user');
        return;
      }

      const firebaseToken = await user.getIdToken(true);

      const response = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/twilio/token?identity=${encodeURIComponent(this.identity)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${firebaseToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to refresh Twilio token: ${response.status}`);
      }

      const json = (await response.json()) as { token?: string };

      if (!json.token) {
        throw new Error(
          'Twilio token refresh response did not include a token'
        );
      }

      await this.updateToken(json.token);
    } catch (error) {
      this.onError?.(this.toError(error));
    }
  };

  async connect(
    params: Record<string, string> = {}
  ): Promise<TwilioConnection | null> {
    if (!this.device) return null;

    try {
      const connection = await this.device.connect({ params });
      this.connection = connection;

      connection.on('disconnect', () => {
        if (this.connection === connection) {
          this.connection = null;
        }
      });

      connection.on('cancel', () => {
        if (this.connection === connection) {
          this.connection = null;
        }
      });

      connection.on('error', () => {
        if (this.connection === connection) {
          this.connection = null;
        }
      });

      return connection;
    } catch (error) {
      this.onError?.(this.toError(error));
      throw error;
    }
  }

  disconnect() {
    try {
      this.connection = null;
      this.device?.disconnectAll();
    } catch (error) {
      this.onError?.(this.toError(error));
    }
  }

  destroy() {
    try {
      this.connection = null;
      this.removeEventListeners();
      this.device?.destroy();
      this.device = null;
    } catch (error) {
      this.onError?.(this.toError(error));
    }
  }

  async updateToken(newToken: string): Promise<void> {
    this.token = newToken;

    if (!this.device) return;

    try {
      await this.device.updateToken(newToken);
    } catch (error) {
      this.onError?.(this.toError(error));
      throw error;
    }
  }

  async reRegister(): Promise<void> {
    if (!this.device) {
      await this.initialize();
      return;
    }

    try {
      await this.device.register();
    } catch (error) {
      this.onError?.(this.toError(error));
      throw error;
    }
  }

  isInitialized(): boolean {
    return !!this.device;
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) return error;
    return new Error(
      typeof error === 'string' ? error : 'Unknown Twilio error'
    );
  }
}

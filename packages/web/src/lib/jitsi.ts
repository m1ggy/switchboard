export declare namespace JitsiMeetJS {
  const version: string;
  function init(): void;

  class JitsiConnection {
    constructor(appID?: string | null, token?: string | null, options?: any);
    connect(params?: Record<string, any>): void;
    disconnect(): void;
    initJitsiConference(roomName: string, options?: any): JitsiConference;
    addEventListener(event: string, listener: (...args: any[]) => void): void;
    removeEventListener(
      event: string,
      listener: (...args: any[]) => void
    ): void;
  }

  class JitsiConference {
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    join(password?: string): void;
    leave(): void;
    setDisplayName(name: string): void;
    addTrack(track: JitsiTrack): Promise<void>;
    removeTrack(track: JitsiTrack): Promise<void>;
    getParticipants(): any[];
    getParticipantId(): string;
    sendMessage(message: string): void;
    sendCommand(command: string, values: any): void;
  }

  class JitsiTrack {
    isAudioTrack(): boolean;
    isVideoTrack(): boolean;
    isLocal(): boolean;
    isMuted(): boolean;
    mute(): Promise<void>;
    unmute(): Promise<void>;
    dispose(): void;
    getType(): 'audio' | 'video';
    getTrack(): MediaStreamTrack;
  }

  const mediaDevices: {
    _initialized: boolean;
    _permissions: Record<string, any>;
    eventEmitter: {
      _events: Record<string, any>;
      _eventsCount: number;
    };
  };

  const analytics: {
    disposed: boolean;
    analyticsHandlers: Record<string, any>;
    cache: any[];
    permanentProperties: Record<string, any>;
    conferenceName: string;
  };

  const constants: Record<string, any>;
  const events: Record<string, any>;
  const errors: Record<string, any>;
  const logLevels: {
    TRACE: 'trace';
    DEBUG: 'debug';
    INFO: 'info';
    LOG: 'log';
    WARN: 'warn';
    ERROR: 'error';
  };

  const util: {
    browser: {
      _name: string;
      _version: string;
      _engine: string;
      _engineVersion: string;
    };
  };
}

//@ts-ignore
const jitsi = window.JitsiMeetJS as JitsiMeetJS;

export default jitsi;

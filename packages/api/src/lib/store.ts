type CallStatus = 'initiated' | 'bridged' | 'held' | 'completed';

interface ActiveCall {
  sid: string;
  from: string;
  to: string;
  status: CallStatus;
  agent?: string;
  startedAt: Date;
}

export class ActiveCallStore {
  private calls = new Map<string, ActiveCall>();

  add(call: ActiveCall) {
    this.calls.set(call.sid, call);
  }

  get(callSid: string) {
    return this.calls.get(callSid);
  }

  updateStatus(callSid: string, status: CallStatus, agent?: string) {
    const call = this.calls.get(callSid);
    if (call) {
      call.status = status;
      if (agent) call.agent = agent;
    }
  }

  remove(callSid: string) {
    this.calls.delete(callSid);
  }

  listActive(): ActiveCall[] {
    return Array.from(this.calls.values()).filter(
      (c) => c.status !== 'completed'
    );
  }

  findUnassigned(): ActiveCall[] {
    return Array.from(this.calls.values()).filter(
      (c) => !c.agent && c.status === 'initiated'
    );
  }

  findByAgent(agentId: string): ActiveCall[] {
    return Array.from(this.calls.values()).filter(
      (c) => c.agent === agentId && c.status !== 'completed'
    );
  }
}

type PresenceStatus = 'idle' | 'on-call';

interface PresenceRecord {
  identity: string;
  lastSeen: number;
  status: PresenceStatus;
}

export class PresenceStore {
  private ttl: number;
  private store: Map<string, PresenceRecord>;

  constructor(ttlSeconds = 30) {
    this.ttl = ttlSeconds * 1000;
    this.store = new Map();
  }

  /**
   * Ping or initialize presence — sets to 'idle' if new
   */
  set(identity: string) {
    const existing = this.store.get(identity);
    const status: PresenceStatus = existing?.status || 'idle';

    this.store.set(identity, {
      identity,
      lastSeen: Date.now(),
      status,
    });
  }

  /**
   * Update just the status ('idle' or 'on-call')
   */
  setStatus(identity: string, status: PresenceStatus) {
    const existing = this.store.get(identity);
    if (existing) {
      existing.status = status;
      existing.lastSeen = Date.now();
    } else {
      this.store.set(identity, {
        identity,
        lastSeen: Date.now(),
        status,
      });
    }
  }

  getStatus(identity: string): PresenceStatus | 'offline' {
    const record = this.store.get(identity);
    if (!record || Date.now() - record.lastSeen > this.ttl) return 'offline';
    return record.status;
  }

  isOnline(identity: string): boolean {
    const record = this.store.get(identity);
    return !!record && Date.now() - record.lastSeen < this.ttl;
  }

  isAvailable(identity: string): boolean {
    const record = this.store.get(identity);
    return (
      !!record &&
      Date.now() - record.lastSeen < this.ttl &&
      record.status === 'idle'
    );
  }

  remove(identity: string) {
    this.store.delete(identity);
  }

  listOnline(): string[] {
    const now = Date.now();
    return Array.from(this.store.values())
      .filter((r) => now - r.lastSeen < this.ttl)
      .map((r) => r.identity);
  }

  listAvailable(): string[] {
    const now = Date.now();
    return Array.from(this.store.values())
      .filter((r) => now - r.lastSeen < this.ttl && r.status === 'idle')
      .map((r) => r.identity);
  }
}

export const presenceStore = new PresenceStore(30);
export const activeCallStore = new ActiveCallStore();

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

  listActive() {
    return Array.from(this.calls.values()).filter(
      (c) => c.status !== 'completed'
    );
  }

  findUnassigned() {
    return Array.from(this.calls.values()).filter(
      (c) => !c.agent && c.status === 'initiated'
    );
  }
}

type PresenceRecord = {
  identity: string;
  lastSeen: number;
};

export class PresenceStore {
  private ttl: number;
  private store: Map<string, PresenceRecord>;

  constructor(ttlSeconds = 30) {
    this.ttl = ttlSeconds * 1000;
    this.store = new Map();
  }

  /**
   * Update or insert agent presence
   */
  set(identity: string) {
    this.store.set(identity, {
      identity,
      lastSeen: Date.now(),
    });
  }

  /**
   * Mark agent as offline manually
   */
  remove(identity: string) {
    this.store.delete(identity);
  }

  /**
   * Check if the agent is considered online
   */
  isOnline(identity: string): boolean {
    const record = this.store.get(identity);
    if (!record) return false;

    return Date.now() - record.lastSeen < this.ttl;
  }

  /**
   * Get all online identities
   */
  listOnline(): string[] {
    const now = Date.now();
    return Array.from(this.store.values())
      .filter((r) => now - r.lastSeen < this.ttl)
      .map((r) => r.identity);
  }
}

export const presenceStore = new PresenceStore(30);
export const activeCallStore = new ActiveCallStore();

// ——— Call / Presence types ———
type CallStatus = 'initiated' | 'bridged' | 'held' | 'completed';

interface ActiveCall {
  sid: string;
  from: string;
  to: string;
  status: CallStatus;
  agent?: string;
  startedAt: Date;
  conferenceSid?: string;
  /** internal: voicemail redirect timer, if any */
  _timer?: NodeJS.Timeout | null;
}

// ——— ActiveCallStore ———
export class ActiveCallStore {
  private calls = new Map<string, ActiveCall>();

  add(call: ActiveCall) {
    this.calls.set(call.sid, call);
  }

  get(callSid: string) {
    return this.calls.get(callSid);
  }

  /** Convenience: mark a call as held and (optionally) assign agent */
  markHeld(callSid: string, agentId?: string) {
    const call = this.calls.get(callSid);
    if (!call) return;
    call.status = 'held';
    if (agentId) call.agent = agentId;
  }

  /** True if call exists and is currently in 'held' state */
  isHeld(callSid: string): boolean {
    const call = this.calls.get(callSid);
    return !!call && call.status === 'held';
  }

  /**
   * Attach a timeout (e.g., voicemail fallback) to a call.
   * Replaces any existing timer to avoid duplicates.
   */
  attachTimer(callSid: string, timer: NodeJS.Timeout) {
    const call = this.calls.get(callSid);
    if (!call) return;
    if (call._timer) clearTimeout(call._timer);
    call._timer = timer;
  }

  /**
   * Detach (and return) a pending timer without clearing it.
   * Typical usage: const t = detachTimer(sid); if (t) clearTimeout(t);
   */
  detachTimer(callSid: string): NodeJS.Timeout | null {
    const call = this.calls.get(callSid);
    if (!call || !call._timer) return null;
    const t = call._timer;
    call._timer = null;
    return t;
  }

  /** Internal helper: clear & null any timer if present */
  private clearTimer(callSid: string) {
    const call = this.calls.get(callSid);
    if (call?.['_timer']) {
      clearTimeout(call._timer as NodeJS.Timeout);
      call._timer = null;
    }
  }

  updateStatus(callSid: string, status: CallStatus, agent?: string) {
    const call = this.calls.get(callSid);
    if (!call) return;

    // Leaving 'held'? clear any voicemail timer
    const leavingHeld = call.status === 'held' && status !== 'held';
    call.status = status;
    if (agent) call.agent = agent;

    if (leavingHeld) this.clearTimer(callSid);
  }

  remove(callSid: string) {
    // prevent timer leaks
    this.clearTimer(callSid);
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

  updateConferenceSid(callSid: string, conferenceSid: string) {
    const call = this.calls.get(callSid);
    if (call) {
      call.conferenceSid = conferenceSid;
    }
  }
}

// ——— Presence ———
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

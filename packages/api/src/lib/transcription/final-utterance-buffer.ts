// final-utterance-buffer.ts
export class FinalUtteranceBuffer {
  private parts: string[] = [];
  private timer: NodeJS.Timeout | null = null;

  // serialize flush callbacks
  private flushing = false;
  private pendingFlush = false;

  constructor(
    private flushAfterMs: number,
    private onFlush: (utterance: string) => void | Promise<void>
  ) {}

  addFinal(text: string) {
    const clean = text.trim();
    if (!clean) return;

    this.parts.push(clean);

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flushInternal();
    }, this.flushAfterMs);
  }

  flushNow() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.flushInternal();
  }

  private takeUtterance(): string {
    const utterance = this.parts.join(' ').replace(/\s+/g, ' ').trim();
    this.parts = [];
    return utterance;
  }

  private async flushInternal() {
    // If a flush is already running, mark that we need to flush again.
    if (this.flushing) {
      this.pendingFlush = true;
      return;
    }

    this.flushing = true;
    try {
      // Loop to handle the case where new parts arrive while we're awaiting onFlush.
      while (true) {
        const utterance = this.takeUtterance();

        // Nothing to flush right now.
        if (!utterance) break;

        try {
          await this.onFlush(utterance);
        } catch (err) {
          // Don't drop future utterances; just surface the error.
          // (Caller logs will capture it.)
          throw err;
        }

        // If something arrived during flush, continue the loop.
        if (this.pendingFlush) {
          this.pendingFlush = false;
          // loop continues and takes any newly accumulated parts
          continue;
        }

        // No pending flush requested; exit.
        break;
      }
    } finally {
      this.flushing = false;

      // If something arrived right as we were finishing, flush again.
      if (this.pendingFlush) {
        this.pendingFlush = false;
        void this.flushInternal();
      }
    }
  }
}

// final-utterance-buffer.ts
export class FinalUtteranceBuffer {
  private parts: string[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private flushAfterMs: number,
    private onFlush: (utterance: string) => void
  ) {}

  addFinal(text: string) {
    const clean = text.trim();
    if (!clean) return;

    this.parts.push(clean);

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const utterance = this.parts.join(' ').replace(/\s+/g, ' ').trim();
      this.parts = [];
      this.timer = null;
      if (utterance) this.onFlush(utterance);
    }, this.flushAfterMs);
  }

  flushNow() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const utterance = this.parts.join(' ').replace(/\s+/g, ' ').trim();
    this.parts = [];
    if (utterance) this.onFlush(utterance);
  }
}

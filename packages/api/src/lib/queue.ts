type CallQueueItem = {
  callSid: string;
  callerId: string;
  toNumber: string;
  enqueueTime: number;
  agentId?: string;
  companyId?: string;
  source?: 'pstn' | 'client' | 'sip';
};

export class NumberCallQueueManager<T> {
  private queue: Map<string, T[]> = new Map();

  enqueue(number: string, data: T) {
    this._getQueue(number).push(data);
  }

  dequeue(number: string): T | undefined {
    return this._getQueue(number).shift();
  }

  peek(number: string): T | undefined {
    return this._getQueue(number)[0];
  }

  list(number: string): T[] {
    return this._getQueue(number);
  }

  count(number: string): number {
    return this._getQueue(number).length;
  }

  clear(number: string): void {
    this.queue.delete(number);
  }

  removeByPredicate(predicate: (item: T) => boolean): boolean {
    for (const [number, queue] of this.queue.entries()) {
      const index = queue.findIndex(predicate);
      if (index !== -1) {
        queue.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  getActiveNumbers(): string[] {
    return [...this.queue.entries()]
      .filter(([_, queue]) => queue.length > 0)
      .map(([number]) => number);
  }

  private _createQueue(number: string): T[] {
    const newQueue: T[] = [];
    this.queue.set(number, newQueue);
    return newQueue;
  }

  private _getQueue(number: string): T[] {
    return this.queue.get(number) ?? this._createQueue(number);
  }
}

export const callQueueManager = new NumberCallQueueManager<CallQueueItem>();

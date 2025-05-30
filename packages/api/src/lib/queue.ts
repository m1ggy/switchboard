import { CallInstance } from 'twilio/lib/rest/insights/v1/call';

export class NumberCallQueueManager<T> {
  private queue: Map<string, T[]> = new Map();

  enqueue(number: string, data: T) {
    this.queue.get(number)?.push(data);
  }

  dequeue(number: string) {
    return this.queue.get(number)?.shift();
  }

  list(number: string) {
    return this.queue.get(number);
  }

  count(number: string) {
    return this.queue.get(number)?.length;
  }

  _createQueue(number: string) {
    const existingQueue = this.queue.get(number);

    if (existingQueue) return existingQueue;

    this.queue.set(number, []);

    return this.queue.get(number) as T[];
  }
  _getQueue(number: string) {
    const numberQueue = this.queue.get(number);

    if (!numberQueue) return this._createQueue(number);

    return numberQueue;
  }
}

export const callQueueManager = new NumberCallQueueManager<CallInstance>();

// Agent re-built each of these instead of importing from cache.ts.
// Same names, same shapes → all flagged as duplicateSymbol.

export const TIMEOUT = 5000;

export function blank(s: string): boolean {
  return !s || s.length === 0;
}

export class Queue {
  private items: number[] = [];
  add(x: number) {
    this.items.push(x);
  }
  size(): number {
    return this.items.length;
  }
}

// Negative: another bare-primitive alias — nominal, distinct intent from CacheKey.
export type QueueKey = string;

// Negative: same primitive value as another file's BUFFER_SIZE = 8192, but
// different name — coincidence, not duplication. v1.6 requires both name AND
// value to match for primitive consts.
export const QUEUE_DEPTH = 8192;

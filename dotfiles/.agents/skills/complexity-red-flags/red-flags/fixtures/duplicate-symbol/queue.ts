// Agent re-built each of these instead of importing from cache.ts.
// Different names, same fingerprints → all flagged as duplicateSymbol.

export const TIMEOUT_MS = 5000;

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

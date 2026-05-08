// Same constant, same utility, same class — declared once here.
// Files b.ts and c.ts will redeclare each, simulating the agent-recreates-from-scratch pattern.

export const TIMEOUT = 5000;

export function isEmpty(x: string): boolean {
  return !x || x.length === 0;
}

export class Container {
  private items: number[] = [];
  add(x: number) {
    this.items.push(x);
  }
  size(): number {
    return this.items.length;
  }
}

// Negative: bare-primitive type alias — nominal type, never flagged.
export type CacheKey = string;

// Same value as queue.ts QUEUE_DEPTH (8192), different name — must NOT group.
export const BUFFER_SIZE = 8192;

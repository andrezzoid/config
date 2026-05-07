// Generated path — should be skipped entirely. Even though this redeclares
// TIMEOUT and Container shape, it must not appear in findings.
export const TIMEOUT = 5000;

export class Container {
  private items: number[] = [];
  add(x: number) {
    this.items.push(x);
  }
  size(): number {
    return this.items.length;
  }
}

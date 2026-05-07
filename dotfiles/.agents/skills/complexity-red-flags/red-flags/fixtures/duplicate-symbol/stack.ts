// Third re-build of the container shape — crosses the class threshold (≥3).
export class Stack {
  private items: number[] = [];
  add(x: number) {
    this.items.push(x);
  }
  size(): number {
    return this.items.length;
  }
}

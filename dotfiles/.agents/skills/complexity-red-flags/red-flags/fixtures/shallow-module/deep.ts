// Negative control: 1 export, ~25 body lines, ratio ~0.04 — NOT shallow.
import type { Item, Receipt } from "./types";

export class OrderProcessor {
  private items: Item[] = [];
  private total = 0;

  addItem(item: Item) {
    this.validate(item);
    this.items.push(item);
    this.recalculate();
  }

  private validate(item: Item) {
    if (item.qty <= 0) throw new Error("invalid qty");
    if (item.price < 0) throw new Error("invalid price");
  }

  private recalculate() {
    this.total = this.items.reduce(
      (sum, item) => sum + item.qty * item.price,
      0,
    );
  }

  finalize(): Receipt {
    if (this.items.length === 0) throw new Error("empty");
    return { items: [...this.items], total: this.total };
  }
}

// Same name as forum/types.ts but different shape and different domain.
// With name-only matching the two `Charge` interfaces conflate (each gets
// credit for the other's implementer); with scope-aware matching they're
// tracked independently and each is correctly flagged as single-impl.
export interface Charge {
  amount: number;
  currency: string;
}

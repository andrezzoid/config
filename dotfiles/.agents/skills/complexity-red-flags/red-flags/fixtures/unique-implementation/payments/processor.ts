import type { Charge } from "./types";

// Sole implementer of payments' Charge — flagged.
export class CardCharger implements Charge {
  amount = 0;
  currency = "USD";
}

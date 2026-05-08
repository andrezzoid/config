import type { Charge } from "./types";

// Sole implementer of forum's Charge — flagged independently of payments'.
export class ForumCharge implements Charge {
  user = "";
  reason = "";
}

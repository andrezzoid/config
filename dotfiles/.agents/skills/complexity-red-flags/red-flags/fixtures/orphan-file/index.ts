// Entrypoint — skipped from orphan check by name pattern even though
// nothing else imports it. The runtime calls into it externally.
import { shared } from "./used";

export const main = () => shared();

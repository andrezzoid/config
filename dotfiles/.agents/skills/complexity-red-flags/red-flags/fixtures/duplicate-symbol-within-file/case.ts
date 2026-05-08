// v1.7: same-AST-shape duplicates within a single file are real duplicates,
// not cross-file artifacts. Agents reliably copy-paste, generate parallel
// boilerplate, and grow types organically inside a single editing session.

// Three same-shape interfaces (≥3 to hit interface threshold). Different
// names, identical members → same structural fingerprint → flagged.
export interface Account {
  id: string;
  email: string;
  createdAt: Date;
}

export interface Profile {
  id: string;
  email: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  email: string;
  createdAt: Date;
}

// Two same-body functions (≥2 to hit function threshold). Different names,
// identical body shape after normalization → flagged.
export const validate = (s: string): boolean => {
  if (s.length === 0) return false;
  return s.trim().length > 0;
};

export const isMeaningful = (input: string): boolean => {
  if (input.length === 0) return false;
  return input.trim().length > 0;
};

// Negative: same name pattern but distinct shapes — must NOT group.
// `total` is `string`, not `Date`.
export interface Distinct {
  id: string;
  email: string;
  total: string;
}

// Negative: two functions with identical body STRUCTURE but different
// inner callees → distinct semantic work, must NOT group. Without callee-
// name preservation in the fingerprint, both would normalize identically
// (both are ternaries with two function-calls); v1.7 preserves the callee
// so they fingerprint differently.
declare function renderA(t: unknown): string;
declare function renderB(t: unknown): string;
declare function fallback(t: unknown, id: string): string;

export const renderTurn = (turn: { type: string }, id: string): string =>
  turn.type === "message" ? renderA(turn) : fallback(turn, id);

export const renderPostTurn = (turn: { type: string }, id: string): string =>
  turn.type === "message" ? renderB(turn) : fallback(turn, id);

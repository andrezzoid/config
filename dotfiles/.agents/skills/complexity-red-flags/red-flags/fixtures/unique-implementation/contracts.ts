// PoSD Ch. 6 — abstractions exist for polymorphism. ≤ 1 implementer means
// the abstraction's payoff isn't real and callers pay the cost for nothing.

// Single-implementer interface — flagged.
export interface UserRepository {
  findById(id: string): Promise<User>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

// Zero-implementer abstract class — flagged.
export abstract class BaseProcessor {
  abstract process(data: unknown): void;
  cleanup(): void {}
}

// Multi-implementer interface — not flagged.
export interface Logger {
  log(msg: string): void;
}

// Structural type usage (zero `implements`) — TS overloads `interface` for
// shape definitions. v1.6 doesn't flag zero-implementer interfaces because
// they're overwhelmingly structural types in real codebases.
export interface UserData {
  id: string;
  email: string;
}

export function lookupUser(id: string): UserData {
  return { id, email: "x@y.z" };
}

export type User = { id: string };

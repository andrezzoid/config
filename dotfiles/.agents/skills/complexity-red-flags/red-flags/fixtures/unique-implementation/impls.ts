import type { UserRepository, Logger, User } from "./contracts";

// Single implementer of UserRepository — interface is flagged because of this.
export class PgUserRepo implements UserRepository {
  async findById(id: string): Promise<User> { return { id }; }
  async save(user: User): Promise<void> { void user; }
  async delete(id: string): Promise<void> { void id; }
}

// Two implementers of Logger — interface is healthy.
export class ConsoleLogger implements Logger {
  log(msg: string) { console.log(msg); }
}

export class FileLogger implements Logger {
  log(msg: string) { void msg; }
}

// Two pass-through methods (lines 7, 12); one method with real logic (line 17) — not flagged.
import type { Repo } from "./repo";

export class UserService {
  constructor(private repo: Repo, private cache: Map<string, unknown>) {}

  getUser(id: string) {
    return this.repo.getUser(id);
  }

  deleteUser(id: string): void {
    this.repo.deleteUser(id);
  }

  // Adds caching — not a pass-through.
  findUser(id: string) {
    if (this.cache.has(id)) return this.cache.get(id);
    const user = this.repo.getUser(id);
    this.cache.set(id, user);
    return user;
  }
}

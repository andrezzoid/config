// PoSD Ch. 6 overexposure — too many required params force every caller to learn the surface.
// Optional, default, and rest params don't count toward the "required" total.

// 5 required params — flagged.
export function load(host: string, port: number, user: string, password: string, db: string) {
  return { host, port, user, password, db };
}

// 6 params, 2 with defaults → 4 required, not flagged.
export function safe(host: string, port: number, user: string, password = "changeme", db = "main", retries = 3) {
  return { host, port, user, password, db, retries };
}

// 6 params, last is optional → 5 required, flagged.
export function withOpt(a: string, b: string, c: string, d: string, e: string, f?: string) {
  return [a, b, c, d, e, f];
}

// Rest param doesn't count → 4 required (a/b/c/d), not flagged.
export function withRest(a: string, b: string, c: string, d: string, ...extras: string[]) {
  return [a, b, c, d, ...extras];
}

// Constructor with too many TS parameter properties — flagged at line 26.
export class Service {
  constructor(
    private readonly a: string,
    private readonly b: string,
    private readonly c: string,
    private readonly d: string,
    private readonly e: string,
  ) {}
}

// Method with 3 required params, not flagged.
export class Small {
  doStuff(a: string, b: string, c: string) {
    return [a, b, c];
  }
}

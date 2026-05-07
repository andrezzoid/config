// PoSD's canonical pass-through variable: the (req, res, ctx, logger, metrics)
// plumbing layer where some params are threaded through without being read.
declare function authenticate(request: unknown, ctx: unknown, logger: unknown): unknown;
declare function authorize(request: unknown, ctx: unknown, logger: unknown): unknown;

// All three params are threaded through to inner calls and never read here.
// Lines 9-12: each param is a pass-through-variable candidate.
export function handleRequest(request: unknown, ctx: unknown, logger: unknown) {
  const user = authenticate(request, ctx, logger);
  const allowed = authorize(request, ctx, logger);
  return { user, allowed };
}

// Negative: `id` is read in arithmetic, not just forwarded — not flagged.
// Also has only 1 param so the ≥3 guard would skip it anyway.
export function offset(id: number, base: number, factor: number) {
  const x = id * factor;
  return x + base;
}

// Negative: only 2 params — skipped by the ≥3 guard regardless of usage.
export function thread(a: unknown, b: unknown) {
  authenticate(a, b, null);
  authorize(a, b, null);
}

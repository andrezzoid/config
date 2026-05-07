// Type-system escape hatches — each tells the compiler "trust me", which the LLM should reconsider.
declare const data: unknown;
declare function unsafe(): unknown;
declare function wrong(): unknown;

const a = data as any;            // line 6
const b = (data as any) as Foo;   // line 7

// @ts-ignore
const c = unsafe();               // ignore on line 9, applies to line 10

// @ts-expect-error: known issue
const d = wrong();                // expect-error on line 12

// Narrower casts — not flagged.
const e = data as unknown;
const f = data as Record<string, unknown>;

type Foo = { x: number };

// `try { ... } catch (e) { throw e; }` is pure noise — same as no try/catch.
declare function doSomething(): void;
declare function doOther(): void;
declare function ok(): void;

try {
  doSomething();
} catch (e) {
  throw e;                        // line 9: pure rethrow
}

try {
  doOther();
} catch (e) {
  console.log("failed");
  throw e;                        // not flagged — adds logging
}

try {
  ok();
} catch (e) {
  throw new Error("wrapped: " + e); // not flagged — wraps with new error
}

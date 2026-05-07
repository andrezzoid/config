// Empty/swallowing catches lose information; PoSD ch.10 says design errors away or surface them.
declare function doSomething(): void;
declare function doOther(): void;
declare function ok(): void;

try {
  doSomething();
} catch (e) {}                    // line 7: empty body

try {
  doOther();
} catch (e) {
  // swallowed silently
}                                 // lines 11-13: comment-only body, still empty AST

try {
  ok();
} catch (e) {
  console.error(e);
}                                 // not flagged — body has a statement

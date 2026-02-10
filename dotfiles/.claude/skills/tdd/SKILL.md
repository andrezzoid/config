---
name: tdd
description: Enforce Test-Driven Development (TDD) methodology for software development. Use when user explicitly requests TDD/test-driven development, is developing features (new or existing project), or says "write tests first" or similar. Ensures Red-Green-Refactor cycle discipline, test-first approach, and minimal implementation.
---

# TDD (Test-Driven Development) Skill

## When to Apply
This skill applies when:
- User explicitly requests TDD/test-driven development
- User is developing features (new or existing project)
- User says "write tests first" or similar

## Core Discipline: Red-Green-Refactor

### RED Phase
1. **Write or update the test first**
   - For new behavior: write new test
   - For changed behavior: update existing test to reflect new requirements
   - Never write implementation before test changes
   
2. **Create minimal interface to make test runnable**
   - If test imports a new module: create empty module/class/function
   - If test calls a new method: add empty method signature
   - Goal: test should fail on assertions, not on imports/syntax
   
3. **Verify the test actually fails**
   - Run the test and confirm red
   - If test passes without implementation, it's a false positive - fix the test

### GREEN Phase
1. **Write minimal implementation**
   - Only add code needed to pass the **current test**
   - Even if the plan includes more features, implement only what this test verifies
   - **Minimal means**: simplest code that makes the test pass
     - One test? Hardcoding the value is fine
     - Two tests? Add just enough logic to handle both
     - Let additional tests force generalization
   
2. **Verify test passes**
   - Run test and confirm green
   - If test fails, fix implementation (not the test)

### REFACTOR Phase
1. **Improve code while maintaining green**
   - Only refactor when all tests pass
   - Run tests after each refactoring step
   - If any test goes red: revert the refactoring and try a different approach
   - Small refactoring steps are safer than large rewrites

## Development Flow

When given a feature/plan to implement:

1. **Break down into testable behaviors**
   - Identify smallest verifiable behavior
   - Order behaviors from simple to complex (build incrementally)

2. **For each behavior:**
   - Write or update test for that specific behavior
   - Create minimal interface if needed (imports must work)
   - Run test, verify RED
   - Implement or modify implementation
   - Run test, verify GREEN  
   - Refactor if needed (maintain green - see REFACTOR phase)

3. **Repeat until plan is complete**

Only ask for clarification when:
- Requirements are ambiguous (unclear what "success" means)
- Edge cases are unspecified (how to handle null/empty/invalid input)
- Trade-offs affect observable behavior (performance vs. accuracy)

## Critical Anti-Patterns to Avoid

❌ **Don't mock the unit under test**
```typescript
// WRONG - mocking the thing we're testing
test('calculates total', () => {
  const calculator = new Calculator();
  jest.spyOn(calculator, 'calculateTotal').mockReturnValue(100); // NO!
  expect(calculator.calculateTotal([1,2,3])).toBe(100);
});
```

✅ **Do create minimal interface**
```typescript
// CORRECT - minimal skeleton to make test importable
export class Calculator {
  calculateTotal(items: number[]): number {
    // Will implement after test fails
    return 0;
  }
}
```

❌ **Don't change implementation then adjust tests to match**
```typescript
// WRONG workflow:
// 1. Modify implementation
// 2. Tests fail
// 3. Change tests to pass with new implementation

// CORRECT workflow:
// 1. Update tests to reflect new requirements (RED)
// 2. Modify implementation to pass updated tests (GREEN)
```

❌ **Don't "fix" tests when implementation fails them**
- If test fails after implementation change → implementation is probably wrong
- Tests are the specification, implementation serves tests
- Exception: Only fix tests if requirements genuinely changed

❌ **Don't write multiple tests before implementing**
- Write one test → make it pass → repeat
- Prevents over-engineering and keeps focus narrow

❌ **Don't over-complicate the solution**
- Implement simplest thing that passes the test
- Use triangulation: add more tests to force generalization
- Don't add abstraction until multiple tests demand it

## Test Integrity Rules

- Each test must be independently runnable
- Tests should not depend on execution order
- Test names should describe the behavior being tested
- One logical assertion per test
  - Multiple assertions are acceptable when testing related aspects of the same behavior
  - Avoid: unrelated assertions that make test failures ambiguous

## When Test Fails After Implementation

Default assumption: **implementation is wrong**

Only modify test if:
- User confirms requirements changed
- Test has a clear bug:
  ```typescript
  // Example of test bug (false positive):
  test('validates email', () => {
    expect(validateEmail('invalid')).toBe(true); // Test expects wrong result
  });
  ```
- Test is testing implementation details, not behavior

## Refactoring vs. Behavior Change

### Refactoring (behavior unchanged)
- All existing tests must stay green throughout
- Follow REFACTOR phase guidelines above
- No test modifications during refactoring

### Bug Fixes
Bugs mean tests were insufficient:

1. Write test that reproduces the bug (should fail)
2. Fix implementation
3. Verify test now passes
4. Existing tests should remain green

If existing tests fail after bug fix, investigate why - either:
- The fix broke something else (revert, rethink)
- Existing test was actually wrong (rare - verify before changing)

---
name: spectre-tdd
description: "Load this skill when executing TDD (Test-Driven Development) methodology. Use when implementing features via strict RED-GREEN-REFACTOR cycles, or when a prompt instructs execution via TDD."
---

# TDD: Test-Driven Development Methodology

Execute tasks using strict TDD (RED → GREEN → REFACTOR). Outcome: Tasks completed with Happy/Failure tests passing, minimal code shipped.

## Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? **Delete it. Start over.** Don't keep it as "reference." Don't "adapt" it. Delete means delete. Implement fresh from tests.

## Rules

- **2 tests per Test Opportunity (TO)**: 1 Happy path, 1 Failure path — then stop
- **Scoped execution**: Never run repo-wide tests; use `--testPathPattern`, `--findRelatedTests`, or per-file lint
- **YAGNI**: No abstractions unless test forces it or ≥2 call sites exist
- **Anti-flake**: Use fake timers, stubs, seeded RNG

---

## Step 1 - Generate TDD TODO List

- **Action** — ParseTaskList: Extract tasks from ARGUMENTS or thread context
  - **If** no clear tasks → stop and ask for guidance
- **Action** — IdentifyTestOpportunities: Derive TOs (smallest behavior unit: function, route, bug fix, acceptance criterion)
- **Action** — TransformToTDD: Convert each TO to cycle using TodoWrite:
  - `RED: Happy — {test}` → `RED: Failure — {test}` → `GREEN: Minimal impl` → `REFACTOR: Tidy` → `COMMIT`
- **Action** — VerifyScope: Confirm TODO contains ONLY assigned tasks

## Step 2 - RED Phase: Write Failing Tests

- **Action** — WriteHappyTest: Write first failing test (happy path)
  - Execute only this test/file, not entire suite
- **Action** — WriteFailureTest: Write second failing test (primary failure mode)
- **Action** — VerifyRed: **MANDATORY** — Confirm each test:
  - Fails (not errors)
  - Fails for expected reason (feature missing, not typo)
  - **If** passes → you're testing existing behavior; fix test

## Step 3 - GREEN Phase: Minimal Implementation

- **Action** — ImplementMinimal: Write least code to pass tests
  - No extra branches, params, or dependencies unless test forces them
- **Action** — VerifyGreen: **MANDATORY** — Run tests (narrowest scope)
  - **If** fail → fix code, not test
  - Remove any speculative code not forced by tests

## Step 4 - REFACTOR Phase: Clean Code

- **Action** — RefactorSafely: Improve only if duplication ≥3 OR readability materially improves
  - Keep tests green; **If** tests fail → revert
- **Action** — HandleLintFailures: Apply in order until clear:
  1. Guard clauses, split compound expressions
  2. Extract tiny private helpers (same file)
  3. Hoist literals to file constants
  4. Split into orchestrator + helpers
  5. Only if still failing: same-directory helper module

## Step 5 - Loop or Complete

- **If** more TOs → return to Step 2
- **Else** → proceed to Step 6

## Step 6 - Commit & Report

- **Action** — CommitCode: Conventional format (`feat({task}): description`)
- **Action** — GenerateReport:
  - **Summary**: Tasks completed, test status (✅ Happy ✅ Failure), files modified
  - **Artifacts**: Test helpers, mocks, fixtures created
  - **API Surface**: New/modified exports with signatures
  - **Patterns**: Code/testing patterns to follow
  - **Deferred**: Coverage gaps for follow-up

---

## Red Flags — STOP and Restart

If any of these occur, delete code and start over with TDD:

| Red Flag | Why It's Wrong |
|----------|----------------|
| Code written before test | Violates Iron Law |
| Test passes immediately | Testing existing behavior, not new |
| Can't explain why test failed | Don't understand what you're testing |
| "Just this once" thinking | Rationalization — TDD has no exceptions |
| Keeping code "as reference" | You'll adapt it; that's tests-after |

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write wished-for API first, then assert on it |
| Test too complicated | Design too complicated — simplify interface |
| Must mock everything | Code too coupled — use dependency injection |
| Test setup huge | Extract helpers; still complex? Simplify design |

## Pre-Completion Checklist

Before marking complete, verify:
- [ ] Every new function has a test
- [ ] Watched each test fail before implementing
- [ ] Each failure was for expected reason
- [ ] Wrote minimal code to pass
- [ ] All tests pass, output clean
- [ ] Mocks used only when unavoidable

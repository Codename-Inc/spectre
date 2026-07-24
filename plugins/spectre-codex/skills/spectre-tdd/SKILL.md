---
name: "spectre-tdd"
description: "Execute implementation via strict red/green/refactor — derive test opportunities, write happy + failure tests, confirm RED failures before any production code, ship minimal GREEN code, then report test evidence. Trigger when a task or prompt requires TDD, failing-test-first, or RED-GREEN-REFACTOR execution (e.g. invoked by fix/execute). Do NOT trigger for test auditing, risk classification, or test planning without implementation — use spectre-test for that."
---

# tdd

Implement assigned behavior through strict RED → GREEN → REFACTOR. Outcome: tasks done with happy + failure tests passing and only test-forced production code shipped.

## Inputs

- `$ARGUMENTS` or thread context — the assigned implementation task(s). If no clear task, stop and ask.
- The task's acceptance criteria / artifact, if one exists.

## Working Set (late-bound — read at run-time, never inline)

- Target behavior, acceptance criteria, and the smallest affected code/test files.
- Narrow test/lint commands for those files only (`--testPathPattern`, `--findRelatedTests`, per-file lint, or equivalent).
- Existing test helpers, fixtures, stubs, fake timers, seeded-RNG patterns.

## Outputs + DONE

- A todo list with one cycle per Test Opportunity: `RED happy` → `RED failure` → `GREEN minimal impl` → `REFACTOR` → `COMMIT`.
- The implementation diff, focused tests, and (optional) conventional commit `feat({task}): description`.
- A completion report: Summary (tasks done, ✅ happy / ✅ failure test status, files modified); Artifacts (helpers/mocks/fixtures); API Surface (new/modified exports + signatures); Patterns; Deferred coverage gaps.

**DONE when:** every Test Opportunity has exactly one happy-path and one primary-failure test (unless the behavior genuinely supports only one); each new test was observed failing for the expected reason before its implementation; minimal production code makes the focused tests pass; refactors left the tests green; every new function has a test; all focused tests + relevant lint pass cleanly.

## Method / guardrails

- **Iron Law — YOU MUST confirm RED before GREEN.** No production code before a failing test. If code was written first, **delete it and restart from the tests** — do not keep it as reference, do not adapt it.
- A Test Opportunity is the smallest behavior unit: a function, route, bug fix, or acceptance criterion.
- Per Test Opportunity: write the happy test, then the primary-failure test; run the narrowest command; confirm both **fail (not error) for the missing behavior**, not a typo/setup bug. A test that passes immediately is testing existing behavior — fix it or pick uncovered behavior.
- GREEN = the least code to pass the focused tests: no extra branches, params, dependencies, or abstractions unless a test forces them or ≥2 call sites exist (YAGNI).
- Refactor only while green, and only for duplication ≥3 or a material readability gain; if a refactor breaks tests, revert it.
- Resolve lint pressure in order: guard clauses / split compounds → tiny same-file helpers → file constants → orchestrator + helpers → same-directory helper module only if still failing.
- Keep execution scoped — never run repo-wide tests when a focused command exists.
- Prefer the repo's existing anti-flake patterns: fake timers, stubs, seeded RNG, deterministic fixtures.

## Handoff

Return the completion report inline with the exact commands run and pass/fail evidence — no scratch files. With `--orchestrated`, return to the caller without user-facing Next Steps. Standalone: recommend `spectre-proof` for completed user-observable behavior, `spectre-test` only for a concrete remaining coverage gap, or `spectre-clean` only when proof is explicitly deferred. Emit one primary route tied to the observed result.

## Escalate-If

- The assigned task or its acceptance criteria are unclear → stop and ask.
- You cannot make a meaningful RED test fail for the expected reason.
- The focused test command cannot be isolated to the changed files.
- Test setup dwarfs the behavior under test → the design is too coupled; simplify the interface (or ask) before continuing.

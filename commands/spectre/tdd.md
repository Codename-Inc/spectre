---
description: 👻 | Execute tasks via strict TDD methodology - primary agent
---

# tdd: Implement tasks using Test-Driven Development

## Description
- **What** — Execute assigned tasks using strict TDD methodology (RED → GREEN → REFACTOR cycles) with critical-path tests only
- **Outcome** — Tasks completed with Happy/Failure tests passing, minimal working code shipped, coverage handoff documented

## Variables

### Dynamic Variables
- `task_list`: List of specific tasks to implement — (via ARGUMENTS: $ARGUMENTS)

### Static Variables
- `max_tests_per_opportunity`: 2 (Happy, Failure)
- `red_timebox`: 6 minutes
- `green_timebox`: 10 minutes
- `refactor_timebox`: 8 minutes

## COMMANDS

**Run Test for a specific file:**

### From app directory
- npm run test:file <file-path>
Example:
- npm run test:file src/services/audio-recording.service.ts

**Lint Specific File**

### From app directory (/Users/joe/Dev/hogan/apps/prototype/hoganv0/app):
Lint a specific file
- npm run lint -- src/services/audio-recording.service.ts

Lint and auto-fix a specific file
- npm run lint:fix -- src/services/audio-recording.service.ts

Lint Multiple files
- npm run lint:fix -- src/services/audio-recording.service.ts src/store/session.store.ts

## Instructions

- **MVP first**: Implement only what current tests require; follow existing project patterns
- **Single-test cadence**: Write one failing test at a time, make it pass, then repeat; this does not mean only one test total
- **Test Opportunity (TO)**: The smallest unit of behavior you add or change that has a clear surface. Examples: new/modified public function or method; new API/CLI route/handler; new reducer/state transition or selector with logic; a discrete bug fix; an explicit acceptance criterion/sub-task producing user-visible behavior.
- **Critical-tests cap**: Maximum 2 tests per TO (1 Happy, 1 Failure)
- **Counting rule**: Count each test case (e.g., `it`/`test`) toward the per‑opportunity cap. For parameterized tests or subtests, count each parameterized case as one test toward the cap. Multiple assertions inside a single test case do not increase the count.
- **Split vs merge heuristic**: Treat behaviors as separate TOs if they have different call sites or public surfaces, independent control flow, distinct acceptance criteria, or validate different invalid inputs. Otherwise, keep them as one TO.
- **TO workflow**: For each TO, complete one RED → GREEN → REFACTOR cycle with exactly 2 tests (Happy + Failure). Repeat for all TOs in the assignment.
- **Stop early**: Exit after Happy + Failure pass;
- **YAGNI filter**: Add dependencies/abstractions only if test forces it or ≥2 call sites exist
- **Anti-flake defaults**: Deterministic time (fake timers), I/O (stubs), randomness (seeded RNG)
- **Task boundary enforcement**: Work only on assigned tasks; do not expand scope
- **Scoped execution only (IMPORTANT)**: Never run repo-wide test or lint commands. Run only the smallest necessary scope: the single test, the current test file(s), or tests related to the files you modified. Use framework filters (e.g., `-k`/node pattern, `--testPathPattern`, `--findRelatedTests`, per-file `eslint/ruff`), and stop if the tool tries to fan out beyond touched files.

## Step 1 - Generate TDD TODO List

- **Action** — ParseTaskList: Extract tasks from ARGUMENTS
  - **If**: ARGUMENTS are empty
  - **Then**: Identify tasks from current thread context
  - **Else**: Stop and ask for guidance on which tasks to execute
  - NOTE: do not write code unless you have a clear set of tasks/subtasks to work from. If confused, stop and ask the user/agent for more guidance.
- **Action** — IdentifyTestOpportunities: Derive a list of TOs from the assigned tasks, sub-tasks, acceptance criteria, and planned code changes (functions/public APIs/routes/reducers/validators/bug fixes).
- **Action** — TransformToTDD: Convert each TO to RED-GREEN-REFACTOR cycles
  - For each TO, create todo items:
    - `RED: Happy — {happy path test description}`
    - `RED: Failure — {primary failure mode}`
    - `GREEN: Implement minimal {task name} logic to pass tests`
    - `REFACTOR: Tidy without adding behavior`
    - `COMMIT: {conventional commit message}`
    - `HANDOFF: Coverage Follow-up — {uncovered areas}`
  - Use TodoWrite tool to create complete TDD todo list
- **Action** — VerifyScope: Confirm TODO list contains ONLY assigned tasks in TDD format
  - **If**: Additional tasks or features detected
  - **Then**: Remove and note as out-of-scope
  - **Else**: Proceed

## Step 2 - RED Phase: Write Failing Tests

- **Action** — WriteHappyTest: Write first failing test (happy path)
  - Write test for primary happy path proving main flow works
  - Capture failure output
  - Execute only this test or its file; do not run the entire suite
  - **If**: Test passes unexpectedly
  - **Then**: Fix test to actually validate behavior; rerun
  - **Else**: Mark RED: Happy complete in TODO list
- **Action** — WriteFailureTest: Write second failing test (primary failure)
  - Write test for most probable or highest-impact failure mode
  - Proves system fails safely
  - Run test to confirm failure (targeted scope only: this test/file or related tests)
  - Mark RED: Failure complete in TODO list
- **Action** — VerifyAllRed: Confirm all written tests fail for correct reasons
  - Review failure messages to ensure testing actual behavior
  - **If**: Failures unclear or wrong
  - **Then**: Refine tests until clear failures
  - **Else**: Proceed to GREEN

## Step 3 - GREEN Phase: Minimal Implementation

- **Action** — ImplementMinimal: Write least code to pass tests
  - No extra branches, params, or dependencies unless test forces them
  - Follow existing project patterns and stack
  - Keep implementation simple and readable
  - **If**: Implementation exceeds {green_timebox}
  - **Then**: Shrink scope; slice task smaller; update TODO
  - **Else**: Continue
- **Action** — RunTests: Execute tests to verify green
  - Run the narrowest scope possible (single test, test file, or related tests only); never run repo-wide
  - **If**: Tests fail
  - **Then**: Debug and fix until all tests pass
  - **Else**: Mark GREEN complete in TODO list
- **Action** — VerifyMinimal: Confirm no speculative code added
  - Review implementation for YAGNI violations
  - **If**: Abstractions or features not forced by tests
  - **Then**: Remove and simplify
  - **Else**: Proceed to REFACTOR

## Step 4 - REFACTOR Phase: Clean Code

- **Action** — EvaluateRefactoring: Decide if refactoring needed
  - **If**: Duplication ≥3 occurrences OR readability materially improves
  - **Then**: Plan refactoring; apply
  - **Else**: Skip refactoring; proceed to commit
- **Action** — RefactorSafely: Improve code while keeping tests green
  - Rename for clarity; inline for simplicity
  - Prefer simpler over clever
  - Run tests continuously to ensure green
  - **If**: Refactoring exceeds {refactor_timebox}
  - **Then**: Stop refactoring; commit current state
  - **Else**: Complete refactoring
- **Action** — VerifyTestsStillGreen: Confirm all tests still pass
  - Run tests only for changed files or framework-detected related tests; never run the entire repository suite
  - **If**: Tests fail
  - **Then**: Revert refactoring or fix
  - **Else**: Mark REFACTOR complete in TODO list

## Step 5 - Complete Remaining Tasks & Report

- **Action** — CheckRemainingTasks: Evaluate TODO list
  - **If**: More tasks in TODO list
  - **Then**: Return to Step (2/6) for next task
  - **Else**: Proceed to final report

## Step 6 - Commit Your Code

- **Action** - **IMPORTANT** 
  - commit YOUR code (only your code) with a conventional commit format (e.g., "feat({task_name}): description")
  - address any linting or test failures specific to *your* code.
  - If size/length/complexity rules fail, use this in-order refactor heuristic (stop at the first step that clears checks):
    - No behavior changes; keep tests green at every step.
    - Same-file first: do not add deps or move files unless noted in step 6.
    - 1) Simplify control flow inside the function: add guard clauses/early returns to reduce nesting; split compound expressions into named locals.
    - 2) Extract tiny, pure helpers (private/file-local) from long functions; keep public signatures unchanged.
    - 3) Hoist literals/regex/large config objects to file-scoped constants.
    - 4) Split a long function into a small orchestrator that delegates to a few private helpers (same file).
    - 5) For classes, extract private methods for repeated logic; avoid changing the public class API.
    - 6) Only if still failing: create a same-directory internal helper module (e.g., `thing.helpers.*`) and import it; do not change the public API surface.
    - 7) If violations persist or broader redesign is needed, pause and ask for approval before any multi-file refactor.

## Step 7 - Finalize Handoff

- **Action** — GenerateReport: Create completion summary
  - **Execution Summary**: Tasks completed, test status (✅ Happy ✅ Failure), files modified with [file:line] references
  - **Reusable Artifacts**: Test helpers, mocks, fixtures, shared utilities created (with file:line refs)
  - **Public API Surface**: New/modified exports with signatures and file:line references
  - **Established Patterns**: Code patterns, testing patterns, architectural decisions to follow
  - **Deferred Work**: coverage gaps
  - **Next Subagent Context**: Critical files to read, patterns to follow, stable APIs to preserve, test commands, suggested next tasks
- **Action** - Share completion summary with the user or primary agent.

---
description: 👻 | Autonomous end-to-end: brain dump -> scope -> TDD -> commit -> rebase -> PR
---
# ship: Autonomous End-to-End Delivery

Take a brain dump and autonomously produce a reviewable PR. Zero confirmation gates — scope, implement with TDD, sweep, rebase, and open a PR.

**Execution Style**: Fully autonomous. No user approval gates. Parse intent, build it, ship the PR.

## ARGUMENTS

&lt;ARGUMENTS&gt; $ARGUMENTS &lt;/ARGUMENTS&gt;

## Step (1/8) - Parse Context

- **Action** — ParseBrainDump: Extract from ARGUMENTS:
  - `INTENT_TYPE`: `feat` or `fix` (infer from context — new behavior = feat, broken behavior = fix)
  - `TARGET_BRANCH`: Extract if specified (e.g., "rebase onto develop"), default `origin/main`
  - `SCOPE_SUMMARY`: 1-2 sentence distillation of what to build/fix
  - `RELEVANT_FILES`: Any files, components, or areas mentioned
  - `CONTEXT`: Remaining context, constraints, preferences
- **Action** — ValidateInput:
  - **If** ARGUMENTS empty → ask user for brain dump, then proceed autonomously
  - **Else** → proceed

## Step (2/8) - Ensure Worktree

- **Action** — DetectBranch: `git rev-parse --abbrev-ref HEAD`
  - **If** already in a worktree or on a non-main branch (not `main`, not `master`) → use current context, proceed
  - **If** on `main` or `master` → use `EnterWorktree` to create an isolated worktree
- **Action** — SetBranchName: Capture current branch name as `BRANCH_NAME` for artifact paths

## Step (3/8) - Quick Scope

- **Action** — DispatchResearch: Spawn parallel lightweight agents:

  - `@spectre:finder` — Locate files related to `RELEVANT_FILES` and `SCOPE_SUMMARY`
  - `@spectre:analyst` — Understand the relevant code area, key interfaces, existing patterns

- **Action** — WriteScopeDoc: Create `docs/tasks/{BRANCH_NAME}/concepts/scope.md`:

  ```markdown
  # Scope: {SCOPE_SUMMARY}
  
  ## Objective
  {1-2 sentences from brain dump}
  
  ## Type
  {feat or fix}
  
  ## In Scope
  - {bullet list of what will be done}
  
  ## Out of Scope
  - {what this explicitly won't touch}
  
  ## Target Branch
  {TARGET_BRANCH}
  
  ## Key Files
  {from research — relevant files and their roles}
  ```

  Keep it \~20 lines. This is a lightweight scope, not full `/spectre:scope`.

## Step (4/8) - Create Tasks

- **Action** — CreateTasks: Use `TaskCreate` to create 3-8 tasks proportional to scope complexity.
  - Each task gets: clear `subject` (imperative), `description` (what to do + acceptance criteria), `activeForm` (present continuous)
  - Order tasks by dependency — foundational work first
  - Tasks are ephemeral and operational — no file artifact needed

## Step (5/8) - Execute with TDD

- **Action** — ExecuteLoop: For each task sequentially:

  1. `TaskUpdate` → `in_progress`
  2. Load `@skill-spectre:spectre-tdd` for TDD methodology
  3. Execute: RED (write failing test) → GREEN (minimal implementation) → REFACTOR (clean up)
  4. Commit with conventional format: `{INTENT_TYPE}({scope}): {description}`
  5. `TaskUpdate` → `completed`

  **Rules**:

  - One commit per task minimum
  - Conventional commit format always
  - TDD methodology for implementation tasks (skip for config/doc-only tasks)
  - If a task reveals new work, create additional tasks rather than scope-creeping the current one

## Step (6/8) - Sweep

Inline sweep — same checklist as `/spectre:sweep`, no subagents:

### 6.1 Diff Sanity Check

- Review full diff for unintentional changes (whitespace-only edits, merge artifacts)
- Verify no accidentally staged files outside the intended scope
- Confirm no secrets, API keys, credentials, or sensitive data in diff

### 6.2 Logging Audit

- Remove temporary/debug logging (console.log, print, debug flags)
- Preserve intentional logs: errors, critical warnings, key state transitions
- Verify log levels are appropriate for production context

### 6.3 Code Hygiene

- Remove commented-out code (it's in git history if needed)
- Resolve or document any TODO/FIXME/HACK introduced in this session
- Remove hardcoded test values that should be config/env

### 6.4 Opportunistic Dead Code Cleanup

- Orphaned imports with no usage in the file
- Unused variables or functions declared but never referenced
- Debug artifacts (debugger statements, leftover TODO/FIXME from this work)

### 6.5 Lint (Strict)

- Run the project linter and **fix all violations** — no skipping, no eslint-disable
- Address structural lint issues by refactoring, not suppressing

### 6.6 Test

- Run affected tests + full test suite
- Fix any failures caused by the changes
- Do NOT write new tests here — that was done in Step 5

### 6.7 Commit Sweep Fixes

- If sweep produced changes, commit: `chore({scope}): sweep cleanup`

## Step (7/8) - Rebase

- **Action** — FetchLatest: `git fetch origin`
- **Action** — CreateSafetyRef: `git branch backup/ship-$(date +%Y%m%d-%H%M%S)`
- **Action** — Rebase: `git rebase {TARGET_BRANCH}`
  - **If** conflicts → resolve automatically, favoring target branch conventions
  - Track resolution decisions for PR summary
- **Action** — VerifyPostRebase:
  - Run linter — fix violations
  - Run full test suite — fix failures
  - Confirm commit count and no unexpected changes

## Step (8/8) - Create PR

- **Action** — PushBranch: `git push -u origin {BRANCH_NAME}`

- **Action** — CreatePR: `gh pr create` with:

  **Title**: `{INTENT_TYPE}({scope}): {SCOPE_SUMMARY}` (under 70 chars)

  **Body**:

  ```markdown
  ## Summary
  {From scope doc — objective and what was done}
  
  ## Changes
  {Bulleted list derived from completed tasks}
  
  ## Test Plan
  {Bulleted checklist — what was tested, what to verify manually}
  
  Shipped autonomously via `/spectre:ship`
  ```

- **Action** — OutputPRUrl: Display the PR URL as the final deliverable

## Next Steps

Use `@skill-spectre:spectre-guide` skill to render the Next Steps footer.
---
description: 👻 | Risk-aware test coverage & commit - primary agent
---

# test: Lightweight test coverage with risk-aware focus

## Description
- **What** — Analyze current diff, assess risk tiers inline, dispatch @test-lead for coverage, verify, commit
- **Outcome** — Changed behaviors tested at appropriate depth, lint clean, all tests pass, conventional commits

## ARGUMENTS Input

Optional scope hint or specific files to focus on.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions

- Primary agent plans and verifies; @test-lead subagents write test code
- Maximize parallelism: dispatch multiple @test-lead agents simultaneously, not sequentially
- Primary agent coordinates; subagents execute test writing in parallel batches
- No OUT_DIR artifacts — this is a lightweight flow
- Risk assessment is inline reasoning, not a classification phase
- Test behaviors at boundaries, not implementation details
- Skip tests for P3 files (types, configs, simple wrappers)

## Steps

### Step (1/4) - Analyze Diff

- **Action** — GatherScope: Run `git status` and `git diff` to understand changes
  - **If** ARGUMENTS specifies files → scope to those files
  - **Else** → scope = all staged + unstaged + untracked
- **Action** — IdentifyChangedBehaviors: List what behaviors changed (not just files)
  - Focus on: new functions, modified logic, changed APIs, altered flows
  - Ignore: formatting, comments, type-only changes

### Step (2/4) - Risk Assessment & Test Plan

- **Action** — InlineRiskCheck: Quick mental triage of changed files

  **P0 Critical** (thorough coverage required):
  - Paths containing: `auth`, `payment`, `security`, `crypto`, `session`, `token`
  - Handles: user data mutations, financial transactions, PII, permissions
  - Has `@critical` annotation

  **P1 Core** (key behaviors):
  - API handlers, feature components, state management, services

  **P2 Supporting** (public surface only):
  - Utils, helpers, hooks, formatters

  **P3 Skip** (no tests):
  - Type definitions (`.d.ts`), configs, styles, index barrels, simple wrappers

- **Action** — CreateTestPlan: Write 3-7 bullet test plan
  - Format: `- [P{tier}] {file}: {behavior to test}`
  - P0 files get multiple bullets (all behaviors + error paths)
  - P1 files get 1-2 bullets (happy path + critical errors)
  - P2 files get 1 bullet (public function smoke test)
  - P3 files listed as "SKIP — {reason}"

### Step (3/4) - Write Tests & Verify

- **Action** — DispatchTestWriter: Spawn MULTIPLE @test-lead subagents IN PARALLEL
  - **Parallelization Strategy**:
    - Partition test plan items into independent batches (by file or logical grouping)
    - Dispatch one @test-lead per batch — aim for 3-5 parallel agents for medium scope, up to 8 for large scope
    - Each agent receives: its batch of test plan items, file paths, risk tier context
    - **Critical**: Use a single message with multiple Task tool calls to launch all agents simultaneously
  - **Batching Heuristics**:
    - P0 files: 1 agent per file (thorough coverage requires focus)
    - P1 files: Group 2-3 related files per agent
    - P2 files: Group 3-5 files per agent (lighter coverage)
  - Instruct each: "Write behavioral tests, assert outcomes not calls, mutation-resistant"
  - Wait for all agents to complete before proceeding to lint/test verification

- **Action** — RunLint: Execute linter; fix violations
  - **If** lint fails → autofix first, then manual fix
  - **Else** → continue

- **Action** — RunTests: Execute full test suite
  - **If** tests fail → analyze failure, fix via @test-lead or direct edit
  - **Else** → continue

- **Action** — VerifyQuality: Spot-check 1-2 tests
  - Confirm: tests assert behaviors, would catch real bugs, survive refactoring
  - **If** test quality poor → rework via @test-lead
  - **Else** → continue

### Step (4/4) - Commit

- **Action** — GroupChanges: Organize changes into logical commits
  - Group by: feat/fix/refactor/test/chore
  - Tests can be bundled with their feature or separate (your judgment)

- **Action** — CommitAll: Create conventional commits
  - Format: `type(scope): description`
  - Each commit answers: What changed and why?

- **Action** — ReadNextStepsGuide: Read `.claude/spectre/next_steps_guide.md`
- **Action** — RenderFooter: End reply with single 60-column Next Steps footer

## Next Steps

**Footer format:**
```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ 🧭 Phase: {phase} | 🟢 {status} | 🚧 {blockers}           ║
║ 🎯 Next — {recommended next step}                         ║
║ ➡️ Options: {sourced from next_steps_guide.md}            ║
║ 💬 Reply — {what to reply, if any}                        ║
╚══════════════════════════════════════════════════════════╝
```

## Success Criteria

**Step 1 - Analyze Diff**:
- [ ] Scope identified (files changed)
- [ ] Behaviors changed listed (not just file names)

**Step 2 - Risk Assessment & Test Plan**:
- [ ] Each changed file assigned P0-P3 tier
- [ ] Test plan created with 3-7 bullets
- [ ] P3 files explicitly marked SKIP

**Step 3 - Write Tests & Verify**:
- [ ] Multiple @test-lead agents dispatched in parallel (not sequential)
- [ ] Test plan partitioned into independent batches
- [ ] All agents launched in single message (parallel tool calls)
- [ ] P0 files have thorough behavioral coverage
- [ ] P1 files have key path coverage
- [ ] P2 files have public surface coverage
- [ ] P3 files have NO tests (confirmed skipped)
- [ ] Lint passes
- [ ] All tests pass
- [ ] Test quality spot-checked

**Step 4 - Commit**:
- [ ] Changes grouped logically
- [ ] Conventional commit format used
- [ ] Single Next Steps footer rendered
- [ ] Next steps guide read and options sourced

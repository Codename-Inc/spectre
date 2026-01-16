---
description: 👻 | Full feature delivery - scope to release - primary agent
---

# spectre: Scope → Plan → Execute → Clean → Test → Release → Evaluate

## Description
- **What** — End-to-end feature delivery: scope alignment, planning, parallel execution, cleanup, release prep, documentation
- **Outcome** — Fully delivered feature with documentation and architecture review, rebased and ready for PR

## Instructions
- **Single interaction**: User iteration only during Scope; all other phases autonomous
- **Attempt recovery**: On failures, retry/fix rather than halt
- **Delegate**: Each phase runs established `/spectre:` workflows

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1 - S: Scope

**Goal**: Lock scope with explicit user confirmation before autonomous execution

### 1a - Gather Context
- **Action** — ImmediateReply: Respond before running tools
  - **If** ARGUMENTS empty → ask user to describe feature
  - **Else** → proceed to scope analysis
  - **CRITICAL**: No tool calls in this action

### 1b - Present Scope
- **Action** — PresentForConfirmation:
  > **Core Problem**: {1-2 sentences}
  >
  > **✅ In Scope**: {features/behaviors}
  >
  > **❌ Out of Scope**: {exclusions}
  >
  > **UX Assumptions**: {assumptions}
  >
  > Reply with corrections or "Confirmed" to proceed.

- **Wait** — User confirms or corrects

### 1c - Clarify & Lock
- **Action** — ClarifyScopeBoundaries: Use AskUserQuestion for up to 5 targeted questions (boundaries, UX, edge cases)
- **Action** — ConfirmParentBranch: 6th question — "Which branch to merge into?" → store as `parent_branch`
- **Action** — PresentFinalScope:
  > **📋 Final Scope**: ✅ In Scope | ❌ Out of Scope | 🎯 Parent: {parent_branch}
  >
  > Reply **"Go"** to start autonomous execution.

- **Wait** — User says "Go"

### 1d - UX Specification (Conditional)

- **Action** — AssessUXComplexity: If feature involves significant UI (new screens, complex interactions, user flows):
  - Ask: "This feature has UI components. Want to define detailed UX spec before planning? (Recommended for UI-heavy features)"
  - **If yes** → Execute `/spectre:ux_spec`, wait for approval, proceed
  - **If no** → Skip to Plan

## Step 2 - P: Plan

- **Action** — RunSpectrePlan: Execute `/spectre:spectre_plan` with locked scope
  - Passes: objective, in-scope, out-of-scope, constraints, parent_branch
  - Handles: deep research (parallel agents), plan creation, @reviewer review
  - **Wait** for `spectre_plan.md` output

## Step 3 - E: Execute

- **Action** — RunExecute: Execute `/spectre:execute` targeting `spectre_plan.md`
  - Handles: wave-based TDD, code review loop, requirement validation
  - **If** failures → attempt recovery
  - **Wait** for completion

## Step 4 - C+T: Clean + Test

- **Action** — RunClean: Execute `/spectre:clean`
  - Handles: diff sanity, logging audit, dead code, lint
  - **If** issues → fix them

- **Action** — RunTest: Execute `/spectre:test`
  - Handles: risk assessment, test plan, test writing via @tester subagents
  - **If** failures → fix them

## Step 5 - R: Release

- **Action** — RunRebase: Execute `/spectre:rebase base={parent_branch}`
  - Use parent_branch from Step 1 — do not prompt user
  - Handle conflicts autonomously
  - Verify tests pass post-rebase

## Step 6 - E: Evaluate

- **Action** — RunEvaluate: Execute `/spectre:evaluate`
  - Handles: feature documentation, architecture review
  - **Wait** for completion

## Report

- **Action** — PresentDeliverySummary:

| Phase | Status |
|-------|--------|
| S - Scope | ✅ {feature_name} |
| P - Plan | ✅ {N} tasks |
| E - Execute | ✅ {N} waves complete |
| C - Clean | ✅ Lint passing |
| T - Test | ✅ Coverage complete |
| R - Release | ✅ Rebased onto {parent_branch} |
| E - Evaluate | ✅ Docs ready |

**Documents**: `{documentation_path}`, `{architecture_review_path}`

**Next**: Review docs, then `gh pr create --base {parent_branch}` or `git merge`

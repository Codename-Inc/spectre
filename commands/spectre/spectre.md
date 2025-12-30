---
description: 👻 | Full feature delivery - scope to release - primary agent
---

# spectre: Scope → Plan → Execute → Clean → Test → Release → Evaluate

## Description
- **What** — End-to-end feature delivery: scope alignment, planning with review, parallel TDD execution, cleanup, release prep, and documentation
- **Outcome** — Fully delivered feature with documentation and architecture review, rebased and ready for PR/merge

## Variables

### Dynamic Variables
- `feature_request`: Feature description — (via ARGUMENTS: $ARGUMENTS)
- `parent_branch`: Branch to merge into — (via clarification Q6)

### Static Variables
- `out_dir`: specs/{branch_name}
- `max_scope_questions`: 5
- `recovery_attempts`: 3

## Instructions

- **Single interaction point**: User iteration only during Scope phase; all other phases autonomous
- **Trust the execution**: After scope lock, workflow runs to completion
- **Attempt recovery**: On failures, retry/fix rather than halt; keep going until feature complete
- **Delegate to existing prompts**: Each phase runs established workflows
- **Agent judgment**: Make decisions autonomously; document rationale when relevant

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/6) - S: Scope

**Goal**: Lock scope boundaries with explicit user confirmation before proceeding

**CRITICAL**: This step has multiple wait points. Do NOT proceed past any **Wait** instruction until user responds.

### Step 1a - Gather Context

- **Action** — ImmediateReply: Respond immediately before running any tools
  - **If** ARGUMENTS empty → ask user to describe the feature they want to build
  - **Else** → proceed to scope analysis
  - **CRITICAL**: Do NOT run any tool calls in this action

### Step 1b - Present Scope Understanding

- **Action** — AnalyzeScope: Parse ARGUMENTS and form initial understanding
  - Identify core user problem being solved
  - Draft what's IN scope (features, UX, behaviors)
  - Draft what's OUT of scope (explicit exclusions)
  - Note any UX assumptions

- **Action** — PresentForConfirmation: Share draft boundaries and STOP for user response
  > Based on your request, here's my understanding:
  >
  > **Core Problem**: {1-2 sentences}
  >
  > **✅ In Scope**:
  > - {feature/behavior 1}
  > - {feature/behavior 2}
  > - {feature/behavior 3}
  >
  > **❌ Out of Scope**:
  > - {explicit exclusion 1}
  > - {explicit exclusion 2}
  >
  > **UX Assumptions**:
  > - {assumption about user flow or interaction}
  >
  > **Does this match your expectations?** Reply with corrections or "Confirmed" to proceed.

- **Wait** — STOP HERE. User must confirm or correct scope before continuing.
  - **If** user provides corrections → update understanding and re-present
  - **If** user confirms → proceed to Step 1c

### Step 1c - Clarify Ambiguities

- **Action** — ClarifyScopeBoundaries: Use AskUserQuestion tool for up to 5 targeted questions
  - Focus on: boundaries, UX expectations, edge cases, what's explicitly NOT wanted
  - Only ask questions where ambiguity exists; skip if scope is crystal clear
  - Questions should have concrete options based on context (not open-ended)

- **Action** — ConfirmParentBranch: Use AskUserQuestion for 6th question (separate from scope)
  - "Which branch should this feature be merged into?"
  - Options: main, development, or user-specified
  - Store as `parent_branch` for Release phase

### Step 1d - Lock Scope

- **Action** — PresentFinalScope: Show final locked scope and request explicit approval
  > **📋 Final Scope Summary**:
  >
  > **✅ In Scope**:
  > - {final in-scope items}
  >
  > **❌ Out of Scope**:
  > - {final exclusions}
  >
  > **🎯 Parent Branch**: {parent_branch}
  >
  > **Ready to proceed?** After this, I'll execute autonomously through planning, building, testing, and release. You'll review documentation at the end.
  >
  > Reply **"Go"** to start autonomous execution, or provide changes.

- **Wait** — STOP HERE. Do NOT proceed until user explicitly says "Go" or equivalent approval.
  - **If** user requests changes → update and re-present final scope
  - **If** user approves → proceed to Step 2

## Step (2/6) - P: Plan

**Goal**: Research codebase deeply, create implementation plan, review and incorporate feedback

- **Action** — RunSpectrePlan: Execute `/spectre:spectre_plan` with locked scope
  - Pass full scope context: objective, in-scope items, out-of-scope exclusions, constraints, parent branch
  - This handles:
    - Deep codebase research (parallel agents: locator, analyzer, pattern-finder)
    - Autonomous resolution of technical ambiguities
    - Implementation plan creation with wave structure
    - Plan review via @independent-review-engineer
    - Feedback incorporation (agent judgment)
  - Wait for completion and `spectre_plan.md` output

- **Action** — VerifyPlanReady: Confirm plan is ready for execution
  - Plan saved to `{out_dir}/spectre_plan.md`
  - Wave structure defined with dependencies
  - Review feedback section populated

## Step (3/6) - E: Execute

**Goal**: Build the feature using parallel TDD execution via the `/spectre:execute` command.

- **Action** — RunExecuteParallel: Dispatch workflow execution
  - Run `/spectre:execute` targeting `{out_dir}/spectre_plan.md`
  - This handles: wave-based TDD, code review loop, requirement validation, test guide generation
  - **If** execution encounters failures → attempt recovery (fix issues, retry)
  - **Else** → proceed when all tasks complete

- **Action** — CaptureExecutionSummary: Record execution results
  - Tasks completed
  - Waves executed
  - Code review iterations
  - Requirement validation pass
  - Test guide location

## Step (4/6) - C+T: Clean + Test

**Goal**: Pre-commit cleanup including test verification

- **Action** — RunClean: Execute cleanup workflow
  - Run `/spectre:clean`
  - This handles: diff sanity, logging audit, code hygiene, dead code, lint, test coverage, commit strategy
  - **If** issues found → fix them (lint errors, test failures, etc.)
  - **Else** → proceed when clean

- **Action** — VerifyTestStatus: Confirm test suite passing
  - All tests green
  - Test guide exists from Execute phase
  - Flag any coverage gaps for documentation

- **Action** - RunTest: Execute test coverage workflow
  - Run `/spectre:test`
  - This handles risk assessment, test plan creation, test writing via test-lead subagents. 
  - **If** issues found → fix them (lint errors, test failures, etc.)
  - **Else** → proceed when test workflow is complete and committed

## Step (5/6) - R: Release

**Goal**: Rebase onto parent branch and prepare for PR/merge

- **Action** — RunRebaseWorkspectre: Execute rebase with confirmed parent branch
  - Run `/spectre:rebase base={parent_branch}`
  - Pass parent_branch from Step 1 — do not stop to ask user
  - Handle conflicts autonomously (favor target branch for API/contract changes)
  - **If** conflicts require user decision → document and proceed with best judgment
  - **Else** → complete rebase

- **Action** — VerifyRebaseComplete: Confirm branch state
  - Rebased onto {parent_branch}
  - All tests still passing post-rebase
  - Ready for PR creation or merge

## Step (6/6) - E: Evaluate

**Goal**: Generate documentation and architecture review for user verification

- **Action** — RunEvaluationWorkflow
  - Run `/spectre:evaluate`
  - This handles feature documentation and architecture review
  - When complete, proceed to the final REPORT step. 

## Report

**Delivery Summary Format**:
```
╔══════════════════════════════════════════════════════════════╗
║ SPECTRE DELIVERY COMPLETE                                    ║
╠══════════════════════════════════════════════════════════════╣
║ S - Scope    │ ✅ {feature_name}                             ║
║ P - Plan     │ ✅ {N} tasks, review incorporated             ║
║ E - Execute  │ ✅ {N} waves, {M} tasks complete              ║
║ C - Clean    │ ✅ Code cleaned, lint passing                 ║
║ T - Test     │ ✅ Test coverage complete                     ║
║ R - Release  │ ✅ Rebased onto {parent_branch}               ║
║ E - Evaluate │ ✅ Docs ready for review                      ║
╠══════════════════════════════════════════════════════════════╣
║ 📄 Documentation: {documentation_path}                        ║
║ 🏗️ Architecture:  {architecture_review_path                   ║
╠══════════════════════════════════════════════════════════════╣
║ 🎯 Next — Review docs to verify build-to-spec                ║
║                                                              ║
║ ➡️ Options:                                                  ║
║ • Create PR: gh pr create --base {parent_branch}             ║
║ • Merge directly: git checkout {parent} && git merge {branch}║
║ • Request changes: Reply with feedback                       ║
╚══════════════════════════════════════════════════════════════╝
```

## Next Steps

**Footer format:**
```
╔══════════════════════════════════════════════════════════════╗
║ NEXT STEPS                                                   ║
╠══════════════════════════════════════════════════════════════╣
║ 🧭 Phase: Evaluate | 🟢 Complete | 🚧 None                   ║
╟──────────────────────────────────────────────────────────────╢
║ 🎯 Next — Review documentation, then create PR or merge      ║
║                                                              ║
║ ➡️ Options:                                                  ║
║ • gh pr create — Open pull request for review                ║
║ • git merge — Merge directly to {parent_branch}              ║
║ • Reply with feedback — Request changes before PR            ║
╚══════════════════════════════════════════════════════════════╝
```

## Success Criteria

**Step 1 - S: Scope**:
- [ ] **(1a)** Immediate reply sent; ARGUMENTS analyzed
- [ ] **(1b)** Scope understanding presented to user
- [ ] **(1b)** **STOPPED** and waited for user confirmation before proceeding
- [ ] **(1b)** User confirmed or corrections incorporated
- [ ] **(1c)** Up to 5 scope clarification questions asked via AskUserQuestion
- [ ] **(1c)** Parent branch confirmed as 6th question (separate from scope)
- [ ] **(1d)** Final scope summary presented with explicit "Go" prompt
- [ ] **(1d)** **STOPPED** and waited for user to say "Go" before proceeding
- [ ] **(1d)** User approved; scope locked

**Step 2 - P: Plan**:
- [ ] `/Spectre:spectre_plan` executed with locked scope context
- [ ] Deep codebase research completed (locator, analyzer, pattern-finder agents)
- [ ] Technical ambiguities resolved autonomously
- [ ] Plan created with wave structure and dependencies
- [ ] @independent-review-engineer plan_review completed
- [ ] Review feedback incorporated (agent judgment)
- [ ] Final plan saved to `{out_dir}/spectre_plan.md`

**Step 3 - E: Execute**:
- [ ] `/Spectre:execute` run targeting plan
- [ ] All tasks completed via TDD waves
- [ ] Code review loop completed
- [ ] Requirement validation passed
- [ ] Test guide generated
- [ ] Recovery attempted on any failures

**Step 4 - C+T: Clean + Test**:
- [ ] `/Spectre:clean` and `/Spectre:test` executed
- [ ] Lint passing, tests passing
- [ ] Code hygiene verified
- [ ] Commits organized logically
- [ ] Test coverage confirmed

**Step 5 - R: Release**:
- [ ] `/Spectre:rebase_workflow` run with `base={parent_branch}`
- [ ] Parent branch passed from Step 1 (no user prompt)
- [ ] Conflicts resolved autonomously
- [ ] Post-rebase tests passing
- [ ] Branch ready for PR/merge

**Step 6 - E: Evaluate**:
- [ ] @coder subagent dispatched for `/Spectre:document`
- [ ] @independent-review-engineer dispatched for `/Spectre:architecture_review`
- [ ] Feature documentation saved to `{out_dir}/`
- [ ] Architecture review saved to `{out_dir}/`
- [ ] Delivery summary presented with SPECTRE status
- [ ] Next steps presented (PR create, merge, or feedback options)

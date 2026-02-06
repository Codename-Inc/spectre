---
description: 👻 | Adaptive Wave-Based Build -> Code_Review -> Validate Flow
---

# execute: Adaptive Task Execution with Quality Gates

Execute tasks in parallel waves with full scope context, adapt based on learnings, code review loop, validate requirements. Outcome: complete implementation with verified quality and E2E requirement coverage.

## ARGUMENTS

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1 - Adaptive Wave Execution

- **Action** — LoadScopeContext: Identify available scope docs in `{OUT_DIR}/`:
  - `concepts/scope.md`, `specs/prd.md`, `specs/ux.md`, `specs/plan.md`, `specs/tasks.md`, `task_summary.md`
  - Store existing paths as `SCOPE_DOCS` for subagent dispatch

- **Action** — LoadTaskList: Read `docs/tasks/{branch}/specs/tasks.md` or Beads tasks
  - Identify wave structure and first wave

- **Action** — ExecuteAdaptiveLoop: Until all tasks complete:

  1. **Batch Tasks**: Assign up to 3 sequential parent tasks per subagent
     - **Batching Rule**: Group sequential tasks (e.g., 1.1→1.2→1.3) to one agent
     - **Parallelization Boundary**: If task N must complete before parallel wave W starts, end the batch at N
     - Example: Tasks 1.1-1.5 sequential, then 2.1-2.3 parallel → Agent A: 1.1-1.3, Agent B: 1.4-1.5, then parallel dispatch for wave 2

  2. **Dispatch Wave**: Launch parallel @dev subagents (1 per task batch)
     - **CRITICAL**: Each subagent MUST read `SCOPE_DOCS` before executing
     - Each receives: task batch assignment, dependency completion reports, SCOPE_DOCS paths
     - Instruct: "Read scope docs first to understand E2E UX and integration points. Load @skill-spectre:spectre-tdd, then execute tasks sequentially using its TDD methodology. **Commit after each parent task** with conventional commit format (e.g., `feat(module): add X`, `fix(module): resolve Y`). Return completion report with **Implementation Insights** + **E2E Completeness Check**."

     **E2E Completeness Check** (subagent returns one per batch):
     - ⚪ Complete — tasks sufficient to deliver spec intent
     - 🟡 Gap — [specific functionality missing for E2E UX]
     - 🔴 Blocker — [cannot deliver spec without changes to other tasks]

  3. **Mark Complete**: Update tasks doc with `[x]` for completed tasks

  4. **Reflect**: Review completion reports for:
     - Scope signals (🟡/🟠/🔴) from implementation insights
     - E2E completeness gaps (🟡/🔴) from completeness checks
     - **If** all ⚪ across both → skip to step 6
     - **Else** → adapt tasks

  5. **Adapt** (only if triggered):
     - Modify future tasks with learned context
     - Add tasks for E2E gaps with `[ADDED - E2E gap]` prefix
     - Add required sub-tasks with `[ADDED]` prefix
     - Mark obsoleted with `[SKIPPED - reason]`
     - Flag cross-task integration issues to remaining waves
     - **Guardrails**: ❌ No "nice-to-have" additions, ❌ No scope expansion, ✅ Only adapt for spec compliance

  6. **Next Wave**: Identify next tasks, gather relevant completion reports, return to step 1

## Step 2 - Code Review Loop

- **Action** — ExecutedeveviewLoop: Until no critical/high feedback:

  1. **Spawn Review**: @dev subagent runs `/spectre:code_review`
  2. **Analyze**: Identify critical/high items
     - **If** none → exit loop
  3. **Address**: Parallel @dev subagents fix feedback
  4. **Re-verify**: Return to step 1

## Step 3 - Validate Requirements

- **Action** — SpawnValidation: @reviewer runs `/spectre:validate` with task list
- **Action** — AddressGaps: If high priority gaps → dispatch @dev subagents to fix

## Step 4 - Prepare for QA

- **Action** — GenerateTestGuide: @dev runs `/spectre:create_test_guide`
  - Save to `{OUT_DIR}/test_guide.md`

## Step 5 - Report

- **Action** — SummarizeCompletion:
  - Tasks completed, waves executed, code review iterations, validation status
  - Test guide location
  - **Task Evolution Summary**: Adaptations made (or "None - original plan executed")
  - **E2E Gaps Addressed**: Summary of completeness issues found and resolved

- **Action** — RenderFooter: Use `@skill-spectre:spectre-next-steps` skill for Next Steps

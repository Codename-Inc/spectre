---
name: spectre-execute
description: 👻 | Adaptive Wave-Based Build with Per-Wave Verification Gate
user-invocable: true
---

# execute

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.


# execute: Adaptive Task Execution with Per-Wave Verification

Execute tasks in parallel waves with full scope context, verify each wave before proceeding, adapt based on learnings, audit cross-wave integration, generate manual test guide. Outcome: complete implementation with verified quality and E2E requirement coverage.

## ARGUMENTS

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1 - Adaptive Wave Execution

- **Action** — ResolveExecuteBrief: If no explicit argument is provided, default to `docs/tasks/{branch}/specs/execute.md`.
  - If the user passes `/spectre:execute <path>`, treat that path as the compact execution index.
  - Read the execute index whole. It is the token-efficient replacement for a separate task index artifact and contains the document manifest, task-detail source, execution summary, wave plan, parent-task index, and slicing rules.
  - Resolve `TASKS_JSON` from the execute index:
    1. If `## Task Detail Source` lists a `Tasks JSON:` path, use that path.
    2. Else if the index basename is `execute.md`, use adjacent `tasks.json`.
    3. Else if the index basename ends in `.execute.md`, replace that suffix with `.tasks.json` in the same directory.
    4. Otherwise stop and ask for the matching task detail JSON path.
  - Do not use a Markdown task fallback or converter. If Beads tasks are already the input source, keep the Beads path; otherwise use the `execute.md` + adjacent `tasks.json` contract.

- **Action** — LoadDocumentManifest: Extract the `## Document Manifest` paths from the execute index.
  - Read each listed existing document before execution.
  - Store existing manifest paths as `SCOPE_DOCS` for subagent dispatch.
  - Do not infer or substitute different planning docs unless a listed required path is missing and the user explicitly directs the replacement.

- **Action** — LoadTaskIndex: Use the execute index's execution summary, wave plan, and parent-task index to identify pending work and the first wave.
  - For status projection, query only task ids/status fields from `TASKS_JSON`; do not load the full JSON detail into context.
  - After any `TASKS_JSON` write, re-parse it before planning the next wave.

- **Action** — ExecuteAdaptiveLoop: Until all tasks complete:

  1. **Batch Tasks**: Assign up to 3 sequential parent tasks per subagent
     - **Batching Rule**: Group sequential tasks (e.g., 1.1→1.2→1.3) to one agent
     - **Slice Boundary Rule**: Batches are selected parent task ids from the wave guidance. They may span phases when the wave guidance and dependencies assign those parent tasks to the same owner.
     - **Parallelization Boundary**: If task N must complete before parallel wave W starts, end the batch at N
     - Example: Tasks 1.1-1.5 sequential, then 2.1-2.3 parallel → Agent A: 1.1-1.3, Agent B: 1.4-1.5, then parallel dispatch for wave 2

  2. **Dispatch Wave**: Launch parallel @dev subagents (1 per task batch)
     - **CRITICAL**: Each subagent MUST read `SCOPE_DOCS` before executing
     - Before dispatch, extract only the selected parent task ids from `TASKS_JSON` for the owner's batch using any convenient mechanism (`jq`, `node -e`, or targeted Read/Edit). The slice must include minimal phase labels plus the assigned parent tasks, subtasks, acceptance criteria, context, and status fields for those parents only.
     - Inline that extracted slice in the dispatch prompt under a `<task_assignment>` XML envelope. Run an in-flight self-check that the prompt contains only the selected parent task ids and no unrelated parent task ids.
     - `@dev` receives: the inlined `<task_assignment>`, SCOPE_DOCS paths, and (after wave 1) a **Prior-Wave Context** block. `@dev` reads no tasks file.
     - **Prior-Wave Context** (REQUIRED in waves 2+): the orchestrator appends each prior wave's @dev Completion Reports verbatim into this wave's dispatch prompt under a `## Prior-Wave Context` header. Includes Completed tasks, Files changed, Scope signal, Discoveries, and Guidance from each prior batch. This is how state is carried forward — there is no separate state file.
     - **Test discovery**: instruct @dev to use the project's native related-test command (`jest --findRelatedTests <file>`, `pytest` by path, `vitest related`, `cargo test <path>`). Do not create parallel test files for code already covered.
     - Instruct: "Read scope docs first to understand E2E UX and integration points. Use the inlined `<task_assignment>` as the only task source; do not read any tasks file. Load @skill-spectre:spectre-tdd, then execute tasks sequentially using its TDD methodology. **Commit after each parent task** with conventional commit format (e.g., `feat(module): add X`, `fix(module): resolve Y`). Return completion report with **Implementation Insights** + **E2E Completeness Check**."

     **E2E Completeness Check** (subagent returns one per batch):
     - ⚪ Complete — tasks sufficient to deliver spec intent
     - 🟡 Gap — [specific functionality missing for E2E UX]
     - 🔴 Blocker — [cannot deliver spec without changes to other tasks]

  3. **Per-Wave Verification Gate**: Verify the wave's output before adapting or advancing.

     **3a. Deterministic pre-gate (no AI)**
     - Detect project commands from `package.json` / `pyproject.toml` / `Cargo.toml` / `Makefile`
     - Run lint, typecheck, build — whichever apply
     - If any fail: dispatch @dev to fix the failures, re-run the gate. Do NOT invoke @reviewer until all deterministic checks pass.

     **3b. Parallel review lenses (single message, two @reviewer dispatches)**

     Build each reviewer prompt from:
     - Wave diff: `git diff <parent-of-first-wave-commit>..HEAD`
     - Acceptance criteria: verbatim text from the inlined `<task_assignment>` for this wave's tasks, plus relevant scope docs
     - Files-touched manifest

     **Forbidden in reviewer prompts**: @dev completion reports, implementer rationale, orchestrator paraphrase of "what the dev did and why". The reviewer is a clean room — diff + criteria only.

     **Lens 1 — security + correctness**
     - OWASP Top-10, injection, auth, secrets, data exposure
     - Logic, edge cases, state transitions
     - Scope adherence (flag only in-scope issues; do not flag missing out-of-scope work)

     **Lens 2 — wiring**
     - Apply the Defined → Connected → Reachable methodology:
       - Defined: code exists in a file
       - Connected: code is imported/called by other code
       - Reachable: a user action can trigger the code path
     - For each new function/component, grep for usage (not just definition)
     - For UI features, trace render-backward: JSX ← variable ← source ← user action
     - Flag dead computations (computed but never reach output) and old code paths still active when replaced

     **Severity & evidence rule** (enforced in both lens prompts):
     - Every CRITICAL or HIGH finding MUST include:
       1. `file:line` reference
       2. A reproducible failure scenario or exploit path describing observable behavior
     - Findings without an evidence chain are auto-downgraded one severity level. "Could potentially" is not evidence.
     - Each finding includes a hash: `sha256(file_path + line + finding_category)` for the fix-loop ledger (3c).

     **3c. Bounded fix loop**

     If lens dispatches return CRITICAL/HIGH:
     - **Iteration cap**: 3 fix waves maximum
     - **Hash ledger**: maintain a set of finding hashes addressed. If a finding with a hash already in the ledger reappears in a later review, classify as "reviewer disagreement" and escalate to user — do NOT re-queue.
     - **Fix/test ratio**: monitor changes per fix wave. If test-file changes > 0.5 × implementation-file changes, halt and surface to user — likely "fixing the test instead of the bug."
     - **Diff-growth circuit-breaker**: if cumulative fix-wave diff grows > 25% per iteration, halt and surface — fixes are adding surface area, not reducing it.
     - **Dispatch fix**: parallel @dev subagents address each CRITICAL/HIGH finding. Each fix-dev receives the finding's full evidence chain (file:line + scenario), not just the description.
     - **Re-verify**: after fixes commit, return to 3a (deterministic) then 3b (lenses).

     **3d. Exit condition**: No CRITICAL/HIGH remain, OR iteration cap reached and user has been notified of unresolved findings.

  4. **Mark Complete**: Edit `TASKS_JSON` directly to set completed assigned subtasks/parent tasks to `status: "done"` in `phases[]`.
     - Mechanism is flexible (`jq`, `node -e`, or Read/Edit), but the write must preserve indented valid JSON.
     - Immediately re-read/re-parse `TASKS_JSON` after the write before reflecting or planning another wave.

  5. **Reflect**: Review completion reports for:
     - Scope signals (🟡/🟠/🔴) from implementation insights
     - E2E completeness gaps (🟡/🔴) from completeness checks
     - **If** all ⚪ across both → skip to step 7
     - **Else** → adapt tasks

  6. **Adapt** (only if triggered):
     - Modify future tasks with learned context by editing `TASKS_JSON` directly
     - Add tasks for E2E gaps by appending new JSON task objects with clear titles and `status: "pending"`
     - Add required sub-tasks by appending new JSON subtask objects with clear titles and `status: "pending"`
     - Mark obsoleted tasks with `status: "skipped"` and a short reason in the task note/metadata
     - Re-read/re-parse `TASKS_JSON` after every adaptation write
     - If adaptation changes wave membership or the parent-task index, update the execute index's Wave Plan and Parent Task Index in the same pass, then re-read it before the next wave
     - Flag cross-task integration issues to remaining waves
     - **Guardrails**: ❌ No "nice-to-have" additions, ❌ No scope expansion, ✅ Only adapt for spec compliance

  7. **Next Wave**: Identify next tasks from the refreshed execute brief plus `TASKS_JSON` status projection, gather prior-wave completion reports for the Prior-Wave Context block, return to step 1

## Step 2 - Cross-Wave Validate

- **Action** — SpawnValidation: @analyst runs `Skill(spectre-validate)` (Claude slash route: `/spectre:validate`) with **narrowed scope**:
  - Focus: cross-wave integration audit (did later waves silently break earlier waves' wiring?) + scope-creep audit (anything implemented that is NOT in the acceptance criteria?) + dead-computation sweep across the full cumulative diff
  - Skip: per-area wiring verification (already done per-wave in Step 1.3b's wiring lens)

- **Action** — AddressGaps: If high priority gaps surface → dispatch @dev subagents to fix.

## Step 3 - Prepare for QA

- **Action** — GenerateTestGuide: @dev runs `Skill(spectre-create_test_guide)` (Claude slash route: `/spectre:create_test_guide`)
  - Save to `{OUT_DIR}/test_guide.md`

## Step 4 - Report

- **Action** — SummarizeCompletion:
  - Tasks completed, waves executed, per-wave fix-loop iteration counts, validation status
  - Test guide location
  - **Task Evolution Summary**: Adaptations made (or "None - original plan executed")
  - **E2E Gaps Addressed**: Summary of completeness issues found and resolved
  - **Unresolved Findings** (if any): Any CRITICAL/HIGH that hit the fix-loop cap and were escalated to user

- **Action** — RenderFooter: Use `@skill-spectre:spectre-guide` skill for Next Steps

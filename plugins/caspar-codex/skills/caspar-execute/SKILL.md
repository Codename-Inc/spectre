---
name: "caspar-execute"
description: "Build the planned feature from a compact execute.md index and sliceable tasks.json detail, dispatching parallel task waves through deterministic checks and clean-room review before advancing. Trigger after execute.md/tasks.json exist or to resume a partially-built wave plan. Do NOT trigger for scoping/planning, unplanned bug-fixing, or dead-code cleanup."
user-invocable: true
---

# execute

Execute tasks in parallel waves without loading the full task graph into primary-agent context. Read `execute.md` whole, slice `tasks.json` only for selected parent tasks, verify each wave before advancing, adapt for spec compliance, audit cross-wave integration, and emit a manual test guide.

## Inputs

- `$ARGUMENTS` — optional path to an execute index or wave/scope hints.
- Required default artifact: `{OUT_DIR}/specs/execute.md` with `Task Detail Source` pointing to `tasks.json`. If absent → stop, route to `caspar-create_tasks`.

## Working Set

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`); `OUT_DIR = docs/tasks/{branch}`.
- `EXECUTE_INDEX = arg path || {OUT_DIR}/specs/execute.md`.
- Resolve `TASKS_JSON`:
  1. Use `## Task Detail Source` line `Tasks JSON: <path>` when present.
  2. Else if index basename is `execute.md`, use adjacent `tasks.json`.
  3. Else if basename ends `.execute.md`, use sibling `.tasks.json`.
  4. Otherwise stop and ask for the matching task detail JSON path.
- `SCOPE_DOCS` = existing paths listed in the execute index `## Document Manifest`; read each before execution and pass paths to subagents.
- Wave diff per gate: `git diff <parent-of-first-wave-commit>..HEAD`; files-touched manifest; verbatim ACs from this wave's selected parent-task slice.

## Method / guardrails

**Resolve + load index.**
- Read `EXECUTE_INDEX` whole. It is the token-efficient orchestration index: manifest, task source, summary, wave plan, parent-task index, slicing rules.
- Do **not** read `TASKS_JSON` whole. Use targeted parsing only: status projection, selected parent-task slices, reviewer criteria/context slices, and status updates.
- After any JSON write, re-parse `TASKS_JSON` before planning the next wave.

**Adaptive wave loop** — until all parent tasks are `done` or `skipped`:

1. **Batch.** Use the execute index's Wave Plan + Parent Task Index to choose pending parent ids. Assign <=3 sequential parent tasks per `@dev`; batches may span phases when wave guidance allows. End a batch before any dependency boundary.
2. **Dispatch wave.** Launch parallel `@dev` (one per batch).
   - Before dispatch, extract only the selected parent task ids from `TASKS_JSON` using `jq`, `node -e`, or targeted read/edit mechanics. Include minimal phase labels plus assigned parents, subtasks, ACs, context, and status fields.
   - Inline that slice under `<task_assignment>`. Self-check: the prompt contains selected parent ids and no unrelated parent ids.
   - `@dev` receives: `<task_assignment>`, `SCOPE_DOCS` paths, and waves 2+ **Prior-Wave Context**. It MUST read scope docs first, use `<task_assignment>` as the only task source, and **not read any tasks file**.
   - Then it loads `Skill(caspar-tdd)`, executes tasks sequentially with red/green TDD, commits after each parent task, uses native related-test commands, and returns compressed **Implementation Insights** + **E2E Completeness Check**.
   - E2E signal: ⚪ Complete · 🟡 Gap [missing functionality] · 🔴 Blocker [needs other-task changes].
3. **Per-wave verification gate** (order is load-bearing):
   - **3a — Deterministic pre-gate:** detect and run lint/typecheck/build from `package.json`/`pyproject.toml`/`Cargo.toml`/`Makefile`; fix until green. Never invoke reviewers while deterministic checks fail.
   - **3b — Dual clean-room review:** dispatch two `@reviewer` prompts built only from wave diff, verbatim ACs/context from the selected slice, relevant scope docs, and files manifest. Forbidden: dev reports, implementer rationale, orchestrator paraphrase.
     - Lens 1: security + correctness, including scope adherence.
     - Lens 2: wiring with Defined → Connected → Reachable; grep usage, trace UI render backward, flag dead computations and old active paths.
     - Evidence rule: every CRITICAL/HIGH carries `file:line` + reproducible failure/exploit scenario; no evidence chain means downgrade. Tag each finding `sha256(file_path + line + finding_category)`.
   - **3c — Bounded fix loop:** CRITICAL/HIGH findings get <=3 fix waves. Reappearing hash = reviewer disagreement; escalate and do not re-queue. Halt on test-file changes >0.5x implementation-file changes or cumulative fix diff growth >25% per iteration. Re-run 3a then 3b after fixes.
   - **3d — Exit:** no CRITICAL/HIGH remain, or cap reached and user notified.
4. **Mark complete.** Edit `TASKS_JSON` status fields for assigned subtasks/parents to `done`; preserve indented valid JSON; re-parse immediately.
5. **Reflect.** Read completion reports for scope signals and E2E gaps. All ⚪ → next wave. Otherwise adapt.
6. **Adapt only for spec compliance.** Edit `TASKS_JSON` directly: append gap tasks/subtasks with `status: "pending"`, mark obsolete work `skipped`, and add learned context to future tasks. If parent ids, titles, dependencies, or wave membership change, update only affected `Wave Plan` / `Parent Task Index` rows in `EXECUTE_INDEX`, then re-read the index. No nice-to-haves; no scope expansion.
7. **Next wave.** Recompute pending status from `TASKS_JSON` projections, gather prior completion reports into `## Prior-Wave Context`, repeat.

**Cross-wave validate.** `@analyst` runs `Skill(caspar-validate)` (`caspar-validate`) narrowed to: cross-wave integration audit, scope-creep audit, and dead-computation sweep over the cumulative diff. Pass `SCOPE_DOCS` plus `TASKS_JSON`; do not use `execute.md` as the validation source. High-priority gaps → dispatch `@dev` to fix.

## Outputs + DONE

- Complete implementation, committed per parent task.
- `TASKS_JSON` statuses reflect completed/skipped/adapted work and parse after final write.
- `{OUT_DIR}/test_guide.md` or `{OUT_DIR}/testing/{branch}_test_guide.md` from `Skill(caspar-create_test_guide)`.
- Completion summary: tasks done · waves · per-wave fix-loop counts · validation status · test-guide path · Task Evolution Summary · E2E Gaps Addressed · Unresolved Findings.
- **DONE when:** every wave passed 3a→3b→3c→3d; all planned tasks are `done`/`skipped`; cross-wave validate is clean or gaps fixed; test guide written; summary returned.

## Handoff

Report the summary inline (counts, fix-loop iterations, unresolved findings, test-guide path), then suggest next:

- `caspar-clean` — remove dead code/artifacts left by the build
- `caspar-test` — strengthen automated tests
- `caspar-rebase` — tidy history before merge

## Escalate-If

- `execute.md` missing, missing required sections, or cannot resolve/parse `tasks.json` → stop; route to `caspar-create_tasks`.
- A subagent prompt slice contains unrelated parent task ids → fix the slice before dispatch.
- Fix loop hits cap, a hash recurs, or a circuit breaker trips → halt and surface; do not force past it.
- Deterministic pre-gate cannot pass → fix before review; never advance a red wave.

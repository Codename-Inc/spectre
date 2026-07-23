---
name: "spectre-execute"
description: "Build a planned feature from either a compact execute.md/tasks.json work source or an explicit readable plan, dispatching parallel task waves through deterministic checks, lightweight sentinel review, and final adversarial review/validation. Trigger after structured task artifacts or an executable plan exist, or to resume a partial run. Do NOT trigger for scoping/planning, unplanned bug-fixing, or dead-code cleanup (spectre-prune)."
user-invocable: true
---

# execute

Execute work in parallel waves without loading or generating an exhaustive task graph in primary-agent context. Resolve structured task artifacts before generic plan input, verify each wave before advancing, adapt only for source-backed compliance, run final adversarial review/validation over the cumulative diff, and emit a manual test guide.

## Inputs

- `$ARGUMENTS` — optional path to an execute index or wave/scope hints.
- Plan-direct input may also provide an explicit readable plan path and optional `target_dir`.
- **Structured mode:** an explicit valid execute index with a resolvable `tasks.json`; preserve the existing indexed-task workflow.
- **Plan-direct mode:** an explicit argument naming another readable plan document; resolve it as `PLAN_SOURCE`. Plan-direct mode never routes to `/spectre:create_tasks`.
- **No-argument execution:** resolve the default `docs/tasks/{branch}/specs/execute.md`; when that structured artifact or its task detail is missing/malformed, stop and route to `/spectre:create_tasks`.

## Working Set

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`); `OUT_DIR = target_dir || docs/tasks/{branch}`.
- Resolve an explicit readable path in precedence order:
  1. If it has execute-index structure and resolves an existing, parseable task detail file by the rules below, set `MODE = structured`, `EXECUTE_INDEX = arg path`, and `TASKS_JSON` to that file.
  2. If it has execute-index structure but task detail cannot be resolved or parsed, keep it in structured mode and use the structured missing-artifact escalation; do not reinterpret a broken execute index as a generic plan.
  3. Otherwise set `MODE = plan-direct` and `PLAN_SOURCE = arg path`. Generic readable-plan detection happens only after structured resolution.
- With no explicit path, set `MODE = structured` and `EXECUTE_INDEX = {OUT_DIR}/specs/execute.md`.
- Resolve structured `TASKS_JSON`:
  1. Use `## Task Detail Source` line `Tasks JSON: <path>` when present.
  2. Else if index basename is `execute.md`, use adjacent `tasks.json`.
  3. Else if basename ends `.execute.md`, use sibling `.tasks.json`.
  4. Otherwise stop and ask for the matching task detail JSON path.
- In structured mode, `SCOPE_DOCS` = existing paths listed in the execute index `## Document Manifest`. In plan-direct mode, `SCOPE_DOCS` = existing readable scope/UX/research paths explicitly referenced by `PLAN_SOURCE`, else an empty list; record them under **Source Plan**.
- Plan-direct `EXECUTION_STATE`:
  - When `PLAN_SOURCE` is inside a Spectre task directory, use `{dirname(PLAN_SOURCE)}/execution_state.md`; otherwise use `{OUT_DIR}/execution_state.md`.
  - If that path records a different source-plan path, use `{plan-stem}-{short-sha256-of-plan-path}.execution_state.md`.
- Wave diff per gate: `git diff <parent-of-first-wave-commit>..HEAD`; files-touched manifest; structured mode uses verbatim ACs/context from the selected parent-task slice, while plan-direct mode uses transient verbatim source-anchored plan text for the active-wave workstreams.

## Method / guardrails

**Resolve + load the selected work source.**
- Structured mode is unchanged: read `EXECUTE_INDEX` whole as the token-efficient orchestration index. Do **not** read `TASKS_JSON` whole; use targeted parsing only for status projection, selected parent-task slices, reviewer criteria/context slices, and status updates. After any JSON write, re-parse `TASKS_JSON` before planning the next wave.
- Plan-direct mode begins execution without a plan-quality, approval, completeness, or Spectre-format gate. The source plan is the sole requirements authority. Never rewrite the source plan; do not edit, repair, approve, or reject it.
- Before the first dev dispatch, create or resume `execution_state.md` with exactly these seven sections:
  1. **Source Plan** — canonical path; `sha256` of the full source-plan bytes; recorded byte length; Git HEAD at capture; mode; baseline Git SHA; resolved `SCOPE_DOCS`; and pointer-only anchors for objective, boundaries, phases/workstreams, and verification signals. Include the sentence `The source plan is the sole requirements authority.`
  2. **Runtime Status** — pending/running/blocked/done, current and last-completed waves, timestamps, current HEAD, and coarse-map coverage over the source plan. Derive cumulative diff only as `baseline..HEAD`.
  3. **Workstream & Parallelization Map** — one coarse row for every plan-native phase/workstream/work item at initial creation, with source anchor, status, dependencies/shared contracts/change surfaces, and ready/deferred/parallel-safe/sequential rationale. No fixed workstream count is imposed.
  4. **Active Wave** — only the currently dispatchable bounded assignments, owners, plan anchors, expected outputs/consumers/replacements, and verification signals.
  5. **Wave History** — completed assignments, commits, changed files, deterministic checks/results, sentinel classification/result, repair count, and E2E completeness signal.
  6. **Plan-Backed Adaptations** — discovered gap, source-plan relationship, disposition, and affected future workstream.
  7. **Final Quality State** — code-review report/verdict, validation report/status, test-guide path, unresolved findings, and normal proof-handoff state.
- The initial map must coarsely cover every plan-native workstream, preserving plan names and source order unless dependency evidence requires documented reordering. Keep detailed assignment content only in **Active Wave**; do not create a parallel JSON task graph, enumerate future subtasks, generate exhaustive acceptance criteria, or durably copy plan excerpts. Stop decomposing as soon as the next safe wave can be dispatched.
- Before resume, recompute `sha256` over the full source-plan bytes and compare the recorded byte length. If unchanged, continue from `EXECUTION_STATE`. If changed, treat the current plan as authoritative, refresh only affected derivative mappings, preserve **Wave History**, and record the reconciliation. Resume/adaptation updates only derivative state and never rewrites the plan.
- Re-read `EXECUTION_STATE` before each wave and update it after every dispatch/gate/adaptation.

**Adaptive wave loop** — until the selected mode's completion projection is satisfied:

1. **Batch.**
   - Structured mode: use the execute index's Wave Plan + Parent Task Index to choose pending parent ids. Assign <=3 sequential parent tasks per `@spectre:dev`; batches may span phases when wave guidance allows. End a batch before any dependency boundary.
   - Plan-direct mode: select dependency-ready pending workstreams from the complete coarse map. Detail bounded assignments for the **Active Wave** only. Dispatch in parallel only when dependency, shared-contract, and likely change-surface evidence supports it; sequential execution is valid and its rationale is recorded.
2. **Dispatch wave.** Launch parallel `@spectre:dev` (one per batch).
   - Structured mode: extract only the selected parent task ids from `TASKS_JSON` using `jq`, `node -e`, or targeted read/edit mechanics. Include minimal phase labels plus assigned parents, subtasks, ACs, context, and status fields. Inline that slice under `<task_assignment>` and self-check that the prompt contains selected parent ids and no unrelated parent ids.
   - Plan-direct mode: build `<task_assignment>` from `PLAN_SOURCE` plus the exact **Active Wave** slice. Include transient verbatim source-anchored plan text for the active-wave workstreams, bounded outputs/consumers/replacements, and verification signals. Never persist that plan text in `EXECUTION_STATE`.
   - `@spectre:dev` receives: `<task_assignment>`, `SCOPE_DOCS` paths, and waves 2+ **Prior-Wave Context**; in plan-direct mode it also receives `PLAN_SOURCE`. It MUST read scope docs first, use `<task_assignment>` as the only task source, and **not read any tasks file**.
   - Then it loads `@skill-spectre:spectre-tdd`, executes the bounded assignment sequentially with red/green TDD, commits after each structured parent task or plan-direct workstream assignment, uses native related-test commands, and returns compressed **Implementation Insights** + **E2E Completeness Check**.
   - E2E signal: ⚪ Complete · 🟡 Gap [missing functionality] · 🔴 Blocker [needs other-task changes].
3. **Per-wave verification gate** (order is load-bearing):
   - **3a — Deterministic pre-gate:** detect and run lint/typecheck/build from `package.json`/`pyproject.toml`/`Cargo.toml`/`Makefile`; fix until green. Never invoke reviewers while deterministic checks fail.
   - **3b — Sentinel selector:** classify the wave before reviewer dispatch:
     - `skip`: deterministic checks passed; isolated implementation; no downstream dependency; no shared contract, replaced path, or E2E gap. Do not dispatch a reviewer; record `sentinel_review: skipped`.
     - `wiring`: default when the wave adds the first vertical slice, touches UI/data/control-flow integration, produces output consumed by later tasks, replaces an old path, exposes a feature, or reports 🟡/🔴 E2E status.
     - `risk`: use only when touched code involves auth, permissions, payments, PII, migrations, public APIs, secrets, network input, destructive actions, or data correctness.
     - If unsure, choose `wiring` rather than dual review.
   - **3c — Lightweight sentinel review:** dispatch at most one `@spectre:reviewer` only for `wiring` or `risk`. Build the prompt only from wave diff, files manifest, relevant scope docs, and the mode-specific requirements source: verbatim ACs/context from the selected slice in structured mode, or the same transient verbatim source-anchored plan text for the active-wave workstreams in plan-direct mode. Forbidden: dev reports, implementer rationale, orchestrator paraphrase.
     - `wiring` lens: Defined -> Connected -> Reachable; grep usage, trace UI/API render or call path backward, flag dead computations, orphaned outputs, duplicate data sources, and old active paths.
     - `risk` lens: security + correctness, including scope adherence for the risk surface.
     - Reviewer output must be either `CLEAN` or CRITICAL/HIGH findings only. No Medium/Low/nits/style/speculative architecture. Every finding must include `file:line`, reproducible failure/exploit scenario, concrete evidence chain, smallest scope-safe fix shape, and `sha256(file_path + line + finding_category)`. No evidence chain means `CLEAN`.
   - **3d — Bounded fix loop:** CRITICAL/HIGH findings get <=3 fix waves. Reappearing hash = reviewer disagreement; escalate and do not re-queue. Halt on test-file changes >0.5x implementation-file changes or cumulative fix diff growth >25% per iteration. Re-run 3a, then re-run 3b/3c only when the selector still requires sentinel review after fixes.
   - **3e — Exit:** deterministic checks pass and no required sentinel CRITICAL/HIGH remains, or cap reached and user notified.
4. **Mark complete.** In structured mode, edit `TASKS_JSON` status fields for assigned subtasks/parents to `done`, preserve indented valid JSON, and re-parse immediately. In plan-direct mode, update mapped workstream status plus checks, sentinel result, commits/files, and the E2E signal in `EXECUTION_STATE`.
5. **Reflect.** Read completion reports for scope signals and E2E gaps. All ⚪ → next wave. Otherwise adapt.
6. **Adapt only for source compliance.**
   - Structured mode: edit `TASKS_JSON` directly to append gap tasks/subtasks with `status: "pending"`, mark obsolete work `skipped`, and add learned context to future tasks. If parent ids, titles, dependencies, or wave membership change, update only affected `Wave Plan` / `Parent Task Index` rows in `EXECUTE_INDEX`, then re-read the index.
   - Plan-direct mode: add or split derivative work only when demonstrably required for a `PLAN_SOURCE` outcome. Record its source-plan relationship under **Plan-Backed Adaptations** and update only affected map rows/future assignments. Never rewrite the plan or add a nice-to-have.
7. **Next wave.** Structured mode recomputes pending status from `TASKS_JSON` projections. Plan-direct mode re-reads `EXECUTION_STATE`, clears completed **Active Wave** detail into **Wave History**, and derives only the next safe assignments. Gather prior completion reports into `## Prior-Wave Context`, then repeat.

**Final adversarial code review + validate.** After the mode-specific work projection is `done`/`skipped` and deterministic checks pass, run the expensive review once over the cumulative feature diff:
- Run `Skill(spectre-code_review)` with `{OUT_DIR} --orchestrated` over the cumulative diff. That skill owns the pinned high-effort opposing-runtime reviewer, same-contract native fallback, adversarial lenses, evidence rules, and saved report.
- Structured-mode reviewer inputs are limited to cumulative diff, files-touched manifest, `SCOPE_DOCS`, and relevant `TASKS_JSON` slices. Plan-direct mode passes the source plan plus relevant execution-state evidence instead of `tasks.json` slices; `PLAN_SOURCE` remains requirements authority and `EXECUTION_STATE` is routing/evidence only. Do not use dev reports or implementer rationale as evidence.
- Read the saved report. CRITICAL/HIGH findings enter the bounded fix loop; Medium/Low findings are summarized but do not block completion unless the user asks.
- Then `@spectre:analyst` runs `Skill(spectre-validate)` (`/spectre:validate`) narrowed to cross-wave integration audit, scope-creep audit, and dead-computation sweep over the cumulative diff. Pass `SCOPE_DOCS` plus `TASKS_JSON` in structured mode, or `PLAN_SOURCE` plus relevant `EXECUTION_STATE` sections in plan-direct mode; do not use `execute.md` or derivative state as the validation requirements source.
- High-priority review or validation gaps → dispatch `@spectre:dev` to fix, rerun deterministic checks, then rerun `Skill(spectre-code_review)` or only the affected validation check.
- In plan-direct mode, write each final review, validation, and test-guide result to **Final Quality State** without copying requirements from `PLAN_SOURCE`.

## Outputs + DONE

- Complete implementation, committed per structured parent task or plan-direct workstream assignment.
- Structured mode: `TASKS_JSON` statuses reflect completed/skipped/adapted work and parse after final write.
- Plan-direct mode: `EXECUTION_STATE` retains pointer-only plan anchors, complete coarse-map/adaptation statuses, wave history, and final quality evidence.
- `{OUT_DIR}/test_guide.md` or `{OUT_DIR}/testing/{branch}_test_guide.md` from `Skill(spectre-create_test_guide)`.
- Completion summary: tasks done · waves · sentinel review counts (`skip`/`wiring`/`risk`) · per-wave fix-loop counts · final review status · validation status · test-guide path · Task Evolution Summary · E2E Gaps Addressed · Unresolved Findings.
- **Structured DONE:** every structured task is `done`/`skipped`.
- **Plan-direct DONE:** every plan-native workstream in the initial coarse map plus every recorded adaptation is `done`/`skipped`, and **Runtime Status** states the map's source-plan coverage.
- **DONE when:** the selected mode's completion rule holds; every wave passed deterministic checks plus any required sentinel review; final adversarial review and cross-wave validate are clean or gaps fixed/accepted; test guide written; summary returned.

## Handoff

Report the summary inline (counts, fix-loop iterations, unresolved findings, test-guide path), then suggest next:

- `/spectre:clean` — run prune + risk-based tests + sweep/commit
- `/spectre:test` — strengthen automated tests
- `/spectre:rebase` — tidy history before merge

## Escalate-If

- In structured or no-argument mode, `execute.md` missing/malformed or `tasks.json` unresolved/unparseable → stop; route to `/spectre:create_tasks`.
- In plan-direct mode, an unreadable source or a genuine execution-time blocker → report the blocker against the authoritative plan; never route to `/spectre:create_tasks` or introduce a plan-completeness gate.
- A subagent prompt slice contains unrelated parent task ids → fix the slice before dispatch.
- Fix loop hits cap, a hash recurs, or a circuit breaker trips → halt and surface; do not force past it.
- Deterministic pre-gate cannot pass → fix before review; never advance a red wave.

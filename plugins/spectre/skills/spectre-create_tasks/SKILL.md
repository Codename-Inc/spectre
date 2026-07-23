---
name: "spectre-create_tasks"
description: "Break requirements into executable task artifacts: a compact execute.md index plus sliceable tasks.json detail with typed acceptance criteria, RED-test pairing, and dependency waves. Trigger after scope/plan when you need concrete build tasks before execute. Do NOT trigger to set scope, design architecture, or run implementation."
user-invocable: true
---

# create_tasks

Transform requirements into two execution artifacts: `execute.md` for primary-agent orchestration and `tasks.json` for full task detail/status. The executor reads the index whole and slices JSON detail by parent task id; it never pays the token cost of the entire task graph.

## Inputs

- `$ARGUMENTS` — explicit feature name/root or descendant requirements artifact; may carry `--depth` (`light` | `standard` | `comprehensive`, default `standard`). Read explicit artifact paths first.
- Planning artifacts in `FEATURE_ROOT`, read fully: `concepts/scope.md` / `task_summary.md`, `specs/prd.md`, `specs/plan.md`, `specs/ux.md`, `task_context.md`, `research/*.md`. Plan **Out-of-Bounds** and **Verification** entries are load-bearing.
- If requirements are too thin to extract scope → ask, or route to `/spectre:plan`; do not invent scope.

## Working Set

- Resolve `FEATURE_ROOT` in this exact order: (1) an explicit feature directory or feature name; (2) a supplied artifact beneath the feature root; (3) one unambiguous feature artifact already present in the current thread. A name maps to `.spectre/features/<feature-name>/`. If resolution is absent or ambiguous, ask for the feature name/path.
- Never use branch name, modification time, lifecycle completeness, or directory scanning to infer a feature. Arbitrary output roots are invalid for new canonical artifacts.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged to every routed child; a child never rederives it.
- An explicit legacy `docs/tasks/**` artifact remains a readable input, but do not move or bulk-rewrite it. Require a confirmed `.spectre/features/<feature-name>/` root for new canonical documents and record the legacy source in the document manifest.
- Ensure `{FEATURE_ROOT}/specs` exists.
- Default pair: `EXECUTE_FILE={FEATURE_ROOT}/specs/execute.md`, `DETAIL_FILE={FEATURE_ROOT}/specs/tasks.json`. If either exists for another feature, write a scoped pair with the same basename: `{name}.execute.md` + `{name}.tasks.json`.
- Reference fixtures: `references/execute.example.md`, `references/tasks.example.json`.
- Research only if plan/context do not name target files/patterns: dispatch `@spectre:finder`, `@spectre:analyst`, `@spectre:patterns`; fold returns into `task_context.md` `## Technical Research`. Skip for LIGHT or clear single-component scope.

## Method / guardrails

1. **Extract requirements** from artifacts + thread. Number REQ-001…; capture in-scope, out-of-scope, constraints. **STRICT COMPLIANCE:** tasks deliver only explicit scope.
2. **Hierarchy:** Phase → Parent task → Subtask → Acceptance criteria. Number 1 → 1.1 → 1.1.1. Every parent declares `predecessor` and `unblocks`.
3. **Phase 0:** include when the plan adds external deps; always include for COMPREHENSIVE. Verify package/version/API assumptions before implementation.
4. **Integration-aware:** every build subtask names `produces`, `consumed_by`, and `replaces`; add wiring/cleanup tasks where needed. No orphaned outputs.
5. **Acceptance criteria:** each criterion is exactly one executable type: `test`, `observable`, or `state`. Use 2-3 criteria per subtask; no prose like "works correctly".
6. **RED pairing:** STANDARD/COMPREHENSIVE behavior changes get a preceding RED subtask; LIGHT only when risky/ambiguous/regression-prone.
7. **Size cap:** split a subtask if it touches >3 files, has >5 criteria, implies >~200 LOC, requires mid-task scope judgment, or spans multiple concerns.
8. **Context payload:** STANDARD/COMPREHENSIVE subtasks carry 2-4 file:line refs + one canonical pattern ref + one plan anchor; LIGHT uses 1-2 refs + a plan anchor. Avoid snippets and step-by-step code instructions.
9. **Validate before writing:** every REQ maps to tasks; every plan Verification signal maps to a criterion; every build output has a consumer; no task implements Out-of-Bounds.
10. **Dependency analysis:** derive sequential order and parallel waves at parent-task granularity. Phases are organizational; waves may span phases when dependencies allow.

**Depth contract:** LIGHT = compact graph, 1-3 parents, Phase 0 only for new deps, RED only when risky, waves optional. STANDARD = normal graph with concise sequencing. COMPREHENSIVE = full graph with Phase 0, context payloads, RED pairing, coverage matrix, and waves.

## Artifact Contract

Write **both** files. This is a hard cutover: do not emit `tasks.md`, and do not create a Markdown fallback/converter.

### `tasks.json`

- Save indented JSON to `DETAIL_FILE`; re-parse it after writing:
  `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$DETAIL_FILE"`
- Top-level keys are exactly `meta` and `phases`.
- `tasks.json` is self-locating: `meta.feature` is the physical feature-directory name and `meta.feature_root` is its repo-relative root.
- `meta` contains: `feature`, `feature_root`, `generated_at`, `schema_version`, `objective`, `scope`, `out_of_bounds`, `requirements_trace`, `architecture_context`, `coverage_summary`.
- `phases[]` contains phase objects with parent tasks and subtasks; mutable status lives only here.
- Do **not** store `index`, `indexes`, `wave_plan`, or `waves` in JSON. Cheap orchestration metadata belongs in `execute.md`.
- Status enum: `pending`, `in_progress`, `done`, `skipped`.
- Preserve task fields:
  - Phase: `id`, `title`, `summary`, `status`, `parents[]`
  - Parent: `id`, `title`, `description`, `status`, `predecessor`, `unblocks`, `subtasks[]`
  - Subtask: `id`, `title`, `type`, `status`, `produces`, `consumed_by`, `replaces`, `context[]`, optional `predecessor`, `acceptance_criteria[]`
  - Context item: `path`, `anchor`, `note`
  - Acceptance criterion: `type` (`test` | `observable` | `state`) and `text`

### `execute.md`

- Save Markdown to `EXECUTE_FILE`; it is safe for the primary executor to read whole.
- `execute.md` begins immediately below its title with:
  ```text
  Feature: <feature-name>
  Feature Root: .spectre/features/<feature-name>
  ```
- Required sections: `Document Manifest`, `Task Detail Source`, `Execution Summary`, `Wave Plan`, `Parent Task Index`, `Slicing Rules`.
- `Document Manifest` lists only actual discovered scope/UX/prototype/plan/research/PRD paths. Intra-feature entries are relative to `FEATURE_ROOT`; repository implementation-file references remain repo-relative.
- `Task Detail Source` lists the task JSON path relative to `FEATURE_ROOT`, declares `FEATURE_ROOT`, and says not to read it whole.
- `Execution Summary` counts phases, parent tasks, subtasks, and waves.
- `Wave Plan` includes each wave as an inline object with `id`, `label`, `parent_task_ids`, `after`, and `rationale`.
- `Parent Task Index` lists phase label plus parent `id`, `title`, `subtasks`, `predecessor`, and `unblocks`. Do not include task bodies, acceptance criteria, context payloads, or mutable status.
- Derive `Wave Plan` and `Parent Task Index` from the same in-memory task structure used for `tasks.json`.
- Slicing is by selected parent task ids, not phase. Batches may span phases when wave guidance and dependencies assign those parents to the same owner.

## Outputs + DONE

- `EXECUTE_FILE` exists and contains the six required sections.
- `DETAIL_FILE` exists and parses as JSON.
- Every REQ is covered; no out-of-scope additions; Out-of-Bounds carried into `meta.out_of_bounds`; every parent has predecessor/unblocks; every build subtask has producer/consumer/replaces; acceptance criteria use only the three executable types; RED pairing and context payloads follow depth; no subtask exceeds the size cap; every plan Verification entry maps to a criterion.
- The execute index tells downstream agents to use targeted parsing only: status projections, selected parent-task slices, reviewer criteria/context slices, and status updates.

## Handoff

Report inline: structure (`{X} phases, {Y} parents, {Z} subtasks`), execution shape (sequential steps / `{N}` waves), and paths for `EXECUTE_FILE` + `DETAIL_FILE`. If `--depth comprehensive`, suggest `/spectre:task_review`; otherwise suggest `/spectre:execute`.

## Escalate-If

- No requirements artifact and thread context is too thin → stop; route to `/spectre:scope` or `/spectre:plan`.
- `plan.md` has no Out-of-Bounds or Verification section → flag the gap; proceed only if scope is otherwise clear.
- A requirement cannot become an executable `test`/`observable`/`state` criterion → surface it instead of writing prose criteria.
- Scope tempts expansion beyond explicit request → stop and confirm before adding tasks.

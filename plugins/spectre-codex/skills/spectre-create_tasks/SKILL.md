---
name: "spectre-create_tasks"
description: "Break requirements into executable task artifacts: a compact execute.md index plus sliceable tasks.json detail with typed acceptance criteria, RED-test pairing, and dependency waves. Trigger after scope/plan when you need concrete build tasks before execute. Do NOT trigger to set scope, design architecture, or run implementation."
user-invocable: true
---

# create_tasks

Transform requirements into `tasks.json` for full task detail/status and `execute.md` for primary-agent orchestration. The invoking primary owns synthesis and directly writes the artifact selected by the mode; research agents return evidence only. Comprehensive orchestration finalizes the task graph before generating its index. The executor reads the index whole and slices JSON detail by parent task id; it never pays the token cost of the entire task graph.

## Inputs

- `$ARGUMENTS` — explicit feature name/root or descendant requirements artifact; may carry `--depth` (`light` | `standard` | `comprehensive`, default `standard`), `--tasks-only`, or `--finalize-index`. Read explicit artifact paths first. The two mode flags are mutually exclusive.
- Planning artifacts in `FEATURE_ROOT`, read fully: `concepts/scope.md` / `task_summary.md`, `specs/prd.md`, `specs/plan.md`, `specs/ux.md`, `task_context.md`, `research/*.md`. Plan **Out-of-Bounds** and **Verification** entries are load-bearing.
- If requirements are too thin to extract scope → ask, or route to `spectre-plan`; do not invent scope.

## Working Set

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged into the loaded skill context and every research prompt; never rederive it.
- An explicit legacy `docs/tasks/**` artifact remains a readable input, but do not move or bulk-rewrite it. Require a confirmed `.spectre/features/<feature-name>/` root for new canonical documents and record the legacy source in the document manifest.
- Ensure `{FEATURE_ROOT}/specs` exists.
- Default pair: `EXECUTE_FILE={FEATURE_ROOT}/specs/execute.md`, `DETAIL_FILE={FEATURE_ROOT}/specs/tasks.json`. If either exists for another feature, write a scoped pair with the same basename: `{name}.execute.md` + `{name}.tasks.json`.
- Reference fixtures: `references/execute.example.md`, `references/tasks.example.json`, and `references/legacy-continuation.example.json`.
- Research only if plan/context do not name target files/patterns: dispatch `@spectre_finder`, `@spectre_analyst`, `@spectre_patterns`. Research agents return evidence only and never write planning artifacts; the primary folds returns into `task_context.md` `## Technical Research`. Skip for LIGHT or clear single-component scope.

## Method / guardrails

1. **Extract requirements** from artifacts + thread. Number REQ-001…; capture in-scope, out-of-scope, constraints. **STRICT COMPLIANCE:** tasks deliver only explicit scope.
2. **Hierarchy:** Phase → Parent task → Subtask → Acceptance criteria. Number 1 → 1.1 → 1.1.1. Every parent declares `predecessor` and `unblocks`.
3. **Phase 0:** include only when the selected work has a real external dependency or capability precondition that must be verified before implementation. Planning depth alone never creates Phase 0.
4. **Integration-aware:** every build subtask names `produces`, `consumed_by`, and `replaces`; add wiring/cleanup tasks where needed. No orphaned outputs.
5. **Acceptance criteria:** each criterion is exactly one executable type: `test`, `observable`, or `state`. Use 2-3 criteria per subtask; no prose like "works correctly".
6. **RED pairing:** STANDARD/COMPREHENSIVE behavior changes get a preceding RED subtask; LIGHT only when risky/ambiguous/regression-prone.
7. **Size cap:** split a subtask if it touches >3 files, has >5 criteria, implies >~200 LOC, requires mid-task scope judgment, or spans multiple concerns.
8. **Context payload:** STANDARD/COMPREHENSIVE subtasks carry 2-4 file:line refs + one canonical pattern ref + one plan anchor; LIGHT uses 1-2 refs + a plan anchor. Avoid snippets and step-by-step code instructions.
9. **Validate before writing:** every REQ maps to tasks; every plan Verification signal maps to a criterion; every build output has a consumer; no task implements Out-of-Bounds.
10. **Dependency analysis:** derive sequential order and parallel waves at parent-task granularity. Phases are organizational; waves may span phases when dependencies allow.
11. **Risk annotation:** tag a parent crossing an auth/trust, persistence/migration, concurrency/order/retry, destructive, high-fan-out, or shared-contract boundary with `risk: <boundary>`; Execute routes model capability and briefing from it. Omit `risk` elsewhere.

**Depth contract:** LIGHT = compact graph, 1-3 parents, Phase 0 only for real preconditions, RED only when risky, waves optional. STANDARD = normal graph with concise sequencing. COMPREHENSIVE = full graph with context payloads, RED pairing, coverage matrix, semantic dependencies, and waves derived after review.

## Mode Contract

- **Default:** preserve compatible LIGHT/STANDARD/standalone behavior by authoring `tasks.json` and its `execute.md` index from the same in-memory graph.
- **`--tasks-only`:** author and reparse only `tasks.json`. Do not create, update, or require `execute.md`; semantic task review follows in comprehensive orchestration.
- **`--finalize-index`:** require an existing finalized `tasks.json`, read a compact structural projection only (`meta`, phase ids/titles, parent ids/titles, subtask ids, `predecessor`, `unblocks`, `risk`), derive counts and topological waves, and author `execute.md` once. Finalization must not revise task semantics or write `tasks.json`.

The primary directly writes the mode-selected artifact; never dispatch a subagent or external process to author or revise it. This is a hard cutover: do not emit `tasks.md`, and do not create a Markdown fallback/converter, task compiler, or persistent projection tool.

## Artifact Contract

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
  - Parent: `id`, `title`, `description`, `status`, `predecessor`, `unblocks`, optional `risk`, `subtasks[]`
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
- `Parent Task Index` lists phase label plus parent `id`, `title`, `subtasks`, `predecessor`, `unblocks`, and `risk` when present. Do not include task bodies, acceptance criteria, context payloads, or mutable status.
- In default mode, derive `Wave Plan` and `Parent Task Index` from the same in-memory task structure used for `tasks.json`. In `--finalize-index`, derive them only from the compact structural projection of final `tasks.json`.
- Slicing is by selected parent task ids, not phase. Batches may span phases when wave guidance and dependencies assign those parents to the same owner.

## Outputs + DONE

- Default mode: `EXECUTE_FILE` exists, contains Feature/Feature Root metadata and the six required sections; `DETAIL_FILE` exists and parses.
- `--tasks-only`: only `DETAIL_FILE` is required; it parses as JSON and contains matching `meta.feature` / `meta.feature_root`.
- `--finalize-index`: the existing `DETAIL_FILE` remains byte-for-byte unchanged; `EXECUTE_FILE` contains the six required sections and matches the final graph's counts, parent index, and dependency waves.
- Every REQ is covered; no out-of-scope additions; Out-of-Bounds carried into `meta.out_of_bounds`; every parent has predecessor/unblocks; every build subtask has producer/consumer/replaces; acceptance criteria use only the three executable types; RED pairing and context payloads follow depth; no subtask exceeds the size cap; every plan Verification entry maps to a criterion.
- The execute index tells downstream agents to use targeted parsing only: status projections, selected parent-task slices, reviewer criteria/context slices, and status updates.

## Handoff

Report inline: structure (`{X} phases, {Y} parents, {Z} subtasks`), the active mode, and paths actually written. Include execution shape (`{N}` waves) only when `EXECUTE_FILE` was finalized.

- **`--orchestrated`:** return the report and any routing signal to the caller without user-facing Next Steps.
- **Standalone:** choose the first applicable route:
  1. Task extraction exposed load-bearing user-facing behavior with no adequate UX/prototype acceptance source → `spectre-ux` when behavior is unresolved, otherwise `spectre-prototype`; require task regeneration afterward.
  2. `--depth comprehensive` + `--tasks-only` → `spectre-task_review`.
  3. Otherwise → `spectre-execute`.

Render one primary recommendation tied to the observed task/artifact state. Add at most one conditional alternative: `spectre-goal` only when plan/review artifacts are finalized and autonomous execute→proof is wanted. If stopping after standalone task generation, offer `Pause: spectre-handoff {feature}` with both artifact paths and the selected next step.

## Escalate-If

- The source `plan.md` records `Execution Mode: direct` → stop and surface that the plan was routed to plan-direct execution; generate task artifacts only on the user's explicit structured re-route, and update the header to `Execution Mode: structured` before writing them.
- No requirements artifact and thread context is too thin → stop; route to `spectre-scope` or `spectre-plan`.
- `plan.md` has no Out-of-Bounds or Verification section → flag the gap; proceed only if scope is otherwise clear.
- A requirement cannot become an executable `test`/`observable`/`state` criterion → surface it instead of writing prose criteria.
- Scope tempts expansion beyond explicit request → stop and confirm before adding tasks.

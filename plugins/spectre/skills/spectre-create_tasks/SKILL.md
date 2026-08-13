---
name: "spectre-create_tasks"
description: "Translate scoped requirements and a plan into tasks.json plus a compact execute.md index with dependency waves, typed criteria, and RED pairing. Use before structured execution; do not use for scope, architecture, task review, or implementation."
user-invocable: true
---

# create_tasks

## Purpose

Produce a scope-faithful, sliceable task graph and cheap execution index. The primary owns synthesis and writes; research agents supply evidence only.

## Inputs

- `$ARGUMENTS`: explicit feature root/name or descendant requirements artifact; `--depth xs|light|standard|comprehensive` (default `standard`); mutually exclusive `--tasks-only` or `--finalize-index`; optional `--orchestrated`.
- Read the selected root's scope/summary, PRD, plan, UX, context, and research artifacts in full. Plan `Out-of-Bounds` and `Verification` are load-bearing. Thin requirements route to `/spectre:plan`; never invent scope.

## Working Set

- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `@skill-spectre:spectre-feature-root` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Repair stale feature/root metadata in artifacts this workflow touches.
- Ensure `{FEATURE_ROOT}/specs`. Default pair: `EXECUTE_FILE={FEATURE_ROOT}/specs/execute.md`, `DETAIL_FILE={FEATURE_ROOT}/specs/tasks.json`; use same-basename feature-scoped pairs on collision. Fixtures: `references/tasks.example.json`, `execute.example.md`.
- When plan/context omit target files or patterns, use read-only `@spectre:finder`, `@spectre:analyst`, and `@spectre:patterns` as needed; skip for LIGHT or clear single-component work. Agents return <=2,000-token evidence; the primary folds accepted evidence into `task_context.md`.

## Outputs + DONE

`tasks.json` is indented, reparsed JSON with exactly `meta` and `phases` top-level keys:

- `meta`: `feature`, `feature_root`, `generated_at`, `schema_version`, `objective`, `scope`, `out_of_bounds`, `requirements_trace`, `architecture_context`, `coverage_summary`.
- Phase: `id`, `title`, `summary`, `status`, `parents[]`.
- Parent: `id`, `title`, `description`, `status`, `predecessor`, `unblocks`, optional `risk`, `subtasks[]`.
- Subtask: `id`, `title`, `type`, `status`, `produces`, `consumed_by`, `replaces`, `context[]`, optional `predecessor`, `acceptance_criteria[]`.
- Context: `path`, `anchor`, `note`. Criterion: `type` (`test|observable|state`), `text`. Status: `pending|in_progress|done|skipped`.
- Mutable status exists only in phases; `index`, `indexes`, `wave_plan`, and `waves` belong only in `execute.md`.

`execute.md` begins below its title with `Feature:` and `Feature Root:` and contains `Document Manifest`, `Task Detail Source`, `Execution Summary`, `Wave Plan`, `Parent Task Index`, and `Slicing Rules`. It lists only discovered artifacts, declares the root and root-relative JSON path, tells executors not to read JSON whole, reports graph counts, and indexes parents without bodies, criteria, context, or status. Each wave has `id`, `label`, `parent_task_ids`, `after`, `rationale`; slicing is by parent id and may span phases.

DONE when the mode-selected files satisfy these contracts; `tasks.json` reparses and self-locates; every REQ and plan Verification signal maps to a task/criterion; the Out-of-Bounds banner is preserved in `meta.out_of_bounds` and no task violates it; every parent has `predecessor`/`unblocks`; every build subtask has `produces`/`consumed_by`/`replaces`; criteria use only the three executable types; RED/context/size rules hold; every output has a consumer; and the index supports targeted projections, slices, review reads, and status updates.

## Method / guardrails

1. Build `Phase -> Parent -> Subtask -> Acceptance criterion` ids (`1`, `1.1`, `1.1.1`) from numbered REQs. **STRICT COMPLIANCE:** deliver only explicit scope.
2. Phase 0 exists only for a real external dependency or capability precondition that must be verified before implementation; depth alone never creates it.
3. Use 2-3 single-purpose criteria per subtask. Split when work touches >3 files, has >5 criteria, implies >~200 LOC, spans concerns, or requires mid-task scope judgment.
4. Pair preceding RED subtasks for STANDARD/COMPREHENSIVE behavior changes; LIGHT requires RED when risky, ambiguous, or regression-prone.
5. Context is 2-4 file:line references plus one canonical pattern and one plan anchor for STANDARD/COMPREHENSIVE; LIGHT uses 1-2 references plus a plan anchor. Provide evidence, not snippets or implementation scripts.
6. Mark parent `risk` only for auth/trust, persistence/migration, concurrency/order/retry, destructive, high-fan-out, or shared-contract boundaries. Derive semantic predecessor/unblocks edges and topological waves at parent granularity; phases are organizational.
7. Execution slicing only: size/depth caps shape task granularity after a plan already exists. This workflow never derives Plan size, acts as a Plan classifier, or overrides `spectre-plan-route`. `xs` = one parent for one direct handoff that was explicitly rerouted to structured; `light` = 1-3 parents, compact graph, optional waves; `standard` = normal concise graph; `comprehensive` = full context, RED, coverage, semantic dependencies, and post-review waves.
8. Validate coverage, verification mapping, integration consumers, dependencies, and Out-of-Bounds before writing. Address root causes; never encode vague criteria or orphan outputs.

**Mode contract**

- Default: write/reparse `tasks.json` and derive `execute.md` from the same in-memory graph.
- `--tasks-only`: write/reparse only `tasks.json`; semantic review follows comprehensive orchestration.
- `--finalize-index`: require finalized `tasks.json`; project only `meta`, phase ids/titles, parent ids/titles, subtask ids, `predecessor`, `unblocks`, and `risk`; leave JSON byte-for-byte unchanged; derive counts/index/topological waves into `execute.md` once.

The primary directly writes only the selected canonical artifacts. Do not delegate their authorship/revision or emit `tasks.md`, fallbacks, converters, compilers, or persistent projections.

## Handoff

Report mode, written paths, and `{X} phases, {Y} parents, {Z} subtasks`; add `{N} waves` only for a finalized index. `--orchestrated` omits user-facing Next Steps. Standalone load-bearing user-facing behavior without adequate UX/prototype acceptance evidence routes to `/spectre:ux` if unresolved, else `/spectre:prototype`; regenerate tasks. Comprehensive `--tasks-only` routes to `/spectre:task_review`; otherwise route to `/spectre:execute`. Offer `/spectre:goal` only after finalized plan/review artifacts, plus a pause handoff when stopping.

## Escalate-If

- `plan.md` says `Execution Mode: direct` -> stop; require explicit structured re-route and update it before task writes.
- Requirements are too thin -> `/spectre:scope` or `/spectre:plan`.
- Out-of-Bounds or Verification is missing -> flag it; proceed only with otherwise-clear scope.
- A requirement cannot become an executable `test|observable|state` criterion -> surface it.
- Any task would expand scope -> stop for confirmation.

Next step: follow the mode- and state-specific handoff above.

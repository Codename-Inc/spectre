---
name: "spectre-create_tasks"
description: "Translate scoped requirements and a plan into tasks.json plus a compact execute.md index with dependency waves, typed criteria, and RED pairing. Use before structured execution; do not use for scope, architecture, task review, or implementation."
user-invocable: true
---

# create_tasks

## Purpose

Produce a scope-faithful task graph and compact execution index. The primary writes; research agents supply evidence only.

## Inputs

- `$ARGUMENTS`: explicit feature root/name or descendant requirements artifact; `--depth xs|light|standard|comprehensive` (default `standard`); mutually exclusive `--tasks-only` or `--finalize-index`; optional `--orchestrated`. Execute may supply finalized plan path/hash and closed-review evidence plus depth for a reviewed selected plan.
- Read selected scope/summary, PRD, plan, UX, context, and research in full. Plan `Out-of-Bounds` and `Verification` are load-bearing. Thin requirements route to `/spectre:plan`; never invent scope.

## Working Set

- Reuse a managed `FEATURE_ROOT` only when explicit/current-thread evidence ties it to this work (physical directory wins; never branch/recency/lifecycle/scans); distinct work ignores ambient roots. Otherwise, including on collision, standalone MUST first load and follow `@skill-spectre:spectre-feature-root` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Repair stale feature/root metadata in artifacts this workflow touches.
- Ensure `{FEATURE_ROOT}/specs`. Default pair: `EXECUTE_FILE={FEATURE_ROOT}/specs/execute.md`, `DETAIL_FILE={FEATURE_ROOT}/specs/tasks.json`; use same-basename feature-scoped pairs on collision. Fixtures: `references/tasks.example.json`, `execute.example.md`.
- When targets/patterns are unclear, use read-only `@spectre:finder`, `@spectre:analyst`, or `@spectre:patterns`; skip for LIGHT/clear work. Agents return <=2,000 tokens; fold accepted evidence into `task_context.md`.

## Outputs + DONE

`tasks.json` is indented, reparsed JSON with exactly `meta` and `phases` top-level keys:

- `meta`: `feature`, `feature_root`, `generated_at`, `schema_version`, `objective`, `scope`, `out_of_bounds`, `requirements_trace`, `architecture_context`, `coverage_summary`.
- Phase: `id`, `title`, `summary`, `parents[]`.
- Parent: `id`, `title`, `description`, `predecessor`, `unblocks`, optional `risk`, `subtasks[]`.
- Subtask: `id`, `title`, `type`, `produces`, `consumed_by`, `replaces`, `context[]`, optional `predecessor`, `acceptance_criteria[]`.
- Context: `path`, `anchor`, `note`. Criterion: `type` (`test|observable|state`), `text`.
- Task definitions are immutable during Execute: no lifecycle status, run/check/evidence data, `index`, `indexes`, `wave_plan`, or `waves`. Execution progress lives only in the local workflow store.

`execute.md` starts with `Feature:`/`Feature Root:` and sections `Document Manifest`, `Task Detail Source`, `Execution Summary`, `Wave Plan`, `Parent Task Index`, `Slicing Rules`. It declares discovered artifacts/root/JSON path, graph counts, and parents without bodies/criteria/context/status; tells executors not to read JSON whole. Waves have `id`, `label`, `parent_task_ids`, `after`, `rationale`; slicing may span phases.

DONE when files satisfy these contracts; `tasks.json` reparses/self-locates; every REQ/Verification signal maps to a criterion; `meta.out_of_bounds` is preserved and obeyed; every parent has `predecessor`/`unblocks`; every build has `produces`/`consumed_by`/`replaces`; criteria, RED/context/slicing, consumers, and targeted index reads are valid.

## Method / guardrails

1. Build `Phase -> Parent -> Subtask -> Acceptance criterion` ids (`1`, `1.1`, `1.1.1`) from numbered REQs. **STRICT COMPLIANCE:** deliver only explicit scope.
2. Phase 0 exists only for a real external dependency or capability precondition that must be verified before implementation; depth alone never creates it.
3. Use 2-3 single-purpose criteria per subtask. Split on an independently implementable outcome, dependency edge, ownership boundary, or required mid-task scope judgment; file/LOC size is a warning, never a split by itself.
4. Put RED-before-GREEN in each behavior-changing build subtask. Create a separate RED subtask only when its failing contract/fixture is independently dispatchable and consumed by later work; LIGHT requires RED when risky, ambiguous, or regression-prone.
5. Context is 2-4 file:line references plus one canonical pattern and one plan anchor for STANDARD/COMPREHENSIVE; LIGHT uses 1-2 references plus a plan anchor. Provide evidence, not snippets or implementation scripts.
6. Mark parent `risk` only when a named threatened invariant and downstream consumer cross an auth/trust, persistence/migration, concurrency/order/retry, destructive, high-fan-out, or shared-contract boundary. Omit it when focused checks settle the risk. Derive semantic predecessor/unblocks edges and topological waves at parent granularity; phases are organizational.
7. Execution slicing only: depth shapes granularity after planning; this workflow never derives Plan size or overrides `spectre-plan-route`. `xs` = one explicitly rerouted parent; `light` = 1-3 parents/optional waves; `standard` = concise graph; `comprehensive` = full context, RED, coverage, semantic dependencies, post-review waves. When supplied finalized plan path/hash and closed-review evidence prove a reviewed selected plan, a legacy `Execution Mode: direct` header does not veto task creation.
8. Validate coverage, verification mapping, integration consumers, dependencies, and Out-of-Bounds before writing. Do not add terminal verification/E2E tasks for checks Execute or Prove owns; a qualification task is valid only when it produces an explicit prerequisite or product-consumed artifact at a product-owned path. Never encode vague criteria or orphan outputs.

**Mode contract**

- Default: write/reparse `tasks.json` and derive `execute.md` from the same in-memory graph.
- `--tasks-only`: write/reparse only `tasks.json`; semantic review follows comprehensive orchestration.
- `--finalize-index`: require finalized `tasks.json`; project only `meta`, phase ids/titles, parent ids/titles, subtask ids, `predecessor`, `unblocks`, and `risk`; leave JSON byte-for-byte unchanged; derive counts/index/topological waves into `execute.md` once.

Primary writes selected canonical artifacts only; never delegate authorship/revision or emit `tasks.md`, fallbacks, converters, compilers, or persistent projections.

## Handoff

Report mode/paths/graph; finalized index adds waves. `--orchestrated` returns without user-facing Next Steps.

| Handoff | Details |
|---|---|
| 🧭 **Current phase** | Done |
| 📦 **What was just done** | Result |
| ▶️ **Proposed next step** | Render resolved action; no placeholders. |

Standalone: load-bearing user-facing behavior without adequate UX/prototype acceptance evidence → UX or Prototype, regenerate; comprehensive tasks-only → Task Review; else Execute resolved absolute execute index + `--origin plan`; pause → Handoff.

## Escalate-If

- Standalone `plan.md` says `Execution Mode: direct` without supplied finalized plan path/hash and closed-review evidence -> stop; require explicit structured re-route before task writes.
- Requirements are too thin -> `/spectre:scope` or `/spectre:plan`.
- Out-of-Bounds or Verification is missing -> flag it; proceed only with otherwise-clear scope.
- A requirement cannot become an executable `test|observable|state` criterion -> surface it.
- Any task would expand scope -> stop for confirmation.

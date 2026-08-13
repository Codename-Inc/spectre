---
name: "spectre-plan-route"
description: "Internal semantic classifier and reclassifier for spectre-plan. Use only from Plan with a bounded routing input; do not invoke for planning, artifacts, telemetry, or user gates."
user-invocable: false
---

# plan-route

## Purpose

Return one deterministic `plan-routing/v1` decision to `spectre-plan`. This skill alone derives planning size; it never owns planning workflow authority.

## Inputs

- Immutable canonical Scope plus late-bound repository observations.
- Mode `initial`, or `observed` with the prior decision and the plan's `Routing Observations`.
- Observations describe semantic work, never a proposed size.
- Historical artifact or telemetry size is accepted only on resume, validated against the exact legacy enum, then normalized once.

## Working Set

- One bounded local scan supplied by Plan: work shape, uncertainty, evidence, changed protected boundaries, task-graph risk, and material user-owned decisions.
- If evidence is the only reason to cross a materially costlier route, use exactly one bounded classification probe with `@spectre:finder` or `@spectre:patterns` to answer one repository question.

## Outputs + DONE

Return one record with `schema: plan-routing/v1`; `shape: ATOMIC | DIRECT | STRUCTURED`; `uncertainty: LOW | MODERATE | HIGH`; `evidence: SUFFICIENT | PROBE_REQUIRED | PROBED`; `protected_boundaries[]: { type, threatened_invariant, failure_mode }`; `task_graph_risk: LOW | HIGH`; `design_authority_required` plus the material decision when true; `size`; `route`; one-sentence `rationale`; and, in observed mode, `regret_direction`, closed reason codes, and `recommendation: KEEP | RERUN_SMALLER | RERUN_LARGER`.

DONE when fields validate, any probe is consumed before deciding, and the table below alone determines size/route.

## Method / guardrails

| Semantic result | Size · route |
|---|---|
| ATOMIC + LOW + no changed protected boundary | XS · `XS_DIRECT` |
| ATOMIC + LOW + changed protected boundary OR DIRECT + LOW | S · `S_DIRECT` |
| ATOMIC/DIRECT + MODERATE/HIGH | M · `M_REVIEWED_DIRECT` |
| STRUCTURED + LOW/MODERATE + ordinary graph risk | L · `L_STRUCTURED` |
| STRUCTURED + HIGH uncertainty or HIGH task-graph risk | XL · `XL_REVIEWED_STRUCTURED` |

- A protected boundary exists only with both a concrete `threatened_invariant` and credible `failure_mode`. It makes work at least S and raises assurance, but never directly selects L or XL or manufactures a task graph.
- Missing evidence alone is not complexity. Use at most the one probe; if uncertainty remains, report it honestly.
- Design authority is true only for an unresolved material product, compatibility, destructive, migration/rollback, or long-term architecture decision; size never creates it.
- Initial and observed modes use the same table. Observed mode compares decisions and recommends KEEP, RERUN_SMALLER, or RERUN_LARGER; it never repeats work or removes artifacts.
- Legacy compatibility reads normalize `MICRO→XS`, `LIGHT→S`, `STANDARD-DIRECT→M`, `STANDARD→L`, `COMPREHENSIVE→XL` once; legacy labels never enter the decision table.
- Never use physical change volume or sensitive-domain keywords as size authority. Never invoke planning children, write artifacts, emit telemetry, or present gates.

## Handoff

Return only the validated record plus probe evidence when used. Plan owns persistence, explanation, orchestration, recommendations, gates, and telemetry.

## Escalate-If

- Canonical Scope is absent/conflicting, an enum is invalid, or a protected boundary lacks either required predicate.
- A material decision cannot be represented without user authority; return it as `design_authority_required`, never decide it.

---
name: "spectre-plan-route"
description: "Internal semantic classifier and reclassifier for spectre-plan. Use only from Plan with a bounded routing input; do not invoke for planning, artifacts, telemetry, or user gates."
user-invocable: false
---

# plan-route

## Purpose

Return a deterministic `plan-routing/v1` decision to `spectre-plan`. Classify only; Plan owns workflow authority.

## Inputs

- Immutable canonical Scope + bounded repository observations; observations describe work, never size.
- Mode `initial`, or `observed` with the prior decision + plan `Routing Observations`.
- Resume-only legacy size is validated and normalized once.

## Working Set

- Plan supplies one bounded scan: implementation topology, approach-changing uncertainty, evidence, protected boundaries, graph risk, and user-owned decisions.
- If missing evidence alone would cross a costlier route, use exactly one bounded probe with `@spectre_finder` or `@spectre_patterns` for one repository question.

## Outputs + DONE

Return `schema: plan-routing/v1`; `shape: ATOMIC|DIRECT|STRUCTURED`; `uncertainty: LOW|MODERATE|HIGH`; `evidence: SUFFICIENT|PROBE_REQUIRED|PROBED`; `protected_boundaries[]: { type, threatened_invariant, failure_mode }`; `task_graph_risk: LOW|HIGH`; design flag/decision; `size`; `route`; and one-sentence rationale. Observed mode also returns regret, closed reason codes, and `KEEP|RERUN_SMALLER|RERUN_LARGER`.

DONE when fields validate; any probe is consumed; STRUCTURED names independent workstreams; HIGH graph risk names a credible implementation-graph failure; and only the table derives size/route.

## Method / guardrails

| Semantic result | Size · route |
|---|---|
| ATOMIC + LOW + no changed protected boundary | XS · `XS_DIRECT` |
| ATOMIC + LOW + changed protected boundary OR DIRECT + LOW | S · `S_DIRECT` |
| ATOMIC/DIRECT + MODERATE/HIGH | M · `M_REVIEWED_DIRECT` |
| STRUCTURED + LOW/MODERATE + ordinary graph risk | L · `L_STRUCTURED` |
| STRUCTURED + HIGH uncertainty or HIGH task-graph risk | XL · `XL_REVIEWED_STRUCTURED` |

- STRUCTURED requires multiple independently implementable workstreams; dependencies, supporting artifacts, workflow/acceptance steps, and pilots are not workstreams.
- HIGH graph risk requires a credible implementation ordering/coordination/rollback failure; workflow gates/state transitions do not qualify.
- A protected boundary requires a concrete invariant + credible failure mode; it floors size at S but never creates structure or HIGH graph risk.
- Honor confirmed Scope assumptions. Missing paths/evidence permit at most the one probe; only unresolved, approach-changing uncertainty affects size.
- Design authority requires an unresolved material product, compatibility, destructive, migration/rollback, or long-term architecture choice outside implementation discretion; size and routine placement never create it.
- Initial and observed use the same table. Observed reports regret and `KEEP|RERUN_SMALLER|RERUN_LARGER`; it never repeats work or removes artifacts.
- Normalize legacy reads once: `MICRO→XS`, `LIGHT→S`, `STANDARD-DIRECT→M`, `STANDARD→L`, `COMPREHENSIVE→XL`; legacy labels never decide.
- Never use file volume, dependency count, or sensitive-domain keywords as size authority. Never plan, write artifacts, emit telemetry, or present gates.

## Handoff

Return the validated record plus probe evidence. Plan owns persistence, explanation, orchestration, gates, and telemetry.

## Escalate-If

- Canonical Scope is absent/conflicting, an enum is invalid, or a protected boundary lacks either predicate.
- A material decision needs user authority; report it through `design_authority_required`, never decide it.

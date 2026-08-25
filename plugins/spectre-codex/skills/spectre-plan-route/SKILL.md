---
name: "spectre-plan-route"
description: "Internal semantic classifier for spectre-plan. Use only from Plan with a bounded routing input; never for planning, artifacts, telemetry, or user gates."
user-invocable: false
---

# plan-route

## Purpose

Return a deterministic plan-routing/v1 decision to spectre-plan. Classify only; Plan owns workflow authority.

## Inputs

- Immutable canonical Scope + bounded repository observations; observations describe work, not size.
- Mode initial, or observed with the prior decision + plan Routing Observations.
- Resume-only legacy size is validated and normalized once.

## Working Set

- Plan supplies one bounded scan: implementation topology, uncertainty, evidence, protected boundaries, graph risk, shipped precedent, and user-owned decisions.
- If missing evidence alone would cross a costlier route, use exactly one bounded probe (`@spectre_finder`/`@spectre_patterns`) for one repository question.

## Outputs + DONE

Return schema plan-routing/v1; shape ATOMIC|DIRECT|STRUCTURED; uncertainty LOW|MODERATE|HIGH; evidence SUFFICIENT|PROBE_REQUIRED|PROBED; protected_boundaries[] {type, threatened_invariant, failure_mode}; task_graph_risk LOW|HIGH; design flag; size; route; rationale. Observed also returns regret, reason codes, and KEEP|RERUN_SMALLER|RERUN_LARGER.

DONE when fields validate; any probe is consumed; STRUCTURED names workstreams; HIGH graph risk names an implementation-graph failure; and only the table derives size/route.

## Method / guardrails

| Semantic result | Size · route |
|---|---|
| ATOMIC + LOW + no changed protected boundary | XS · XS_DIRECT |
| ATOMIC + LOW + changed protected boundary OR DIRECT + LOW | S · S_DIRECT |
| ATOMIC/DIRECT + MODERATE/HIGH | M · M_REVIEWED_DIRECT |
| STRUCTURED + LOW/MODERATE + ordinary graph risk | L · L_STRUCTURED |
| STRUCTURED + HIGH uncertainty or HIGH task-graph risk | XL · XL_REVIEWED_STRUCTURED |

- STRUCTURED requires multiple independently implementable workstreams; render variants of one surface (layout, density, breakpoint, theme), dependencies, supporting artifacts, workflow/acceptance steps, and pilots are not workstreams.
- Two shipped instances of a change-shape make the next DIRECT; its layers are not workstreams; STRUCTURED requires a named delta beyond repetition.
- HIGH graph risk requires a credible implementation ordering/coordination/rollback failure; workflow gates/state transitions do not qualify.
- A protected boundary needs a concrete invariant + credible failure mode; it floors size at S but never creates structure or HIGH graph risk.
- Honor confirmed Scope assumptions. Missing paths/evidence permit at most the one probe; when Scope mandates an abstraction, spend it on whether it ships; classify the real delta. Only unresolved, approach-changing uncertainty affects size.
- Design authority requires an unresolved product, compatibility, destructive, migration/rollback, or architecture choice outside implementation discretion; size and routine placement never create it.
- Observed reports regret and KEEP|RERUN_SMALLER|RERUN_LARGER; never repeats work or removes artifacts.
- Normalize legacy reads once: MICRO→XS, LIGHT→S, STANDARD-DIRECT→M, STANDARD→L, COMPREHENSIVE→XL; legacy labels never decide.
- Never use file volume, dependency count, surface counts, or sensitive-domain keywords as size authority, and never let them create workstreams. Never plan, write artifacts, emit telemetry, or present gates.

## Handoff

Return the record plus probe evidence. Plan owns persistence, explanation, orchestration, gates, and telemetry.

## Escalate-If

- Canonical Scope is absent/conflicting, an enum is invalid, or a protected boundary lacks a predicate.
- A material decision needs user authority; report `design_authority_required`, never decide it.

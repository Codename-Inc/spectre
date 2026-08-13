---
name: "spectre-plan"
description: "Orchestrate durable XS–XL planning after confirmed Scope, with adaptive artifacts, review, tasks, telemetry, and explicit pre-code approval. Do not use for scoping, bug diagnosis, read-only work, or execution of approved artifacts."
user-invocable: true
disable-model-invocation: true
---

# plan

## Purpose

Turn confirmed Scope into the smallest sufficient approved implementation handoff. `spectre-plan-route` alone classifies; the primary planning agent owns synthesis, routing, and deterministic finalization. Research agents return evidence only and never write planning artifacts; independent reviewers use only explicit scope-safe reviewer write surfaces.

## Inputs

- `$ARGUMENTS`: confirmed managed Scope/root or descendant artifact. Ordinary repository-changing work without confirmed Scope returns to `spectre-scope`; reported bugs normally use `spectre-fix`. Read-only diagnosis/review, release, and execution of approved artifacts remain direct.
- Existing `concepts/scope.md`, `specs/prd.md`, `ux.md` (preferred) or legacy `specs/ux.md`, `task_context.md`, plans, reviews, tasks/index, and goal prompts.

## Working Set

- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `Skill(spectre-feature-root)` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Treat `concepts/scope.md` as immutable canonical scope; downstream work may not narrow, expand, or reinterpret it without explicit scope-change approval.
- Read `references/estimation-guidance.md` only at an applicable gate; each estimate excludes user waits and never delays or blocks the gate.

## Outputs + DONE

| Size | Required durable result |
|---|---|
| XS | Compact direct `specs/plan.md`; no review/tasks/goal artifact. |
| S | Direct plan + `goal-prompts.md`. |
| M | Direct plan + one paired plan-review pipeline + goal. |
| L | Reviewed plan + `tasks.json` + `execute.md` + goal. |
| XL | L outputs + one task-review report before one-time index finalization and pair validation. |

DONE when both routing decisions are recorded; required children ran in order; declared artifacts and protected inputs validate; reviewer writes stayed stage-owned; any reroute recommendation was resolved; goal ran after the last applicable artifact change; every size passed final pre-code approval before an implementation prompt; telemetry is `complete|degraded`; and canonical Scope is unchanged or a scope-change gate stopped work.

## Method / guardrails

1. Check product readiness: unresolved journeys/states/copy/accessibility route to `spectre-ux`; load-bearing interaction/layout validation routes to `spectre-prototype`.
2. Make one cheap local scan, then invoke `Skill(spectre-plan-route)` in `initial` mode. Show size and its one-sentence rationale without asking the user to approve the label. Start local Plan telemetry; failures degrade observation only.
3. Gather proportional evidence: XS/S stay local except the route's bounded probe; M uses at most two relevant `@spectre_finder`, `@spectre_analyst`, or `@spectre_patterns`; L/XL cover necessary dimensions. `@spectre_web_research` is only for an external dependency/API/framework decision. Persist accepted evidence in `task_context.md`.
4. If and only if the decision reports a material user-owned decision, present one proposed resolution, verification spine, sourced assumptions, and open questions at a **design-authority gate**. Show **Estimated remaining planning time** when valid; wait for explicit approval and record `## Selected Design` before children.
5. Run exactly the chosen route; one plan-review pipeline means one `spectre-plan_review` invocation with correctness then simplification:
   - XS → `Skill(spectre-create_plan) --depth xs --no-review --execution direct`.
   - S → `Skill(spectre-create_plan) --depth light --no-review --execution direct` → `Skill(spectre-goal) --orchestrated`.
   - M → `Skill(spectre-create_plan) --depth standard --no-review --execution direct` → `Skill(spectre-plan_review) --auto-apply scope-safe --orchestrated` → `Skill(spectre-goal) --orchestrated`.
   - L → `Skill(spectre-create_plan) --depth standard --no-review` → `Skill(spectre-plan_review) --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks) --depth standard --orchestrated` → `Skill(spectre-goal) --orchestrated`.
   - XL → `Skill(spectre-create_plan) --depth comprehensive --no-review` → `Skill(spectre-plan_review) --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks) --depth comprehensive --tasks-only --orchestrated` → `Skill(spectre-task_review) --mode adversarial --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks) --depth comprehensive --finalize-index --orchestrated` → `validate-pair` → `Skill(spectre-goal) --orchestrated`.
6. Require valid paired reports/no unresolved correctness Blocker/High for M–XL; for XL require one completed task-review round before finalization and passing `validate-pair`. Never substitute reviewer findings or semantic writeback.
7. Invoke `Skill(spectre-plan-route)` in `observed` mode with the plan's `Routing Observations`. Surface KEEP/RERUN_SMALLER/RERUN_LARGER and wait when changed; never silently rerun paid work or delete heavier artifacts.
8. Present artifacts, verification, review/task results, reclassification, and **Estimated implementation time** when valid at the **final pre-code approval** gate for every size. Wait. Scope-preserving feedback gets the smallest stage-owned update, deterministic validation, refreshed goal, and no repeated review absent an explicit request; scope-changing feedback returns to Scope.

## Handoff

Only after approval: XS returns a self-contained `spectre-tdd` prompt anchored to the compact plan. S–XL return the generated structured goal prompt as a copy-ready fenced block as the primary next step, then `Alternative: spectre-execute — run the reviewed artifacts interactively in this session instead of goal mode.` Record final gate/completion telemetry; include `goal-prompts.md` where produced.

## Escalate-If

- Scope/root is absent or conflicts, product ambiguity changes behavior, a reviewer gate fails, deterministic artifacts do not validate, or user feedback changes scope.
- Telemetry or a missing estimate never blocks planning; report degraded observation and continue.

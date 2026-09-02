---
name: "spectre-plan"
description: "Orchestrate durable XS–XL planning after confirmed Scope, with adaptive artifacts, review, tasks, telemetry, and an immediate copy-ready Execute handoff. Do not use for scoping, bug diagnosis, read-only work, or execution of approved artifacts."
user-invocable: true
disable-model-invocation: true
---

# plan

## Purpose

Turn confirmed Scope into the smallest sufficient approved implementation handoff. `spectre-plan-route` alone classifies; the primary planning agent owns synthesis, routing, and deterministic finalization. Research agents return evidence only and never write planning artifacts; independent reviewers use only explicit scope-safe reviewer write surfaces.

## Inputs

- `$ARGUMENTS`: confirmed managed Scope/root or descendant artifact. Ordinary repository-changing work without confirmed Scope returns to `spectre-scope`; reported bugs normally use `spectre-fix`. Read-only diagnosis/review, release, and execution of approved artifacts remain direct.
- Existing `concepts/scope.md`, `specs/prd.md`, `ux.md` (preferred) or legacy `specs/ux.md`, `task_context.md`, plans, reviews, and tasks/index.

## Working Set

- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `Skill(spectre-feature-root)` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Treat `concepts/scope.md` as immutable canonical scope; downstream work may not narrow, expand, or reinterpret it without explicit scope-change approval.
- Read `references/estimation-guidance.md` only at an applicable gate; each estimate excludes user waits and never delays or blocks the gate.

## Outputs + DONE

| Size | Required durable result |
|---|---|
| XS | Compact direct `specs/plan.md`; no review or tasks artifact. |
| S | Direct plan. |
| M | Direct plan + one paired plan-review pipeline. |
| L | Reviewed plan + `tasks.json` + `execute.md`. |
| XL | L outputs + one task-review report before one-time index finalization and pair validation. |

DONE when both routing decisions are recorded; every required high-level design gate was explicitly approved and recorded; required children ran in order; declared artifacts and protected inputs validate; reviewer writes stayed stage-owned; any reroute recommendation was resolved; the returned launch command names the routed execution source and explicit `plan` origin; telemetry is `complete|degraded`; and canonical Scope is unchanged or a scope-change gate stopped work.

## Method / guardrails

1. Check product readiness: unresolved journeys/states/copy/accessibility route to `spectre-ux`; load-bearing interaction/layout validation routes to `spectre-prototype`.
2. Make one cheap local scan, then invoke `Skill(spectre-plan-route)` in `initial` mode. Run `node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs" plan start` with the root/scope hash plus the returned semantic record, size/route, reason codes, design flag, probe flags, and protected boundaries; retain `PLAN_RUN_ID` for the resulting `plan.started`. Show size/rationale without asking approval of the label.
3. Gather proportional evidence: XS/S stay local except the route's bounded probe; M uses at most two relevant `@spectre_finder`, `@spectre_analyst`, or `@spectre_patterns`; L/XL cover necessary dimensions. `@spectre_web_research` is only for an external dependency/API/framework decision. Persist accepted evidence in `task_context.md`.
4. For L/XL, and for XS–M when the decision reports a material user-owned decision, read `references/high-level-design-gate.md` and follow it through DONE before invoking any child. A current-run explicitly approved `## Selected Design` is the only fast path. Show **Estimated remaining planning time** when valid; after approval emit `plan.gate_completed` without response prose.
5. Run exactly the chosen route; one plan-review pipeline means one `spectre-plan_review` invocation with correctness then simplification:
   - XS → `Skill(spectre-create_plan) --depth xs --no-review --execution direct`.
   - S → `Skill(spectre-create_plan) --depth light --no-review --execution direct`.
   - M → `Skill(spectre-create_plan) --depth standard --no-review --execution direct` → `Skill(spectre-plan_review) --auto-apply scope-safe --orchestrated`.
   - L → `Skill(spectre-create_plan) --depth standard --no-review` → `Skill(spectre-plan_review) --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks) --depth standard --orchestrated`.
   - XL → `Skill(spectre-create_plan) --depth comprehensive --no-review` → `Skill(spectre-plan_review) --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks) --depth comprehensive --tasks-only --orchestrated` → `Skill(spectre-task_review) --mode adversarial --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks) --depth comprehensive --finalize-index --orchestrated` → `validate-pair`.
6. Require valid paired reports/no unresolved correctness Blocker/High for M–XL; for XL require one completed task-review round before finalization and passing `validate-pair`. Never substitute reviewer findings or semantic writeback.
7. After the route's final planning artifact step (and after any review), emit `plan.review_completed` with review yield and structural before/after counts when a review ran. Invoke `Skill(spectre-plan-route)` in `observed` mode with `Routing Observations`, then emit `plan.reclassified` with plan hash, initial/observed records, and regret. Surface KEEP/RERUN_SMALLER/RERUN_LARGER and wait when changed; never silently rerun paid work or delete heavier artifacts.
8. After required artifacts, reviews, observed routing, and deterministic validation settle, present artifacts, verification, review/task results, reclassification, and **Estimated implementation time** when valid with the exact copy-ready Execute command. Do not require a final `Approved` reply: displaying the command is non-mutating and does not start Execute. Scope-preserving feedback gets the smallest stage-owned update, deterministic validation, a refreshed launch command, and no repeated review absent an explicit request; scope-changing feedback returns to Scope. All events use `node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs" plan record`; any telemetry failure is reported internally as degraded and planning, approval, and execution handoff continue.

## Handoff

After deterministic completion, emit `plan.completed` with artifact hashes (SHA-256 of raw artifact file bytes), counts, planning elapsed time excluding waits, and continuation. XS returns a self-contained `spectre-tdd` prompt anchored to the compact plan. S–XL return one copy-ready fenced launch command as the primary next step: the host's explicit `spectre-execute` invocation (Claude Code `/spectre:` prefix, Codex `$` prefix), explicit `--origin plan`, and the repo-relative execution source — `specs/execute.md` for L/XL, the direct `specs/plan.md` for S/M. Never pass `--orchestrated`; a user-launched run stays self-owned through final review and proof. Append at most one short runtime-only instruction that cannot live in a durable artifact; durable guidance belongs in the plan, tasks, or `task_context.md`. Never generate a goal prompt; autonomous goal mode is an explicit opt-in utility outside this route.

## Escalate-If

- Scope/root is absent or conflicts, product ambiguity changes behavior, a reviewer gate fails, deterministic artifacts do not validate, or user feedback changes scope.
- Telemetry or a missing estimate never blocks planning; report degraded observation and continue.

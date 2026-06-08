---
name: "caspar-plan"
description: "Unified planning entry point: classify tier, run tier-sized research, then route to the smallest safe plan→task-artifacts→review workflow. Use after scope or for \"plan this/how build this\" requests. Do NOT trigger for scope, specific bug diagnosis, or direct task breakdown."
user-invocable: true
---

# plan

Planning router: classify tier, spend a tier-sized research budget, then route to the smallest safe workflow. **Clear on WHAT, silent on HOW.** Classify before subagents. Route on hard-stops and clarity, not point-scoring.

## Inputs
- `$ARGUMENTS` — feature/problem reference + optional user-specified output dir or tier.
- Existing artifacts under `{OUT_DIR}/` if present: `concepts/scope.md`, `specs/prd.md`/`specs/ux.md`, `task_context.md`, `specs/plan.md`, `specs/execute.md`, `specs/tasks.json`, `research/*.md`. Read what exists; reuse research instead of repeating it.

## Working Set (late-bound — read at run-time, never inline)
- `branch = git rev-parse --abbrev-ref HEAD`
- `OUT_DIR = user-specified || docs/tasks/{branch}`; `mkdir -p` it.
- Cheap local scan only at classification: thread context, provided files, existing artifacts, `rg`/glob/manifests. **No subagents until tier is set.**

## Method / guardrails — tier-routed

**1. Classify (CheapLocalScan → CheckHardStops → DetermineTier).** Any hard-stop true ⇒ **automatic COMPREHENSIVE**:
`db_schema_destructive` (drop/rename/non-additive column) · `data_migration_required` (backfill/transform) · `new_service_or_component` · `auth_or_pii_change` · `secrets_or_credentials_handling` · `payment_billing_logic` · `public_api_change` · `concurrent_writes_or_locking` · `caching_consistency` · `cross_service_or_cross_workspace_change` · `slo_sla_risk`.

| Tier | Use when |
|---|---|
| **MICRO** | Obvious ≤1-file change, no artifact needed, no hard-stop. |
| **LIGHT** | Clear internal change, known pattern, ~≤5 files / 1–2 components, no hard-stop. |
| **STANDARD** | Multi-file or moderate ambiguity, no hard-stop; needs adversarial review. |
| **COMPREHENSIVE** | Any hard-stop, new architecture/service, high ambiguity, or broad blast radius. |

Between adjacent tiers: prefer **lower** if execution can check the gap; prefer **higher** for scope, security/privacy, data correctness, public API, or rollback risk. Log tier inline; **do not ask for confirmation**.

**2. Research by tier.** MICRO/LIGHT: cheap scan only (LIGHT may dispatch `@caspar:finder` if files unclear). STANDARD: ≤2 of `@caspar:finder`/`@caspar:analyst`/`@caspar:patterns`; no `@caspar:web-research` unless a new external dep/API/framework is likely. COMPREHENSIVE: all needed dimensions incl. `@caspar:web-research` only when external choices matter. For non-MICRO, write findings to `{OUT_DIR}/task_context.md` `## Technical Research` so downstream skills consume instead of re-research.

**3. Initial Design Proposal Gate — STANDARD/COMPREHENSIVE only** (skip MICRO/LIGHT). Present **inline** a single high-level proposed approach — components + key decisions/rationale — with: **Verification spine** (major change → test|observable|state signal), **Filled assumptions** (default + source), **Open questions** (each with recommended default). A fork = an open question, not a menu.

**HOLD FOR USER CONFIRMATION HERE.** End with exactly: *"High-level design proposed. Reply `Approved` to generate the full reviewed plan/tasks, or give design feedback."* Do not call `caspar-create_plan`, `caspar-create_tasks`, or `caspar-plan_review` until the user approves this gate or gives feedback that has been incorporated. Once approved, append `## Selected Design` to `{OUT_DIR}/task_context.md`, including the approved design and any resolved assumptions/questions.

**4. Route — invoke the required skills only after required gates are satisfied** (do not describe, summarize, or hand-write plan/tasks):
- **MICRO** → emit an inline 3–5 item checklist with one verification signal; state MICRO skipped artifacts + review by design. No skill calls.
- **LIGHT** → `Skill(caspar-create_plan)` `{OUT_DIR}/task_context.md --depth light --no-review` → `Skill(caspar-create_tasks)` `… --depth light`. Verify `execute.md` sections + `tasks.json` parse; summarize artifacts; state LIGHT skipped review + human gate.
- **STANDARD/COMPREHENSIVE precondition:** `task_context.md` must contain `## Selected Design` from the approved Initial Design Proposal Gate before routing. If missing, return to step 3 and stop.
- **STANDARD** → `create_plan --depth standard --no-review` → `create_tasks --depth standard` → `Skill(caspar-plan_review)` `{OUT_DIR} --mode adversarial --auto-apply scope-safe`.
- **COMPREHENSIVE** → same chain at `--depth comprehensive` and `plan_review … --mode full --auto-apply scope-safe`.

After any user conversation, re-orient: if STANDARD/COMPREHENSIVE and the Initial Design Proposal Gate is not approved, stay in step 3; if approved and `## Selected Design` exists in `task_context.md`, continue to step 4; only then execute the next required Skill invocation. **YOU MUST** call these via the Skill tool — never write `plan.md`, `execute.md`, or `tasks.json` content yourself, never self-author `plan_review`, never end the turn saying "I'll now…".

## Guardrails (binding)
- **Canonical-Scope-Invariant.** Treat `concepts/scope.md` (then `specs/prd.md`/`specs/ux.md`) as canonical. Planning, task artifacts, review, and feedback integration may change approach, sequencing, verification, references, and YAGNI fences — but **MUST NOT cut, narrow, expand, or reinterpret scope without an explicit user scope-change gate.** Never overwrite an existing `plan.md`, `execute.md`, or `tasks.json`; use scoped names.
- **Independent plan_review (STANDARD/COMPREHENSIVE):** `caspar-plan_review` must produce a saved review through an opposite-runtime CLI reviewer when available, or through explicit same-runtime Caspar subagent fallback when not. The planner **MUST NOT** substitute an inline/self-authored review. Read the report; ensure every **scope-safe** Blocker/High is reflected in `plan.md`, `execute.md`, and/or `tasks.json`; apply smallest missing edits. If parent ids/titles/dependencies/waves change, update the execute index rows in the same pass. **Do not apply Scope-Change-Required findings** — surface them.

## Outputs + DONE
- MICRO: inline checklist only.
- LIGHT: `{OUT_DIR}/specs/plan.md` + `specs/execute.md` + `specs/tasks.json`.
- STANDARD/COMPREHENSIVE: the above + a saved `plan_review` report under `{OUT_DIR}/reviews/`, with scope-safe findings integrated.

**Post-tasks tier re-check:** count parent/sub-tasks, unique files, Phase-0 deps. Recommend, do **not** silently re-run: escalate if LIGHT touches >3 files or >2 parents; STANDARD reveals a missed hard-stop; or any Out-of-Bounds violation. Downgrade only if COMPREHENSIVE collapses to one parent with no migration/new-component/API change. Say: *"I planned this as {tier}, but tasks revealed {signal}. Recommend re-running as {new}. Reply 'rerun' or 'keep'."* and wait.

**DONE when:** tier was classified and logged; the tier's required skills ran (not described); required artifacts exist for the tier; `execute.md` has Document Manifest / Task Detail Source / Execution Summary / Wave Plan / Parent Task Index / Slicing Rules; referenced `tasks.json` parses; for STANDARD/COMPREHENSIVE, the Initial Design Proposal Gate was approved and recorded as `## Selected Design`, independent review produced a saved report, scope-safe review findings are integrated, the Final Gate was presented, and the post-tasks re-check passed/was surfaced; canonical scope is unchanged (or a scope gate was raised).

## Handoff — Final Gate (STANDARD/COMPREHENSIVE)
Present artifact paths (`plan.md`, `execute.md`, `tasks.json`, `reviews/…`), applied review changes, skipped items, and any blocked scope-change recommendation. If scope change is required, say *"This requires a scope change; I did not apply it"* and ask whether to reopen scope or keep the scope-preserving plan. Else prompt: *"Final reviewed plan/tasks are ready. Reply `Approved` to proceed to execution, or give final feedback."* Wait.
- **Feedback preserving scope** → apply smallest edits to `plan.md`, `execute.md`, and/or `tasks.json`; re-run `plan_review … --auto-apply scope-safe` if it changes approach/verification/deps/sequencing/references; re-present the gate.
- **Feedback changing scope** → stop, route back to `/caspar:scope`; do not edit plan/tasks against stale scope.

Then render the inline Next-Steps line: suggest `/caspar:execute`.

## Escalate-If
- Hard-stop discovered mid-flow → jump to COMPREHENSIVE rather than continuing a lower tier.
- Design alignment won't converge → surface the specific unresolved tension and let the user decide before generating the plan.
- User feedback changes canonical scope → stop and route to `/caspar:scope`.

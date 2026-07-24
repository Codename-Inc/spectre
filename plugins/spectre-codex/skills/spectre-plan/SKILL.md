---
name: "spectre-plan"
description: "Unified planning entry point: classify tier, run tier-sized research, then route to the smallest safe plan→task-artifacts→review workflow. Use after scope or for \"plan this/how build this\" requests. Do NOT trigger for scope, specific bug diagnosis, or direct task breakdown."
user-invocable: true
disable-model-invocation: true
---

# plan

Planning router: classify tier, spend a tier-sized research budget, then route to the smallest safe workflow. **Clear on WHAT, silent on HOW.** Plan review stabilizes intent before task generation; comprehensive task review checks generated execution artifacts.

## Inputs
- `$ARGUMENTS` — feature/problem reference + optional explicit managed feature name/root, artifact path, or tier.
- Existing artifacts under `{FEATURE_ROOT}/` if present: `concepts/scope.md`, `specs/prd.md`, `ux.md` (preferred) or legacy `specs/ux.md`, `task_context.md`, `specs/plan.md`, `specs/execute.md`, `specs/tasks.json`, `goal-prompts.md`, `research/*.md`. Read what exists; reuse research instead of repeating it.

## Working Set (late-bound — read at run-time, never inline)
- `FEATURE_ROOT = .spectre/features/<feature-name>/`, resolved once below and passed unchanged to every child.
- Cheap local scan only at classification: thread context, provided files, existing artifacts, `rg`/glob/manifests. **No subagents until tier is set.**

## Feature root contract

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature.
- When the user explicitly names an existing managed feature, continue or re-plan it under its existing overwrite safeguards. The physical directory is authoritative.
- For an inferred name, use the first free `.spectre/features/<name>[-N]/`; never overwrite or auto-continue a collision. An explicitly selected unmanaged directory remains a safety blocker.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`.
- Keep the marker lifecycle-neutral: never add branch, status, active-pointer, alias, or absolute-path state.
- If `.spectre/.gitignore` is absent and the repository does not already ignore `.spectre/`, create it with `manifest.json`, `bin/`, `handoffs/`, and `!features/`. Do not rewrite a user root ignore file. If the selected feature root is ignored, warn that its records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid. Pass the exact selected `FEATURE_ROOT` unchanged to every child call.

## Method / guardrails — tier-routed

**0. Product-artifact readiness.** Before technical tiering, inspect canonical scope/UX inputs. If a user-facing feature still has unresolved journeys, segments, states, copy, or accessibility, stop and recommend `spectre-ux`. If behavior is settled and uncomplicated but interaction/layout/visual validation is a load-bearing open question, recommend `spectre-prototype`. Resume planning after that artifact is reconciled; do not bury product ambiguity in Filled Assumptions.

**1. Classify (CheapLocalScan → CheckHardStops → DetermineTier).** Any hard-stop true ⇒ **automatic COMPREHENSIVE**:
`db_schema_destructive` (drop/rename/non-additive column) · `data_migration_required` (backfill/transform) · `new_service_or_component` · `auth_or_pii_change` · `secrets_or_credentials_handling` · `payment_billing_logic` · `public_api_change` · `concurrent_writes_or_locking` · `caching_consistency` · `cross_service_or_cross_workspace_change` · `slo_sla_risk`.

| Tier | Use when |
|---|---|
| **MICRO** | Obvious ≤1-file change, no artifact needed, no hard-stop. |
| **LIGHT** | Clear internal change, known pattern, ~≤5 files / 1–2 components, no hard-stop. |
| **STANDARD** | Multi-file or moderate ambiguity, no hard-stop; needs adversarial review. |
| **COMPREHENSIVE** | Any hard-stop, new architecture/service, high ambiguity, or broad blast radius. |

Between adjacent tiers: prefer **lower** if execution can check the gap; prefer **higher** for scope, security/privacy, data correctness, public API, or rollback risk. Log tier inline; **do not ask for confirmation**.

**2. Research by tier.** MICRO/LIGHT: cheap scan only (LIGHT may dispatch `@spectre_finder` if files unclear). STANDARD: ≤2 of `@spectre_finder`/`@spectre_analyst`/`@spectre_patterns`; no `@spectre_web_research` unless a new external dep/API/framework is likely. COMPREHENSIVE: all needed dimensions incl. `@spectre_web_research` only when external choices matter. For LIGHT, initialize the accepted root and write findings to `{FEATURE_ROOT}/task_context.md` `## Technical Research`. For STANDARD/COMPREHENSIVE, keep findings in-thread until the design gate accepts the proposed name/root, then initialize the root and write the same research so downstream skills consume instead of re-research. `task_context.md` begins below its title with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`.

**3. Initial Design Proposal Gate — STANDARD/COMPREHENSIVE only** (skip MICRO/LIGHT). Present **inline** the proposed feature name/root and a single high-level proposed approach — components + key decisions/rationale — with: **Verification spine** (major change → test|observable|state signal), **Filled assumptions** (default + source), **Open questions** (each with recommended default). A fork = an open question, not a menu. Approval or design feedback without name feedback accepts the proposed name.

**HOLD FOR USER CONFIRMATION HERE.** End with exactly: *"High-level design proposed. Reply `Approved` to generate the full reviewed plan/tasks, or give design feedback."* Do not call `spectre-create_plan`, `spectre-create_tasks`, or `spectre-plan_review` until the user approves this gate or gives feedback that has been incorporated. Once approved, initialize the accepted root if new and append `## Selected Design` to `{FEATURE_ROOT}/task_context.md`, including the approved design and any resolved assumptions/questions.

**4. Route — invoke the required skills only after required gates are satisfied** (do not describe, summarize, or hand-write plan/tasks):
- **MICRO** → emit an inline 3–5 item checklist with one verification signal; state MICRO skipped artifacts + review by design. MICRO skips goal-prompt artifacts because goal-mode overhead is not justified. No skill calls.
- **LIGHT** → `Skill(spectre-create_plan)` `{FEATURE_ROOT}/task_context.md --depth light --no-review` → `Skill(spectre-create_tasks)` `… {FEATURE_ROOT} --depth light --orchestrated` → `Skill(spectre-goal)` `{FEATURE_ROOT} --orchestrated`. Verify `execute.md` sections + `tasks.json` parse + `goal-prompts.md`; summarize artifacts; state LIGHT skipped review + human gate.
- **STANDARD/COMPREHENSIVE precondition:** `{FEATURE_ROOT}/task_context.md` must contain `## Selected Design` from the approved Initial Design Proposal Gate before routing. If missing, return to step 3 and stop.
- **STANDARD** → `Skill(spectre-create_plan)` `{FEATURE_ROOT}/task_context.md --depth standard --no-review` → `Skill(spectre-plan_review)` `{FEATURE_ROOT} --mode adversarial --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks)` `{FEATURE_ROOT} --depth standard --orchestrated` → `Skill(spectre-goal)` `{FEATURE_ROOT} --orchestrated`.
- **COMPREHENSIVE** → `Skill(spectre-create_plan)` `{FEATURE_ROOT}/task_context.md --depth comprehensive --no-review` → `Skill(spectre-plan_review)` `{FEATURE_ROOT} --mode full --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks)` `{FEATURE_ROOT} --depth comprehensive --orchestrated` → `Skill(spectre-task_review)` `{FEATURE_ROOT} --mode adversarial --auto-apply scope-safe --orchestrated` → `Skill(spectre-goal)` `{FEATURE_ROOT} --orchestrated`.

After any user conversation, re-orient: if STANDARD/COMPREHENSIVE and the Initial Design Proposal Gate is not approved, stay in step 3; if approved and `## Selected Design` exists in `task_context.md`, continue to step 4; only then execute the next required Skill invocation. **YOU MUST** call these via the Skill tool — never write `plan.md`, `execute.md`, or `tasks.json` content yourself, never self-author `plan_review`, never end the turn saying "I'll now…".

## Guardrails (binding)
- **Canonical-Scope-Invariant.** Treat `concepts/scope.md` (then `specs/prd.md`, then `ux.md` or legacy `specs/ux.md`) as canonical. Planning, task artifacts, review, and feedback integration may change approach, sequencing, verification, references, and YAGNI fences — but **MUST NOT cut, narrow, expand, or reinterpret scope without an explicit user scope-change gate.** Never overwrite an existing `plan.md`, `execute.md`, or `tasks.json`; use scoped names.
- **Independent plan_review (STANDARD/COMPREHENSIVE):** `spectre-plan_review` must produce a saved plan-only review through an opposite-runtime CLI reviewer when available, or through explicit same-runtime Spectre subagent fallback when not. The planner **MUST NOT** substitute an inline/self-authored review. Read the report; ensure every scope-safe Blocker/High is reflected in `plan.md` before task generation. **Do not apply Scope-Change-Required findings** — surface them.
- **Task artifact review (COMPREHENSIVE only):** `spectre-task_review` checks only generated `execute.md` + `tasks.json` against the reviewed plan. Apply scope-safe Blocker/High task fixes to `tasks.json` and affected execute-index rows only; never edit `plan.md` or scope docs from task review.

## Outputs + DONE
- MICRO: inline checklist only.
- LIGHT: `{FEATURE_ROOT}/specs/plan.md` + `specs/execute.md` + `specs/tasks.json` + `goal-prompts.md`.
- STANDARD: the above + a saved `plan_review` report under `{FEATURE_ROOT}/reviews/`, with scope-safe plan findings integrated before task generation.
- COMPREHENSIVE: STANDARD outputs + a saved `task_review` report under `{FEATURE_ROOT}/reviews/`, with scope-safe task-artifact findings integrated before goal generation.

**Post-tasks tier re-check:** count parent/sub-tasks, unique files, Phase-0 deps. Recommend, do **not** silently re-run: escalate if LIGHT touches >3 files or >2 parents; STANDARD reveals a missed hard-stop; or any Out-of-Bounds violation. Downgrade only if COMPREHENSIVE collapses to one parent with no migration/new-component/API change. Say: *"I planned this as {tier}, but tasks revealed {signal}. Recommend re-running as {new}. Reply 'rerun' or 'keep'."* and wait.

**DONE when:** tier was classified and logged; the tier's required skills ran (not described); required artifacts exist for the tier; `execute.md` has Document Manifest / Task Detail Source / Execution Summary / Wave Plan / Parent Task Index / Slicing Rules; referenced `tasks.json` parses; for every non-MICRO tier, `goal-prompts.md` contains portable-strict structured + compact prompts generated after the tier's final task-artifact step; for STANDARD/COMPREHENSIVE, the Initial Design Proposal Gate was approved and recorded as `## Selected Design`, independent plan review produced a saved report before task generation, scope-safe plan findings are integrated, the Final Gate was presented, and the post-tasks re-check passed/was surfaced; for COMPREHENSIVE, task review produced a saved report after task generation and scope-safe task findings are integrated before goal generation; canonical scope is unchanged (or a scope gate was raised).

## Handoff

- **MICRO:** `Next (recommended): spectre-tdd — the MICRO checklist is the execution contract and no task artifacts were generated.` Offer `spectre-plan` only if implementation exposes wider scope or a hard-stop.
- **LIGHT:** `Next (recommended): spectre-execute — the LIGHT execute index and tasks are ready.` Offer the structured `/goal` prompt in `goal-prompts.md` only as the autonomous execute→proof alternative.
- **STANDARD/COMPREHENSIVE:** use the Final Gate below.

### Final Gate — STANDARD/COMPREHENSIVE
Present artifact paths (`plan.md`, `execute.md`, `tasks.json`, `goal-prompts.md`, `reviews/…`), applied review changes, skipped items, and any blocked scope-change recommendation. If scope change is required, say *"This requires a scope change; I did not apply it"* and ask whether to reopen scope or keep the scope-preserving plan. Else prompt: *"Final reviewed plan/tasks and portable goal prompts are ready. Reply `Approved` to proceed to execution, or give final feedback."* Wait.
- **Feedback preserving scope** → if it changes approach/verification/deps/sequencing/references, apply the smallest `plan.md` edit, re-run `plan_review … --auto-apply scope-safe --orchestrated`, then regenerate task artifacts; if it only corrects task translation, edit `tasks.json` plus affected `execute.md` rows and re-run `task_review --orchestrated` for COMPREHENSIVE.
- **Feedback changing scope** → stop, route back to `spectre-scope`; do not edit plan/tasks against stale scope.

After any scope-preserving feedback changes `plan.md`, `execute.md`, `tasks.json`, or a review finding applied to them, re-run `Skill(spectre-goal)` with `--orchestrated` so `goal-prompts.md` cannot describe stale artifacts.

After approval, render exactly one primary line: `Next (recommended): spectre-execute — the reviewed plan and task artifacts are approved.` Add one conditional alternative: `Alternative: run the structured portable-strict /goal prompt in goal-prompts.md when autonomous execute→proof is preferred.` If stopping at the approved planning boundary, offer `Pause: spectre-handoff {feature}` with canonical artifact paths and the selected next step.

## Escalate-If
- Hard-stop discovered mid-flow → jump to COMPREHENSIVE rather than continuing a lower tier.
- Design alignment won't converge → surface the specific unresolved tension and let the user decide before generating the plan.
- User feedback changes canonical scope → stop and route to `spectre-scope`.

## Codex Agent Preflight

Before dispatching any `@spectre_*` custom agent, run the bundled setup helper once:

```bash
node "${PLUGIN_ROOT}/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
```

If the helper reports agents were installed or updated in this session, continue directly only for lookup/scoping work that can be completed without a subagent. For other agent-dependent workflows, stop with a clear one-session restart requirement so Codex can discover the new custom agents.

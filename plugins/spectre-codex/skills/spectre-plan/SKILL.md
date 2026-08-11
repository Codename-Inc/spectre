---
name: "spectre-plan"
description: "Unified planning entry point: classify tier, run tier-sized research, then route to the smallest safe workflow — reviewed plan-direct execution or plan→task-artifacts→review. Use after scope or for \"plan this/how build this\" requests. Do NOT trigger for scope, specific bug diagnosis, or direct task breakdown."
user-invocable: true
disable-model-invocation: true
---

# plan

Planning router: classify tier, spend a tier-sized research budget, then route to the smallest safe workflow. **The primary planning agent owns synthesis, routing, and deterministic finalization**; research agents return evidence, while authorized independent reviewers author their reports and apply scope-safe edits only to their stage-owned plan/task artifact. Skill invocation loads procedure into that same primary except for those explicit review write surfaces.

## Inputs
- `$ARGUMENTS` — feature/problem reference + optional explicit managed feature name/root, artifact path, or tier.
- Existing artifacts under `{FEATURE_ROOT}/` if present: `concepts/scope.md`, `specs/prd.md`, `ux.md` (preferred) or legacy `specs/ux.md`, `task_context.md`, `specs/plan.md`, `specs/execute.md`, `specs/tasks.json`, `goal-prompts.md`, `research/*.md`. Read what exists; reuse research instead of repeating it.

## Working Set (late-bound — read at run-time, never inline)
- `FEATURE_ROOT = .spectre/features/<feature-name>/`, resolved once below and passed unchanged to every skill, research prompt, and reviewer.
- Cheap local scan only at classification: thread context, provided files, existing artifacts, `rg`/glob/manifests. **No subagents until tier is set.**
- Estimate policy: for STANDARD-family/COMPREHENSIVE gates, read `references/estimation-guidance.md` at runtime and prefer its optional local telemetry snapshot over the shipped seed prior. Never scan transcripts during a live Plan.

## Feature root contract

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature.
- When the user explicitly names an existing managed feature, continue or re-plan it under its existing overwrite safeguards. The physical directory is authoritative.
- For an inferred name, use the first free `.spectre/features/<name>[-N]/`; never overwrite or auto-continue a collision. An explicitly selected unmanaged directory remains a safety blocker.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`.
- Keep the marker lifecycle-neutral: never add branch, status, active-pointer, alias, or absolute-path state.
- If `.spectre/.gitignore` is absent and the repository does not already ignore `.spectre/`, create it with `manifest.json`, `bin/`, `handoffs/`, and `!features/`. Do not rewrite a user root ignore file. If the selected feature root is ignored, warn that its records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid. Pass the exact selected `FEATURE_ROOT` unchanged to every skill, research, and review invocation.

## Method / guardrails — tier-routed

**0. Product-artifact readiness.** Before technical tiering, inspect canonical scope/UX inputs. If a user-facing feature still has unresolved journeys, segments, states, copy, or accessibility, stop and recommend `spectre-ux`. If behavior is settled and uncomplicated but interaction/layout/visual validation is a load-bearing open question, recommend `spectre-prototype`. Resume planning after that artifact is reconciled; do not bury product ambiguity in Filled Assumptions.

**1. Classify (CheapLocalScan → CheckHardStops → DetermineTier).** Any hard-stop true ⇒ **automatic COMPREHENSIVE**:
`db_schema_destructive` (drop/rename/non-additive column) · `data_migration_required` (backfill/transform) · `new_service_or_component` · `auth_or_pii_change` · `secrets_or_credentials_handling` · `payment_billing_logic` · `public_api_change` · `concurrent_writes_or_locking` · `caching_consistency` · `cross_service_or_cross_workspace_change` · `slo_sla_risk`.

| Tier | Use when |
|---|---|
| **MICRO** | Obvious ≤1-file change, no artifact needed, no hard-stop. |
| **LIGHT** | Clear internal change, known pattern, ~≤5 files / 1–2 components, no hard-stop. |
| **STANDARD-DIRECT** | Multi-file, follows an existing in-repo pattern, decomposition obvious, no hard-stop; reviewed plan executes plan-direct without task artifacts. |
| **STANDARD** | Multi-file with moderate ambiguity — novel approach or uncertain decomposition, no hard-stop; needs adversarial review + task artifacts. |
| **COMPREHENSIVE** | Any hard-stop, new architecture/service, high ambiguity, or broad blast radius. |

**STANDARD-family split** — classify STANDARD-DIRECT only when all three hold; any failure ⇒ structured STANDARD: (1) no shared contract (new/changed interface, type, schema, or event) consumed by more than one planned workstream; (2) expected parallel frontier ≤2 concurrent workstreams; (3) the cheap scan found a concrete in-repo pattern anchor to model on. STANDARD-DIRECT follows every STANDARD gate, research rule, and guardrail; only step-4 routing differs.

Between adjacent tiers: prefer **lower** if execution can check the gap; prefer **higher** for scope, security/privacy, data correctness, public API, or rollback risk. Log tier inline — for the STANDARD family, also log the deciding discriminator; **do not ask for confirmation**.

**2. Research by tier.** Research agents return evidence only and never write planning artifacts. MICRO/LIGHT: cheap scan only (LIGHT may dispatch `@spectre_finder` if files unclear). STANDARD: ≤2 of `@spectre_finder`/`@spectre_analyst`/`@spectre_patterns`; no `@spectre_web_research` unless a new external dep/API/framework is likely. COMPREHENSIVE: all needed dimensions incl. `@spectre_web_research` only when external choices matter. For LIGHT, the primary initializes the accepted root and writes findings to `{FEATURE_ROOT}/task_context.md` `## Technical Research`. For STANDARD/COMPREHENSIVE, keep findings in-thread until the design gate accepts the proposed name/root, then the primary initializes the root and writes the same research so downstream skills consume instead of re-research. `task_context.md` begins below its title with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`.

**3. Initial Design Proposal Gate — STANDARD-family/COMPREHENSIVE only** (skip MICRO/LIGHT). Present **inline** the proposed feature name/root and a single high-level proposed approach — components + key decisions/rationale — with: **Verification spine** (major change → test|observable|state signal), **Filled assumptions** (default + source), **Open questions** (each with recommended default). A fork = an open question, not a menu. Approval or design feedback without name feedback accepts the proposed name.

Immediately before the approval sentence, render the single **Estimated remaining planning time** sentence required by `references/estimation-guidance.md` when a valid tier-compatible estimate exists. The estimate excludes user-response waits, is informational, and never delays or blocks the gate; omit it without warning when no valid estimate exists.

**HOLD FOR USER CONFIRMATION HERE.** End with exactly: *"High-level design proposed. Reply `Approved` to generate the full reviewed plan/tasks, or give design feedback."* Do not call `spectre-create_plan`, `spectre-create_tasks`, or `spectre-plan_review` until the user approves this gate or gives feedback that has been incorporated. Once approved, initialize the accepted root if new and append `## Selected Design` to `{FEATURE_ROOT}/task_context.md`, including the approved design and any resolved assumptions/questions.

**4. Route — load the required skills into the primary only after required gates are satisfied:**
- **MICRO** → emit an inline 3–5 item checklist with one verification signal; state MICRO skipped artifacts + review by design. MICRO skips goal-prompt artifacts because goal-mode overhead is not justified. No skill calls.
- **LIGHT** → `Skill(spectre-create_plan)` `{FEATURE_ROOT}/task_context.md --depth light --no-review --execution direct` → `Skill(spectre-goal)` `{FEATURE_ROOT} --orchestrated`. Verify `plan.md` spine sections + `Execution Mode: direct` header + `goal-prompts.md`; summarize artifacts; state LIGHT skipped review + human gate and executes plan-direct without task artifacts.
- **STANDARD-family/COMPREHENSIVE precondition:** `{FEATURE_ROOT}/task_context.md` must contain `## Selected Design` from the approved Initial Design Proposal Gate before routing. If missing, return to step 3 and stop.
- **STANDARD-DIRECT** → `Skill(spectre-create_plan)` `{FEATURE_ROOT}/task_context.md --depth standard --no-review --execution direct` → `Skill(spectre-plan_review)` `{FEATURE_ROOT} --auto-apply scope-safe --orchestrated` → `Skill(spectre-goal)` `{FEATURE_ROOT} --orchestrated`. Never invoke `spectre-create_tasks` on this route.
- **STANDARD** → `Skill(spectre-create_plan)` `{FEATURE_ROOT}/task_context.md --depth standard --no-review` → `Skill(spectre-plan_review)` `{FEATURE_ROOT} --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks)` `{FEATURE_ROOT} --depth standard --orchestrated` → `Skill(spectre-goal)` `{FEATURE_ROOT} --orchestrated`.
- **COMPREHENSIVE** → `Skill(spectre-create_plan)` `{FEATURE_ROOT}/task_context.md --depth comprehensive --no-review` → `Skill(spectre-plan_review)` `{FEATURE_ROOT} --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks)` `{FEATURE_ROOT} --depth comprehensive --tasks-only --orchestrated` → `Skill(spectre-task_review)` `{FEATURE_ROOT} --mode adversarial --auto-apply scope-safe --orchestrated` → `Skill(spectre-create_tasks)` `{FEATURE_ROOT} --depth comprehensive --finalize-index --orchestrated` → run `task-review-safety.mjs validate-pair` against final `execute.md` + `tasks.json` → `Skill(spectre-goal)` `{FEATURE_ROOT} --orchestrated`.

After any user conversation, re-orient: if STANDARD-family/COMPREHENSIVE and the Initial Design Proposal Gate is not approved, stay in step 3; if approved and `## Selected Design` exists in `task_context.md`, continue to step 4; only then execute the next required Skill invocation. **YOU MUST** call these via the Skill tool. The primary authors plan/task/index/goal artifacts under the loaded contracts except for the explicit scope-safe reviewer write surfaces in `plan_review` and `task_review`; it never self-authors or semantically reconfirms independent review findings, or ends the turn saying "I'll now…".

## Guardrails (binding)
- **Canonical-Scope-Invariant.** Treat `concepts/scope.md` (then `specs/prd.md`, then `ux.md` or legacy `specs/ux.md`) as canonical. Planning, task artifacts, review, and feedback integration may change approach, sequencing, verification, references, and YAGNI fences — but **MUST NOT cut, narrow, expand, or reinterpret scope without an explicit user scope-change gate.** Never overwrite an existing `plan.md`, `execute.md`, or `tasks.json`; use scoped names.
- **Estimate semantics:** follow `references/estimation-guidance.md`; at both gates, keep confidence, evidence quality, cohort/analog details, token usage, monetary estimates, and billing explanations internal. Show only the applicable rounded time sentence when a valid analog exists, and never present it as a commitment.
- **Independent plan_review (STANDARD-family/COMPREHENSIVE):** `spectre-plan_review` must produce a saved plan-only review through an opposite-runtime CLI reviewer when available, or through explicit same-runtime Spectre subagent fallback when not. Under scope-safe auto-apply, the reviewer authors the report, writes complete findings before edits, applies authorized simplifications only to `plan.md`, and records every disposition/resulting plan edit. The primary validates protected inputs and outputs but **MUST NOT** substitute findings or reconstruct semantic writeback. **Do not apply Scope-Change-Required findings** — surface them.
- **Task artifact review (COMPREHENSIVE only):** `spectre-task_review` checks final draft `tasks.json` against the reviewed plan before `execute.md` exists. Under scope-safe auto-apply, the reviewer authors its report, applies authorized task fixes only to `tasks.json`, and records dispositions/resulting task edits. The primary validates protected inputs and final task structure, then creates `execute.md` once and runs deterministic `validate-pair`; it never semantically reapplies findings or edits `plan.md`/scope from task review.
- **Single automatic plan review:** each planning run invokes `spectre-plan_review` at most once, before task generation (structured) or goal generation (direct). Later artifact edits or scope-preserving feedback never trigger another plan review. A new explicit user request for plan review invokes it normally; the planner never infers a second review.
- **Review routing:** a plan review that returns without a valid report stops the route before `spectre-create_tasks` or later skills. `spectre-task_review` retains its own completed-round and recovery contract.

## Outputs + DONE
- MICRO: inline checklist only.
- LIGHT: `{FEATURE_ROOT}/specs/plan.md` (header records `Execution Mode: direct`) + `goal-prompts.md`; no task artifacts.
- STANDARD-DIRECT: LIGHT outputs + a saved `plan_review` report under `{FEATURE_ROOT}/reviews/`, with scope-safe plan findings integrated before goal generation.
- STANDARD: `{FEATURE_ROOT}/specs/plan.md` + `specs/execute.md` + `specs/tasks.json` + `goal-prompts.md` + a saved `plan_review` report under `{FEATURE_ROOT}/reviews/`, with scope-safe plan findings integrated before task generation.
- COMPREHENSIVE: STANDARD outputs + a saved `task_review` report under `{FEATURE_ROOT}/reviews/`, with scope-safe task findings integrated before one-time execute-index finalization, deterministic pair validation, and goal generation.

**Post-artifact tier re-check:** structured tiers: count parent/sub-tasks, unique files, Phase-0 deps; escalate if STANDARD reveals a missed hard-stop or any Out-of-Bounds violation; downgrade only if COMPREHENSIVE collapses to one parent with no migration/new-component/API change. Direct tiers (LIGHT/STANDARD-DIRECT): after the plan (and review, when run) exists, re-test the split blockers against actual plan content — a shared contract with >1 consuming workstream, a >2-wide parallel frontier, a needed novel abstraction, LIGHT touching >5 files, or any hard-stop ⇒ recommend the structured tier. Recommend, do **not** silently re-run. Say: *"I planned this as {tier}, but {the tasks|the plan} revealed {signal}. Recommend re-running as {new}. Reply 'rerun' or 'keep'."* and wait.

**DONE when:** tier was classified and logged (with the deciding discriminator for the STANDARD family); the tier's required skills ran (not described); required artifacts exist for the tier; for structured tiers, `execute.md` has Document Manifest / Task Detail Source / Execution Summary / Wave Plan / Parent Task Index / Slicing Rules and referenced `tasks.json` parses; for direct tiers, `plan.md` records `Execution Mode: direct`, carries the full spine, and no task artifacts were generated; for every non-MICRO tier, `goal-prompts.md` contains portable-strict structured + compact prompts generated after the tier's final artifact step; for STANDARD-family/COMPREHENSIVE, the Gate 1 remaining-planning-time sentence was presented when a valid analog existed, the Gate 2 implementation-time sentence was presented when a valid analog existed, the Initial Design Proposal Gate was approved and recorded as `## Selected Design`, one independent plan review authored a valid saved report and integrated authorized scope-safe plan edits before task or goal generation, the Final Gate was presented, and the post-artifact re-check passed/was surfaced; for COMPREHENSIVE, exactly one task-review round authored a valid report and integrated authorized scope-safe task edits before one-time `execute.md` finalization, final `validate-pair` passed, and goal generation ran last; canonical scope is unchanged (or a scope gate was raised).

## Handoff

- **MICRO:** render one copy-ready execution prompt in a fenced block — `spectre-tdd` followed by the objective, the 3–5 item checklist, and its verification signal, fully self-contained (no artifact references) so it works pasted into a fresh session. Add one alternative: rerun as LIGHT when a portable judged `/goal` handoff is wanted. Offer `spectre-plan` only if implementation exposes wider scope or a hard-stop.
- **LIGHT:** render the structured portable-strict `/goal` prompt from `goal-prompts.md` verbatim in a copy-ready fenced block as the primary next step. Add one alternative: `spectre-execute — run the plan-direct execution interactively in this session instead of goal mode.`
- **STANDARD-family/COMPREHENSIVE:** use the Final Gate below.

### Final Gate — STANDARD-family/COMPREHENSIVE
Present the tier's artifact paths (`plan.md`, `goal-prompts.md`, `reviews/…`, plus `execute.md` and `tasks.json` for structured tiers), applied review changes, skipped items, and any blocked scope-change recommendation. Count the final parents, subtasks, and dependency waves (structured) or plan workstreams and critical files (STANDARD-DIRECT) internally, then render the single **Estimated implementation time** sentence required by `references/estimation-guidance.md` immediately before the final approval sentence when a valid analog exists. Keep confidence and analog details internal; omit the estimate without warning when no valid analog exists. The estimate is informational and never delays or blocks the gate. If scope change is required, say *"This requires a scope change; I did not apply it"* and ask whether to reopen scope or keep the scope-preserving plan. Else prompt: *"Final reviewed plan/tasks and portable goal prompts are ready. Reply `Approved` to proceed to execution, or give final feedback."* Wait.
- **Feedback preserving scope** → the primary directly applies the smallest `plan.md` edit and, on structured tiers, regenerates affected task artifacts when approach/verification/deps/sequencing/references change; for task-translation-only corrections, the primary edits `tasks.json` plus affected `execute.md` rows. On direct tiers the plan edit alone suffices (keep the spine executable). Run deterministic parse/reference/post-checks and regenerate `goal-prompts.md`, but **do not re-run `plan_review` or `task_review`**. Report that the edit happened after the single review round.
- **Explicit review request** → when the user's latest instruction expressly asks for another plan review, invoke `spectre-plan_review` normally. For another task review, use `spectre-task_review --review-again` under its own contract. Generic feedback, a scope-preserving edit, or a request to continue is not authorization.
- **Feedback changing scope** → stop, route back to `spectre-scope`; do not edit plan/tasks against stale scope.

After any scope-preserving feedback changes `plan.md`, `execute.md`, `tasks.json`, or a review finding applied to them, re-run `Skill(spectre-goal)` with `--orchestrated` so `goal-prompts.md` cannot describe stale artifacts.

After approval, render the structured portable-strict `/goal` prompt from `goal-prompts.md` verbatim in a copy-ready fenced block as the primary next step, then exactly one alternative line: `Alternative: spectre-execute — run the reviewed artifacts interactively in this session instead of goal mode.` If stopping at the approved planning boundary, offer `Pause: spectre-handoff {feature}` with canonical artifact paths and the selected next step.

## Escalate-If
- Hard-stop discovered mid-flow → jump to COMPREHENSIVE rather than continuing a lower tier.
- Design alignment won't converge → surface the specific unresolved tension and let the user decide before generating the plan.
- User feedback changes canonical scope → stop and route to `spectre-scope`.

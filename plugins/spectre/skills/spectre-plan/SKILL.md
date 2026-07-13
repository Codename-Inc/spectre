---
name: spectre-plan
description: 👻 | Unified planning entry point - researches, assesses complexity, routes to workflow - primary agent
user-invocable: true
---

# plan

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# plan: Intelligent Planning Router

## Description

- **What** — Classify scope cheaply, run only needed research, route to the smallest safe workflow
- **Outcome** — MICRO uses a checklist; LIGHT writes concise `plan.md` + the `execute.md`/`tasks.json` task pair; STANDARD adds adversarial review; COMPREHENSIVE adds full research, design gate, and full review.

## ARGUMENTS Input

&lt;ARGUMENTS&gt; $ARGUMENTS &lt;/ARGUMENTS&gt;

## MANDATORY COMPLIANCE RULES

> **⚠️ NON-NEGOTIABLE**: After tier routing, MICRO must produce an inline checklist; LIGHT must invoke `Skill(spectre-create_plan)` and `Skill(spectre-create_tasks)`; STANDARD/COMPREHENSIVE must invoke `Skill(spectre-create_plan)`, `Skill(spectre-create_tasks)`, and `Skill(spectre-plan_review)` (Claude slash route: `/spectre:create_plan`, `/spectre:create_tasks`, and `/spectre:plan_review`). Failure to invoke the required routed action is a critical error. Do NOT summarize, describe, or skip these workflows. INVOKE THEM.

**After ANY user conversation or questions:**

1. Re-read this prompt from Step 4
2. Determine where you are in the workflow
3. Execute the next required Skill invocation

**You MUST call these skills (not describe them):**

- Use the **Skill** tool with `skill: "spectre-create_plan"` and `args: "{path} --depth {tier}"` — generates plan.md, including LIGHT
- Use the **Skill** tool with `skill: "spectre-create_tasks"` and `args: "{path} --depth {tier}"` — generates `specs/execute.md` and `specs/tasks.json`
- Use the **Skill** tool with `skill: "spectre-plan_review"` and `args: "{OUT_DIR} --mode {adversarial|full} --auto-apply scope-safe"` — reviews and integrates scope-safe feedback for STANDARD/COMPREHENSIVE

## Instructions

- Classify before research; do not spawn subagents until the tier and research budget are known
- Route based on hard-stops and clarity, not point-scoring
- Never overwrite existing `plan.md`, `execute.md`, or `tasks.json` artifacts for a different feature — use scoped names
- Treat `concepts/scope.md` (then `specs/prd.md` / `specs/ux.md` when present) as canonical. Plan generation, task generation, review, and feedback integration may change implementation approach, sequencing, verification, references, and YAGNI fences, but MUST NOT cut, narrow, expand, or reinterpret the agreed scope without an explicit user scope-change gate.

## Step 1 - Preflight Route

- **Action** — DetermineOutputDir:

  - `OUT_DIR=docs/tasks/{branch_name}` (or user-specified)
  - `mkdir -p "${OUT_DIR}"`

- **Action** — ScanExistingContext: Read existing artifacts in `{OUT_DIR}/` if present: `task_context.md`, `specs/plan.md`, `specs/execute.md`, `specs/tasks.json`, `concepts/scope.md`, `specs/ux.md`, `research/*.md`. Extract filled assumptions from scope/UX for later design review.

- **Action** — CheapLocalScan: Use only thread context, provided files, existing artifacts, and cheap local search (`rg`, filenames, package manifests). Do not spawn subagents.

- **Action** — CheckHardStops: Any true = automatic COMPREHENSIVE.
  - `db_schema_destructive` — drops, renames, or non-additive column changes
  - `data_migration_required` — backfill, transform, or row-by-row data change
  - `new_service_or_component` — net-new service, daemon, or top-level component
  - `auth_or_pii_change` — authn/authz flow, session handling, PII storage/exposure
  - `secrets_or_credentials_handling` — new secret introduced, rotation, or boundary change
  - `payment_billing_logic` — money flow, invoicing, charge logic
  - `public_api_change` — externally-consumed API surface modified
  - `concurrent_writes_or_locking` — concurrency, locking, or distributed coordination
  - `caching_consistency` — cache invalidation, staleness windows, multi-tier caching
  - `cross_service_or_cross_workspace_change` — coordinated change across services or workspaces
  - `slo_sla_risk` — latency, throughput, or availability budget at stake

- **Action** — DetermineTier:

  | Tier | Use when |
  | --- | --- |
  | **MICRO** | Obvious <=1 file change, no artifact needed, no hard-stop. |
  | **LIGHT** | Clear internal change, known pattern, roughly <=5 files / 1-2 components, no hard-stop. |
  | **STANDARD** | Multi-file or moderate ambiguity, no hard-stop, needs adversarial execution-readiness review. |
  | **COMPREHENSIVE** | Any hard-stop, new architecture/service/component, high ambiguity, or broad blast radius. |

  When unsure between adjacent tiers, prefer the lower tier if the missing information can be checked during execution; prefer the higher tier if the uncertainty affects scope, security/privacy, data correctness, public API behavior, or rollback safety.

- **Action** — LogTier: Note the assessed tier in your response for transparency, then proceed immediately to the next step. Do NOT ask for confirmation.

## Step 2 - Targeted Research

- **Action** — ResearchByTier:

  | Tier | Research budget |
  | --- | --- |
  | **MICRO** | None. Use cheap scan only. |
  | **LIGHT** | None by default; dispatch `@finder` only if files are unclear. |
  | **STANDARD** | Dispatch only missing dimensions, max two of `@finder`, `@analyst`, `@patterns`. No `@web-research` unless new external dependency/API/framework is likely. |
  | **COMPREHENSIVE** | Dispatch all needed dimensions: `@finder`, `@analyst`, `@patterns`, and `@web-research` only when external choices matter. |

- **Action** — SaveResearch: For MICRO, skip artifacts. Otherwise write `{OUT_DIR}/task_context.md` with `## Technical Research` plus any filled assumptions. Keep it concise; downstream skills must consume this instead of repeating research.

> **CHECKPOINT**: After determining tier and completing its research budget, proceed IMMEDIATELY to Step 3 for STANDARD/COMPREHENSIVE, or Step 4 for MICRO/LIGHT. Do NOT end turn here. Do NOT ask user to confirm the tier.

## Step 3 - High-Level Design

**SKIP IF MICRO/LIGHT** — proceed directly to Step 4. LIGHT still generates a real plan; it skips the human alignment gate.

Goal: align on the *shape* of the solution before generating a full plan. This catches misalignments early and gives the user a chance to redirect before reading a long plan doc.

- **Action** — PresentDesign: Synthesize research from Step 2 into a single proposed approach with open questions. Present inline (do not write a separate design file).

  **Format**:

  > Here's the high-level design I'd take. Scan the shape, then resolve any open questions or push back on the approach.
  >
  > **Approach**: [1-2 paragraph summary of the solution shape — what changes structurally, not file-by-file]
  >
  > **Key components touched**:
  > - `path/file.ts` — [what shifts and why]
  > - `path/other.ts` — [what shifts and why]
  >
  > **Key decisions**:
  > - [decision] — [rationale; alternative considered]
  > - [decision] — [rationale; alternative considered]
  >
  > **How we'll know it works** (verification spine):
  > - [change] → [test name | observable behavior | state condition]
  > - [change] → [test name | observable behavior | state condition]
  >
  > **Filled assumptions** (surfaced from scope.md / ux.md / inferred):
  > - [assumption] — *source: [scope.md / ux.md / default]*
  > - [assumption] — *source: [scope.md / ux.md / default]*
  >
  > **Open questions** (with default assumption):
  > 1. [question] — *default: [assumption]*
  > 2. [question] — *default: [assumption]*
  >
  > Reply with answers, edits to the approach, or 'looks good' to continue.

  **CRITICAL**:
  - **Single proposed approach**, not a menu. If a true fork exists, surface it as an open question with your recommendation — not as parallel options.
  - Stay at the *shape* level: components, key decisions, structural changes. Defer file-by-file detail to `create_plan`.
  - **Verification is mandatory.** Every major change in the approach must declare how it will be checked — falsifiable signal, not prose. This becomes the spine that `create_plan` and `create_tasks` build on.
  - **Filled assumptions are mandatory.** If scope.md or ux.md left something silent and you defaulted it, surface the default here. Reviewer-visible by design — these are the silent decisions that bite at execution.
  - Open questions should be specific and answerable; pair each with a default assumption so the user can skip if the default is fine.

- **Action** — IterateDesign: If the user replies with answers, edits, or pushback, update the design and re-present. Loop until user says 'looks good' (or equivalent).

- **Wait** — User signals alignment.

- **Action** — PersistDesign: Append a "Selected Design" section to `{OUT_DIR}/task_context.md` capturing the agreed approach, key decisions, and resolved questions. This is what `create_plan` consumes.

> **CHECKPOINT**: After alignment, proceed IMMEDIATELY to Step 4. This is the early gate. The next valid actions are Skill invocations that generate the draft plan, generate tasks, run plan_review, integrate scope-safe feedback, and then present the final plan/tasks for the user's final gate.

## Step 4 - Route to Workflow

### ⛔ MANDATORY SKILL INVOCATION ⛔

```plaintext
┌────────────────────────────────────────────────────────────────────────┐
│  YOU MUST USE THE SKILL TOOL TO INVOKE THESE COMMANDS                  │
│                                                                        │
│  ❌ WRONG: "I'll now create the plan..."                               │
│  ❌ WRONG: "The next step would be to run /spectre:create_plan"        │
│  ❌ WRONG: Ending turn without invoking Skill tool                     │
│                                                                        │
│  ✅ CORRECT: MICRO inline checklist OR required Skill invocations       │
│  ✅ CORRECT: Skill tool with skill: "spectre-create_plan", args: "..." │
│  ✅ CORRECT: Skill tool with skill: "spectre-create_tasks", args: "..."│
│  ✅ CORRECT: Skill tool with skill: "spectre-plan_review", args: "..." │
└────────────────────────────────────────────────────────────────────────┘
```

**DO NOT:**

- Say you’ll create a plan or set of tasks yourself without running the skill tool
- Describe what you would do
- Summarize the plan/task steps yourself
- End your turn without invoking Skill
- Write plan.md, execute.md, or tasks.json content directly

**YOU MUST:**

- MICRO: write an inline checklist, no artifacts.
- Use the Skill tool: `skill: "spectre-create_plan"`, `args: "{OUT_DIR}/task_context.md --depth {tier}"`
- Use the Skill tool: `skill: "spectre-create_tasks"`, `args: "{OUT_DIR}/task_context.md --depth {tier}"`
- For STANDARD: use `skill: "spectre-plan_review"`, `args: "{OUT_DIR} --mode adversarial --auto-apply scope-safe"`
- For COMPREHENSIVE: use `skill: "spectre-plan_review"`, `args: "{OUT_DIR} --mode full --auto-apply scope-safe"`

---

### Routing Logic

- **If MICRO**:

  - **Action** — PresentMicroChecklist: Summarize the intended change in 3-5 checkboxes with one verification signal. State that MICRO skipped artifacts and review by design.
  - Skip to footer

- **ElseIf LIGHT**:

  - **INVOKE NOW** → Skill tool with `skill: "spectre-create_plan"`, `args: "{OUT_DIR}/task_context.md --depth light --no-review"`
  - **Wait** — Returns concise plan with solution shape, patterns, risks, and verification approach
  - **INVOKE NOW** → Skill tool with `skill: "spectre-create_tasks"`, `args: "{OUT_DIR}/task_context.md --depth light"`
  - **Wait** — Returns task breakdown grounded in the light plan
  - **Action** — VerifyExecutionIndex: Cheaply verify `{OUT_DIR}/specs/execute.md` exists and contains `Document Manifest`, `Task Detail Source`, `Execution Summary`, `Wave Plan`, `Parent Task Index`, and `Slicing Rules`; verify the referenced `tasks.json` parses. Do not read full task bodies or reconstruct the index.
  - **Action** — PresentLightArtifacts: Summarize `{OUT_DIR}/specs/plan.md`, `{OUT_DIR}/specs/execute.md`, and `{OUT_DIR}/specs/tasks.json`. State that LIGHT skipped `plan_review` and the human execution gate by design.
  - Skip to footer

- **ElseIf STANDARD**:

  - **INVOKE NOW** → Skill tool with `skill: "spectre-create_plan"`, `args: "{OUT_DIR}/task_context.md --depth standard --no-review"`
  - **Wait** — Returns focused plan (Overview, Approach, Out of Scope)
  - **INVOKE NOW** → Skill tool with `skill: "spectre-create_tasks"`, `args: "{OUT_DIR}/task_context.md --depth standard"`
  - **Wait** — Returns task breakdown
  - **Action** — VerifyExecutionIndex: Cheaply verify `{OUT_DIR}/specs/execute.md` exists and contains `Document Manifest`, `Task Detail Source`, `Execution Summary`, `Wave Plan`, `Parent Task Index`, and `Slicing Rules`; verify the referenced `tasks.json` parses. Do not read full task bodies or reconstruct the index.
  - **INVOKE NOW** → Skill tool with `skill: "spectre-plan_review"`, `args: "{OUT_DIR} --mode adversarial --auto-apply scope-safe"`
  - **Wait** — Returns adversarial findings, applied edits, skipped scope-changing recommendations, and updated artifacts
  - **Action** — IntegratePlanReviewFeedback: Read the plan_review report path returned by `plan_review`. Confirm every scope-safe Blocker/High finding is reflected in `plan.md`, `execute.md`, and/or `tasks.json`. If `plan_review` changed parent task ids, parent titles, dependencies, or wave guidance, update only the affected index rows in `execute.md`; otherwise do not rebuild the index. If `plan_review` produced a scope-safe suggested edit but did not apply it because it needed minor adaptation, apply the smallest artifact edit now and record it in the final summary. Do not apply Scope Change Required findings.
  - Continue to Final Gate

- **ElseIf COMPREHENSIVE**:

  - **INVOKE NOW** → Skill tool with `skill: "spectre-create_plan"`, `args: "{OUT_DIR}/task_context.md --depth comprehensive --no-review"`
  - **Wait** — Returns full plan (all sections: Architecture, Phases, API Design, Testing Strategy, etc.)
  - **INVOKE NOW** → Skill tool with `skill: "spectre-create_tasks"`, `args: "{OUT_DIR}/task_context.md --depth comprehensive"`
  - **Wait** — Returns task breakdown
  - **Action** — VerifyExecutionIndex: Cheaply verify `{OUT_DIR}/specs/execute.md` exists and contains `Document Manifest`, `Task Detail Source`, `Execution Summary`, `Wave Plan`, `Parent Task Index`, and `Slicing Rules`; verify the referenced `tasks.json` parses. Do not read full task bodies or reconstruct the index.
  - **INVOKE NOW** → Skill tool with `skill: "spectre-plan_review"`, `args: "{OUT_DIR} --mode full --auto-apply scope-safe"`
  - **Wait** — Returns full-lens findings, applied edits, skipped scope-changing recommendations, and updated artifacts
  - **Action** — IntegratePlanReviewFeedback: Read the plan_review report path returned by `plan_review`. Confirm every scope-safe Blocker/High finding is reflected in `plan.md`, `execute.md`, and/or `tasks.json`. If `plan_review` changed parent task ids, parent titles, dependencies, or wave guidance, update only the affected index rows in `execute.md`; otherwise do not rebuild the index. If `plan_review` produced a scope-safe suggested edit but did not apply it because it needed minor adaptation, apply the smallest artifact edit now and record it in the final summary. Do not apply Scope Change Required findings.
  - Continue to Final Gate

---

### Post-Tasks Tier Re-check

After tasks return, do a fast self-check against tier signals:

- Count parent tasks, sub-tasks, files touched (sum of unique paths in Context blocks), and Phase 0 dep count.
- **Escalation triggers** (any true → recommend re-running at a higher tier):
  - Tier was LIGHT but tasks touch >3 files OR have >2 parent tasks
  - Tier was STANDARD but tasks reveal a hard-stop signal not caught earlier (e.g., a migration sub-task appeared)
  - Tasks contain any Out-of-Bounds violation
- **Downgrade triggers** (rare; only suggest if confident):
  - Tier was COMPREHENSIVE but tasks collapsed to a single parent with no migrations, no new components, and no API change

If an escalation/downgrade is triggered, surface it as a recommendation — do NOT silently re-run. Format:

> Tier reassessment: I planned this as {original tier}, but tasks revealed {signal}. Recommend re-running as {new tier}. Reply 'rerun' to regenerate or 'keep' to proceed as-is.

Only proceed past this checkpoint when the user confirms.

---

### Final Gate

- **Action** — PresentFinalArtifacts:
  - Summarize final artifact paths: `{OUT_DIR}/specs/plan.md`, `{OUT_DIR}/specs/execute.md`, `{OUT_DIR}/specs/tasks.json`, and the saved plan_review report under `{OUT_DIR}/reviews/`.
  - Summarize review integration: findings applied by `plan_review`, any additional plan-orchestrator edits applied to integrate feedback, skipped edits, and any recommendations that were blocked because they would change canonical scope.
  - If plan_review surfaced a scope-changing recommendation, state: "This requires a scope change; I did not apply it." Ask the user whether to reopen scope or approve the current canonical-scope-preserving plan/tasks.
  - Otherwise prompt: "Final reviewed plan and task artifacts are ready. Reply `Approved` to proceed to execution, or provide final feedback."

- **Wait** — User final approval or feedback.

- **If feedback preserves canonical scope** — apply the smallest edits to `plan.md`, `execute.md`, and/or `tasks.json`, re-run `plan_review {OUT_DIR} --auto-apply scope-safe` if the feedback changes implementation approach, verification, dependencies, task sequencing, or references, then present the Final Gate again.
- **If feedback changes canonical scope** — stop and route back to `/spectre:scope` (or explicitly update the canonical scope artifact if the user directs it). Do not silently update plan/tasks against stale scope.

---

- **Action** — RenderFooter: Use `@skill-spectre:spectre-guide` skill for Next Steps

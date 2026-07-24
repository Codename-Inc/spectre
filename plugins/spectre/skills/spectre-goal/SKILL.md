---
name: "spectre-goal"
description: "Generate portable, transcript-verifiable `/goal` prompts from finalized Spectre task artifacts or existing plan-direct execution state, requiring spectre-execute followed by spectre-proof before success. Use when spectre-plan routes here after task generation/review, or when regenerating an autonomous execution handoff from existing structured or plan-direct state. Do NOT use to create planning/execution artifacts, run implementation, or handle quick one-step work."
user-invocable: true
---

# goal

Turn existing Spectre planning and execution-state artifacts into a copy-ready autonomous completion contract. Write one portable-strict goal in structured and compact forms; both forms have identical scope, process, verification, and stopping semantics.

## Inputs

- `$ARGUMENTS` — task/output directory, optional execute-index path or source-plan path plus `execution_state.md`, optional turn/time cap, and `--orchestrated` when a parent workflow owns the next step.
- Goal accepts either structured execute/tasks artifacts or a readable source plan plus its `execution_state.md`.
- Structured mode uses finalized planning artifacts under `OUT_DIR`: approved scope/UX/PRD when present, reviewed `specs/plan.md`, `specs/execute.md`, and its referenced `specs/tasks.json`. For COMPREHENSIVE plans, the task-review report must exist and all scope-safe Blocker/High findings must already be integrated.
- Plan-direct prompts require only readable plan/runtime inputs; they do not require `execute.md`, `tasks.json`, plan-completeness review, or task review.

## Working Set

- Resolve `FEATURE_ROOT` in this order: an explicit feature directory or feature name; a supplied artifact beneath the feature root; one unambiguous feature artifact in the current conversation. Never infer it from the branch, recency, or lifecycle state.
- An explicit legacy `docs/tasks/**` plan/execute/task artifact remains a compatibility input, but new goal prompts require a confirmed `.spectre/features/<feature-name>/` root and record the legacy source.
- Resolve `INPUT_MODE`: use structured mode for an explicit/default execute index with its resolvable task source; use plan-direct mode for an explicit readable source plan plus existing readable runtime state.
- Structured mode: `OUT_DIR = FEATURE_ROOT`; `EXECUTE_INDEX = explicit path || {FEATURE_ROOT}/specs/execute.md`; resolve `TASKS_JSON` from its `Task Detail Source`.
- Plan-direct mode: `PLAN_SOURCE = explicit readable plan path`; `EXECUTION_STATE = explicit path || {dirname(PLAN_SOURCE)}/execution_state.md`; `OUT_DIR = FEATURE_ROOT`.
- `GOAL_FILE = {OUT_DIR}/goal-prompts.md`.
- `SOURCE_MANIFEST` is mode-specific: structured mode uses `EXECUTE_INDEX`, targeted `TASKS_JSON` projections, and actual files in the execute index's `Document Manifest`; plan-direct mode uses `PLAN_SOURCE`, `EXECUTION_STATE`, and the readable process/scope paths recorded in its source manifest.
- Read `EXECUTE_INDEX` whole in structured mode and only targeted `TASKS_JSON` projections: `meta`, status counts, requirement trace, and acceptance-criterion text needed to name verification surfaces. Do not load the whole task graph. In plan-direct mode, read `PLAN_SOURCE`, `EXECUTION_STATE`, and the resolved manifest paths whole.

## Completion contract

Derive every prompt from six load-bearing elements:

1. **Outcome** — the concrete approved end state, not “finish the plan.”
2. **Verification** — `spectre-execute` satisfies its DONE contract, then `spectre-proof` records aggregate `PASS`; require the agent to print a concise evidence capsule into the transcript.
3. **Constraints (must not)** — preserve canonical scope and Out-of-Bounds; do not weaken/delete tests, silently change public behavior, add unapproved proof dependencies, ship, publish, or share.
4. **Scope** — exact canonical artifact paths and permitted repository boundary.
5. **Iteration** — structured mode resumes from durable `tasks.json` and proof state. In plan-direct mode, resume from durable `execution_state.md` plus proof state. Follow each skill's bounded repair/adaptation rules and record the next evidence-driven move.
6. **Stop** — success only when verification passes; otherwise stop at the explicit cap or a real escalation condition and report attempts, evidence, blocker, and required input. Reaching the cap is not success.

Use an explicit user cap when supplied. Otherwise use 40 goal turns and state that visible assumption in the document. A cap is a safety checkpoint, never an alternate completion condition.

## Method / guardrails

1. Validate the selected input branch without crossing its boundary:
   - Structured mode validates that the plan/task artifacts are finalized and mutually consistent. If artifacts are missing, task review is still pending, or a required verification signal is not executable, stop and route to `Skill(spectre-plan)`; do not invent a goal.
   - Plan-direct mode requires only readable plan/runtime inputs. If `PLAN_SOURCE` or `EXECUTION_STATE` is absent or unreadable, stop and report the missing input; do not create it, generate task artifacts, or review plan completeness.
2. Extract the objective, canonical scope, Out-of-Bounds, exact artifact paths, and primary verification surfaces. Point to source artifacts instead of pasting the PRD or task graph into the prompt.
   - Verify that the evidence measures the approved outcome rather than a convenient proxy; cover material qualities the user asked for, not only the easiest metric.
   - Keep scope broad enough to repair an upstream cause but narrow enough to audit against the canonical artifacts.
3. Require this process order in both prompt forms:
   - Structured mode runs `Skill(spectre-execute)` with `EXECUTE_INDEX --orchestrated`.
   - Plan-direct mode: invoke `Skill(spectre-execute)` with the source-plan path and `--orchestrated`.
   - Structured mode: only after execute meets its DONE contract, run `Skill(spectre-proof)` with `OUT_DIR --orchestrated` and follow its proof-repair loop until aggregate `PASS` or escalation.
   - Plan-direct mode: only after execute is DONE, invoke `Skill(spectre-proof)` with the same output directory (`OUT_DIR`), `PLAN_SOURCE`, and `--orchestrated`; follow its proof-repair loop until aggregate `PASS` or escalation.
   - Do not imitate, summarize away, or bypass either skill's current contract.
4. Require a final transcript evidence capsule containing task status counts, deterministic checks and exit results, final review/validation status, proof-matrix counts and aggregate status, artifact paths, repairs, and limitations. This makes one prompt verifiable by both Codex and transcript-only evaluators.
5. Write `goal-prompts.md` with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>` immediately below its title, then:
   - source-artifact manifest and visible assumptions;
   - **Portable strict — recommended** selection note;
   - **Structured prompt** with `/goal`, **Outcome**, **Verification**, **Constraints (must not)**, **Scope**, **Process**, **Iteration**, and **Stop** fields;
   - **Compact prompt** preserving the exact same contract in a shorter form.
6. Check each copyable prompt independently:
   - at most 4,000 characters;
   - concrete outcome and real verification surfaces;
   - execute appears before proof;
   - aggregate `PASS` is the only success state;
   - cap and blocked path are explicit;
   - no vague finish line, judgment-only criterion, wrong/proxy metric, invented command, duplicated PRD, transcript-blind claim, or weakened must-not.

## Prompt forms

Substitute actual values from the artifacts; do not emit placeholders.

**Structured prompt**

```text
/goal <one-sentence approved end state>

Outcome: <measurable user-visible result>
Verification: <execute DONE evidence>; then <proof.json aggregate PASS>; print <evidence capsule> in the transcript.
Constraints (must not): <canonical Out-of-Bounds and regression fences>
Scope: <repository boundary plus exact mode-specific source-manifest paths>
Process: run Skill(spectre-execute) with <execute index or source-plan path> --orchestrated; only after DONE, run Skill(spectre-proof) with <output directory in structured mode; source-plan path and output directory in plan-direct mode> --orchestrated.
Iteration: <resume durable tasks or execution-state plus proof state, record evidence, choose the next skill-authorized move>
Stop: success = execute DONE and proof aggregate PASS; OR checkpoint after <cap>; OR if blocked, report attempts, evidence, blocker, and required input. Reaching the cap is not success.
```

**Compact prompt**

```text
/goal <approved end state>, verified by Skill(spectre-execute) completing <execute index or source plan> --orchestrated and then Skill(spectre-proof) recording aggregate PASS with <output directory in structured mode; source plan and output directory in plan-direct mode> --orchestrated. Preserve <scope and must-nots>. Resume from durable task or execution-state plus proof state and print the final evidence capsule into the transcript. Success requires execute DONE plus proof PASS; otherwise checkpoint after <cap> or report the evidenced blocker and required input. Reaching the cap is not success.
```

## Outputs + DONE

- `GOAL_FILE` exists and contains the source manifest, visible assumptions, structured prompt, and compact prompt.
- Both prompts pass the portable-strict checks, reference existing artifacts, and are semantically equivalent.
- The file identifies the selected structured or plan-direct source branch; this skill generates prompts but never starts goal mode.
- Goal does not create plan-direct artifacts or introduce a new success, cap, or proof rule.

## Handoff

Report `GOAL_FILE`, the chosen cap, and the exact source artifacts.

- `--orchestrated` → return the generated prompt path and validation result to the caller without user-facing Next Steps.
- Standalone → `Next (recommended): run the structured portable-strict /goal prompt in {GOAL_FILE} — it preserves the approved execute→proof completion contract.` Add `Alternative: /spectre:execute — use the direct interactive path instead of goal mode.` Offer the compact prompt only when a shorter copy/paste surface is useful, and `/spectre:handoff` only when pausing before execution.

## Escalate-If

- The approved outcome is subjective or cannot be proven by public behavior/evidence.
- The selected branch's authoritative scope, plan, execution, task, or review artifacts conflict.
- Proof requires a new dependency, credentials, external service, OS permission, hardware, or human judgment that has not been approved.
- The requested objective is quick one-step work where goal-mode overhead is not justified.

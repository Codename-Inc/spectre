---
name: "spectre-goal"
description: "Opt-in utility that turns reviewed Spectre plans or execution state into one safe, verifiable `/goal` completion contract for Codex, Claude Code, or both. Use only when a user explicitly asks for an autonomous goal prompt. Do NOT use as the Plan handoff, or to plan, implement, start goal mode, or handle quick work."
user-invocable: true
disable-model-invocation: true
---

# goal

## Purpose

Write one autonomous completion contract whose success is provable by surfaced evidence. This is an explicit utility outside the default Plan → Execute route: `spectre-plan` never invokes it, and `spectre-execute` remains the sole implementation, repair, review, validation, and proof authority.

## Inputs

- `$ARGUMENTS`: finalized execute index or readable source plan plus its `execution_state.md`; optional target (`Codex`, `Claude Code`, or `both`), turn/time cap, and `--orchestrated`.
- **Structured:** reviewed plan, execute index, referenced tasks, and approved scope/UX/PRD when present. XL also requires completed task review with scope-safe Blocker/High findings integrated.
- **Plan-direct:** only readable plan/runtime inputs: a source plan plus its `execution_state.md`, or a plan marked `Execution Mode: direct`; no execute/tasks artifacts or plan/task review required.

## Working Set

- Reuse a managed `FEATURE_ROOT` only when explicit/current-thread evidence ties it to this work (physical directory wins; never branch/recency/lifecycle/scans); distinct work ignores ambient roots. Otherwise, including on collision, standalone MUST first load and follow `Skill(spectre-feature-root)` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Structured source: execute index plus targeted task projections needed for objective, trace, acceptance, and verification; read run progress from `node "${PLUGIN_ROOT}/hooks/scripts/workflow-cli.mjs" run status`, never from the task graph. Plan-direct source: plan, existing state, and its recorded scope/process manifest.
- `GOAL_FILE={FEATURE_ROOT}/goal-prompts.md`.

## Outputs + DONE

`GOAL_FILE` contains exactly one copy-ready goal prompt. It starts with `/goal `: no title, preamble, manifest, selection note, rationale, or compact alternative. Put assumptions inside the relevant goal section.

Use this exact readable shape, substituting real values and preserving a blank line before and after every Markdown heading:

```markdown
/goal <one-sentence approved end state>. Persistent execution authority: before implementation on initial entry and every continuation/resume, including after compaction, YOU MUST invoke/reload Skill(spectre-execute) with <exact execute index or source plan and feature root> --orchestrated and follow it through DONE, including aggregate proof PASS. Do not implement directly or substitute another workflow.

## Outcome

<concrete, measurable approved end state>

## Verification

<exact evidence that proves the outcome and must be surfaced in the transcript>

## Constraints (must not)

<canonical Out-of-Bounds and regression fences>

## Scope

<authoritative inputs and auditable repository boundary>

## Iteration

<durable state, evidence recorded after each attempt, and next-move policy>

## Stop

<success, checkpoint-cap, and NEEDS_AUTHORITY conditions>
```

The completed prompt is ≤4,000 characters and satisfies all six fields:

1. **Outcome:** concrete—not “finish the plan.” Quantify it when possible; otherwise use a known-good reference. Subjective qualities require approved human/reviewer sign-off.
2. **Verification:** exact existing tests, commands, benchmarks, artifacts, and proof evidence that measure every material requested quality rather than a proxy. Codex may re-run evidence. Claude Code must run checks and print outputs/exit codes because its evaluator is transcript-only. For `both` or unknown, use the Claude-compatible standard.
3. **Constraints:** preserve canonical scope/Out-of-Bounds, public behavior, tests, dependencies, schemas, and approval boundaries; do not ship, publish, or share unless approved.
4. **Scope:** narrow enough to audit, broad enough for upstream root-cause repair.
5. **Iteration:** every continuation/resume invokes/reloads `Skill(spectre-execute)` before implementation, then resumes structured mode from `tasks.json` or plan-direct mode from `execution_state.md`; record evidence and choose only Execute-authorized moves. Never suppress failures.
6. **Stop:** success only when verification passes and execute reaches DONE with aggregate proof `PASS`. An explicit cap or visible 40-turn default is a durable checkpoint: persist evidence and the next action, then resume when the platform permits. `NEEDS_AUTHORITY` reports attempts, evidence, blocker, and exact input needed.

Execute authority persists beyond the first step. Structured mode passes `EXECUTE_INDEX --orchestrated`; plan-direct mode passes the source-plan path, `FEATURE_ROOT`, and `--orchestrated`. Execute owns single-pass proof invocation plus repair/reinvoke closure. The goal forbids direct implementation, imitation, bypass, summarization-away, workflow substitution, and direct `spectre-prove` invocation.

Require a final transcript evidence capsule containing task counts, deterministic checks/exits, review/validation status, proof-matrix counts and aggregate status, artifacts, repairs, and limitations.

DONE means the one prompt passes the contract and quality checks, references authoritative sources, and contains no prose outside the goal itself. This skill never starts goal mode or creates/reviews planning artifacts.

## Method / guardrails

1. Validate inputs. Structured artifacts must be finalized, mutually consistent, reviewed as required, and verifiable; otherwise route to `Skill(spectre-plan)`. Plan-direct requires a readable plan; when marked direct before execution, name the state path execute will create.
2. Map existing evidence into the six fields before asking anything. Infer ordinary constraints/boundaries and state assumptions in the applicable section. If target, measurable outcome, verification, or cap remains genuinely undecidable, ask at most three focused questions; under `--orchestrated`, return those gaps to the caller instead.
3. Verify every named command or evidence surface from readable project artifacts; never invent commands. If no credible verification exists, require an approved test, benchmark, reference, or human sign-off surface first; otherwise withhold the goal.
4. Reject drafts with a vague finish line, wrong/proxy metric, judgment-only success, pasted-PRD condition, transcript-blind evidence, missing must-nots, invented command, unauditable scope, cap presented as success, missing blank-line section spacing, or prose outside the `/goal` contract.
5. Point to plans/specs for background instead of pasting them. Emit no placeholders.

## Handoff

`--orchestrated` returns `GOAL_FILE`, runtime, cap, sources, assumptions, and validation only.

| Handoff | Details |
|---|---|
| 🧭 **Current phase** | Done |
| 📦 **What was just done** | Result |
| ▶️ **Proposed next step** | Render resolved action. |

Standalone: run `/goal` from resolved goal file path; pause → Handoff.

## Escalate-If

- The outcome or a material quality cannot be operationalized or routed to approved human judgment.
- Authoritative scope, plan, execution, task, review, or verification evidence conflicts.
- Proof needs an unapproved dependency, credential, external service, permission, hardware, destructive action, or human decision.
- The objective is quick one-step work where goal-mode overhead is unjustified.

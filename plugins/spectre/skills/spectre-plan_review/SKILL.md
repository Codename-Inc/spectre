---
name: "spectre-plan_review"
description: "Simplify plan.md before task generation: remove over-engineering, prefer boring reuse, and cap each Test Opportunity at one happy + primary-failure test. Use after create_plan and before create_tasks. Do not review tasks/code or change scope."
user-invocable: true
---

# plan_review

## Purpose

Plan-only simplification gate: find the simplest path that delivers every agreed requirement, then remove everything else before task generation.

## Inputs

- `$ARGUMENTS`: explicit feature name/root or descendant `plan.md`; optional `--auto-apply scope-safe`.
- Required: `{FEATURE_ROOT}/specs/plan.md`. Read canonical scope in order: `concepts/scope.md`, `specs/prd.md`, `specs/ux.md`, explicit requirements in `task_context.md`; read relevant `research/*.md`. Missing plan -> `/spectre:create_plan`.

## Working Set

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact; otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; disclose it in an existing user gate or normal response without waiting. Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. Inferred names use the first free `.spectre/features/<name>[-N]/`.
- Initialize new roots with lifecycle-neutral `feature.json`. The physical feature directory is authoritative; repair stale feature name/root metadata before continuing. Pass the exact feature root unchanged to every reviewer. Legacy plans are readable; new reports require a confirmed `.spectre/features/<feature-name>/` root.
- `REVIEW_REPORT={FEATURE_ROOT}/reviews/plan_review.md`; if it exists, write `plan_review_{timestamp}.md`.

## Outputs + DONE

`REVIEW_REPORT` is self-locating with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`. It contains: Simplest Viable Plan; Must Delete; Collapse/Reuse/Defer; Test Opportunities (requirement + representative pair + removals); Required Complexity Retained; findings (`# | Severity | Location | Finding | Suggested Edit`); a disposition ledger (`Finding | Disposition | Resulting Plan Edit`) using `addressed`, `skipped`, `unresolved`, or `scope-change`; Before -> After; summary + reviewer metadata. `No scope-safe deletion found` is valid only with requirement/necessity traceability for everything retained.

DONE when every retained element and Test Opportunity is source-backed; for an `Execution Mode: direct` plan every Verification signal is executable; each opportunity has one representative happy + primary-failure test; `plan.md` carries the accepted Test Opportunity inventory; the plan is smaller or the report proves no safe reduction; every finding has one disposition and every addressed finding identifies its resulting plan edit; scope changes remain unapplied; and post-edit checks preserve scope and Out-of-Bounds.

## Method / guardrails

**Canonical Scope Invariant:** remove implementation choices, tasks, tests, dependencies, and process, but **MUST NOT** narrow, expand, or reinterpret agreed scope. Changes to scope become **Scope Change Required** and are never auto-applied.

**Simplify:** trace every component/abstraction/dependency/task/test/process step to a requirement and removal failure. Delete speculation, premature hardening, redundant verification, and artifacts. Collapse single-caller/pass-through/duplicate/fragmented work. Reuse concrete patterns instead of frameworks, factories, adapters, config layers, dependencies, or novelty. Defer extensibility, telemetry, optimization, compatibility, migration tooling, and broad coverage. Prefer boring solutions; delete/defer anything untraceable.

**Test Opportunity budget:** A Test Opportunity is the smallest behavior unit: a function, route, bug fix, or acceptance criterion. Derive it from assigned behavior. Do not manufacture extra opportunities solely from files, layers, tasks, helpers, branches, or internal steps. Per opportunity, keep exactly one representative happy-path test and one representative primary-failure test — then stop; existing tests may satisfy either. Another opportunity requires distinct required behavior and a cited requirement. Reject third cases, matrices, implementation-detail tests, and elaborate setup; defer broader coverage.

**Direct-execution spine check:** when `plan.md` records `Execution Mode: direct`, additionally verify every Verification signal is executable — a runnable command or a concrete observable/state condition. A judgment-only signal ("works correctly") is a High finding whose Suggested Edit supplies a concrete executable replacement; the spine is the sole acceptance authority for plan-direct execution. Structured plans skip this check.

**Anti-expansion guardrail:** this review is simplification-only. Do not add architecture, layers, tasks, dependencies, tests, matrices, references, or docs for completeness. Add only minimum replacement detail after a larger cut or to resolve an execution-blocking nonexistent reference, dependency, or verification gap exposed while simplifying. Review in one pinned process; do not delegate.

Severity: **Blocker** = scope cannot ship; **High** = scope-safe over-engineering, manufactured Test Opportunity, or excess tests; **Medium** = material collapse/reuse/boring substitution; **Scope Change Required** = user approval needed. No Low/style findings.

**Write-back ownership:** the reviewer may write only `REVIEW_REPORT` and `plan.md`; scope, requirements, task artifacts, and implementation files are immutable. The reviewer writes the complete findings before editing `plan.md`. `--auto-apply scope-safe` authorizes it to apply scope-safe Blocker/High and unambiguous Medium simplifications, then append one disposition and resulting plan edit per finding. Otherwise it writes the report only and the primary asks `all|blockers|IDs|skip`; after selection, the same route receives a writeback-only continuation with the saved findings and selected IDs. That continuation applies the selection and updates dispositions but does not repeat semantic review. Replace broad test matrices with the accepted Test Opportunity inventory and never apply scope changes. The primary validates protected scope/context hashes, output readability, required plan sections, Test Opportunity inventory, and disposition completeness; it does not recreate or semantically reconfirm reviewer findings.

**Reviewer route:** prefer the opposite runtime, launch long-running, and poll. Allow up to 20 minutes for completion. Do not pass launcher timeout or duration guidance to the reviewer. Once a route returns a semantically usable review, the semantic review is complete: the primary directly normalizes report-only contract defects — verified counts, paths, citations, route metadata, sections/tables, and invalid or forbidden enum values such as `Low` — from the reviewer's existing finding, evidence, consequence, and the schema definitions. Severity-enum normalization is mechanical when it preserves the finding's meaning, evidence, recommendation, disposition, and resulting plan edit; it never triggers another reviewer or fallback. The primary must not originate findings or materially reinterpret their substance. If a route produces no semantically usable review, use native fallback without a report-only repair attempt. Unavailable opposing runtimes never block completion.

```bash
claude -p --model opus --effort high --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Write,Edit" --output-format text "$REVIEW_PROMPT"
codex exec -C "$PWD" -m gpt-5.6-sol -c 'model_reasoning_effort="high"' -s workspace-write "$REVIEW_PROMPT"
```

`REVIEW_PROMPT` includes the exact feature root, protected-input hashes, scope invariant, simplification contract, report/disposition schema, diagnosis-before-edit ordering, and write permission limited to `REVIEW_REPORT` and `plan.md`. It forbids editing scope, requirements, task artifacts, or implementation code. The reviewer must not rederive the feature root from branch or repository activity. Codex -> Claude Code: `Reviewer Runtime: Claude Code`, `Reviewer Model: opus`, `Reviewer Effort: high`, `Invocation Route: Codex -> Claude Code`. Claude Code -> Codex: `Reviewer Runtime: Codex`, `Reviewer Model: gpt-5.6-sol`, `Reviewer Effort: high`, `Invocation Route: Claude Code -> Codex`. Native fallback uses one clean-context `@spectre:reviewer` with the same semantic and write-back contract, no delegation, and writes the same two authorized artifacts; record route metadata and reason. If a fallback can return only a report, preserve it and stop before task creation rather than transferring semantic write-back to the primary. The primary must not originate or materially reinterpret semantic findings; mechanical validation is orchestration, not self-review.

## Handoff

Return route/fallback, Simplest Viable Plan, Before -> After, findings, report path, applied/skipped, withheld scope changes, and updated plan. Orchestrated calls return directly; standalone blockers stay in remediation, otherwise recommend `/spectre:create_tasks`.

## Escalate-If

- Plan missing; simplification needs scope change; or post-edit scope/Out-of-Bounds checks fail.

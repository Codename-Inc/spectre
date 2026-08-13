---
name: "spectre-plan_review"
description: "Review plan.md for correctness, then simplify without repeated research. Use after create_plan and before create_tasks; do not review tasks/code or change scope."
user-invocable: true
---

# plan_review

## Purpose

Produce the smallest correct plan via one evidence wave, then correctness and simplification reviews.

## Inputs

- `$ARGUMENTS`: feature root/name or descendant `plan.md`; optional `--auto-apply scope-safe`, `--orchestrated`.
- Require `{FEATURE_ROOT}/specs/plan.md` or route to `/spectre:create_plan`. Scope order: `concepts/scope.md`, `specs/prd.md`, `specs/ux.md`, explicit `task_context.md` requirements. Reuse existing research.

## Working Set

Resolve from an explicit/current-thread artifact; otherwise create the first free `.spectre/features/<kebab-name>[-N]/` with neutral `feature.json`. Never infer from branch, recency, lifecycle, or scans.

Reports: `reviews/plan_correctness.md` and `reviews/plan_review.md`. Resume a sole correctness report only when its post-edit hash matches `plan.md`; otherwise use absent canonical paths or timestamped siblings. Pass exact paths.

## Outputs + DONE

`plan_correctness.md`: pair/reviewer metadata; evidence ledger (`Question | Evidence | Verdict | Unknowns`); findings (`# | Severity | Category | Location | Finding | Consequence | Suggested Edit`); retained constraints; tests; dispositions/edits; hashes.

`plan_review.md`: pair/reviewer metadata and correctness path/hash; Simplest Viable Correct Plan; Must Delete; Collapse/Reuse/Defer; retained complexity; tests with requirement/risk, baseline pair, extras/removals; findings/dispositions; Before -> After. No deletion requires traceability for retained elements.

DONE: both reports complete; research ran once at most; findings/tests evidenced; no correctness Blocker/High remains; scope changes withheld; every finding disposed and addressed edit named; hash/scope checks pass; constraints survive; `plan.md` carries accepted tests and executable direct-mode Verification.

## Method / guardrails

**Canonical Scope Invariant:** improve the plan without narrowing, expanding, or reinterpreting scope. Mark required changes `Scope Change Required`; never auto-apply them.

1. **Shared evidence.** List unsupported material claims after reading plan/research. If evidence is insufficient, use at most one each: `@spectre:finder` for locations, `@spectre:analyst` for flows/assumptions, `@spectre:patterns` for reuse; parallelize independent work. Brief question IDs, excerpts, paths, read-only bounds; require citation-first evidence/unknowns only (<=1,000 tokens). Mechanically compile one packet; no second wave.

2. **Correctness review.** A fresh reviewer tests delivery, assumptions, reuse/authority, architecture/flows, ownership/integration/order/compatibility/recovery, implicated security/privacy/integrity/concurrency/migration/performance risks, and verification. Use `Blocker`, `High`, `Medium`, or `Scope Change Required`; no Low/style. Write `plan_correctness.md` first, then edit `plan.md` with the authorized dispositions.

3. **Test policy.** Each meaningful behavior/contract starts with a representative happy and primary-failure test; existing tests count. Add cases only for distinct requirements, public boundaries, credible regressions, or materially different risks. Exclude duplicate, implementation-detail, and combinatorial coverage; remove only unsupported/redundant tests.

4. **Simplification review.** After correctness passes, a second fresh reviewer reads the corrected plan, scope, and report. No broad research/delegation; allow one cited-anchor spot-check when a deletion depends on an uncovered fact. Trace elements to scope/constraints; delete speculation/redundancy, collapse pass-through/fragmentation, reuse concrete patterns, and defer unjustified extensibility, telemetry, optimization, compatibility tooling, and coverage. Preserve constraints/tests. Use the same severities. Write `plan_review.md` first, then edit `plan.md` with the authorized dispositions. Shrinkage is optional; unjustified complexity is not.

5. **Writeback/verify.** Reviewers write only their report and `plan.md`; research agents write nothing; scope/context/tasks/code are immutable. `--auto-apply scope-safe` permits Blocker/High and unambiguous Medium edits. Otherwise save, ask `all|blockers|IDs|skip`, and continue on the same route. Record `addressed|skipped|unresolved|scope-change`. Stop on unresolved correctness Blocker/High, scope change, unavailable writeback, or failed schema/hash/scope checks. The primary may normalize mechanics, never semantics.

6. **Reviewer route.** Run each stage fresh at high effort (20-minute limit): Codex -> Claude Code `opus`; Claude Code -> Codex `gpt-5.6-sol`. Include paths/hashes, contract, invariant, edit mode, and write bounds; correctness gets evidence, simplification its report/hash and research ban. Record stage/runtime/model/effort/route. If no usable review returns, use one clean-context native `@spectre:reviewer` with the same contract/no delegation. Usable review is terminal; normalization never launches fallback. Preserve the report and stop if writeback is unavailable.

## Handoff

Return routes, correctness assessment, simplest plan, deltas, evidence reuse, dispositions, reports, edits, withheld scope changes, and updated plan in <=2,000 tokens. Orchestrated calls return; standalone success recommends `/spectre:create_tasks` or direct `/spectre:execute`.

## Escalate-If

Plan missing; a material claim remains unknowable; scope change is required; correctness Blocker/High remains; or schema/hash/scope/Out-of-Bounds checks fail.

---
name: "spectre-execute"
description: "Execute a structured task set or readable plan in dependency-safe waves with affected verification, phase-complete review, one final adversarial review, and end-only proof. Use after planning or to resume execution; not for planning, unplanned fixes, or pruning."
user-invocable: true
---

# execute

Build the selected work source without loading an exhaustive task graph into primary context. Preserve source authority, checkout, phase gates, repair continuity, and finalization ownership.

## Inputs

- `$ARGUMENTS`: optional feature/artifact/plan path and wave hints; `--orchestrated`; optional `--finalization-owner parent` (valid only with `--orchestrated`). Default owner: `self`.
- `structured`: a valid execute index plus resolvable `tasks.json`. A broken index remains structured and escalates; never reinterpret it as a plan.
- `plan-direct`: any other explicit readable plan. It is the sole requirements authority; never rewrite, approve, or route it through `spectre-create_tasks`.
- No path: structured mode at `{FEATURE_ROOT}/specs/execute.md`.

## Working Set

- Resolve an explicit feature/root/artifact or the unambiguous current-thread artifact; otherwise derive lowercase kebab-case and use the first free `.spectre/features/<name>[-N]/`. Never select by branch, recency, lifecycle, or scanning. Physical directory wins stale metadata. Create only missing lifecycle-neutral `feature.json` and safe `.spectre/.gitignore`; never edit root `.gitignore`.
- Keep the invocation checkout. Pass exact `FEATURE_ROOT` to every child. Explicit `docs/tasks/**` inputs remain readable/in-place legacy sources; new canonical artifacts require a confirmed feature root.
- Structured task-detail precedence: declared `Tasks JSON`, adjacent `tasks.json` for `execute.md`, then sibling `.tasks.json`; otherwise escalate. Read the index whole, but `tasks.json` only by targeted slices/status projections and reparse after writes.
- `SCOPE_DOCS` are manifest paths in structured mode or readable scope/UX/research paths cited by the plan.
- On first plan-direct use/resume, read `references/plan-direct.md`. On the first verification failure, review finding, E2E gap, or proof failure, read `references/repair-policy.md`.
- Maintain a coverage ledger keyed by verified HEAD, changed surface/dependency boundary, command/result, failure attribution, and disposition. This ledger—not command count—controls final reruns.

## Outputs + DONE

- Commit each structured parent task or plan-direct workstream; persist valid structured statuses or pointer-only plan-direct execution state.
- `self`: one final comprehensive review, then proof artifacts ending in aggregate `PASS`.
- `parent`: `IMPLEMENTATION_READY` + `ACCEPTANCE_PENDING` manifest; no final review, proof, test guide, or acceptance claim.
- DONE requires all selected work/adaptations `done|skipped`, current affected verification and phase review for every completed phase, no attributable CRITICAL/HIGH or stale/uncovered final surface, plus self-owned final review and end-only proof when applicable.

## Method / guardrails

1. **Resolve and resume.** Load only the selected source and required state. Plan-direct starts without a quality/completeness gate. Preserve source order unless dependency evidence records a reordering. Detail only the next safe wave.
2. **Batch and dispatch.** Choose dependency-ready work: structured batches contain at most three sequential parent tasks per `@spectre:dev`; plan-direct batches contain bounded active workstreams. Parallelize only when dependencies, shared contracts, and change surfaces allow. Give each dev only its exact assignment, scope-doc paths, prior-wave context, and plan path when applicable—never the tasks file or unrelated ids. Require `@skill-spectre:spectre-tdd`, native focused checks, per-assignment commits, compressed implementation insights, and E2E status (`Complete|Gap|Adaptation`).
3. **Gate the wave.** Before any reviewer, the primary independently runs affected lint/typecheck/build and native focused tests selected from the wave diff plus real consumer/integration/lifecycle boundaries. Never run a repository baseline/root suite. Attribute failures and follow `references/repair-policy.md`; implementation reports are supporting evidence only.
4. **Record and adapt.** Mark completed assignments and reparse/re-read state. Add, split, skip, or reorder derivative work only when the work source requires it; update only affected index/map rows. Never add nice-to-haves or rewrite the plan.
5. **Review phase milestones.** A phase is reviewable only when all its source-owned tasks/workstreams and required adaptations are `done|skipped` with current affected verification. After each wave, send all newly completed phases in one lightweight `@spectre:reviewer` call, with an independent verdict per phase. Never review a partial phase or review every wave.
   - Inputs: phase diff/commits/files, scope docs, and verbatim requirement/AC/context slices only—no dev reports, rationale, pending phases, or unrelated files.
   - Check Defined → Connected → Reachable, E2E completeness, demonstrated security/correctness risk, dead/orphaned outputs, duplicate data sources, and old active paths.
   - Return `CLEAN` or evidence-backed CRITICAL/HIGH findings with `file:line`, invariant, observable scenario, evidence chain, smallest scope-safe fix, finding fingerprint, and invariant family. Repair under the conditional policy; reopened phases require fresh affected verification and phase review.
6. **Repeat** until the selected completion projection is satisfied.

## Finalization

Compute coverage from the ledger. Run only stale or uncovered checks; never blanket-rerun cumulative verification or a root suite.

- `parent`: require current phase gates and no attributable CRITICAL/HIGH, then return cumulative diff/base, commits/files, package/test roots, exact verification coverage, phase-review evidence, repair/routing ledger, source requirement paths/slices, unresolved findings, and `ACCEPTANCE_PENDING`.
- `self`: invoke `Skill(spectre-code_review)` exactly once, high effort, over the cumulative feature diff with requirements/scope and no implementer rationale. Structured mode passes completed requirement/AC slices; plan-direct passes `PLAN_SOURCE` plus relevant `EXECUTION_STATE` evidence, which remains routing/evidence only. The review owns exhaustive delivery/reachability, scope-creep, dead-computation, old-path, and single-source audits; do not also invoke `spectre-validate`. Repair CRITICAL/HIGH findings under the conditional policy, rerun affected verification and one focused phase/boundary review, and record remediation; do not rerun the comprehensive review.
- Only after review remediation closes, invoke `Skill(spectre-proof)` once over final requirements. If it fails, repair and reverify/review affected boundaries, then run a fresh final proof. Proof is always the last acceptance gate. Formatting, lint, evidence, rebase, or commit-only changes do not trigger reproof.

## Handoff

Return counts, affected/final coverage, phase/final review status, repair/routing iterations, owner/status, self-owned proof status, unresolved findings, and artifact paths. Parent-owned runs return `IMPLEMENTATION_READY`/`ACCEPTANCE_PENDING` without user-facing next steps. Otherwise render one recommended next step from unresolved high findings → `/spectre:fix`, concrete coverage risk → `/spectre:test`, else `/spectre:clean`.

## Escalate-If

- Structured index/task detail is missing or malformed → `/spectre:create_tasks`; unreadable plan or genuine authority/safety impasse → `NEEDS_AUTHORITY` against that plan.
- Invalid parent ownership, unsafe/unrelated prompt slice, conflicting acceptance, unavailable authority/capability, required scope change, or unauthorized destructive action.
- Never escalate solely for check failure, unavailable/red baseline, repair/reviewer count, diff growth, related-file changes, or recurring invariant family; repair, route unrelated failure, or continue independent work while authority-bound work pauses.

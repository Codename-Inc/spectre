---
name: "spectre-execute"
description: "Execute structured tasks or a readable plan in dependency-safe waves with affected verification, risk-triggered intermediate review, one final adversarial review, and end-only proof. Use after planning or to resume; not for planning, unplanned fixes, or pruning."
user-invocable: true
---

# execute

Build the selected source without an exhaustive graph in primary context. Preserve authority, checkout, phase gates, repairs, and finalization.

## Inputs

- `$ARGUMENTS`: optional feature/artifact/plan path, wave hints, `--orchestrated`, and orchestrated-only `--finalization-owner parent`. Default owner: `self`.
- Optional `--review-profile final-only`, valid only with `--orchestrated --finalization-owner parent`; it defers all intermediate review and requires the orchestrating caller to invoke `Skill(spectre-code_review)` exactly once over the final candidate. The caller owns sequencing, never semantic review. Default: risk-routed intermediate review.
- `structured`: execute index + resolvable `tasks.json`; malformed structured input escalates, never becomes a plan.
- `plan-direct`: any other explicit readable plan; it alone owns requirements; never rewrite, approve, or route it through `spectre-create_tasks`.
- No path: structured mode at `{FEATURE_ROOT}/specs/execute.md`.

## Working Set

- Resolve explicit feature/root/artifact or the unambiguous thread artifact; otherwise use the first free kebab-case `.spectre/features/<name>[-N]/`. Never select by branch/recency/lifecycle/scanning. Physical directory wins stale metadata; create only missing lifecycle-neutral `feature.json` and safe `.spectre/.gitignore`, never root `.gitignore`.
- Keep the invocation checkout. Pass exact `FEATURE_ROOT` to every child. Explicit `docs/tasks/**` inputs remain readable/in-place legacy sources; new canonical artifacts require a confirmed feature root.
- Structured detail precedence: declared `Tasks JSON` → adjacent `tasks.json` → sibling `.tasks.json`; else escalate. Read the index whole, task detail by targeted slices/projections, and reparse after writes.
- Structured mode reads `references/telemetry.md`, starts/resumes one local event run, and follows its primary/worker task authority contract. Plan-direct is not instrumented in v1. Telemetry failure degrades observation, never delivery authority.
- `SCOPE_DOCS`: structured manifest paths or scope/UX/research paths cited by the plan.
- On first plan-direct use/resume, read `references/plan-direct.md`. On the first verification failure, review finding, E2E gap, or proof failure, read `references/repair-policy.md`.
- Maintain coverage by HEAD, changed/dependency surface, command/result, attribution, and disposition; it controls final reruns.

## Outputs + DONE

- Commit each structured parent task or plan-direct workstream; persist valid structured statuses or pointer-only plan-direct execution state.
- `self`: one final comprehensive review, then proof artifacts ending in aggregate `PASS`.
- `parent`: `IMPLEMENTATION_READY` + `ACCEPTANCE_PENDING` manifest; no final review, proof, test guide, or acceptance claim. With `--review-profile final-only`, every phase records `final-only` and the parent receives `FINAL_REVIEW_PENDING`.
- DONE: selected work/adaptations `done|skipped`; current affected verification; each completed phase routed `final-only` or reviewed once for recorded compounding risk under the selected profile; every finding dispositioned after at most one repair pass; no stale/uncovered final surface; self-owned final review + end-only proof when applicable; and structured telemetry complete or honestly `degraded`.

## Method / guardrails

1. **Resolve and resume.** Load only the selected source and required state. In structured mode initialize telemetry and start the execute/phase/wave boundaries per its reference. Plan-direct starts without a quality/completeness gate. Preserve source order unless dependency evidence records a reordering. Detail only the next safe wave.
2. **Batch and dispatch.** Choose dependency-ready work: at most three sequential structured parents per batch or bounded plan-direct workstreams. The primary may implement one sequential workstream; use `@spectre_dev` only for independent parallel work or context protection. Brief exact assignment, scope/prior-wave/plan context only—never the tasks file or unrelated ids. Structured dispatch includes the exact `<workflow_telemetry>` assignment for every parent/subtask. Require `Skill(spectre-tdd)`, focused checks, assignment commits, compressed insights, and E2E `Complete|Gap|Adaptation`.
3. **Gate the wave.** Before any reviewer, the primary independently runs affected lint/typecheck/build and native focused tests selected from the wave diff plus real consumer/integration/lifecycle boundaries. Never run a repository baseline/root suite. Record the verification gate without raw output. Attribute failures and follow `references/repair-policy.md`; implementation reports are supporting evidence only.
4. **Record and adapt.** Persist accepted child/parent completion and reparse state, then emit primary-owned task completion against the passing verification gate; a worker submission is never acceptance. Add/split/skip/reorder only source-required derivative work and affected index/map rows; never nice-to-haves or plan rewrites. New structured tasks join the same run when first assigned.
5. **Route intermediate review by compounding risk or final-only profile.** With `--review-profile final-only`, record each verified completed phase as `final-only` without loading review routing or dispatching a reviewer. Otherwise a phase may be reviewed only after all source-owned tasks/workstreams and adaptations are `done|skipped` under current affected verification; completion alone is not a trigger. On the first completed phase, read `references/review-routing.md`.
   - Inputs: triggered phase diff/commits/files, risk, scope, and verbatim requirement/AC slices—no dev rationale, pending phases, or unrelated files.
   - Check the named risk, Defined → Connected → Reachable, E2E completeness, security/correctness, dead/orphaned outputs, duplicate sources, and old active paths.
   - Return `CLEAN` or evidence-backed CRITICAL/HIGH with `file:line`, invariant, observable scenario, evidence chain, and smallest fix. Follow the repair policy: one consolidated pass, affected verification, dispositions, and no repair re-review.
6. **Repeat** until the selected completion projection is satisfied.

## Finalization

Compute coverage from the ledger. Run only stale or uncovered checks; never blanket-rerun cumulative verification or a root suite.

- `parent`: require wave gates plus any triggered-review dispositions. Return cumulative diff/base, commits/files, package/test roots, verification coverage, review route (`intermediate:<trigger>|final-only`), repair/routing ledger, requirement sources/slices, unresolved findings, and `ACCEPTANCE_PENDING`; add `FINAL_REVIEW_PENDING` for the final-only profile. That status requires the caller to invoke `Skill(spectre-code_review)` once under its opposite-runtime-first contract before proof.
- `self`: invoke `Skill(spectre-code_review)` exactly once, high effort, over cumulative diff + requirements/scope without implementer rationale. Structured mode passes completed requirement/AC slices; plan-direct passes `PLAN_SOURCE` plus relevant `EXECUTION_STATE` evidence as routing only. It owns delivery/reachability, scope-creep, dead-computation, old-path, and single-source audits; never also invoke `spectre-validate`. Record its result as a review gate. Give attributable CRITICAL/HIGH one consolidated repair pass, affected verification, and honest dispositions—never a validation reviewer.
- After review dispositions are recorded, invoke `Skill(spectre-prove)` once over final requirements and record its result as a proof gate. A proof failure gets one behavior-repair pass, affected verification, and one fresh proof over failed/impact-linked rows—never a code review. Proof is always the last acceptance gate; surface a persistent failure instead of looping. Formatting, lint, evidence, rebase, or commit-only changes do not trigger reproof. Finish structured runs with the truthful terminal event.

## Handoff

Return counts, affected/final coverage, review profile/routing/final-review status, finding dispositions, owner/status, self-owned proof status, unresolved findings, artifact paths, and structured `RUN_ID` + telemetry `complete|degraded`. Parent-owned runs return `IMPLEMENTATION_READY`/`ACCEPTANCE_PENDING` plus `FINAL_REVIEW_PENDING` when applicable, without user-facing next steps. Otherwise render one recommended next step from unresolved high findings → `spectre-fix`, concrete coverage risk → `spectre-test`, else `spectre-clean`.

## Escalate-If

- Structured index/task detail is missing or malformed → `spectre-create_tasks`; unreadable plan or genuine authority/safety impasse → `NEEDS_AUTHORITY` against that plan.
- Invalid parent ownership; `--review-profile final-only` without an orchestrated caller that explicitly owns the one final `Skill(spectre-code_review)` invocation; unsafe/unrelated prompt slice; conflicting acceptance; unavailable authority/capability; required scope change; or unauthorized destructive action.
- Never escalate solely for check failure, unavailable/red baseline, review/proof finding, diff growth, or related-file changes; repair once where this contract permits, route or disclose the result, and continue independent work while authority-bound work pauses.

## Codex Agent Preflight

Before dispatching any `@spectre_*` custom agent, run the bundled setup helper once:

```bash
node "${PLUGIN_ROOT}/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
```

If the helper reports agents were installed or updated in this session, continue directly only for lookup/scoping work that can be completed without a subagent. For other agent-dependent workflows, stop with a clear one-session restart requirement so Codex can discover the new custom agents.

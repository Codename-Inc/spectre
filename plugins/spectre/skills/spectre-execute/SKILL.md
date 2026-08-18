---
name: "spectre-execute"
description: "Execute structured tasks or a readable plan in dependency-safe waves with affected verification, risk-triggered intermediate review, one final adversarial review, and end-only proof. Use after planning or to resume; not for planning, unplanned fixes, or pruning."
user-invocable: true
---

# execute

Orchestrate the source without placing implementation in primary context. Maximize dependency-safe parallelism while preserving authority, gates, repairs, and finalization.

## Inputs

- `$ARGUMENTS`: optional feature/artifact/plan path, wave hints, `--orchestrated`, and orchestrated-only `--finalization-owner parent`. Default owner: `self`.
- Optional `--review-profile final-only`, valid only with `--orchestrated --finalization-owner parent`; it defers intermediate review and requires the orchestrating caller to invoke `Skill(spectre-code_review)` exactly once on the final candidate. The caller owns sequencing, never semantic review. Default: risk-routed review.
- `structured`: execute index + resolvable `tasks.json`; malformed structured input escalates, never becomes a plan.
- `plan-direct`: any other explicit readable plan, or a plan whose header records `Execution Mode: direct`; it alone owns requirements; never rewrite, approve, or route it through `spectre-create_tasks`.
- No path: structured mode at `{FEATURE_ROOT}/specs/execute.md` when it exists; else plan-direct at a `{FEATURE_ROOT}/specs/plan.md` recording `Execution Mode: direct`; else escalate.

## Working Set

- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `@skill-spectre:spectre-feature-root` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Keep the invocation checkout.
- Structured detail precedence: declared `Tasks JSON` → adjacent `tasks.json` → sibling `.tasks.json`; else escalate. Read the index whole and task detail by targeted slices.
- Structured and plan-direct modes read `references/telemetry.md`, start/resume one local event run, and follow its primary/worker task authority contract; that local store is the sole lifecycle/progress authority and source plans/tasks remain immutable. Plan-direct emits workstream-granularity events. Telemetry failure degrades observation, never delivery authority.
- `SCOPE_DOCS`: structured manifest paths or scope/UX/research paths cited by the plan.
- On first plan-direct use/resume, read `references/plan-direct.md`. On the first verification failure, review finding, E2E gap, or proof failure, read `references/repair-policy.md`.
- Maintain a compact local verification ledger by HEAD, stable check id, changed/dependency surface, result, attribution, and disposition; it controls final reruns. Never persist raw output or per-wave evidence/checkpoint/report files.

## Outputs + DONE

- Commit logical implementation batches and canonical artifacts only. Task/plan definitions stay immutable; Execute evidence, markers, checkpoints, run state, and plan-direct execution state stay local and uncommitted.
- `self`: one final comprehensive review, then proof artifacts ending in aggregate `PASS`.
- `parent`: `IMPLEMENTATION_READY` + `ACCEPTANCE_PENDING` manifest; no final review, proof, test guide, or acceptance claim. With `--review-profile final-only`, every phase records `final-only` and the parent receives `FINAL_REVIEW_PENDING`.
- DONE: selected work/adaptations `done|skipped`; current affected verification; each completed phase routed `final-only` or reviewed once for recorded compounding risk under the selected profile; every finding dispositioned after at most one repair pass; no stale/uncovered final surface; self-owned final review + end-only proof when applicable; no primary-authored planned work; and structured telemetry complete or honestly `degraded`.

## Method / guardrails

1. **Resolve and resume.** Persistent execution authority: before implementation on initial entry and on every continuation/resume, including after compaction, reload this contract with the original source arguments and continue the same durable run; never implement from memory or substitute another workflow. Load only source/required state. Structured mode initializes telemetry/boundaries. A direct-marked plan (`Execution Mode: direct`) must carry its seven spine sections or escalate to `/spectre:plan`; legacy unmarked plans start without a quality/completeness gate. Preserve source order absent dependency evidence; detail only the ready frontier.
2. **Batch and dispatch.** Dispatch when dependencies are accepted; waves are hints, phases review boundaries, and only unaccepted dependencies block. Batch at most three sequential parents or bounded plan-direct workstreams. Every source-owned workstream, including single/sequential work, goes to `@spectre:dev`. The primary only orchestrates, verifies, accepts, and records state; it never implements planned work. For `risk`, request Claude `claude-opus-5` or Codex `gpt-5.6-sol`; otherwise use defaults. Give exact assignment/scope/prior context, never whole tasks/unrelated ids; include the named threatened invariant and shared contract slice. Structured dispatch includes exact `<workflow_telemetry>`. Require `@skill-spectre:spectre-tdd`, focused checks, commits, compressed insights, E2E `Complete|Gap|Adaptation`.
3. **Gate accepted batches.** Before any reviewer, the primary independently runs affected lint/typecheck/build and native focused non-harness tests selected from the returned diff and demonstrated dependency/consumer boundaries; gate completed batches while other assignments remain in flight, and let early parents ride the next covering gate. Never run a repository baseline/root suite, full app harness, benchmark, or broad qualification here. Record stable check ids/result against current HEAD without raw output or new evidence files. Attribute failures and follow `references/repair-policy.md`; implementation reports are leads only.
4. **Record and adapt.** Record accepted child/parent completion only in local workflow state, then emit primary-owned completion against the passing gate; a worker submission is never acceptance. Never mutate source task/plan artifacts for lifecycle state. Add/split/skip/reorder only source-required derivative work in local state; amend the canonical task graph only when the definition itself was wrong before execution. New derivative tasks join the same run when first assigned.
5. **Route intermediate review by compounding risk or final-only profile.** With `--review-profile final-only`, record each verified completed phase as `final-only` without loading review routing or dispatching a reviewer. Otherwise a phase may be reviewed only after all source-owned tasks/workstreams and adaptations are `done|skipped` under current affected verification; completion alone is not a trigger. On first phase completion, read `references/review-routing.md`.
   - Inputs: triggered phase diff/commits/files, risk, scope, and verbatim requirement/AC slices—no dev rationale, pending phases, or unrelated files.
   - Check the named risk, Defined → Connected → Reachable, E2E completeness, security/correctness, dead/orphaned outputs, duplicate sources, and old active paths.
   - Return `CLEAN` or evidence-backed CRITICAL/HIGH with `file:line`, invariant, observable scenario, evidence chain, and smallest fix in-thread. Persist only the local route/dispositions, never an intermediate review report. Follow the repair policy: one consolidated pass, affected verification, and no repair re-review.
6. **Repeat** until the selected completion projection is satisfied.

## Finalization

Compute coverage from the local ledger. Run only stale or uncovered checks; never blanket-rerun cumulative verification or a root suite. Expensive harness/performance/full qualification runs only for the final relevant candidate, unless a source task explicitly produces a prerequisite or product-consumed qualification artifact that blocks downstream work. Cache it by `candidate definition hash = relevant inputs + scenario/config + command`; permit one run per hash, and rerun only after those inputs change or a diagnosed infrastructure failure invalidates the run.

- `parent`: require wave gates/review dispositions. Return diff/base, commits/files, test roots, coverage, review route, repair ledger, requirement slices, findings, and `ACCEPTANCE_PENDING`; add `FINAL_REVIEW_PENDING` for final-only, requiring one opposite-runtime-first `Skill(spectre-code_review)` before proof.
- `self`: invoke `Skill(spectre-code_review)` exactly once, high effort, over cumulative diff + requirements/scope without implementer rationale. Structured mode passes completed requirement/AC slices; plan-direct passes `PLAN_SOURCE` plus relevant `EXECUTION_STATE` evidence as routing only. It owns delivery/reachability, scope-creep, dead-computation, old-path, and single-source audits; never also invoke `spectre-validate`. Record its result as a review gate. Give attributable CRITICAL/HIGH one consolidated repair pass, affected verification, and honest dispositions—never a validation reviewer.
- After review dispositions are recorded, invoke `Skill(spectre-prove)` once over final requirements, passing fresh inspected primary evidence bound to the candidate hash so it runs only uncovered journeys, and record its result as a proof gate. A proof failure gets one behavior-repair pass, affected verification, and one fresh proof over failed/impact-linked rows—never a code review. Proof is always the last acceptance gate; surface a persistent failure instead of looping. Formatting, lint, artifact, rebase, or commit-only changes do not trigger reproof. Finish structured runs with the truthful terminal event.
- After that authoritative terminal status, follow the telemetry reference to emit one non-authoritative `plan.execution_outcome`; Plan/Execute artifact joins use SHA-256 hashes of raw artifact file bytes, and join failure only degrades telemetry.

## Handoff

Return counts, coverage, review route/status, dispositions, owner/proof status, findings/artifacts, and `RUN_ID` + telemetry status. Parent-owned runs return `IMPLEMENTATION_READY`/`ACCEPTANCE_PENDING` plus applicable `FINAL_REVIEW_PENDING`, without user-facing next steps. Otherwise recommend `/spectre:fix` for high findings, `/spectre:test` for concrete coverage risk, else `/spectre:clean`.

## Escalate-If

- Structured index/task detail is missing or malformed → `/spectre:create_tasks`; unreadable plan or genuine authority/safety impasse → `NEEDS_AUTHORITY` against that plan.
- Invalid parent ownership; `--review-profile final-only` without an orchestrated caller that explicitly owns the one final `Skill(spectre-code_review)` invocation; unsafe/unrelated prompt slice; conflicting acceptance; unavailable authority/capability; required scope change; or unauthorized destructive action.
- Never escalate solely for check failure, unavailable/red baseline, review/proof finding, diff growth, or related-file changes; repair once where this contract permits, route or disclose the result, and continue independent work while authority-bound work pauses.

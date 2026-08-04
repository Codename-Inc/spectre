---
name: "spectre-align-and-deliver"
description: "Confirm one bounded feature/fix scope, then deliver tested code, acceptance proof, and a draft PR. Use when one grounded scope gate is wanted; not for no-gate delivery, broad discovery, or non-code work."
user-invocable: true
disable-model-invocation: true
---

# align-and-deliver

## Purpose

Confirm one low-ambiguity scope, then produce a proven draft PR. Confirmation authorizes delivery—not later scope changes, merge, deploy, or release.

## Inputs

- `$ARGUMENTS`: request, references, optional natural-language target branch, and optional managed feature/root/descendant. If empty, ask and wait. Default target: `origin/main`.

## Working Set

- Late-bind repository/checkout/diff/command state. Resolve `FEATURE_ROOT=.spectre/features/<feature-name>/` once and pass it unchanged.
- Canonical artifacts: `concepts/scope.md`; needed `specs/{quick_task_plan.md,execute.md,tasks.json}`; verification/reviews; and `proof/{proof.json,proof.html}` beneath `FEATURE_ROOT`.

## Feature root contract

- Resolve an explicit feature/root/descendant or one unambiguous current-thread artifact; otherwise derive lowercase kebab-case and use the first free `.spectre/features/<name>[-N]/` without waiting. Never select existing work by branch, recency, lifecycle, or scanning; auto-continue a collision; or accept an explicitly selected unmanaged directory. The physical directory is authoritative, and an explicitly selected managed feature may continue or be re-scoped under its safeguards.
- Before the first artifact, initialize a new root with lifecycle-neutral `feature.json`: `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`. Never add branch, status, active-pointer, alias, or absolute-path state.
- If `.spectre/.gitignore` is absent and the repository does not already ignore `.spectre/`, create it with `manifest.json`, `bin/`, `handoffs/`, and `!features/`. Do not rewrite a user root ignore file. If the selected feature root is ignored, warn that its records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid. Pass the exact selected `FEATURE_ROOT` unchanged to every child call.

## Outputs + DONE

- User-confirmed canonical `SCOPE_FILE` + hash with immutable boundaries.
- Bounded `quick_task_plan.md`: Agreed Scope · Research · Approach · dependency-ordered Tasks · Success Criteria; light structured artifacts only when needed.
- Tested conventional commits, affected verification/dispositions, one advisory post-rebase full-suite observation, clean/rebased safety evidence, separate sanitized proof, pushed branch, and diff-grounded draft PR.

**DONE:** scope confirmed before implementation; affected verification complete; every code review ran once with at most one consolidated repair pass and honest dispositions; proof had at most one repair/reproof; post-rebase full-suite status disclosed; cleanup/rebase safe; acceptance proof and final candidate state are recorded separately; draft PR returned. Non-green verification/review/proof status never prevents PR creation by itself; CI merge-gates. No merge, deploy, release, or public proof publication occurs.

## Method / guardrails

Invoke named child skills with stated arguments and validate their DONE contracts.

1. **Resolve the execution location.** Before any artifact or product write, snapshot `git status --porcelain=v1 --untracked-files=all`. A clean linked worktree stays in place, reusing its non-protected branch or creating one there when protected/detached. For a dirty linked worktree or any primary/local checkout, leave the source byte-for-byte untouched and create a clean sibling worktree plus collision-safe branch from committed `HEAD`; never stash, reset, commit, copy, or carry pre-existing changes. Route without confirmation, run every child in the selected checkout, never commit to `main`/`master`, and refuse unrelated or sensitive changes.
2. **Scope once.** Run `Skill(spectre-scope)` with the task, `{FEATURE_ROOT}`, `DELIVERY_ALIGNMENT=one-confirmation`, and `--orchestrated`. Preserve its WHAT-not-HOW, canonical schema, and immutable-boundary contracts:
   - Use its fast grounding lookup; when insufficient, finish read-only pre-research before prompting.
   - Present one hypothesis with IN / OUT / ANTI-SCOPE and only blocking questions; wait once. Record optional unknowns as assumptions with “if false” consequences.
   - Coherent confirmation/corrections → write scope, capture the returned path as `SCOPE_FILE`, and record `SCOPE_SHA256=sha256(bytes(SCOPE_FILE))`. If not, return `NEEDS_FULL_SCOPE` and stop; do not iterate or guess here.
3. **Plan from confirmed scope.** Resolve technical choices from live code without another routine gate. Write collision-safe `QUICK_PLAN_FILE` within roughly three phases/eight parents and map every IN item to work/proof.
4. **Route implementation.**
   - Tiny `feature` — exactly one dependency-safe sequential workstream with no structured resume/parallelization need → run `Skill(spectre-execute)` with `QUICK_PLAN_FILE`, `{FEATURE_ROOT}`, `--orchestrated`, and `--finalization-owner parent` in plan-direct mode. Do not create `execute.md`/`tasks.json` merely as ceremony.
   - Other `feature` → run `Skill(spectre-create_tasks)` with `SCOPE_FILE`, `QUICK_PLAN_FILE`, `{FEATURE_ROOT}`, `--orchestrated`, and `--depth light` for ≤3 parents or `--depth standard` otherwise. Capture returned `EXECUTE_FILE` and `DETAIL_FILE`, verify both, then run `Skill(spectre-execute)` with `EXECUTE_FILE`, `--orchestrated`, and `--finalization-owner parent`.
   - `fix` → run `Skill(spectre-fix-core)` with the bug report, `PHASE=full`, `PARENT=spectre-align-and-deliver`, `PARENT_AUTHORIZATION={SCOPE_FILE}`, `AUTHORIZED_SCOPE_SHA256={SCOPE_SHA256}`, `ALIGNMENT_MODE=confirmed`, and `--orchestrated`. Preserve root cause and RED-before-GREEN repair; the confirmed scope replaces only diagnosis approval.
5. **Accept readiness, not finalization.** Feature: `IMPLEMENTATION_READY` manifest + `ACCEPTANCE_PENDING`. Fix: root cause, RED→GREEN, affected paths/roots/results. No pre-rebase final review/proof or `spectre-validate`; finalization is below.
6. **Prepare, observe, and repair the candidate.** Deterministic failures permit normal root-cause repair/routing; each scheduled review permits one consolidated repair pass and no repair-validation review:
   1. Run `Skill(spectre-clean)` with `{FEATURE_ROOT} --orchestrated`, then `Skill(spectre-rebase)` with target, `--orchestrated`, `--verification-owner parent`, and mandatory backup ref. Require `REBASE_READY`; Align-and-Deliver owns post-rebase verification.
   2. Set `EVIDENCE_DIRS={FEATURE_ROOT}/{reviews,verification,proof}`. Capture `FULL_SUITE_SHA=git rev-parse HEAD`, then run the single repository-authoritative root suite once; do not run a baseline or duplicate package suites. Persist compact command/results/duration/runtime plus exact failing identities under `{FEATURE_ROOT}/verification/`; keep raw output out of child prompts.
   3. Attribute `branch-caused|unrelated|indeterminate`; prefer target-SHA CI, else reproduce only the failed check there. Root-cause repair branch failures and rerun failed+affected checks; route unrelated and disclose persistent indeterminate. Never rerun the full suite after repairs; final candidate is `CI: pending`.
   4. Capture the current candidate tuple: `BASE_SHA=git rev-parse {TARGET_BRANCH}`, `HEAD_SHA=git rev-parse HEAD`, and `DIFF_SHA256=sha256(bytes(git diff --binary --full-index --no-ext-diff --no-color --no-renames {BASE_SHA}...{HEAD_SHA}))`.
   5. Use `REQUIREMENTS_SOURCE=DETAIL_FILE` for structured tasks, otherwise `QUICK_PLAN_FILE`; recheck scope hash, then run one comprehensive `Skill(spectre-code_review)` with root, scope, requirements, candidate tuple, and `--orchestrated`. Route non-defects; give attributable CRITICAL/HIGH one consolidated root-cause repair pass by primary/owner. Run affected checks, record `repaired-verified|repaired-unverified|unresolved|scope-change|unrelated`, and recapture the tuple. Related-file growth is not scope change. Never dispatch a reviewer to validate the repair or rerun the comprehensive review.
   6. Run acceptance proof only now. Invoke `Skill(spectre-proof)` with `{FEATURE_ROOT}`, `SCOPE_FILE`, `SCOPE_SHA256`, `REQUIREMENTS_SOURCE`, `EVIDENCE_DIRS`, and `--orchestrated`, without the candidate tuple. An observable failure gets one behavior-repair pass through execute or `spectre-fix-core`, affected verification, tuple recapture, and one fresh proof over failed/impact-linked rows—never a code review. Disclose persistent failure; non-behavior changes never trigger reproof.
7. **Open the review boundary.** Build compact `VERIFICATION_SUMMARY` from observation, attribution, dispositions, affected final checks, and `CI: pending`. Run `Skill(spectre-create_pr)` with target, `EXPECTED_BASE_SHA={BASE_SHA}`, `EXPECTED_HEAD_SHA={HEAD_SHA}`, `EXPECTED_DIFF_SHA256={DIFF_SHA256}`, evidence, summary, `--draft`, `--orchestrated`. On `PR_CANDIDATE_STALE`, refresh the tuple and retry without a cap. Keep workflow evidence outside the PR diff; never force-push unrelated history, bypass checks, suppress failures, merge, deploy, or release.

## Handoff

Return confirmed scope/hash · proof paths/status · candidate tuple · full-suite observation · dispositions/affected checks · `CI: pending` · review · rebase/restore evidence · limitations · draft PR URL.

End with: `Next (recommended): review the proof and draft PR.`

## Escalate-If

- `NEEDS_FULL_SCOPE`, non-convergent, or broad/multi-area scope → standalone `spectre-scope` or `spectre-plan`; do not implement.
- Changed product scope, conflicting acceptance, or missing authority/credential/capability. Related-file technical repair is not scope change.
- Unsafe checkout/dirty dependency, semantic rebase/diverged remote, secrets/PII, or no equivalent child route.
- Never escalate solely for test/lint/type/build failures, red baselines, unavailable broad suites, review/proof findings, diff growth, or candidate drift that can be refreshed; disclose unresolved results in the draft PR.

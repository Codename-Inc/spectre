---
name: "spectre-align-and-deliver"
description: "Run one abbreviated spectre-scope confirmation for a feature or bug fix, then autonomously deliver implementation, acceptance proof, and a draft PR. Use for one grounded scope prompt before execution. Do NOT use for no-gate delivery (use spectre-deliver), broad discovery, or non-code work."
user-invocable: true
disable-model-invocation: true
---

# align-and-deliver

## Purpose

Run one-confirmation `spectre-scope` for a low-ambiguity feature or fix, then produce a proven draft PR. Confirmation authorizes delivery, not scope changes, merge, deploy, or release.

## Inputs

- `$ARGUMENTS` — feature request or bug report, referenced context, and an optional target branch stated in natural language. If empty, ask for the task and wait.
- Optional explicit managed feature name/root or an artifact beneath one.
- Default target: `origin/main`.

## Working Set

- Late-bind branch, worktree, remotes, diff, repository instructions, and test/lint/build commands.
- `FEATURE_ROOT = .spectre/features/<feature-name>/`, resolved once below and passed unchanged to every child.
- Canonical artifacts: `{FEATURE_ROOT}/concepts/scope.md`; `{FEATURE_ROOT}/specs/{quick_task_plan.md,execute.md,tasks.json}` when needed; final verification/review reports; and `{FEATURE_ROOT}/proof/{proof.json,proof.html}`.

## Feature root contract

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature.
- When the user explicitly names an existing managed feature, continue or re-scope it under its existing overwrite safeguards. The physical directory is authoritative.
- For an inferred name, use the first free `.spectre/features/<name>[-N]/`; never overwrite or auto-continue a collision. An explicitly selected unmanaged directory remains a safety blocker.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`.
- Keep the marker lifecycle-neutral: never add branch, status, active-pointer, alias, or absolute-path state.
- If `.spectre/.gitignore` is absent and the repository does not already ignore `.spectre/`, create it with `manifest.json`, `bin/`, `handoffs/`, and `!features/`. Do not rewrite a user root ignore file. If the selected feature root is ignored, warn that its records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid. Pass the exact selected `FEATURE_ROOT` unchanged to every child call.

## Outputs + DONE

- A user-confirmed canonical `SCOPE_FILE` plus `SCOPE_SHA256` from `spectre-scope`, with all required sections and immutable boundaries.
- A bounded `quick_task_plan.md`: Agreed Scope · Research Summary · Approach · dependency-ordered Implementation Tasks · Success Criteria; plus light `execute.md`/`tasks.json` when the feature route needs them.
- Tested implementation with conventional commits; affected verification and repair/routing evidence; one advisory post-rebase full-suite observation; clean and rebased branch with backup/restore evidence.
- Sanitized `proof.json` and `proof.html` recording acceptance evidence separately from the final candidate tuple.
- A pushed branch and draft PR grounded in the actual diff; a separate proof capsule and PR URL returned together for review.

**DONE when:** the scope was confirmed before product implementation; implementation completed affected verification; repairable review/proof findings were repaired or routed; the post-rebase full suite ran once and its qualified status is disclosed; cleanup and rebase safety contracts pass; acceptance proof and final candidate state are recorded separately; and the draft PR URL is returned. Non-green verification/review/proof status never prevents PR creation by itself; CI owns merge-gating full-suite validation. No merge, deploy, release, or public proof publication occurs.

## Method / guardrails

Invoke every named child skill with the stated arguments; do not merely describe or inline it. Validate each returned DONE contract before advancing.

1. **Resolve the execution location; isolate only when needed.** Before any artifact or product write, snapshot the entry state with `git status --porcelain=v1 --untracked-files=all` and distinguish the primary/local checkout from a linked worktree.
   - **Clean linked worktree:** stay in the current directory. Reuse its non-protected branch; when it is on `main`/`master` or detached `HEAD`, create a collision-safe feature branch in that same worktree. Never create another worktree.
   - **Dirty linked worktree:** leave it byte-for-byte untouched and create a clean sibling worktree plus collision-safe feature branch from committed `HEAD`. Do not stash, reset, commit, copy, or otherwise carry its pre-existing changes into the delivery worktree.
   - **Primary/local checkout:** whether clean or dirty, leave it untouched and create a clean linked worktree plus collision-safe feature branch from committed `HEAD`.
   - Apply this routing without a confirmation gate, run every child in the selected checkout, and never commit directly to `main`/`master`. Refuse unrelated or sensitive changes.
2. **Scope once.** Run `Skill(spectre-scope)` with the task, `{FEATURE_ROOT}`, `DELIVERY_ALIGNMENT=one-confirmation`, and `--orchestrated`. Preserve its WHAT-not-HOW, canonical schema, and immutable-boundary contracts:
   - Use its fast grounding lookup; when insufficient, finish read-only pre-research before prompting.
   - Present one hypothesis with IN / OUT / ANTI-SCOPE and only blocking questions; wait once. Record optional unknowns as assumptions with “if false” consequences.
   - Coherent confirmation/corrections → write scope, capture the returned path as `SCOPE_FILE`, and record `SCOPE_SHA256=sha256(bytes(SCOPE_FILE))`. If not, return `NEEDS_FULL_SCOPE` and stop; do not iterate or guess here.
3. **Plan from the confirmed scope.** Resolve technical choices from live code without another routine user gate. Write a bounded quick plan to a collision-safe `QUICK_PLAN_FILE`; keep it within roughly three phases/eight parents and map every IN item to work and proof.
4. **Route implementation.**
   - Tiny `feature` — exactly one dependency-safe sequential workstream with no structured resume/parallelization need → run `Skill(spectre-execute)` with `QUICK_PLAN_FILE`, `{FEATURE_ROOT}`, `--orchestrated`, and `--finalization-owner parent` in plan-direct mode. Do not create `execute.md`/`tasks.json` merely as ceremony.
   - Other `feature` → run `Skill(spectre-create_tasks)` with `SCOPE_FILE`, `QUICK_PLAN_FILE`, `{FEATURE_ROOT}`, `--orchestrated`, and `--depth light` for ≤3 parents or `--depth standard` otherwise. Capture returned `EXECUTE_FILE` and `DETAIL_FILE`, verify both, then run `Skill(spectre-execute)` with `EXECUTE_FILE`, `--orchestrated`, and `--finalization-owner parent`.
   - `fix` → run `Skill(spectre-fix-core)` with the bug report, `PHASE=full`, `PARENT=spectre-align-and-deliver`, `PARENT_AUTHORIZATION={SCOPE_FILE}`, `AUTHORIZED_SCOPE_SHA256={SCOPE_SHA256}`, `ALIGNMENT_MODE=confirmed`, and `--orchestrated`. Preserve root cause and RED-before-GREEN repair; the confirmed scope replaces only diagnosis approval.
5. **Accept implementation readiness, not finalization.** A feature route must return `IMPLEMENTATION_READY` with its required execute manifest; a fix route must return its root cause, RED→GREEN evidence, affected paths/test roots, and relevant deterministic results. Repair attributable CRITICAL/HIGH findings through the owning child; route unrelated findings and continue. Do not run a pre-rebase final code review or separate `spectre-validate`; the candidate review below owns exhaustive delivery/reachability, scope-creep, dead-computation, old-path, and single-data-source validation.
6. **Prepare, observe, and repair the candidate.** Continue without a global cycle cap; failures and findings create repair/routing work, not blockers:
   1. Run `Skill(spectre-clean)` with `{FEATURE_ROOT} --orchestrated`, then `Skill(spectre-rebase)` with `{TARGET_BRANCH}`, `--orchestrated`, `--verification-owner parent`, and its mandatory backup ref. Require `REBASE_READY`; Align-and-Deliver now owns post-rebase verification.
   2. Set `EVIDENCE_DIRS={FEATURE_ROOT}/{reviews,verification,proof}`. Capture `FULL_SUITE_SHA=git rev-parse HEAD`, then run the single repository-authoritative root suite once; do not run a baseline or duplicate package suites. Persist compact command/results/duration/runtime plus exact failing identities under `{FEATURE_ROOT}/verification/`; keep raw output out of child prompts.
   3. Attribute failures as `branch-caused`, `unrelated`, or `indeterminate`. Prefer target-SHA CI evidence; otherwise reproduce only the failing test/check at the target SHA. Group branch-caused failures by invariant/root-cause family, repair, and rerun failing plus affected checks. Route unrelated findings and continue; disclose persistent indeterminate findings. Never rerun the full suite after repairs; set `CI: pending` for authoritative final-candidate full validation.
   4. Capture the current candidate tuple: `BASE_SHA=git rev-parse {TARGET_BRANCH}`, `HEAD_SHA=git rev-parse HEAD`, and `DIFF_SHA256=sha256(bytes(git diff --binary --full-index --no-ext-diff --no-color --no-renames {BASE_SHA}...{HEAD_SHA}))`.
   5. Set `REQUIREMENTS_SOURCE=DETAIL_FILE` when structured tasks exist, otherwise `QUICK_PLAN_FILE`. Recompute `SCOPE_SHA256` before each child and return `NEEDS_AUTHORITY` only on genuine scope-authority drift. Run `Skill(spectre-code_review)` with `{FEATURE_ROOT}`, `SCOPE_FILE`, `REQUIREMENTS_SOURCE`, the candidate tuple, and `--orchestrated`. CRITICAL/HIGH defects enter repair/adaptation; related-file growth is not scope change. After repair, run affected verification, recapture the tuple, and rerun only the affected review. Route non-defects and continue.
   6. Preserve acceptance ownership. Feature: consume execute's proof `PASS`; never reprove for candidate drift or finalization. Fix: run one `Skill(spectre-proof)` pass with `{FEATURE_ROOT}`, `SCOPE_FILE`, `SCOPE_SHA256`, `EVIDENCE_DIRS`, and `--orchestrated`, without the candidate tuple. After observable-behavior repair, resume execute (feature) or run a fresh proof pass (fix); non-behavior changes never trigger proof.
7. **Open the review boundary.** Build compact `VERIFICATION_SUMMARY` from the full-suite observation, attribution, repairs, focused final checks, and `CI: pending`. Run `Skill(spectre-create_pr)` with `{TARGET_BRANCH}`, `EXPECTED_BASE_SHA={BASE_SHA}`, `EXPECTED_HEAD_SHA={HEAD_SHA}`, `EXPECTED_DIFF_SHA256={DIFF_SHA256}`, `EVIDENCE_DIRS`, `VERIFICATION_SUMMARY`, `--draft`, and `--orchestrated`. If it returns `PR_CANDIDATE_STALE`, refresh the tuple and retry without a cap. Keep workflow evidence separate from the PR diff. Never force-push unrelated history, bypass hooks/checks, suppress failures, merge, deploy, or release.

## Handoff

Return: confirmed scope path and hash · proof status and artifact paths · `{BASE_SHA, HEAD_SHA, DIFF_SHA256}` · full-suite observation SHA/status · attribution/repair/routing summary · focused final checks · `CI: pending` · review result · rebase target, backup ref, and restore command · limitations · draft PR URL.

End with: `Next (recommended): review the proof and draft PR.`

## Escalate-If

- `NEEDS_FULL_SCOPE`, non-convergent boundaries, or broad/multi-area scope → continue in standalone `spectre-scope` or route to `spectre-plan`; do not implement.
- Post-confirmation evidence requires changed product scope; acceptance truth conflicts; or a required proof dependency/credential/permission needs user authority. A technical repair that touches related files is not a scope change.
- A required child skill/orchestrated mode is unavailable and no equivalent safe route exists.
- Git cannot provide the required safe checkout, or the requested delivery depends on pre-existing dirty changes deliberately left behind.
- Rebase requires semantic product judgment, remote history diverged unexpectedly, or secrets/PII appear in the working set or evidence.
- Never escalate solely for test/lint/type/build failures, red baselines, unavailable broad suites, review/proof findings, repair count, diff growth, or candidate drift that can be refreshed.

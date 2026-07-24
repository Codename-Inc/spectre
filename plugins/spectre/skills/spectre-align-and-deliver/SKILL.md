---
name: "spectre-align-and-deliver"
description: "Run one abbreviated spectre-scope confirmation for a feature or bug fix, then autonomously deliver implementation, final proof, and a draft PR. Use for one grounded scope prompt before execution. Do NOT use for no-gate delivery (use spectre-deliver), broad discovery, or non-code work."
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
- Canonical artifacts: `{FEATURE_ROOT}/concepts/scope.md`; `{FEATURE_ROOT}/specs/{quick_task_plan.md,execute.md,tasks.json}`; review/validation reports; and `{FEATURE_ROOT}/proof/{proof.json,proof.html}`.

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
- Tested implementation with conventional commits; cumulative review/validation evidence; clean and rebased branch with backup/restore evidence.
- Sanitized `proof.json` and `proof.html` proving the immutable final candidate tuple `{BASE_SHA, HEAD_SHA, DIFF_SHA256}`.
- A pushed branch and draft PR grounded in the actual diff; a separate proof capsule and PR URL returned together for review.

**DONE when:** the scope was confirmed before product implementation; implementation and deterministic gates pass; no unresolved CRITICAL/HIGH review or validation gap remains; proof aggregate is `PASS` for the exact final candidate tuple; cleanup and rebase safety contracts pass; and the draft PR URL is returned. No merge, deploy, release, or public proof publication occurs.

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
   - `feature` → run `Skill(spectre-create_tasks)` with `SCOPE_FILE`, `QUICK_PLAN_FILE`, `{FEATURE_ROOT}`, `--orchestrated`, and `--depth light` for ≤3 parents or `--depth standard` otherwise. Capture returned `EXECUTE_FILE` and `DETAIL_FILE`, verify both, then run `Skill(spectre-execute)` with `EXECUTE_FILE --orchestrated`.
   - `fix` → run `Skill(spectre-fix-core)` with the bug report, `PHASE=full`, `PARENT=spectre-align-and-deliver`, `PARENT_AUTHORIZATION={SCOPE_FILE}`, `AUTHORIZED_SCOPE_SHA256={SCOPE_SHA256}`, `ALIGNMENT_MODE=confirmed`, and `--orchestrated`. Preserve root cause and RED-before-GREEN repair; the confirmed scope replaces only diagnosis approval.
5. **Close implementation gaps.** Require deterministic checks and cumulative adversarial review plus defined→connected→reachable validation. When the selected path did not already produce them, run `Skill(spectre-code_review)` with `{FEATURE_ROOT} --orchestrated`, then `Skill(spectre-validate)` with `SCOPE_FILE`, `DETAIL_FILE` when present, `{FEATURE_ROOT}`, and `--orchestrated`; repair only scope-safe gaps and rerun the affected gate.
6. **Converge the final candidate.** Allow at most two cycles:
   1. Run `Skill(spectre-clean)` with `{FEATURE_ROOT} --orchestrated`, then `Skill(spectre-rebase)` with `{TARGET_BRANCH} --orchestrated` and its mandatory backup ref.
   2. Set `EVIDENCE_DIRS={FEATURE_ROOT}/{reviews,validation,proof}`. Require a clean candidate worktree outside them, then capture `BASE_SHA=git rev-parse {TARGET_BRANCH}`, `HEAD_SHA=git rev-parse HEAD`, and `DIFF_SHA256=sha256(bytes(git diff --binary --full-index --no-ext-diff --no-color --no-renames {BASE_SHA}...{HEAD_SHA}))`.
   3. Recompute `SCOPE_SHA256` before each child and stop on drift. Run `Skill(spectre-code_review)` and `Skill(spectre-validate)` with the Step 5 sources plus the candidate tuple. Require clean/accepted results and verify the tuple is unchanged after each. Any repair or candidate-affecting mutation restarts this cycle at clean.
   4. Run `Skill(spectre-proof)` with `{FEATURE_ROOT}`, `SCOPE_FILE`, `SCOPE_SHA256`, the candidate tuple, `EVIDENCE_DIRS`, and `--orchestrated`. Require aggregate `PASS` for that exact tuple. Any product or proof-infrastructure repair returns `CANDIDATE_CHANGED` and restarts this cycle.
7. **Open the review boundary.** Run `Skill(spectre-create_pr)` with `{TARGET_BRANCH}`, `EXPECTED_BASE_SHA={BASE_SHA}`, `EXPECTED_HEAD_SHA={HEAD_SHA}`, `EXPECTED_DIFF_SHA256={DIFF_SHA256}`, `EVIDENCE_DIRS`, `--draft`, and `--orchestrated`. It must fetch and reject target/head/diff or candidate-worktree drift as `PR_CANDIDATE_STALE` before pushing or opening; restart Step 6 within its cap. Keep workflow evidence separate from the PR diff. Never force-push unrelated history, bypass hooks/checks, suppress failures, merge, deploy, or release.

## Handoff

Return: confirmed scope path and hash · proof status and artifact paths · `{BASE_SHA, HEAD_SHA, DIFF_SHA256}` · checks/review/validation results · repair/finalization counts · rebase target, backup ref, and restore command · limitations · draft PR URL.

End with: `Next (recommended): review the proof and draft PR.`

## Escalate-If

- `NEEDS_FULL_SCOPE`, non-convergent boundaries, or broad/multi-area scope → continue in standalone `/spectre:scope` or route to `/spectre:plan`; do not implement.
- Post-confirmation evidence requires changed scope; a bug cannot be reproduced or root-caused; acceptance truth conflicts; or a required proof dependency/credential/permission needs user authority.
- Deterministic, review, validation, proof, or finalization repair caps are exhausted.
- A required child skill or orchestrated mode is unavailable or cannot satisfy its DONE contract.
- Git cannot provide the required safe checkout, or the requested delivery depends on pre-existing dirty changes deliberately left behind.
- Rebase requires semantic product judgment, remote history diverged unexpectedly, or secrets/PII appear in the working set or evidence.

---
name: "spectre-deliver"
description: "Autonomously take a tightly scoped feature or bug fix from request to tested implementation, reviewed final-state proof, and a draft PR. Use when the user wants Spectre to infer a bounded scope and proceed without a confirmation gate. Do NOT use for ambiguous or broad work, non-code work, or when the user wants to confirm scope first (use spectre-align-and-deliver)."
user-invocable: true
disable-model-invocation: true
---

# deliver

## Purpose

Turn one low-ambiguity feature or bug-fix request into a proven, reviewer-ready draft PR without routine user gates. Infer the smallest coherent scope, preserve it through delivery, and stop before merge, deploy, or release.

## Inputs

- `$ARGUMENTS` — feature request or bug report, referenced context, and an optional target branch stated in natural language. If empty, ask for the task and wait.
- Optional explicit managed feature name/root or an artifact beneath one.
- Default target: `origin/main`.
- Read referenced files completely before decomposing the work.

## Working Set

- Late-bind branch, worktree, remotes, diff, repository instructions, and test/lint/build commands.
- `FEATURE_ROOT = .spectre/features/<feature-name>/`, resolved once below and passed unchanged to every child.
- Canonical artifacts: `{FEATURE_ROOT}/concepts/scope.md`; `{FEATURE_ROOT}/specs/{quick_task_plan.md,execute.md,tasks.json}`; review/validation reports; and `{FEATURE_ROOT}/proof/{proof.json,proof.html}`.

## Feature root contract

- Resolve an explicit feature directory or feature name first, then a supplied artifact beneath the feature root, then one unambiguous feature artifact from the current thread. If unresolved or ambiguous, use the proposal flow below; never use branch name, modification time, lifecycle completeness, or directory scanning to infer a feature.
- For new work, propose a lowercase kebab-case feature name and `.spectre/features/<feature-name>/` in the existing delivery-start response, then proceed. Silence on the name accepts it; never create a separate name-confirmation gate.
- When the user explicitly names an existing managed feature, continue it under its existing overwrite safeguards. The physical directory is authoritative.
- Before the first write, inspect the proposed root. An unintended occupied directory must stop the workflow; never auto-suffix, reinterpret, or overwrite it. An explicitly selected directory without a valid `feature.json` is unmanaged and must also stop.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`.
- Keep the marker lifecycle-neutral: never add branch, status, active-pointer, alias, or absolute-path state.
- If `.spectre/.gitignore` is absent and the repository does not already ignore `.spectre/`, create it with `manifest.json`, `bin/`, `handoffs/`, and `!features/`. Do not rewrite a user root ignore file. If the selected feature root is ignored, warn that its records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid. Pass the exact selected `FEATURE_ROOT` unchanged to every child call.

## Outputs + DONE

- A compact `SCOPE_FILE` plus `SCOPE_SHA256`: **Alignment: inferred** · Type (`feature | fix`) · Objective · IN · OUT · ANTI-SCOPE · Acceptance Criteria · Proof Journeys · Assumptions · Target Branch.
- A bounded `quick_task_plan.md`: Agreed Scope · Research Summary · Approach · dependency-ordered Implementation Tasks · Success Criteria; plus light `execute.md`/`tasks.json` when the feature route needs them.
- Tested implementation with conventional commits; cumulative review/validation evidence; clean and rebased branch with backup/restore evidence.
- Sanitized `proof.json` and `proof.html` proving the immutable final candidate tuple `{BASE_SHA, HEAD_SHA, DIFF_SHA256}`.
- A pushed branch and draft PR grounded in the actual diff; a separate proof capsule and PR URL returned together for review.

**DONE when:** implementation and deterministic gates pass; no unresolved CRITICAL/HIGH review or validation gap remains; proof aggregate is `PASS` for the exact final candidate tuple; cleanup and rebase safety contracts pass; and the draft PR URL is returned. No merge, deploy, release, or public proof publication occurs.

## Method / guardrails

Invoke every named child skill with the stated arguments; do not merely describe or inline it. Validate each returned DONE contract before advancing.

1. **Resolve and isolate.** Work on a feature branch/worktree; never commit directly to `main`/`master`. Refuse unrelated or sensitive changes.
2. **Infer the delivery brief.** Ground with targeted `@spectre:finder`, `@spectre:analyst`, and `@spectre:patterns` reads. Write the compact scope without confirmation, capture its actual path as `SCOPE_FILE`, and record `SCOPE_SHA256=sha256(bytes(SCOPE_FILE))`; use a scoped filename rather than overwriting another task. Record material assumptions. Once mutation begins, scope is immutable: no silent narrowing, expansion, or reinterpretation.
3. **Plan and route.** Write a bounded quick plan to a collision-safe `QUICK_PLAN_FILE`; keep it within roughly three phases/eight parents and map every IN item to work and proof.
   - `feature` → run `Skill(spectre-create_tasks)` with `SCOPE_FILE`, `QUICK_PLAN_FILE`, `{FEATURE_ROOT}`, `--orchestrated`, and `--depth light` for ≤3 parents or `--depth standard` otherwise. Capture returned `EXECUTE_FILE` and `DETAIL_FILE`, verify both, then run `Skill(spectre-execute)` with `EXECUTE_FILE --orchestrated`.
   - `fix` → run `Skill(spectre-fix-core)` with the bug report, `PHASE=full`, `PARENT=spectre-deliver`, `PARENT_AUTHORIZATION={SCOPE_FILE}`, `AUTHORIZED_SCOPE_SHA256={SCOPE_SHA256}`, `ALIGNMENT_MODE=inferred`, and `--orchestrated`. Preserve root cause and RED-before-GREEN repair; the explicit `/spectre:deliver` invocation replaces only diagnosis approval.
4. **Close implementation gaps.** Require deterministic checks and cumulative adversarial review plus defined→connected→reachable validation. When the selected path did not already produce them, run `Skill(spectre-code_review)` with `{FEATURE_ROOT} --orchestrated`, then `Skill(spectre-validate)` with `SCOPE_FILE`, `DETAIL_FILE` when present, `{FEATURE_ROOT}`, and `--orchestrated`; repair only scope-safe gaps and rerun the affected gate.
5. **Converge the final candidate.** Allow at most two cycles:
   1. Run `Skill(spectre-clean)` with `{FEATURE_ROOT} --orchestrated`, then `Skill(spectre-rebase)` with `{TARGET_BRANCH} --orchestrated` and its mandatory backup ref.
   2. Set `EVIDENCE_DIRS={FEATURE_ROOT}/{reviews,validation,proof}`. Require a clean candidate worktree outside them, then capture `BASE_SHA=git rev-parse {TARGET_BRANCH}`, `HEAD_SHA=git rev-parse HEAD`, and `DIFF_SHA256=sha256(bytes(git diff --binary --full-index --no-ext-diff --no-color --no-renames {BASE_SHA}...{HEAD_SHA}))`.
   3. Recompute `SCOPE_SHA256` before each child and stop on drift. Run `Skill(spectre-code_review)` and `Skill(spectre-validate)` with the Step 4 sources plus the candidate tuple. Require clean/accepted results and verify the tuple is unchanged after each. Any repair or candidate-affecting mutation restarts this cycle at clean.
   4. Run `Skill(spectre-proof)` with `{FEATURE_ROOT}`, `SCOPE_FILE`, `SCOPE_SHA256`, the candidate tuple, `EVIDENCE_DIRS`, and `--orchestrated`. Require aggregate `PASS` for that exact tuple. Any product or proof-infrastructure repair returns `CANDIDATE_CHANGED` and restarts this cycle.
6. **Open the review boundary.** Run `Skill(spectre-create_pr)` with `{TARGET_BRANCH}`, `EXPECTED_BASE_SHA={BASE_SHA}`, `EXPECTED_HEAD_SHA={HEAD_SHA}`, `EXPECTED_DIFF_SHA256={DIFF_SHA256}`, `EVIDENCE_DIRS`, `--draft`, and `--orchestrated`. It must fetch and reject target/head/diff or candidate-worktree drift as `PR_CANDIDATE_STALE` before pushing or opening; restart Step 5 within its cap. Keep workflow evidence separate from the PR diff. Never force-push unrelated history, bypass hooks/checks, suppress failures, merge, deploy, or release.

## Handoff

Return: proof status and artifact paths · `{BASE_SHA, HEAD_SHA, DIFF_SHA256}` · scope hash · checks/review/validation results · repair/finalization counts · rebase target, backup ref, and restore command · limitations · draft PR URL.

End with: `Next (recommended): review the proof and draft PR.`

## Escalate-If

- No safe, cohesive low-ambiguity interpretation exists before mutation → recommend `/spectre:align-and-deliver`; route broad/multi-area work to `/spectre:plan`.
- A bug cannot be reproduced or root-caused; acceptance truth conflicts; a repair changes scope; or a required proof dependency/credential/permission needs user authority.
- Deterministic, review, validation, proof, or finalization repair caps are exhausted.
- A required child skill or orchestrated mode is unavailable or cannot satisfy its DONE contract.
- Rebase requires semantic product judgment, remote history diverged unexpectedly, or secrets/PII appear in the working set or evidence.

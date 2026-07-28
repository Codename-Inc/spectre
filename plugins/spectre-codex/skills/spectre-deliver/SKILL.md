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
- Canonical artifacts: `{FEATURE_ROOT}/concepts/scope.md`; `{FEATURE_ROOT}/specs/{quick_task_plan.md,execute.md,tasks.json}` when needed; final verification/review reports; and `{FEATURE_ROOT}/proof/{proof.json,proof.html}`.

## Feature root contract

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature.
- When the user explicitly names an existing managed feature, continue it under its existing overwrite safeguards. The physical directory is authoritative.
- For an inferred name, use the first free `.spectre/features/<name>[-N]/`; never overwrite or auto-continue a collision. An explicitly selected unmanaged directory remains a safety blocker.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`.
- Keep the marker lifecycle-neutral: never add branch, status, active-pointer, alias, or absolute-path state.
- If `.spectre/.gitignore` is absent and the repository does not already ignore `.spectre/`, create it with `manifest.json`, `bin/`, `handoffs/`, and `!features/`. Do not rewrite a user root ignore file. If the selected feature root is ignored, warn that its records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid. Pass the exact selected `FEATURE_ROOT` unchanged to every child call.

## Outputs + DONE

- A compact `SCOPE_FILE` plus `SCOPE_SHA256`: **Alignment: inferred** · Type (`feature | fix`) · Objective · IN · OUT · ANTI-SCOPE · Acceptance Criteria · Proof Journeys · Assumptions · Target Branch.
- A bounded `quick_task_plan.md`: Agreed Scope · Research Summary · Approach · dependency-ordered Implementation Tasks · Success Criteria; plus light `execute.md`/`tasks.json` when the feature route needs them.
- Tested implementation with conventional commits; exact-candidate deterministic/review evidence; clean and rebased branch with backup/restore evidence.
- Sanitized `proof.json` and `proof.html` proving the immutable final candidate tuple `{BASE_SHA, HEAD_SHA, DIFF_SHA256}`.
- A pushed branch and draft PR grounded in the actual diff; a separate proof capsule and PR URL returned together for review.

**DONE when:** implementation and exact-candidate deterministic gates pass; no unresolved CRITICAL/HIGH review or delivery-coverage gap remains; proof aggregate is `PASS` for the exact final candidate tuple; cleanup and rebase safety contracts pass; and the draft PR URL is returned. No merge, deploy, release, or public proof publication occurs.

## Method / guardrails

Invoke every named child skill with the stated arguments; do not merely describe or inline it. Validate each returned DONE contract before advancing.

1. **Resolve the execution location; isolate only when needed.** Before any artifact or product write, snapshot the entry state with `git status --porcelain=v1 --untracked-files=all` and distinguish the primary/local checkout from a linked worktree.
   - **Clean linked worktree:** stay in the current directory. Reuse its non-protected branch; when it is on `main`/`master` or detached `HEAD`, create a collision-safe feature branch in that same worktree. Never create another worktree.
   - **Dirty linked worktree:** leave it byte-for-byte untouched and create a clean sibling worktree plus collision-safe feature branch from committed `HEAD`. Do not stash, reset, commit, copy, or otherwise carry its pre-existing changes into the delivery worktree.
   - **Primary/local checkout:** whether clean or dirty, leave it untouched and create a clean linked worktree plus collision-safe feature branch from committed `HEAD`.
   - Apply this routing without a confirmation gate, run every child in the selected checkout, and never commit directly to `main`/`master`. Refuse unrelated or sensitive changes.
2. **Infer the delivery brief.** Ground with targeted `@spectre_finder`, `@spectre_analyst`, and `@spectre_patterns` reads. Write the compact scope without confirmation, capture its actual path as `SCOPE_FILE`, and record `SCOPE_SHA256=sha256(bytes(SCOPE_FILE))`; use a scoped filename rather than overwriting another task. Record material assumptions. Once mutation begins, scope is immutable: no silent narrowing, expansion, or reinterpretation.
3. **Plan and route.** Write a bounded quick plan to a collision-safe `QUICK_PLAN_FILE`; keep it within roughly three phases/eight parents and map every IN item to work and proof.
   - Before a feature route, set `VERIFICATION_PROFILE=bounded` only when the planned diff is confined to one package/workspace, repository-native related tests are identifiable, and neither scope nor likely paths touch auth, permissions, payments, PII, migrations, public APIs/contracts, secrets, network input, destructive actions, data correctness, persistent state, external side effects, shared infrastructure/build/test tooling, cross-package behavior, or a lifecycle/trust boundary. Otherwise set `strict`. This is an evidence-based classification, not a user-confidence claim; execute may promote bounded to strict but never demote it.
   - Tiny `feature` — exactly one dependency-safe sequential workstream with no structured resume/parallelization need → run `Skill(spectre-execute)` with `QUICK_PLAN_FILE`, `{FEATURE_ROOT}`, `--orchestrated`, `--verification-profile {VERIFICATION_PROFILE}`, and `--finalization-owner parent` in plan-direct mode. Do not create `execute.md`/`tasks.json` merely as ceremony.
   - Other `feature` → run `Skill(spectre-create_tasks)` with `SCOPE_FILE`, `QUICK_PLAN_FILE`, `{FEATURE_ROOT}`, `--orchestrated`, and `--depth light` for ≤3 parents or `--depth standard` otherwise. Capture returned `EXECUTE_FILE` and `DETAIL_FILE`, verify both, then run `Skill(spectre-execute)` with `EXECUTE_FILE`, `--orchestrated`, `--verification-profile {VERIFICATION_PROFILE}`, and `--finalization-owner parent`.
   - `fix` → run `Skill(spectre-fix-core)` with the bug report, `PHASE=full`, `PARENT=spectre-deliver`, `PARENT_AUTHORIZATION={SCOPE_FILE}`, `AUTHORIZED_SCOPE_SHA256={SCOPE_SHA256}`, `ALIGNMENT_MODE=inferred`, and `--orchestrated`. Preserve root cause and RED-before-GREEN repair; the explicit `spectre-deliver` invocation replaces only diagnosis approval.
4. **Accept implementation readiness, not finalization.** A feature route must return `IMPLEMENTATION_READY` with its required execute manifest; a fix route must return its root cause, RED→GREEN evidence, affected paths/test roots, and relevant deterministic results. Reject unresolved CRITICAL/HIGH findings or an incomplete task/workstream projection. Do not run a pre-rebase final code review or separate `spectre-validate`; the immutable candidate review below owns exhaustive delivery/reachability, scope-creep, dead-computation, old-path, and single-data-source validation.
5. **Converge the final candidate.** Allow at most two cycles:
   1. Run `Skill(spectre-clean)` with `{FEATURE_ROOT} --orchestrated`, then `Skill(spectre-rebase)` with `{TARGET_BRANCH}`, `--orchestrated`, `--verification-owner parent`, and its mandatory backup ref. Require `REBASE_READY`; Deliver now owns post-rebase verification.
   2. Set `EVIDENCE_DIRS={FEATURE_ROOT}/{reviews,verification,proof}`. Require a clean candidate worktree outside them, then capture `BASE_SHA=git rev-parse {TARGET_BRANCH}`, `HEAD_SHA=git rev-parse HEAD`, and `DIFF_SHA256=sha256(bytes(git diff --binary --full-index --no-ext-diff --no-color --no-renames {BASE_SHA}...{HEAD_SHA}))`.
   3. **Verify the exact candidate once.** Resolve and run repository-authoritative lint/typecheck/build plus exactly one complete-suite layer: when a single authoritative root suite exists, run it once and do not also run identical package suites; otherwise run each affected package/workspace complete suite once. Use the execute/fix manifest only to locate affected roots and commands, never as pass evidence. Persist command bytes, exit/results, duration, runtime/tool versions, lockfile hash, candidate tuple, and `FINAL_VERIFICATION_KEY=sha256(candidate tuple + command bytes + stable environment fingerprint)` under `{FEATURE_ROOT}/verification/`. Reuse a prior PASS only for an exact key match; any tuple, command, lockfile, runtime, or environment change invalidates it. Recompute `HEAD_SHA` and `DIFF_SHA256` after verification and restart at clean on any candidate or non-evidence worktree change.
   4. Set `REQUIREMENTS_SOURCE=DETAIL_FILE` when structured tasks exist, otherwise `QUICK_PLAN_FILE`. Recompute `SCOPE_SHA256` before each child and stop on drift. Run `Skill(spectre-code_review)` with `{FEATURE_ROOT}`, `SCOPE_FILE`, `REQUIREMENTS_SOURCE`, the candidate tuple, and `--orchestrated`. Require clean/accepted exhaustive delivery coverage and verify the tuple is unchanged afterward. Any repair or candidate-affecting mutation restarts this cycle at clean.
   5. Run `Skill(spectre-proof)` with `{FEATURE_ROOT}`, `SCOPE_FILE`, `SCOPE_SHA256`, the candidate tuple, `EVIDENCE_DIRS`, and `--orchestrated`. Require aggregate `PASS` for that exact tuple. Any product or proof-infrastructure repair returns `CANDIDATE_CHANGED` and restarts this cycle.
6. **Open the review boundary.** Run `Skill(spectre-create_pr)` with `{TARGET_BRANCH}`, `EXPECTED_BASE_SHA={BASE_SHA}`, `EXPECTED_HEAD_SHA={HEAD_SHA}`, `EXPECTED_DIFF_SHA256={DIFF_SHA256}`, `EVIDENCE_DIRS`, `--draft`, and `--orchestrated`. It must fetch and reject target/head/diff or candidate-worktree drift as `PR_CANDIDATE_STALE` before pushing or opening; restart Step 5 within its cap. Keep workflow evidence separate from the PR diff. Never force-push unrelated history, bypass hooks/checks, suppress failures, merge, deploy, or release.

## Handoff

Return: proof status and artifact paths · `{BASE_SHA, HEAD_SHA, DIFF_SHA256}` · scope hash · verification profile/promotions · exact-candidate checks/review result · repair/finalization counts · rebase target, backup ref, and restore command · limitations · draft PR URL.

End with: `Next (recommended): review the proof and draft PR.`

## Escalate-If

- No safe, cohesive low-ambiguity interpretation exists before mutation → recommend `spectre-align-and-deliver`; route broad/multi-area work to `spectre-plan`.
- A bug cannot be reproduced or root-caused; acceptance truth conflicts; a repair changes scope; or a required proof dependency/credential/permission needs user authority.
- Deterministic, review, proof, or finalization repair caps are exhausted.
- A required child skill or orchestrated mode is unavailable or cannot satisfy its DONE contract.
- Git cannot provide the required safe checkout, or the requested delivery depends on pre-existing dirty changes deliberately left behind.
- Rebase requires semantic product judgment, remote history diverged unexpectedly, or secrets/PII appear in the working set or evidence.

## Codex Agent Preflight

Before dispatching any `@spectre_*` custom agent, run the bundled setup helper once:

```bash
node "${PLUGIN_ROOT}/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
```

If the helper reports agents were installed or updated in this session, continue directly only for lookup/scoping work that can be completed without a subagent. For other agent-dependent workflows, stop with a clear one-session restart requirement so Codex can discover the new custom agents.

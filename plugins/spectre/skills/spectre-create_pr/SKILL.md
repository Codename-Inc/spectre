---
name: "spectre-create_pr"
description: "Generate a grounded draft pull request from the actual diff and open it via gh. Use when wrapping up a branch or writing a PR description; not to commit/clean (spectre-sweep), rebase (spectre-rebase), or autonomously deliver a request (spectre-delegate)."
user-invocable: true
---

# create_pr

Produce a reviewer-ready draft PR grounded in the actual change. Every claim traces to a diff hunk, commit, or linked issue; never invent rationale.

## Inputs

- `$ARGUMENTS`: `TARGET_BRANCH` (default `origin/main`), feedback focus, compact `VERIFICATION_SUMMARY`, all-or-none `EXPECTED_BASE_SHA`/`EXPECTED_HEAD_SHA`/`EXPECTED_DIFF_SHA256`, or `--orchestrated`.
- Orchestrated mode accepts `--pr-phase pending|final-update`. `pending` requires the complete candidate tuple and sets local verification `RUNNING`; return its draft URL and body. `final-update` requires that URL/body, the same complete tuple, and `FINAL_VERIFICATION_SUMMARY`; it updates the existing draft's Testing section only.
- Resolve just-in-time: branch (not `main`/`master`), fetch target and derive `PR_BASE`, `BASE_SHA`, `HEAD_SHA`, canonical `git-diff-v1` `DIFF_SHA256` over binary/full-index/no-color/no-renames `{BASE_SHA}...{HEAD_SHA}`, commits, branch/commit issue ref, `gh`, and unpushed commits.
- Any expected field requires all three. After fetch, compare them with the live tuple and a clean candidate worktree (committed canonical review/proof artifacts are allowed; ignored lifecycle state is excluded). Tracked or non-ignored untracked changes return `PR_CANDIDATE_STALE` with expected/observed state before push, create, or edit. If `gh` is absent, return title/body for manual draft creation.

## Working Set

The target-to-HEAD diff and commit log, issue reference, and any GitHub PR template (whose required sections win).

## Outputs + DONE

- Conventional `type(scope): summary` title: <70 chars, imperative, lowercase after colon, no period; grounded body scaled to the change.
- Standalone/pending opens only `gh pr create --draft`; pending returns URL/body with Testing `RUNNING`. Final-update returns the existing URL/body after replacing only Testing from final verification.

**DONE:** fetched tuple is verified; every factual claim is grounded; Testing honestly reflects diff tests and supplied verification (never turns advisory non-green into pass); Why is sourced or the placeholder; no secret/credential/PII is quoted; and only a draft is opened or updated.

## Method / guardrails

1. **Ground sections:** What is behavioral diff effect, not file churn; Why is issue, then commits, then branch or `<!-- WHY: motivation not found in commits/issue — fill in -->`; How/trade-offs are visible decisions only; Testing includes supplied verification in substance (command/scope, counts, attribution, repairs, findings, CI status), summarizes changed tests, or says none changed.
2. **Scale:** trivial uses What/Why/Closes; standard uses Summary, behavioral Changes, Testing, Closes; complex also adds visible trade-offs, breaking/rollback, UI/CLI screenshots, and focused reviewer feedback. Derive type from dominant change and scope from primary area; add only found issue links.
3. **Verify before side effects:** reread the diff, map every body claim to a hunk/commit/issue, drop unsupported claims, and reject secrets/keys/PII. Verify tuple and clean candidate after fetch; push only then.
4. **Draft lifecycle:** pending grounds `RUNNING`, pushes, creates the draft, and returns URL/body. Final-update rechecks its tuple/clean candidate and draft; if repairs changed the tuple, refresh candidate-sensitive claims under freshness, grounding, and secret gates, verify clean repaired HEAD, pushes, re-resolves/rechecks live tuple, then replaces only Testing using `FINAL_VERIFICATION_SUMMARY` and `gh pr edit`; never mark ready.

## Handoff

Return URL/body or `PR_CANDIDATE_STALE`; `--orchestrated`: no user step.

| Handoff | Details |
|---|---|
| 🧭 **Current phase** | Done |
| 📦 **What was just done** | Result |
| ▶️ **Proposed next step** | Render resolved action; no placeholders. |

Standalone: review the PR.

## Escalate-If

- Branch is main/master or has no target-ahead commits; candidate tuple is incomplete/different; branch/target/remote is unsafe; or the diff has secrets/PII.
- Large intent is ungrounded: use the Why placeholder and draft, never fabricate.

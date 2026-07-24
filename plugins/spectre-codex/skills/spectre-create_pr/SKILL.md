---
name: "spectre-create_pr"
description: "Generate a high-quality pull request from the actual diff and open it via gh — derives What from the diff, Why from commits/linked issue/branch, Testing from real test changes, scales the template to PR size, self-verifies every claim against a diff hunk, then runs gh pr create. Use when wrapping up a branch and asked to open a PR or write a PR description. Do NOT use to commit/clean the diff first (spectre-sweep), to rebase history (spectre-rebase), or for the full autonomous request→proof→PR flow (spectre-deliver)."
user-invocable: true
---

# create_pr

Produce a reviewer-ready pull request grounded in the actual change. Every claim traces to a diff hunk, a commit message, or a linked issue — never invented. Scale the description to the size of the change. Then open the PR with `gh`.

## Inputs
- `$ARGUMENTS` (optional): `TARGET_BRANCH` (default `origin/main`), feedback-focus hint, `--draft`, optional `EXPECTED_BASE_SHA`/`EXPECTED_HEAD_SHA`/`EXPECTED_DIFF_SHA256` plus explicit `EVIDENCE_DIRS`, or `--orchestrated` when a parent workflow owns the final summary. Read the live repo state at runtime — never assume a prior phase ran.
- Resolve just-in-time:
  - `BRANCH = git rev-parse --abbrev-ref HEAD`. If on `main`/`master` → stop and ask (nothing to PR).
  - `TARGET_BRANCH` (default `origin/main`); `PR_BASE = TARGET_BRANCH` with a leading remote name such as `origin/` removed. `git fetch`, then resolve `BASE_SHA` and `HEAD_SHA`.
  - `DIFF = git diff {BASE_SHA}...{HEAD_SHA}`; `DIFF_SHA256` uses `git-diff-v1`: SHA-256 over raw stdout from `git diff --binary --full-index --no-ext-diff --no-color --no-renames {BASE_SHA}...{HEAD_SHA}`; `COMMITS = git log {BASE_SHA}..{HEAD_SHA}`; branch name; any issue ref found in branch name or commits (`#123`, `PROJ-123`).
  - If any expected candidate field is supplied, require all three and compare them with the fetched base, current head, canonical diff hash, and candidate worktree before push or PR creation. Only evidence files inside explicit `EVIDENCE_DIRS` may be dirty; any other tracked or untracked change returns `PR_CANDIDATE_STALE` with expected/observed state and performs neither action.
  - `gh` availability + unpushed commits. If `gh` is absent → output the title + body for manual creation and say so.

## Working Set
The diff between `TARGET_BRANCH` and `HEAD`, the commit log over that range, and any `.github/pull_request_template.md` / `.github/PULL_REQUEST_TEMPLATE/`. If a repo template exists, honor its required sections over the defaults below.

## Outputs + DONE
- A PR title in conventional-commit form: `type(scope): summary` (<70 chars, imperative, lowercase after colon, no trailing period).
- A PR body grounded per the Method, scaled to PR size.
- An opened PR via `gh pr create` (`--draft` when requested); the **PR URL output as the final deliverable**. If `gh` is unavailable, the title + body are output for manual creation instead.

**DONE when:** any supplied candidate tuple was verified after fetch; every factual claim in the body traces to a diff hunk, a commit message, or a linked issue; the Testing section reflects whether test files actually changed (no claimed tests that don't exist in the diff); no "Why" was fabricated (placeholder used if no source); title follows conventional-commit form; PR opened (or body emitted with the gh-unavailable note) and URL returned.

## Method / guardrails
1. **Ground each section in a real source — never the model's prior knowledge of the codebase:**
   - **What** ← summarize the **behavioral** change from `DIFF`. Describe what the code now does, not which files/lines moved. Never recite the diff.
   - **Why** ← linked issue body, then commit messages, then branch name. If no source exists, emit `<!-- WHY: motivation not found in commits/issue — fill in -->` rather than inventing rationale.
   - **How / trade-offs** ← decisions visible in commit messages or diff structure. Omit for trivial changes; never infer design intent from code shape alone.
   - **Testing** ← inspect the diff for test-file changes. If tests changed, summarize what they cover. If none changed, state that plainly — do not claim tests were added.
2. **Scale the template to PR size** (lines changed + concern count):
   - **Trivial** (small, single-concern): What + Why + `Closes #`.
   - **Standard**: Summary · Changes (behavioral bullets) · Testing · `Closes #`.
   - **Complex** (large/multi-area/risky): add How & Trade-offs, Breaking Changes / Rollback, Screenshots (UI/CLI), and a **Feedback Requested** line directing the reviewer (e.g. "focus on the data model in `src/models/`") — the highest-leverage section for review quality.
3. **Title** — derive `type` from the dominant change (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`perf`), `scope` from the primary area touched.
4. **Issue linking** — if an issue ref was found, add `Closes #NNN` (or the tracker's pattern) as its own line. Do not invent issue numbers.
5. **Self-verification pass (required)** — before opening: re-read the diff and check each claim in the body maps to a specific hunk. Drop or flag any claim that doesn't. Confirm no secrets/keys/PII are quoted from the diff into the body.
6. **Pin the candidate, then open.** After the required fetch, verify any expected tuple before side effects. Only then push unpushed commits (`git push -u origin {BRANCH}`) and run `gh pr create --base {PR_BASE} --title … --body …` (`--draft` if requested). Output the URL.

## Handoff
Terminal skill — output is the PR URL (or the body + gh-unavailable note). With `--orchestrated`, return it or `PR_CANDIDATE_STALE` to the caller without user-facing Next Steps. Standalone: `Next (recommended): review the PR.` Add `spectre-code_review` only when an additional adversarial review is requested or the diff risk warrants it.

## Escalate-If
- On `main`/`master`, or no commits ahead of `TARGET_BRANCH` → stop and ask; there is nothing to PR.
- Expected candidate tuple is incomplete or differs after fetch → return `PR_CANDIDATE_STALE`; do not push or open a PR.
- A secret/credential/PII appears in the diff → surface it; do not embed it in the body or open the PR until resolved.
- The diff is large and intent cannot be grounded from commits/issue/branch → open as `--draft` with the `WHY` placeholder and flag the gap, rather than fabricating rationale.

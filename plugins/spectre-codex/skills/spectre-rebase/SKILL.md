---
name: "spectre-rebase"
description: "👻 | Safe guided git rebase — backup ref, auto-resolve conflicts, verify tests, smoketest guide. Use to rebase the current branch onto a target (e.g. origin/main), especially when conflicts or post-rebase verification are expected. Do NOT use for merges, cherry-picks, interactive history edits, or non-git work."
user-invocable: true
---

# rebase

Rebase the current branch onto a target, resolving conflicts and verifying the result, with a recoverable safety net.

## Inputs
- Target branch from `$ARGUMENTS` (e.g. `origin/main`) and optional `--orchestrated` when a parent workflow owns the next step. If absent, ask which branch to rebase onto.
- Current branch + working-tree state (read just-in-time via `git status`, never assume).

## Working Set
- The current git branch and its commits ahead of target.
- Project test/lint commands (detect from repo: `npm test`, `pytest`, `cargo test`, `go test`).

## Outputs + DONE
A rebased branch and a **Rebase Summary** returned in-thread (not written to disk):
- Branch `{current} → {target}`; commit count; conflict count; test result PASS/FAIL.
- Per-conflict decision table: `| File | Decision | Rationale |`.
- Smoketest guide grounded in files touched: `{area}: [ ] {behavior to verify}`.
- Safety line: backup ref name + restore command.

**DONE when:** rebase completes with no remaining conflict markers, commit count validated against expectation, **lint + full test suite actually run and passing**, and the summary (including the backup ref + restore command) is delivered.

## Method / guardrails
1. **Snapshot first.** If the tree is dirty, auto-commit (`git commit -am "chore: snapshot before rebase"`) — no prompt. Then `git fetch origin`.
2. **YOU MUST create a backup ref before rebasing** and surface its restore command in the summary:
   `git branch backup/rebase-$(date +%Y%m%d-%H%M%S)` → restore via `git reset --hard {backup}`. This is the only rollback; never start the rebase without it.
3. Run `git rebase {target}`. For each conflict: resolve favoring the target branch's conventions (no prompts), record `{file}: {decision} — {rationale}`, `git add`, `git rebase --continue`. Repeat until clean.
4. **Verify after resolution** — run lint (fix violations) and the full test suite; confirm commit count and no unexpected changes. Do not declare done on an unverified rebase.
5. Track every resolution decision as you go (the summary table is a postcondition, not an afterthought).

## Handoff
Return the Rebase Summary inline as a compressed (1–2K) block. With `--orchestrated`, return to the caller without user-facing Next Steps. Standalone success → `Next (recommended): spectre-create_pr — the rebased branch is verified and ready for review.` A failed or incomplete rebase recommends only the exact recovery action.

## Escalate-If
- Conflicts can't be resolved by favoring the target (genuine semantic divergence) → stop, report, leave the rebase in progress for the user.
- Tests fail after rebase → report the failure and the restore command; do not force-push or proceed.
- Working tree or target branch state is ambiguous → ask before acting.

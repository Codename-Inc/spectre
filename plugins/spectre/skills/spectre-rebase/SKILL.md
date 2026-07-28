---
name: "spectre-rebase"
description: "👻 | Safe guided git rebase — backup ref, auto-resolve conflicts, and either verify tests or hand exact verification ownership to an orchestrating parent. Use to rebase the current branch onto a target (e.g. origin/main), especially when conflicts or post-rebase verification are expected. Do NOT use for merges, cherry-picks, interactive history edits, or non-git work."
user-invocable: true
---

# rebase

Rebase the current branch onto a target, resolving conflicts and verifying the result, with a recoverable safety net.

## Inputs
- Target branch from `$ARGUMENTS` (e.g. `origin/main`) and optional `--orchestrated` when a parent workflow owns the next step. If absent, ask which branch to rebase onto.
- Optional `--verification-owner parent`, valid only with `--orchestrated`. It transfers post-rebase lint/full-suite ownership to the parent so the exact final candidate is verified once; plain `--orchestrated` does not transfer ownership.
- Current branch + working-tree state (read just-in-time via `git status`, never assume).

## Working Set
- The current git branch and its commits ahead of target.
- Project test/lint commands (detect from repo: `npm test`, `pytest`, `cargo test`, `go test`).

## Outputs + DONE
A rebased branch and a **Rebase Summary** returned in-thread (not written to disk):
- Branch `{current} → {target}`; commit count; conflict count; verification result `PASS|PARENT_OWNED|FAIL`.
- Per-conflict decision table: `| File | Decision | Rationale |`.
- Smoketest guide grounded in files touched: `{area}: [ ] {behavior to verify}`.
- Safety line: backup ref name + restore command.

**DONE when self-owned:** rebase completes with no remaining conflict markers, commit count validates against expectation, **lint + full test suite actually run and pass**, and the summary (including the backup ref + restore command) is delivered.

**REBASE_READY when parent-owned:** rebase completes with no remaining conflict markers, commit count validates against expectation, the summary records `verification: PARENT_OWNED`, and the parent explicitly accepts responsibility to run lint + the authoritative full suite against the resulting immutable candidate before review/proof/PR.

## Method / guardrails
1. **Snapshot first.** If the tree is dirty, auto-commit (`git commit -am "chore: snapshot before rebase"`) — no prompt. Then `git fetch origin`.
2. **YOU MUST create a backup ref before rebasing** and surface its restore command in the summary:
   `git branch backup/rebase-$(date +%Y%m%d-%H%M%S)` → restore via `git reset --hard {backup}`. This is the only rollback; never start the rebase without it.
3. Run `git rebase {target}`. For each conflict: resolve favoring the target branch's conventions (no prompts), record `{file}: {decision} — {rationale}`, `git add`, `git rebase --continue`. Repeat until clean.
4. **Verify after resolution** — always confirm commit count and no unexpected changes.
   - Self-owned: run lint (fix violations) and the full test suite. Do not declare DONE on an unverified rebase.
   - `--orchestrated --verification-owner parent`: do not run lint or tests; return `REBASE_READY` with `verification: PARENT_OWNED`. Never use this route unless the caller's contract requires exact-candidate lint/full-suite verification before review/proof/PR.
5. Track every resolution decision as you go (the summary table is a postcondition, not an afterthought).

## Handoff
Return the Rebase Summary inline as a compressed (1–2K) block. With `--orchestrated`, return to the caller without user-facing Next Steps; parent-owned verification returns `REBASE_READY`, never DONE. Standalone success → `Next (recommended): /spectre:create_pr — the rebased branch is verified and ready for review.` A failed or incomplete rebase recommends only the exact recovery action.

## Escalate-If
- Conflicts can't be resolved by favoring the target (genuine semantic divergence) → stop, report, leave the rebase in progress for the user.
- Tests fail after rebase → report the failure and the restore command; do not force-push or proceed.
- `--verification-owner parent` is supplied without `--orchestrated`, or the caller does not explicitly own post-rebase lint/full-suite verification → stop before rebase.
- Working tree or target branch state is ambiguous → ask before acting.

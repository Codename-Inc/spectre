---
name: "caspar-clean"
description: "Analyze a scoped working set (a commit range, unstaged changes, or session files) for dead code and artifacts left by recent or abandoned work — orphaned imports/exports, unused code, commented-out blocks, debug/temp logging, duplication, AI slop — then conservatively validate and remove the safe ones with a lint+test gate. Trigger after finishing a feature/branch, after a failed implementation attempt, or when asked to clean up / remove dead code. Do NOT trigger for adding tests (caspar-test), bug fixes (caspar-fix), or broad refactors that change behavior."
user-invocable: true
---

# clean

Find and remove dead code and artifacts from recent work — **clear on WHAT, silent on HOW.** Conservative by default: investigate and validate before deleting; production code is never removed unsigned. Findings flow in-thread (no intermediate report files); only the final code changes and summary persist.

## Inputs

- `$ARGUMENTS` — optional scope. A `commit_id`/SHA, the word `unstaged`/`staged`, or `context`/session. If ambiguous → ask which scope mode (commit / unstaged / session files). If a given `commit_id` is invalid or not in history → **STOP and ask** for a valid ref.
- `target_out_dir` — optional OUT_DIR override.

## Working Set (late-bound — read at run-time, never inline)

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`); `OUT_DIR = target_out_dir || docs/tasks/{branch}`
- Resolve the working set from `scope_mode`:
  - **commit_range** (`commit_id` given): UNION of committed `git log --name-only --pretty=format: {commit_id}^..HEAD | sort -u` (the `^..` **includes** the commit_id commit itself), staged `git diff --cached --name-only`, unstaged `git diff --name-only`, untracked `git ls-files --others --exclude-standard`. If `commit_id == HEAD`, working set = staged + unstaged + untracked.
  - **unstaged**: UNION of staged + unstaged + untracked (the three commands above).
  - **context**: ask the user which session files; **WAIT** for the list.
- Respect `.gitignore`; honor `package.json`/`tsconfig.json` context. All paths absolute from repo root.

## Method / guardrails

- **Detect → investigate → validate → remove.** Scan the working set for dead-code signals, then confirm each before deleting. Be conservative: when in doubt, downgrade, don't delete.
- **Dead-code signals** (ordered by likelihood after a failed branch): orphaned imports · unused functions/vars · large commented-out blocks (>5 lines) · debug artifacts (debugger, current-work TODO/FIXME) · **temp/dev logging** (bare `console.log`/dumps, per-iteration logs in loops/hot paths, DEBUG/TEMP/XXX/HACK prefixes, checkpoint "got here" logs, commented-out logs) · dead/unreachable branches · orphaned exports · duplicate implementations (abandoned refactor) · test artifacts (`.only`, skipped tests) · AI slop (over-commenting, defensive try/catch in trusted paths, `any` casts to dodge types, verbose where the codebase is concise).
- **Duplication:** flag copy-pasted logic (>5 lines, 2+ instances), near-identical functions, repeated types/validate/transform/fetch patterns — with locations, a consolidation target, low/med/high effort. Ignore intentional duplication (fixtures, generated code).
- **Parallel investigation (read-only).** For a non-trivial working set, dispatch up to **4** `@caspar:analyst` agents over file/module chunks. Each verifies per finding: actually unused (imports/calls/refs)? a failed-approach remnant (git history)? safe to remove (dependencies)? and returns a **compressed in-thread** verdict per item — `SAFE_TO_REMOVE` / `NEEDS_VALIDATION` / `KEEP` — with evidence. **No report files written.** When in doubt → `NEEDS_VALIDATION`.
- **Validate high-risk before removal.** Every function/file/export deletion gets a second read-only `@caspar:analyst` pass searching for ANY usage (dynamic imports, string refs, reflection, tests) → `CONFIRMED_SAFE` / `UNSAFE` / `UNCERTAIN`. Only `CONFIRMED_SAFE` is removable; `UNCERTAIN` → manual-review list.
- **Approval gate.** Present the summary (files analyzed · safe removals · manual-review · excluded-with-reason) and **WAIT** for the user to approve specific items or all `CONFIRMED_SAFE`. Remove only what's approved, sequentially.
- **Commit gate.** After removals, run lint (fix violations) and tests for affected areas. **If tests fail → roll back that change** and document it; only commit on green. `--no-verify`, `eslint-disable`, and `@ts-ignore`/`@ts-expect-error` to force a commit are **forbidden without the user's explicit permission.**
- **ESLint-debt scan (diagnostic only).** `grep -rn "eslint-disable\|@ts-ignore\|@ts-expect-error"` the working set, group by module, and for any group with ≥2 bypasses dispatch `@caspar:analyst` to produce a refactor plan (rule · reason · fix · effort · risk). Report it for future tasks — do **not** refactor during clean.

## Outputs + DONE

- Removed dead code (commit by type: chore/refactor/fix/test, conventional format).
- `{OUT_DIR}/cleanup_summary.md` (scoped filename if one exists — never overwrite): Executive Summary · Safe Removals (file:line · what · why safe) · Manual Review Required · Excluded Items (kept + why) · Estimated Impact.
- **DONE when:** every removal was validated `CONFIRMED_SAFE` and user-approved; lint + affected tests pass (failures rolled back); no `--no-verify`/`eslint-disable` introduced; summary written; uncertain items handed to manual review.

## Handoff

Report inline: counts analyzed/removed/excluded, the manual-review list, and the ESLint-debt plan, with the summary path. Then suggest the next command (no wait):

- `/caspar:test` — add/strengthen tests for the cleaned areas
- `/caspar:rebase` — tidy history before merge

## Escalate-If

- A `commit_id` is invalid or scope is ambiguous → stop and ask before scanning.
- A finding sits at `UNCERTAIN`/`UNSAFE`, or removal touches production code without a clean signal → leave it in, flag for manual review, don't force it.
- Lint/tests fail after a removal → roll back and surface it; never commit red or reach for `--no-verify`.

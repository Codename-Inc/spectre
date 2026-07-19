---
name: "spectre-ship"
description: "👻 | Autonomous end-to-end delivery — brain dump → scope → TDD → sweep → rebase → PR, zero confirmation gates. Use when you want a reviewable PR produced hands-off from an informal description. Do NOT use when you want approval checkpoints (use the staged scope/plan/execute flow), or for non-code/non-git work."
user-invocable: true
---

# ship

Take a brain dump and autonomously produce a reviewable PR — scope, implement with TDD, sweep, rebase, and open the PR with no user approval gates.

## Inputs
- Brain dump from `$ARGUMENTS`. If empty, ask once for it, then proceed autonomously.
- Parse from it: `INTENT_TYPE` (`feat` = new behavior, `fix` = broken behavior), `TARGET_BRANCH` (default `origin/main`), `SCOPE_SUMMARY` (1–2 sentences), `RELEVANT_FILES`, `CONTEXT`.
- Current branch + tree state (read just-in-time via `git status`/`git rev-parse`, never assume).

## Working Set
- The code area named in `RELEVANT_FILES`/`SCOPE_SUMMARY` (locate via `@finder`, understand via `@analyst`).
- Project test/lint commands (detect from repo).
- `BRANCH_NAME` for artifact paths.

## Outputs + DONE
- `docs/tasks/{BRANCH_NAME}/concepts/scope.md` — lightweight (~20 lines): Objective · Type · In Scope · Out of Scope · Target Branch · Key Files.
- Conventional commits (one per task minimum), `{INTENT_TYPE}({scope}): {desc}`.
- A pushed branch + a PR (`gh pr create`) with title `{INTENT_TYPE}({scope}): {SCOPE_SUMMARY}` (<70 chars) and body sections: Summary · Changes · Test Plan · "Shipped autonomously via `spectre-ship`".

**DONE when:** all tasks completed via TDD, sweep done and committed, branch rebased onto `TARGET_BRANCH` with **lint + full test suite actually run and passing**, branch pushed, and the **PR URL output as the final deliverable**.

## Method / guardrails
Fully autonomous — no approval gates; parse intent, build it, ship the PR. Run in order:

1. **Worktree** — if on `main`/`master`, `EnterWorktree` to isolate; else use the current branch. Capture `BRANCH_NAME`.
2. **Quick scope** — fan out `@finder` + `@analyst` (read-only), write the ~20-line scope.md. This is a light scope, not full `spectre-scope`.
3. **Tasks** — `TaskCreate` 3–8 tasks proportional to scope, dependency-ordered (foundational first), each with imperative subject + acceptance criteria. Ephemeral — no file artifact.
4. **Execute (TDD)** — per task sequentially: `TaskUpdate`→in_progress; load `Skill(spectre-tdd)`; **RED (failing test first) → GREEN (minimal impl) → REFACTOR**; commit; `TaskUpdate`→completed. Skip TDD only for config/doc-only tasks. If new work surfaces, create a new task — do not scope-creep the current one.
5. **Sweep** (inline, no subagents) — run every check, then commit `chore({scope}): sweep cleanup` if it produced changes:
   - Diff sanity: no unintended/whitespace-only/merge-artifact edits; no out-of-scope staged files; **no secrets/keys/credentials**.
   - Logging: remove temp/debug logs; keep intentional error/warning/state logs; appropriate levels.
   - Hygiene: remove commented-out code; resolve/document TODO/FIXME/HACK added this session; remove hardcoded test values.
   - Dead code: orphaned imports, unused vars/functions, debug artifacts.
   - **Lint (strict): fix all violations — no skipping, no `eslint-disable`/`--no-verify`; refactor structural issues, never suppress.**
   - Test: run affected + full suite, fix failures. Do not write new tests here (done in step 4).
6. **Rebase** — `git fetch origin`; **YOU MUST create a backup ref first**: `git branch backup/ship-$(date +%Y%m%d-%H%M%S)` (the only rollback; never rebase without it). `git rebase {TARGET_BRANCH}`, auto-resolving conflicts favoring the target's conventions, tracking each decision for the PR. **Verify after**: lint (fix) + full test suite (fix) + confirm commit count and no unexpected changes.
7. **PR** — `git push -u origin {BRANCH_NAME}`, then `gh pr create`; output the PR URL. Ground the description in the actual change, not memory: **What** = behavioral summary from the diff (not a diff recitation); **Why** = from the brain dump / commits / linked issue (placeholder if none — never fabricated); **Test Plan** = what the diff's tests actually cover. Scale to size — trivial PRs get Summary + Why; larger/multi-area PRs add Changes, Test Plan, and a Feedback-Requested line directing the reviewer. Before opening, verify each claim maps to a real hunk and no secrets/PII are quoted into the body. (See `Skill(spectre-create_pr)` for the full grounding contract.)

## Handoff
Terminal skill — output is the PR URL. End with a one-line Next Steps pointer (e.g. review the PR / `spectre-code_review`).

## Escalate-If
- `ARGUMENTS` empty → ask once for the brain dump, then continue autonomously.
- Rebase conflicts are genuine semantic divergence (not resolvable by favoring the target) → stop, report, leave the rebase in progress with the backup-ref restore command.
- Tests still fail after rebase/sweep fixes → report the failure + restore command; do not force-push or open the PR.

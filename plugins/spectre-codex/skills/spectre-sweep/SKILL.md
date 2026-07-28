---
name: "spectre-sweep"
description: "Light pre-commit cleanup pass — diff sanity, log/dead-code hygiene on changed files, strict affected lint, run related/affected tests, then conventional-commit. Use when wrapping up uncommitted or just-finished work before check-in (\"sweep\", \"clean up and commit\", \"tidy this diff\"), standalone or as the final phase of spectre-clean. Do NOT use for forensic dead-code removal across the codebase (use spectre-prune), for authoring new tests (use spectre-test), or as a full validation gate — this is a fast hygiene+commit pass, not deep review."
user-invocable: true
---

# sweep

Prepare uncommitted or recently-changed work for check-in: a fast, formulaic hygiene pass, then descriptive conventional commits. No subagents, no approval gates — execute each step and move on.

## Inputs
- `$ARGUMENTS` (optional scope/intent hint, plus `--orchestrated` when a parent workflow owns the next step). Read the live working tree at runtime (`git status`, `git diff`) — do not assume a prior phase ran.

## Working Set
Changed files only. Opportunistic, not forensic — do not hunt beyond the diff.

## Outputs + DONE
One or more conventional commits covering the changes. DONE when:
- Diff reviewed: no unintended edits, no out-of-scope staged files, **no secrets/keys/credentials/PII**.
- Debug/temp logging removed; intentional logs (errors, key state transitions) kept at production-appropriate levels.
- Commented-out code, session-introduced TODO/FIXME/HACK, and hardcoded test values resolved or documented.
- Lint passes with **zero violations fixed by suppression** — refactor structural issues, never `eslint-disable` or equivalent. `.gitignore` covers temp/build/IDE artifacts.
- Related/affected verification has no branch-caused failure; unrelated findings are recorded/routed.
- Work committed as `type(scope): description` conventional commits, split by concern.

## Method / guardrails
1. **Diff sanity** — scan full diff for accidental edits, stray staged files, and secrets.
2. **Log + code hygiene** — strip debug logging, commented-out code, leftover TODO/FIXME from this work, hardcoded test values; keep intentional logs.
3. **Opportunistic dead code (changed files only)** — orphaned imports, unused vars/functions, debugger statements. No deep investigation.
4. **Strict lint** — fix all violations by correcting code; YOU MUST NOT suppress or `--no-verify`. Refactor for size/complexity thresholds.
5. **Test** — run tests related to changed files (co-located, importers, shared modules) plus affected lint/typecheck/build across demonstrated dependency boundaries. Never run a repository-wide baseline or full suite. A failure is repair or routing work, not a blocker: fix branch-caused failures and reverify; record/route unrelated failures and continue; reproduce only the failing check/test at the base SHA when attribution is indeterminate. Do NOT author new tests — this is a sweep, not a test pass.
6. **Commit** — group by concern into conventional commits.
   - Types: feat · fix · refactor · test · chore · docs · style · perf.
   - Subject answers what changed and why; include scope (`feat(auth): add token refresh on 401`). Optional body for motivation/trade-offs.
   - One concern per commit — if it spans concerns, split it. Treat commits as durable context for future readers/LLMs; never `fix: updates` / `refactor: clean up`.

## Handoff
- `--orchestrated` → return commit hashes and verification status to the caller without user-facing Next Steps.
- Standalone → emit one repo-state-grounded recommendation: `spectre-proof` if completed user-observable work still needs acceptance evidence; otherwise `spectre-rebase` when the branch is ready for merge preparation, or `spectre-create_pr` only when already current with the target.

## Escalate-If
- A secret/credential appears in the diff — stop, surface it, do not commit until resolved.
- No safe repair/routing action exists without suppression, changing product requirements, or unavailable user authority → return `NEEDS_AUTHORITY`; ordinary lint/test failures remain in repair flow.

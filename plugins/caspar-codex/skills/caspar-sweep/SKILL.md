---
name: "caspar-sweep"
description: "Light pre-commit cleanup pass — diff sanity, log/dead-code hygiene on changed files, strict lint, run related + broad tests, then conventional-commit. Use when wrapping up uncommitted or just-finished work before check-in (\"sweep\", \"clean up and commit\", \"tidy this diff\"), standalone or as the final phase of caspar-clean. Do NOT use for forensic dead-code removal across the codebase (use caspar-prune), for authoring new tests (use caspar-test), or as a full validation gate — this is a fast hygiene+commit pass, not deep review."
user-invocable: true
---

# sweep

Prepare uncommitted or recently-changed work for check-in: a fast, formulaic hygiene pass, then descriptive conventional commits. No subagents, no approval gates — execute each step and move on.

## Inputs
- `$ARGUMENTS` (optional scope/intent hint). Read the live working tree at runtime (`git status`, `git diff`) — do not assume a prior phase ran.

## Working Set
Changed files only. Opportunistic, not forensic — do not hunt beyond the diff.

## Outputs + DONE
One or more conventional commits covering the changes. DONE when:
- Diff reviewed: no unintended edits, no out-of-scope staged files, **no secrets/keys/credentials/PII**.
- Debug/temp logging removed; intentional logs (errors, key state transitions) kept at production-appropriate levels.
- Commented-out code, session-introduced TODO/FIXME/HACK, and hardcoded test values resolved or documented.
- Lint passes with **zero violations fixed by suppression** — refactor structural issues, never `eslint-disable` or equivalent. `.gitignore` covers temp/build/IDE artifacts.
- Related + broader test suite run and green; failures caused by these changes fixed.
- Work committed as `type(scope): description` conventional commits, split by concern.

## Method / guardrails
1. **Diff sanity** — scan full diff for accidental edits, stray staged files, and secrets.
2. **Log + code hygiene** — strip debug logging, commented-out code, leftover TODO/FIXME from this work, hardcoded test values; keep intentional logs.
3. **Opportunistic dead code (changed files only)** — orphaned imports, unused vars/functions, debugger statements. No deep investigation.
4. **Strict lint** — fix all violations by correcting code; YOU MUST NOT suppress or `--no-verify`. Refactor for size/complexity thresholds.
5. **Test** — run tests related to changed files (co-located, importers, shared modules) plus the broader suite; fix change-caused failures. Do NOT author new tests — this is a sweep, not a test pass.
6. **Commit** — group by concern into conventional commits.
   - Types: feat · fix · refactor · test · chore · docs · style · perf.
   - Subject answers what changed and why; include scope (`feat(auth): add token refresh on 401`). Optional body for motivation/trade-offs.
   - One concern per commit — if it spans concerns, split it. Treat commits as durable context for future readers/LLMs; never `fix: updates` / `refactor: clean up`.

## Handoff
Next Steps: one-line footer suggesting the natural follow-on (e.g. `caspar-rebase` to tidy history, or push/PR) grounded in the actual repo state.

## Escalate-If
- A secret/credential appears in the diff — stop, surface it, do not commit until resolved.
- Lint or a test failure can only be cleared by suppression or by changing behavior beyond this diff — stop and ask rather than `--no-verify`.

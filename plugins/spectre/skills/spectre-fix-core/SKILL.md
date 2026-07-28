---
name: "spectre-fix-core"
description: "Internal diagnose-and-repair engine for Spectre workflows. Use only when invoked by spectre-fix, spectre-deliver, or spectre-align-and-deliver with an explicit phase and authorization contract. Do NOT invoke directly for user requests."
user-invocable: false
---

# fix-core

## Purpose

Own one reusable bug flow: reproduce the failure, identify the root cause, and implement a verified RED-before-GREEN repair. Keep user approval in the standalone `spectre-fix` parent while allowing delivery parents to supply scope-bound authorization.

## Inputs

- Bug report: error, stack trace, reproduction, and referenced context.
- `PHASE=diagnose | repair | full`.
- `repair` requires the exact diagnosis plus `USER_APPROVED_DIAGNOSIS=true`.
- `full` requires `PARENT=spectre-deliver | spectre-align-and-deliver`, `PARENT_AUTHORIZATION={scope.md}`, `AUTHORIZED_SCOPE_SHA256`, and the matching `ALIGNMENT_MODE=inferred | confirmed`.
- `--orchestrated` — return to the parent without user-facing routing.

## Working Set

- Read affected paths and recent changes just-in-time.
- Use one `@spectre:analyst` per leading hypothesis; no scratch reports.
- In parent-authorized `full`, read the scope artifact before any code write.

## Outputs + DONE

- `diagnose` → `DIAGNOSIS_READY`: reproduction, root cause, affected files, proposed repair, and regression-test opportunity; no code writes.
- `repair | full` → `FIX_COMPLETE`: diagnosis plus confirmed RED evidence, implementation, GREEN checks, `[🪳 TEMP {TOPIC}]` diagnostic logging, changed files, and limitations.

**DONE when:** root cause is grounded, authorization is valid, the regression is RED→GREEN, affected checks have no attributable failure, unrelated findings are routed, and the parent receives the result.

## Method / guardrails

1. **Diagnose.** Generate 5–7 plausible sources, reduce to the 1–2 strongest from data flow, recent changes, error evidence, and affected paths, then dispatch parallel `@spectre:analyst` traces. Reproduce the failure and synthesize one cause-level repair.
2. **Honor phase.** `diagnose` returns `DIAGNOSIS_READY` before any code write.
3. **Verify authorization before repair.**
   - `repair` proceeds only when the parent supplies the exact diagnosis previously shown to the user plus `USER_APPROVED_DIAGNOSIS=true`.
   - `full` proceeds only when the named delivery parent supplies a readable scope artifact whose recomputed SHA-256 equals `AUTHORIZED_SCOPE_SHA256`, whose alignment mode matches the parent (`deliver=inferred`, `align-and-deliver=confirmed`), and the diagnosis plus repair remain inside it. Parent authorization replaces only the post-diagnosis approval pause.
4. **Repair test-first.** Write the regression test, confirm RED for the diagnosed reason, implement the smallest root-cause fix plus `[🪳 TEMP {TOPIC}]` logging, then reach GREEN and run affected deterministic checks.
5. **Attribute and continue.** Classify extra failures `branch-caused|unrelated|indeterminate`; repair branch-caused families, route unrelated findings, and use a focused target-state check when unclear. A red repository-wide baseline never blocks.
6. **Contain scope.** Do not broaden behavior, hide failures, weaken assertions, bypass checks, or treat an unrelated defect as authorized.

## Handoff

Return the phase status, diagnosis, authorization path/hash/mode, RED/GREEN evidence, changed files, checks, limitations, and exact validation steps. The parent owns all user-facing Next Steps.

## Escalate-If

- The report is too thin to form testable hypotheses, reproduction is unavailable, or no root cause can be grounded.
- Authorization is absent, stale, unreadable, hash/mode-mismatched, does not match the diagnosis, or the repair exceeds the authorized scope.
- The regression cannot establish the cause, evidence contradicts it, or further safe action needs authority. Never escalate for unrelated red checks, unavailable broad suites, attempt count, or authorized related-file growth.

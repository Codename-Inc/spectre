---
name: "spectre-fix"
description: "Investigate a reported bug, pin its root cause, and prepare an Execute handoff. Use for errors, stack traces, failing behavior, or repro steps. Do NOT use for greenfield work (plan/execute) or a complete repair report (execute)."
user-invocable: true
disable-model-invocation: true
---

# fix

Standalone diagnosis-to-Execute bug workflow. Delegate diagnosis to `spectre-fix-core`; never implement.

## Inputs
- **bug_report** (`$ARGUMENTS`): error/stack trace, repro steps, context. If empty, ask the user for error message, repro steps, and relevant context before proceeding.

## Working Set
- Resolve one managed `BUG_ROOT`: an explicitly named managed root wins; otherwise load and follow `Skill(spectre-feature-root)` with `KIND=bug` through DONE. Never adopt an ambient feature root. Keep writes beneath it and pass it unchanged.
- The bug report plus the exact in-thread diagnosis and experience contract returned by `spectre-fix-core`.
- Affected paths, history, analysts, tests, and diagnostics are owned by the core and read just-in-time.

## Outputs + DONE
The core's full diagnosis and experience contract rendered in-thread, mirrored in full into a self-locating managed repair plan at `{BUG_REPORT_PATH}` before code mutation, recording `Bug`, `Bug Root`, and the reported problem in the user's own words, plus an explicit Execute handoff. DONE when:
- Root cause and candidate repair boundary are grounded, not symptom-suppressed — name the cause and affected files.
- The transcript carries every contract row with its evidence; the plan beneath the managed bug root matches it. A file path is not a presentation.
- The current→expected experience, preserved invariants, and disclosed collateral changes are explicit; every row is resolved.
- The same response gives the exact bug-report path, explicit `fix` origin, and one copy-ready Execute invocation that works in a fresh session.
- Command display is non-mutating; invoking Execute is the mutation boundary.

## Method / guardrails
1. Run `Skill(spectre-fix-core)` with the bug report, `PHASE=diagnose`, and `--orchestrated`; require `DIAGNOSIS_READY` and reject symptom-only explanations.
2. Present the experience contract first in product language: what users do and observe now, what they will do and observe after repair, and which adjacent journeys change or remain unchanged. Then present the root cause, affected files, repair boundary, and verification plan; resolve every `unresolved` row. Mirror that render into `{BUG_ROOT}/bug-report.md`, using a scoped name if one already exists; capture the exact written path as `BUG_REPORT_PATH`; never alter canonical Scope or overwrite a reviewed plan.
3. In the same response, present one copy-ready host-specific `spectre-execute {BUG_REPORT_PATH} --origin fix`. Never repair from Fix; invoking Execute is the mutation boundary.
4. Feedback revises the report and refreshes the command; it does not enter an approval loop.

## Handoff
| Handoff | Details |
|---|---|
| 🧭 **Current phase** | Done |
| 📦 **What was just done** | Result |
| ▶️ **Proposed next step** | Render resolved action. |

Return diagnosis/contract + one Execute route; closeout commits report, never repair. Render Execute with resolved absolute bug-report path + `--origin fix`.

## Escalate-If
- Bug report is empty or too thin to form hypotheses → ask the user for error, repro, and context.
- Investigation contradicts every hypothesis (no root cause found) → report findings and ask for more repro detail rather than guessing a fix.
- Desired behavior is unclear, an `unresolved` row remains, or a collateral change exceeds the reported repair.

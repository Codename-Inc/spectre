---
name: "spectre-fix"
description: "Investigate a reported bug, pin the root cause, and implement a verified fix. Use when given an error, stack trace, failing behavior, or repro steps and asked to diagnose and fix it — the diagnose-then-fix loop. Do NOT use for greenfield feature work (use plan/execute) or for fixes already root-caused with an approved approach (go straight to execute)."
user-invocable: true
disable-model-invocation: true
---

# fix

Standalone approval-gated bug workflow. Delegate diagnosis and repair mechanics to `spectre-fix-core`, but preserve the user checkpoint between them.

## Inputs
- **bug_report** (`$ARGUMENTS`): error/stack trace, repro steps, context. If empty, ask the user for error message, repro steps, and relevant context before proceeding.

## Working Set
- The bug report and exact in-thread diagnosis returned by `spectre-fix-core`.
- Affected paths, history, analysts, tests, and diagnostics are owned by the core and read just-in-time.

## Outputs + DONE
A root-cause diagnosis and a verified fix. DONE when:
- Root cause is identified (not just the symptom suppressed) — name the cause, the affected files, and the fix approach.
- The fix was approved by the user before any code was written.
- The fix is implemented test-first (RED before GREEN — confirm the test fails for the right reason, then make it pass).
- Fix includes `[🪳 TEMP {TOPIC}]`-prefixed debug logging to confirm the fix and gather data if it fails.
- A closing summary lists what was delivered and the exact steps the user runs to validate.

## Method / guardrails
1. Run `Skill(spectre-fix-core)` with the bug report, `PHASE=diagnose`, and `--orchestrated`. Require `DIAGNOSIS_READY`; do not accept a symptom-only explanation.
2. Present the returned root cause, affected files, proposed repair, and regression-test opportunity. **YOU MUST hold for user approval here — do NOT write code until approved (HoldForApproval).**
3. After approval, run `Skill(spectre-fix-core)` with the exact diagnosis, `PHASE=repair`, `USER_APPROVED_DIAGNOSIS=true`, and `--orchestrated`. Require `FIX_COMPLETE`.
4. Never set parent authorization on the user's behalf or reinterpret an approval after the diagnosis changes.

## Handoff
Summarize what was delivered and the concrete validation steps. Recommend `/spectre:proof` for repaired user-observable behavior, `/spectre:test` only for a concrete remaining coverage gap, or `/spectre:clean` only when proof is explicitly deferred. Emit one primary route tied to the observed repair state.

## Escalate-If
- Bug report is empty or too thin to form hypotheses → ask the user for error, repro, and context.
- Investigation contradicts every hypothesis (no root cause found) → report findings and ask for more repro detail rather than guessing a fix.
- The diagnosis changes after approval → return to the approval gate with the revised cause and approach.

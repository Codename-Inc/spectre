---
name: "spectre-fix"
description: "Investigate a reported bug, pin the root cause, and implement a verified fix. Use when given an error, stack trace, failing behavior, or repro steps and asked to diagnose and fix it — the diagnose-then-fix loop. Do NOT use for greenfield feature work (use plan/execute) or for fixes already root-caused with an approved approach (go straight to execute)."
user-invocable: true
---

# fix

Diagnose a bug to its root cause, get approval on the fix approach, then implement it test-first. Treat the current command `$ARGUMENTS` as the bug report.

## Inputs
- **bug_report** (`$ARGUMENTS`): error/stack trace, repro steps, context. If empty, ask the user for error message, repro steps, and relevant context before proceeding.

## Working Set
- The affected code paths and recent changes around the reported symptom (read just-in-time; do not inline file lists here).
- `@analyst` for parallel hypothesis investigation.

## Outputs + DONE
A root-cause diagnosis and a verified fix. DONE when:
- Root cause is identified (not just the symptom suppressed) — name the cause, the affected files, and the fix approach.
- The fix was approved by the user before any code was written.
- The fix is implemented test-first (RED before GREEN — confirm the test fails for the right reason, then make it pass).
- Fix includes `[🪳 TEMP {TOPIC}]`-prefixed debug logging to confirm the fix and gather data if it fails.
- A closing summary lists what was delivered and the exact steps the user runs to validate.

## Method / guardrails
1. **Hypothesize.** Brainstorm 5–7 possible sources; distill to the 1–2 most likely root causes, weighing the component's primary data flow, recent changes, error patterns, stack traces, and affected paths.
2. **Investigate in parallel.** Dispatch one `@analyst` per top hypothesis; each traces its hypothesis through the codebase (relevant code, recent commits, similar patterns, edge cases) and returns a compressed (~1–2K) finding in-thread — no scratch files.
3. **Synthesize & gate.** Present the root cause, affected files, and proposed approach. **YOU MUST hold for user approval here — do NOT write code until approved (HoldForApproval).**
4. **Implement test-first.** Per `Skill(spectre-tdd)`: write the failing test, confirm RED, then implement the fix plus the `[🪳 TEMP {TOPIC}]` logging to GREEN. Address the root cause; do not paper over the symptom.

## Handoff
Summarize what you delivered and the concrete validation steps. Then render the inline Next Steps line pointing to the natural follow-on (e.g. `spectre-test` or `spectre-clean`).

## Escalate-If
- Bug report is empty or too thin to form hypotheses → ask the user for error, repro, and context.
- Investigation contradicts every hypothesis (no root cause found) → report findings and ask for more repro detail rather than guessing a fix.

---
name: "spectre-fix"
description: "Investigate a reported bug, pin the root cause, and implement a verified fix. Use when given an error, stack trace, failing behavior, or repro steps and asked to diagnose and fix it — the diagnose-then-fix loop. Do NOT use for greenfield feature work (use plan/execute) or for fixes already root-caused with an approved approach (go straight to execute)."
user-invocable: true
disable-model-invocation: true
---

# fix

Standalone approval-gated bug workflow. Delegate diagnosis and repair mechanics to `spectre-fix-core`, but preserve user approval of the observable experience between them.

## Inputs
- **bug_report** (`$ARGUMENTS`): error/stack trace, repro steps, context. If empty, ask the user for error message, repro steps, and relevant context before proceeding.

## Working Set
- The bug report plus the exact in-thread diagnosis and experience contract returned by `spectre-fix-core`.
- Affected paths, history, analysts, tests, and diagnostics are owned by the core and read just-in-time.

## Outputs + DONE
A user-approved observable experience contract and a verified fix. DONE when:
- Root cause and candidate repair boundary are grounded, not symptom-suppressed — name the cause and affected files.
- Before code, the user approves the current→expected product experience, preserved invariants, and disclosed collateral changes.
- The intended regression is confirmed RED before GREEN; risk-proportional invariant checks protect adjacent behavior.
- Fix includes `[🪳 TEMP {TOPIC}]`-prefixed debug logging to confirm the fix and gather data if it fails.
- The closing summary maps delivered behavior, side effects, and limitations to the approved contract and gives exact validation steps.

## Method / guardrails
1. Run `Skill(spectre-fix-core)` with the bug report, `PHASE=diagnose`, and `--orchestrated`; require `DIAGNOSIS_READY` and reject symptom-only explanations.
2. Present the experience contract first in product language: what users do and observe now, what they will do and observe after repair, and which adjacent journeys change or remain unchanged. Then present the root cause, affected files, repair boundary, and verification plan; resolve every `unresolved` row. **YOU MUST hold for user approval here — do NOT write code (HoldForApproval).**
3. After approval, run the core with the exact diagnosis and approved experience contract, `PHASE=repair`, `USER_APPROVED_FIX_CONTRACT=true`, and `--orchestrated`; require `FIX_COMPLETE`.
4. Never set parent authorization on the user's behalf. A changed diagnosis, repair boundary, or experience contract returns to diagnosis/approval.

## Handoff
Map actual behavior and evidence to every approved experience-contract row, then give concrete validation steps. Recommend `spectre-prove` for repaired user-observable behavior, `spectre-test` only for a concrete remaining coverage gap, or `spectre-clean` only when proof is explicitly deferred. Emit one primary route tied to the observed repair state.

## Escalate-If
- Bug report is empty or too thin to form hypotheses → ask the user for error, repro, and context.
- Investigation contradicts every hypothesis (no root cause found) → report findings and ask for more repro detail rather than guessing a fix.
- Desired behavior is unclear, an `unresolved` row remains, or a collateral change lacks approval.
- The diagnosis, repair boundary, or experience contract changes after approval → return to the approval gate.

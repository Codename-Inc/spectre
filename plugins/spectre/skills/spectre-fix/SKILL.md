---
name: "spectre-fix"
description: "Investigate a reported bug, pin the root cause, and prepare an approved Execute repair handoff. Use when given an error, stack trace, failing behavior, or repro steps and asked to diagnose a fix. Do NOT use for greenfield feature work (use plan/execute) or for fixes already root-caused with an approved approach (go straight to execute)."
user-invocable: true
disable-model-invocation: true
---

# fix

Standalone approval-gated bug workflow. Delegate diagnosis and repair mechanics to `spectre-fix-core`, but preserve user approval of the observable experience between them.

## Inputs
- **bug_report** (`$ARGUMENTS`): error/stack trace, repro steps, context. If empty, ask the user for error message, repro steps, and relevant context before proceeding.

## Working Set
- Resolve one managed `BUG_ROOT`: an explicitly named managed root wins; otherwise load and follow `@skill-spectre:spectre-feature-root` with `KIND=bug` through DONE. Never adopt an ambient feature root. Keep writes beneath it and pass it unchanged.
- The bug report plus the exact in-thread diagnosis and experience contract returned by `spectre-fix-core`.
- Affected paths, history, analysts, tests, and diagnostics are owned by the core and read just-in-time.

## Outputs + DONE
The core's full diagnosis and experience contract rendered in-thread, mirrored in full into a self-locating managed repair plan at `{BUG_REPORT_PATH}` before code mutation, recording `Bug`, `Bug Root`, and the reported problem in the user's own words, plus an explicit Execute handoff. DONE when:
- Root cause and candidate repair boundary are grounded, not symptom-suppressed — name the cause and affected files.
- The transcript carries every contract row with its evidence; the plan beneath the managed bug root matches it. A file path is not a presentation.
- Before code, the user approves the current→expected product experience, preserved invariants, and disclosed collateral changes.
- The completed handoff gives the exact approved bug-report path, explicit `fix` origin, and one copy-ready Execute invocation that works in a fresh session.
- Command display is non-mutating: it does not begin repair or transfer approval beyond the approved diagnosis/experience contract.

## Method / guardrails
1. Run `Skill(spectre-fix-core)` with the bug report, `PHASE=diagnose`, and `--orchestrated`; require `DIAGNOSIS_READY` and reject symptom-only explanations.
2. Present the experience contract first in product language: what users do and observe now, what they will do and observe after repair, and which adjacent journeys change or remain unchanged. Then present the root cause, affected files, repair boundary, and verification plan; resolve every `unresolved` row. Mirror that render into `{BUG_ROOT}/bug-report.md`, using a scoped name if one already exists; capture the exact written path as `BUG_REPORT_PATH`; never alter canonical Scope or overwrite a reviewed plan. **YOU MUST hold for user approval here — do NOT write code (HoldForApproval).**
3. After approval, keep `{BUG_REPORT_PATH}` immutable as the repair authority and present exactly one copy-ready Execute invocation with explicit `fix` provenance: the host-specific `spectre-execute {BUG_REPORT_PATH} --origin fix` command. Do not run `spectre-fix-core` repair from this user-facing parent.
4. A changed diagnosis, repair boundary, or experience contract returns to diagnosis/approval. Displaying the command never starts repair or grants execution approval.

## Handoff
| Handoff | Details |
| --- | --- |
| 🧭 **Current phase** | Repair approved. |
| 📦 **What was just done** | Diagnosis and experience contract. |
| ▶️ **Proposed next step** | `/spectre:execute {PLAN_FILE} --origin fix` — the approved repair route. |

Closeout commits the report.

## Escalate-If
- Bug report is empty or too thin to form hypotheses → ask the user for error, repro, and context.
- Investigation contradicts every hypothesis (no root cause found) → report findings and ask for more repro detail rather than guessing a fix.
- Desired behavior is unclear, an `unresolved` row remains, or a collateral change lacks approval.
- The diagnosis, repair boundary, or experience contract changes after approval → return to the approval gate.

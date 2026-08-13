---
name: "spectre-clean"
description: "Meta cleanup workflow: orchestrate prune, risk-based automated tests, and sweep/commit through focused subagents. Use after execute/validate or when asked to clean up a finished branch end-to-end. Do NOT trigger for dead-code-only cleanup (spectre-prune), test-only work (spectre-test), commit-only hygiene (spectre-sweep), bug fixes (spectre-fix), or scoping/planning."
user-invocable: true
---

# clean

End-to-end cleanup orchestrator. The primary agent owns scope, sequencing, test risk assessment, and final synthesis. Phase work runs in subagents using the existing focused skills: `spectre-prune`, `spectre-test`, and `spectre-sweep`.

## Inputs

- `$ARGUMENTS` — optional scope hint: commit/SHA, `unstaged`/`staged`, `context`/session, task dir, files, or `--orchestrated` when a parent workflow owns the next step.
- `FEATURE_ROOT` — explicit feature name/root or one descendant feature artifact.

## Working Set

- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `@skill-spectre:spectre-feature-root` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Set `OUT_DIR = FEATURE_ROOT`.
- Resolve the same full working set used by prune/test/sweep from committed changes, staged, unstaged, and untracked files. If a provided ref/scope is invalid or ambiguous, stop and ask.
- Write/update `{OUT_DIR}/working_set.json` with `"feature":"<feature-name>"` and `"feature_root":".spectre/features/<feature-name>"`, plus scope, files, and the primary's P0-P3 risk tiers before dispatching test work.

## Outputs + DONE

- `spectre-prune` cleanup completed by a subagent; manual-review items preserved.
- Primary-authored P0-P3 risk assessment and test plan recorded in `working_set.json`.
- `spectre-test` work completed by `@spectre:tester` test-lead subagents using the primary's risk plan.
- `spectre-sweep` completed by a subagent, including final hygiene, verification, and conventional commits.
- Final report: prune/manual review · risk tiers · tests/affected checks · routed findings · sweep commits · `NEEDS_AUTHORITY`, if any.
- **DONE when:** every phase ran in its owning subagent, the primary supplied risk tiers, repairable findings were repaired/routed by their owner, manual-review items surfaced, and sweep committed or returned genuine `NEEDS_AUTHORITY`.

## Method / guardrails

1. **Resolve scope once.** Establish files, task dir, and OUT_DIR. Keep dynamic details out of the prompt body; read them live.
2. **Prune phase.** Dispatch a prune-lead subagent instructed to load and execute `Skill(spectre-prune)` with `{FEATURE_ROOT} --orchestrated` for the resolved scope. It returns cleanup edits, summary path, validation status, and manual-review items.
3. **Primary risk assessment.** After prune returns, the primary classifies every changed file P0-P3:
   - **P0 Critical:** auth/payment/security/crypto/session/token, PII, permissions, user-data mutation, external API handlers, DB migrations, `@critical`.
   - **P1 Core:** feature components, API handlers, state/business logic, fetch/cache, user-visible error paths.
   - **P2 Supporting:** exported utilities, validators, transformers, adapters, hooks with real logic.
   - **P3 Skip:** docs, styles, config, types, constants/enums, re-export barrels, pass-through wrappers, generated files.
   Write a compact plan: `- [P{tier}] {file}: {behavior or SKIP reason}`.
4. **Test phase.** Dispatch `@spectre:tester` test-lead subagents in parallel. Each subagent loads `Skill(spectre-test)` with `{FEATURE_ROOT} --orchestrated`, consumes the primary risk plan for its batch, and does the test/verification work. P0 gets dedicated focus; P1/P2 may be grouped; P3 is skipped with reason.
5. **Sweep phase.** Dispatch a sweep-lead subagent instructed to load and execute `Skill(spectre-sweep)` with `--orchestrated` on the resulting diff. Sweep owns final hygiene, verification, and commits.
6. **Synthesize.** Route repairable findings to their owner; report final state, routed findings, and genuine authority/safety impasses.

Guardrails:
- Do not inline the bodies of prune/test/sweep; call the skills.
- Do not let the primary perform prune edits, test authoring, or sweep commits; repairable findings remain with the owning child, which continues without a user gate.
- `CONFIRMED_SAFE` cleanup may be applied; `UNCERTAIN`/`UNSAFE` cleanup stays untouched and appears in final manual review.
- `--no-verify`, lint/type suppressions, and forced green are forbidden unless the user explicitly permits them.

## Handoff

`NEEDS_AUTHORITY` reports its phase/impasse and manual-review list. Ordinary test/lint/build failures never produce it; repair or route them. Otherwise report commits.

- `--orchestrated` → return the result to the caller without user-facing Next Steps.
- Standalone → `Next (recommended): /spectre:rebase — clean completed and the committed branch is ready for safe merge preparation.` Add `/spectre:prove` only as a conditional alternative when acceptance evidence is still desired before shipping.

## Escalate-If

- Scope is ambiguous, a ref is invalid, or no meaningful working set exists.
- A phase skill conflicts with this orchestration contract; surface the conflict instead of improvising.
- P0 coverage exposes a product-requirement or user-authority conflict with no safe executable alternative; ordinary coverage gaps remain in repair/adaptation.
- Sweep finds secrets/PII or cannot commit without bypassing verification.

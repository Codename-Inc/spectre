---
name: "caspar-clean"
description: "Meta cleanup workflow: orchestrate prune, risk-based automated tests, and sweep/commit through focused subagents. Use after execute/validate or when asked to clean up a finished branch end-to-end. Do NOT trigger for dead-code-only cleanup (caspar-prune), test-only work (caspar-test), commit-only hygiene (caspar-sweep), bug fixes (caspar-fix), or scoping/planning."
user-invocable: true
---

# clean

End-to-end cleanup orchestrator. The primary agent owns scope, sequencing, test risk assessment, and final synthesis. Phase work runs in subagents using the existing focused skills: `caspar-prune`, `caspar-test`, and `caspar-sweep`.

## Inputs

- `$ARGUMENTS` — optional scope hint: commit/SHA, `unstaged`/`staged`, `context`/session, task dir, or files.
- `target_out_dir` — optional OUT_DIR override.

## Working Set

- Late-bind at runtime: `branch = git rev-parse --abbrev-ref HEAD`; `OUT_DIR = target_out_dir || docs/tasks/{branch}`.
- Resolve the same full working set used by prune/test/sweep from committed changes, staged, unstaged, and untracked files. If a provided ref/scope is invalid or ambiguous, stop and ask.
- Write/update `{OUT_DIR}/working_set.json` with scope, files, and the primary's P0-P3 risk tiers before dispatching test work.

## Outputs + DONE

- `caspar-prune` cleanup completed by a subagent; manual-review items preserved.
- Primary-authored P0-P3 risk assessment and test plan recorded in `working_set.json`.
- `caspar-test` work completed by `@tester` test-lead subagents using the primary's risk plan.
- `caspar-sweep` completed by a subagent, including final hygiene, verification, and conventional commits.
- Final report includes: prune summary path, manual-review items, risk-tier counts, tests added/verified, lint/test status, sweep commit list, and any blockers.
- **DONE when:** each phase skill actually ran in a subagent; primary did the test risk assessment itself; no phase rules were duplicated or hand-written in place of loading the focused skill; manual-review items are surfaced; sweep either committed cleanly or stopped on an explicit blocker.

## Method / guardrails

1. **Resolve scope once.** Establish files, task dir, and OUT_DIR. Keep dynamic details out of the prompt body; read them live.
2. **Prune phase.** Dispatch a prune-lead subagent instructed to load and execute `Skill(caspar-prune)` for the resolved scope. It returns cleanup edits, summary path, validation status, and manual-review items.
3. **Primary risk assessment.** After prune returns, the primary classifies every changed file P0-P3:
   - **P0 Critical:** auth/payment/security/crypto/session/token, PII, permissions, user-data mutation, external API handlers, DB migrations, `@critical`.
   - **P1 Core:** feature components, API handlers, state/business logic, fetch/cache, user-visible error paths.
   - **P2 Supporting:** exported utilities, validators, transformers, adapters, hooks with real logic.
   - **P3 Skip:** docs, styles, config, types, constants/enums, re-export barrels, pass-through wrappers, generated files.
   Write a compact plan: `- [P{tier}] {file}: {behavior or SKIP reason}`.
4. **Test phase.** Dispatch `@tester` test-lead subagents in parallel. Each subagent loads `Skill(caspar-test)`, consumes the primary risk plan for its batch, and does the test/verification work. P0 gets dedicated focus; P1/P2 may be grouped; P3 is skipped with reason.
5. **Sweep phase.** Dispatch a sweep-lead subagent instructed to load and execute `Skill(caspar-sweep)` on the resulting diff. Sweep owns final hygiene, verification, and commits.
6. **Synthesize.** Read phase returns and git state; report only the final state and blockers.

Guardrails:
- Do not inline the bodies of prune/test/sweep; call the skills.
- Do not let the primary perform prune edits, test authoring, or sweep commits except to recover from a surfaced blocker with user approval.
- `CONFIRMED_SAFE` cleanup may be applied; `UNCERTAIN`/`UNSAFE` cleanup stays untouched and appears in final manual review.
- `--no-verify`, lint/type suppressions, and forced green are forbidden unless the user explicitly permits them.

## Handoff

If sweep committed successfully, report commit hashes/messages and suggest `caspar-rebase` or push/PR. If blocked, report the exact phase and blocker, plus the manual-review list.

## Escalate-If

- Scope is ambiguous, a ref is invalid, or no meaningful working set exists.
- A phase skill conflicts with this orchestration contract; surface the conflict instead of improvising.
- P0 coverage cannot be made behavioral and mutation-resistant.
- Sweep finds secrets/PII or cannot commit without bypassing verification.

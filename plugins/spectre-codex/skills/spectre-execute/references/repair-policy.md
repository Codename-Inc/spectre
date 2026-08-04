# Execute repair policy

Load on the first verification failure, review finding, E2E gap, or proof failure; reuse thereafter.

## Verification continuation

- `branch-caused`: group by invariant/root cause, repair, then rerun the failing and affected checks.
- `unrelated`: record or route follow-up work and continue; it cannot block the wave or execution.
- `indeterminate`: run the smallest focused reproduction. Use the recorded base SHA only for that failing check when needed, then repair or route it.

Expand affected checks only across demonstrated dependency/consumer/integration/lifecycle boundaries. Persist compact coverage, keep raw output outside child prompts, and run no reviewer while attributable deterministic failures remain.

## Review findings

- Classify CRITICAL/HIGH as `defect` (completed requirement violated; related-file growth allowed), `scheduled` (pending source work owns it), `scope-change` (authority required), or `unrelated`.
- Each triggered intermediate or final review runs once. Group compatible defects into one consolidated root-cause repair pass; the primary handles bounded local work and uses `@spectre_dev` only for independent work or material context protection.
- Run affected verification, then record `repaired-verified|repaired-unverified|unresolved|scheduled|scope-change|unrelated`. The original review remains unchanged; a failed check creates check work, not another review pass.
- Never dispatch a reviewer solely to validate a repair. A later risk-triggered intermediate or final review may independently rediscover the issue and gets its own pass; there is no global lifetime cap across distinct scheduled reviews.

## Adaptation and proof

- Structured mode appends/updates only required `tasks.json` work and affected index rows. Plan-direct adds only demonstrated plan-backed derivative work and affected map rows; never rewrite the plan or add nice-to-haves.
- Final-review repair gets affected verification and dispositions; never rerun or replace the comprehensive review.
- Proof failure gets one behavior-repair pass, affected verification, then one fresh proof over failed/impact-linked row ids. Never code-review proof repair; disclose persistent failure.
- `NEEDS_AUTHORITY` only for conflicting acceptance, unavailable authority/capability, required scope change, or unsafe/unauthorized action.

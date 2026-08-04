# Execute repair policy

Load on the first verification failure, review finding, E2E gap, or proof failure; reuse for the rest of the run.

## Verification continuation

A failed check is repair or routing work, not a blocker by itself.

- `branch-caused`: group by invariant/root cause, repair, then rerun the failing and affected checks.
- `unrelated`: record or route follow-up work and continue; it cannot block the wave or execution.
- `indeterminate`: run the smallest focused reproduction. Use the recorded base SHA only for that failing check when needed, then repair or route it.

Expand affected verification across demonstrated dependency, consumer, integration, and lifecycle boundaries, never to a repository baseline/root suite. Persist only the compact coverage record; keep raw output outside child prompts. Do not invoke reviewers while attributable deterministic failures remain.

## Finding disposition

Before repair, classify each CRITICAL/HIGH phase or final-review finding:

- `defect`: a completed requirement is violated. Related-file or dependency growth for that requirement remains a defect.
- `scheduled`: explicit pending source work owns it; consumes no repair attempt.
- `scope-change`: repair changes requirements or authority. Pause only the authority-bound action while independent work continues.

Record evidence. A phase defect reopens the affected task/workstream and makes its prior phase review stale until repair, affected verification, and phase review pass.

## Invariant-family repair

- `finding_fingerprint = sha256(requirement anchor + primary symbol/boundary + normalized observable failure)`.
- `invariant_family = sha256(requirement anchor + normalized violated invariant + lifecycle/data-flow boundary)`.
- Track attempts by invariant family and manifestations by fingerprint. Distinct families have independent histories; there is no global repair/review cap.
- Attempt 1: one focused `@spectre:dev` repair.
- A second manifestation: primary-owned revalidation plus a RED regression at the invariant's actual level across the demonstrated transition chain, followed by a different diagnosis and route—implement directly or use a clean-context high-effort opposing runtime. Never replay the same prompt, agent, or approach.
- If the family survives attempt 2, promote it to source-backed Adapt work. Attempt count alone never stops execution. Growth over 25%, or test-file changes over half the implementation-file changes, may trigger Adapt sooner.

## Adaptation and proof

- Structured mode edits `tasks.json` directly: append required pending work, skip obsolete work, add learned context, and update only affected execute-index rows.
- Plan-direct mode adds/splits derivative work only for a demonstrated plan outcome, records the source relationship, and updates only affected map rows. Never rewrite the plan or add nice-to-haves.
- After final-review repair, run affected verification and one focused phase/boundary review; never rerun the comprehensive review.
- After proof failure, repair and reverify/review affected boundaries, then invoke a fresh final proof with artifact paths and failed/impact-linked row ids, not raw evidence or a candidate tuple.
- Return `NEEDS_AUTHORITY` only for conflicting acceptance, unavailable authority/capability, required scope change, or unsafe/unauthorized action—not ordinary failure or recurrence.

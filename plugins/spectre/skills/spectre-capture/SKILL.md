---
name: "spectre-capture"
description: "Capture or revise evidenced project knowledge as the primary agent after a user accepts a consequential decision, a non-obvious reusable constraint is verified, existing guidance is disproved, or an ongoing blocker is confirmed/resolved. Also write or refresh a work record when Execute, Ship, Create PR, or Learn invokes this skill. Do not use for speculative findings, routine progress, task completion alone, or worker-owned writes."
user-invocable: false
---

# capture

## Purpose

Maintain evidenced typed knowledge and work accounts without making capture an approval, acceptance, or PR gate.

## Inputs

- A primary-owned consequential event, accepted execution-batch findings, or an explicit workflow work-summary call.
- Project root; exact run, PR, or repository/base/head/diff association when work is involved; prior work ID when carried forward.
- Candidate evidence, authority, and any known record ID/revision.

## Working Set

- Bounded task/tag search results; exact verified candidate loads; current revision tokens.
- Explicit applicability context (`project` or exact work/run) and the current work lifecycle state.
- Worker findings and evidence references only. Workers never write records or tags.

## Outputs + DONE

- A saved, updated, superseded, retired, no-op, skipped, or surfaced-failure result with record ID/revision where applicable.
- Work summaries retain all seven sections: requested outcome/scope; actual changes/components; reasons/decisions; discoveries/approaches; verification/evidence; remaining work/unknowns; related knowledge/source context.

**DONE when:** the primary has either recorded supported durable facts through the typed preconditioned path, or truthfully returned a skip/no-op/failure; capture never changes Execute acceptance, verification authority, or PR progression.

## Method / guardrails

1. Capture only when: a user accepts a lasting decision; the primary verifies a reusable cause, constraint, or pattern; verified evidence contradicts maintained guidance; or an ongoing blocker is confirmed/resolved. An incidental code shape is not a general pattern; a transient failed command is not an ongoing blocker.
2. After an accepted execution batch, evaluate worker findings against those triggers. Otherwise skip speculative findings, duplicates, unsupported hypotheses, routine progress, and task completion alone; pending facts belong truthfully in a work account.
3. Resolve/carry the exact work ID, search related knowledge and tags, and assess applicability. For each needed ID, make one successful `knowledge-cli.mjs load <id> --json` body load per unchanged revision and context; reuse its `record` and `revisionToken` for assessment, no-op, proposal, registration, and result. A metadata-only revision check is allowed; reload only for a changed revision, conflict, or new context. If allowance blocks a needed body, request `--allowance-tokens` expansion; never read canonical files.
4. To revise, materialize that returned record as `<proposal-root>/<exact-id>/record.json` outside the knowledge store and register it with `--expected-revision`; never edit canonical packages, `index.json`, or history, and preserve failed proposals. Reconcile stale evidence by reloading and comparing it; surface contradictions with an explicit user decision. Already-authorized accepted facts need no new proposal or approval loop.
5. For work, carry the exact ID from a run, PR, or candidate—never branch or recency. Register exact `work.associations`, then re-resolve it; an operandless or unrelated-run miss never allocates work. Keep execution, verification, and PR state separate; `work.pullRequest.state: draft-open` never implies merged. Knowledge may retain source run references until the work account links them without rewriting it.
6. Report a recoverable conflict or an unrecoverable save failure with retained recovery input. Do not retry forever, claim success, block a draft PR, or turn zero knowledge into a failure.

## Handoff

Return compact primary-owned capture findings: trigger or skip reason, record/work ID, revision or conflict, applicability, lifecycle state, and evidence references. Worker handoffs contain findings only.

## Escalate-If

- Evidence conflicts with an explicit user decision, applicability cannot be determined, or exact work associations are ambiguous.
- A write cannot be recovered after the available repair path; report the failed operation and recovery input without blocking workflow acceptance or PR creation.

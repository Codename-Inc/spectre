# Plan-direct state contract

Use only for plan-direct creation, resume, or reconciliation.

## Paths and authority

- `PLAN_SOURCE` is the sole requirements authority. Never rewrite it or durably copy its prose.
- `EXECUTION_STATE = {FEATURE_ROOT}/execution_state.md`. It is compact local/gitignored resume state. If it records another plan, use `{plan-stem}-{short-sha256-of-plan-path}.execution_state.md`.
- Record a legacy plan's repo-relative path. State is derivative routing/evidence, never acceptance authority.

## Required document

Place `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>` below the title, then exactly these sections:

1. **Source Plan** — canonical path; full-byte SHA-256; byte length; capture HEAD; mode; baseline SHA; resolved scope docs; pointer-only objective, boundary, phase/workstream, and verification anchors; plus `The source plan is the sole requirements authority.`
2. **Runtime Status** — `pending|running|repairing|needs-authority|done`; current/last wave; timestamps; current HEAD; finalization owner; coarse-map source coverage. Cumulative diff is only `baseline..HEAD`.
3. **Workstream Map** — one coarse row per plan-native phase/workstream/item: stable id, source anchor, local status, dependencies/shared contracts/change surfaces, and readiness reason.
4. **Active Wave** — only currently dispatchable bounded assignments, owners, source anchors, outputs/consumers/replacements, and verification signals.
5. **Verification Ledger** — completed ids, commits/files, verified HEADs, stable check ids/results, review route (`intermediate:<trigger>|final-only`), repair dispositions, routed failures, and E2E status. No raw output or report prose.
6. **Plan-Backed Adaptations** — discovered gap, source-plan relationship, disposition, and affected future workstream.
7. **Final Quality State** — intermediate/final review reports and verdicts, final verification coverage, requirement-delivery coverage, proof runs/result, and unresolved findings.

Do not create a parallel JSON graph, enumerate all future subtasks, manufacture acceptance criteria, or persist active-wave plan excerpts. Stop decomposition once the next safe wave is dispatchable.

## Lifecycle

- Before first dispatch, create the complete coarse map and bounded Active Wave.
- Before every wave, reread state. After every dispatch, gate, review-routing decision, review, or adaptation, update it.
- Dev assignments contain transient verbatim plan text for only the active workstreams plus the exact Active Wave slice. Never persist that text in state.
- On resume, recompute plan SHA-256 and byte length. If unchanged, continue. If changed, treat the current plan as authoritative, refresh only affected derivative mappings, preserve Wave History, and record reconciliation.
- After a wave, replace Active Wave detail with compact ledger entries, clear it, and derive only the next safe assignments.
- DONE requires every initial mapped workstream and recorded adaptation `done|skipped`, with Runtime Status reporting complete source-plan coverage.

## Escalation valve

While building or updating the coarse map, if a hard-stop signal surfaces (destructive schema change, data migration, auth/PII, secrets, payments, public API change, concurrency/locking, caching consistency, cross-service change, SLO risk) or a bounded assignment cannot be derived without inventing a cross-workstream contract the plan does not state, pause dispatch, record the trigger under Plan-Backed Adaptations, and recommend routing the plan through `spectre-create_tasks` (structured re-plan) instead of pushing through. Resume only on explicit user/caller direction.

## Telemetry

Follow `references/telemetry.md` with `--source "$PLAN_SOURCE"`. Assign each coarse-map row a stable `ws-<n>` id at creation and use it as the task id for dispatches, `task start`/`submit`/`complete`, and gates. Workstream granularity only — never synthetic subtask events. Record `RUN_ID` in Runtime Status.

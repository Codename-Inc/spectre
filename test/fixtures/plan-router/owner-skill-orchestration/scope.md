# Commission an Existing Feature Owner

## Problem

An existing specialist agent needs a custom owner skill and a daily scheduled assignment so it can maintain one feature backlog under explicit human approval gates.

## Success Criteria

- The owner skill drives `Triage → Gate 1 → Build → Gate 2 → approved merge`.
- A small durable backlog and lifecycle record survive daily runs.
- The existing scheduler runs the owner skill once per day.
- Approval replies are attributable to the proposal they authorize.
- One real feature completes the workflow end to end.

## Scope Boundaries

### IN

- Author one owner skill for the existing agent.
- Configure one daily assignment using the existing scheduler.
- Keep the skill's backlog and lifecycle state beside its assignment.
- Exercise one real pilot through both approval gates.

### OUT

- Creating another agent or scheduler.
- Modifying prerequisite repositories or bundling their dependencies.
- UI, deployment, multi-owner coordination, or public portability.

### ANTI-SCOPE

- No inferred approvals, autonomous merges, or self-defined mandate.
- No generic coding-agent framework.

## Load-Bearing Assumptions

- The existing agent, scheduler, messaging path, and prerequisite repositories are available and may be treated as existing dependencies.
- One owner skill can call their established interfaces without changing those systems.
- Approval identity and lifecycle state can be represented in the assignment-owned files.

## Verification

- Validate the skill and assignment configuration locally.
- Run the real pilot and retain evidence for both approvals and the final merge authorization.

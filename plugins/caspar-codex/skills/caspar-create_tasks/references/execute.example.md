# Execute Index — Example Feature

## Document Manifest
Read these docs before execution:
- Scope: `docs/tasks/example/concepts/product-scope.md`
- UX: `docs/tasks/example/specs/user-flows.md`
- Prototype: `docs/tasks/example/prototypes/example-flow.html`
- Plan: `docs/tasks/example/specs/plan.md`
- Research: `docs/tasks/example/task_context.md`

## Task Detail Source
Do not read this file whole:
- Tasks JSON: `docs/tasks/example/specs/tasks.json`

Use targeted parsing only: status projections, selected parent-task slices, reviewer criteria/context slices, and status updates.

## Execution Summary
- Phases: 2
- Parent tasks: 2
- Subtasks: 3
- Waves: 2

## Wave Plan
- Wave 1: `{ id: "wave-1", label: "Define Contract", parent_task_ids: ["1.1"], after: [], rationale: "The detail contract must exist before consumers can reference it." }`
- Wave 2: `{ id: "wave-2", label: "Consumer Slice", parent_task_ids: ["2.1"], after: ["wave-1"], rationale: "Dispatch behavior depends on the fixture contract." }`

## Parent Task Index
- Phase 1 — Define Contract
  - `{ id: "1.1", title: "Example detail artifact", subtasks: ["1.1.1", "1.1.2"], predecessor: "none", unblocks: "2.1" }`
- Phase 2 — Consumer Slice
  - `{ id: "2.1", title: "Inline selected parent tasks into dispatch", subtasks: ["2.1.1"], predecessor: "1.1", unblocks: "terminal" }`

## Slicing Rules
Read this index to plan waves. For each owner, choose selected parent task ids from the Wave Plan and batching rules, then query only those parent tasks from `tasks.json` using `jq`, `node -e`, or direct targeted mechanics. Inline the selected parent-task slice under `<task_assignment>`.

Do not load the full task detail JSON into orchestration context. Do not require dispatch boundaries to match phase boundaries. Update mutable `status` fields in `tasks.json`, re-parse after every write, and update this index only if parent ids, parent titles, dependencies, or wave guidance change.

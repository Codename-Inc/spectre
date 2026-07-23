# Execute Index — Deterministic Project Knowledge Surfacing

## Document Manifest

Read these documents before execution:

- Scope: `docs/tasks/main/concepts/scope.md`
- Technical context and selected design: `docs/tasks/main/knowledge-surfacing/task_context.md`
- Implementation plan: `docs/tasks/main/knowledge-surfacing/specs/plan.md`
- Independent plan review: `docs/tasks/main/knowledge-surfacing/reviews/plan_review.md`

## Task Detail Source

Do not read this file whole:

- Tasks JSON: `docs/tasks/main/knowledge-surfacing/specs/tasks.json`

Use targeted parsing only: status projections, selected parent-task slices, reviewer criteria/context slices, and status updates.

## Execution Summary

- Phases: 7
- Parent tasks: 13
- Subtasks: 32
- Waves: 10

## Wave Plan

- Wave 0: `{ id: "wave-0", label: "Runtime feasibility", parent_task_ids: ["0.1"], after: [], rationale: "Host limits and the executable payload gate must be pinned before persistent-data implementation." }`
- Wave 1: `{ id: "wave-1", label: "Readable store foundation", parent_task_ids: ["1.1"], after: ["wave-0"], rationale: "Every later component needs canonical identity and atomic store transactions." }`
- Wave 2: `{ id: "wave-2", label: "Record and index contract", parent_task_ids: ["1.2"], after: ["wave-1"], rationale: "Migration, search, and matching all consume the validated canonical record/index contract." }`
- Wave 3: `{ id: "wave-3", label: "Independent core consumers", parent_task_ids: ["2.1", "3.1", "4.1"], after: ["wave-2"], rationale: "Migration classification, lexical CLI/search, and prompt matching can proceed independently once the store contract is stable." }`
- Wave 4: `{ id: "wave-4", label: "Registration and migration entry points", parent_task_ids: ["2.2"], after: ["wave-3"], rationale: "Registration depends on the migration engine and canonical validation." }`
- Wave 5: `{ id: "wave-5", label: "Workflow and hook cutover", parent_task_ids: ["3.2", "4.2"], after: ["wave-4"], rationale: "Learn/recall and hook adapters both need canonical commands; hook delivery also needs the completed matcher." }`
- Wave 6: `{ id: "wave-6", label: "Npm install integration", parent_task_ids: ["5.1"], after: ["wave-5"], rationale: "Installer/config cutover needs migration, CLI adapters, and final hook behavior." }`
- Wave 7: `{ id: "wave-7", label: "Diagnostics and preservation", parent_task_ids: ["5.2"], after: ["wave-6"], rationale: "Doctor and uninstall must inspect the final installer/runtime state." }`
- Wave 8: `{ id: "wave-8", label: "Generate and package", parent_task_ids: ["6.1"], after: ["wave-7"], rationale: "The generated Codex mirror and tarball must reflect all canonical runtime, skill, and installer changes." }`
- Wave 9: `{ id: "wave-9", label: "Acceptance evidence", parent_task_ids: ["6.2"], after: ["wave-8"], rationale: "Full automated and real-host acceptance runs only against the final generated and packed state." }`

## Parent Task Index

- Phase 0 — Runtime Feasibility
  - `{ id: "0.1", title: "Host and payload feasibility baseline", subtasks: ["0.1.1", "0.1.2"], predecessor: "none", unblocks: "1.1" }`
- Phase 1 — Canonical Store Foundation
  - `{ id: "1.1", title: "Project identity and store transactions", subtasks: ["1.1.1", "1.1.2"], predecessor: "0.1", unblocks: "1.2" }`
  - `{ id: "1.2", title: "Record, index, and payload contracts", subtasks: ["1.2.1", "1.2.2", "1.2.3"], predecessor: "1.1", unblocks: "2.1, 3.1, 4.1" }`
- Phase 2 — Lossless Migration
  - `{ id: "2.1", title: "Legacy migration engine", subtasks: ["2.1.1", "2.1.2"], predecessor: "1.2", unblocks: "2.2" }`
  - `{ id: "2.2", title: "Atomic registration and migration entry points", subtasks: ["2.2.1", "2.2.2"], predecessor: "2.1", unblocks: "3.2, 4.2, 5.1" }`
- Phase 3 — Search and Skill Workflows
  - `{ id: "3.1", title: "Knowledge CLI and lexical search", subtasks: ["3.1.1", "3.1.2", "3.1.3"], predecessor: "1.2", unblocks: "3.2, 5.1" }`
  - `{ id: "3.2", title: "Learn and recall workflow cutover", subtasks: ["3.2.1", "3.2.2"], predecessor: "2.2, 3.1", unblocks: "6.1" }`
- Phase 4 — Prompt-Time Delivery
  - `{ id: "4.1", title: "Matcher, framing, and session ledger", subtasks: ["4.1.1", "4.1.2", "4.1.3"], predecessor: "1.2", unblocks: "4.2" }`
  - `{ id: "4.2", title: "UserPromptSubmit and capability-only SessionStart", subtasks: ["4.2.1", "4.2.2", "4.2.3"], predecessor: "2.2, 4.1", unblocks: "5.1, 6.1" }`
- Phase 5 — Installer and Diagnostics
  - `{ id: "5.1", title: "Npm adapters, config, and install/update", subtasks: ["5.1.1", "5.1.2", "5.1.3"], predecessor: "2.2, 3.1, 4.2", unblocks: "5.2" }`
  - `{ id: "5.2", title: "Doctor and uninstall preservation", subtasks: ["5.2.1", "5.2.2"], predecessor: "5.1", unblocks: "6.1" }`
- Phase 6 — Generation and End-to-End Verification
  - `{ id: "6.1", title: "Codex generation and package integrity", subtasks: ["6.1.1", "6.1.2", "6.1.3"], predecessor: "3.2, 4.2, 5.2", unblocks: "6.2" }`
  - `{ id: "6.2", title: "Automated and real-host acceptance", subtasks: ["6.2.1", "6.2.2"], predecessor: "6.1", unblocks: "terminal" }`

## Slicing Rules

Read this index to choose waves and parent-task owners. Query only the selected parent task IDs from `tasks.json` with `jq`, `node -e`, or equivalent targeted parsing, then inline those task bodies under the execution assignment.

Do not load the full task detail JSON into orchestration context. Batches may span phases when the Wave Plan assigns independent parents together. Preserve the predecessor graph, especially the Phase 0 payload stop gate and the migration-before-cleanup ordering.

Update mutable `status` fields only in `tasks.json`, re-parse it after every write, and update this index only if parent IDs, titles, dependencies, counts, or wave guidance change.

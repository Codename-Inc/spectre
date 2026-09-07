---
name: spectre-handoff
description: Save a quiet, branch-keyed session snapshot with continuity, active work, and optional task/todo state for automatic resume. Use when ending or pausing a coding session; do not use for project documentation or workflow routing.
user-invocable: true
disable-model-invocation: true
---

# handoff

## Purpose

Persist the smallest complete state needed to resume the current branch. Finish in 2–3 tool calls and emit only the final confirmation.

## Inputs

- `$ARGUMENTS`: task name; default to the raw current branch.
- Current conversation/session memory: goal, completed and active work, decisions, constraints, blockers, risks, open questions, next steps, active files/IDs, recent verification commands, outer workflow routing, and any nonempty agent-native todo list.
- Late-bound repository state: raw branch, HEAD, worktree status, canonical/legacy handoff history, and optional healthy `bd` tasks labeled with the branch.

## Working Set

- `CANONICAL_DIR=.spectre/handoffs/{raw-branch}`; slash-containing branches intentionally create nested directories.
- `LEGACY_DIR=docs/tasks/{raw-branch}/session_logs` is read-only fallback history.
- Canonical `*_handoff.json` history wins. Use matching legacy history only when canonical history is empty; count that selected history so the first canonical handoff continues its numbering.
- New handoffs and todo snapshots write only under `CANONICAL_DIR`. Resolve timestamp, selected history directory, and output path once and pass them literally; never reconstruct branch identity from paths.

## Outputs + DONE

Write `{timestamp}_handoff.json` as valid JSON with this exact v1.1 shape:

```json
{
  "version": "1.1",
  "timestamp": "YYYY-MM-DD-HHMMSS",
  "branch_name": "raw branch",
  "task_name": "argument or raw branch",
  "session_number": 1,
  "progress_update": {
    "summary": "string",
    "goal": "string",
    "accomplished": [],
    "now": "string",
    "next_steps": [],
    "confidence": "high|medium|low",
    "constraints": [],
    "decisions": [],
    "blockers": [],
    "open_questions": [],
    "risks": []
  },
  "working_set": {
    "key_files": [],
    "active_ids": [],
    "recent_commands": []
  },
  "beads": {
    "available": true,
    "workspace_label": "raw branch",
    "task_count": 1,
    "epic_id": null,
    "epic_title": null,
    "tasks": [{"id":"", "title":"", "status":"", "type":"", "parent":null, "children":[], "labels":[]}]
  },
  "context": {
    "wip_state": "uncommitted|clean",
    "last_commit": "short SHA"
  }
}
```

Use “we” voice and empty arrays when optional content is absent. `now` identifies the exact interrupted work. Omit `beads` unless `bd doctor` succeeds and matching `open|in_progress|blocked` tasks exist. On continuations, `@spectre:sync` may add `continuity` while preserving current-session priority and schema.

When a nonempty agent-native todo list exists, also write its exact statuses to `{timestamp}_todos.json` and update `todos_history.json` to retain the five newest snapshots. Otherwise create neither file.

DONE when paths/numbering follow the selected-history rule; current `summary`, `now`, `accomplished`, `next_steps`, confidence, working set, and session number are preserved; optional `beads` is omitted when unavailable/empty; JSON reparses; and only the applicable canonical files changed.

## Method / guardrails

1. Gather repository/history/task state in one shell call: resolve raw branch (fallback `unknown`), short HEAD, worktree count, canonical and legacy counts, selected history, next session number, timestamp/output path, and healthy branch-labeled `bd` tasks. Create only `CANONICAL_DIR`.
2. Compose the current snapshot from session memory. Preserve the outer workflow’s already-selected `Next (recommended)` skill and observed reason verbatim as the first next step; include its canonical artifacts in `key_files`. Do not independently reroute or invent todo state.
3. If selected `session_count = 0`, write the handoff directly. Otherwise dispatch exactly one `@spectre:sync` with the full current JSON inside `<current_session>`, plus the literal selected history directory and canonical output file inside `<session_history_path>` and `<handoff_output_path>`. It reads at most the three newest prior handoffs and writes the final file.
4. Treat canonical artifacts as shared state; write no intermediate documents. Verify the final JSON and any todo-history retention before claiming success.

## Handoff

| Handoff | Details |
| --- | --- |
| 🧭 **Current phase** | Handoff saved. |
| 📦 **What was just done** | Session at `{path}`. |
| ▶️ **Proposed next step** | `/spectre:handoff {feature}` — next session auto-resumes. |

Output only the applicable table; do not narrate execution.

## Escalate-If

- The canonical file, continuation synthesis, JSON validation, or required todo writes fail: surface the concrete failure and do not claim the handoff was saved.

Next step: resume from the saved canonical handoff.

---
name: spectre-handoff
description: Save a branch-keyed state snapshot for session resume
user-invocable: true
disable-model-invocation: true
---

# handoff

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.


# handoff: Fast Session State Snapshot

Generate progress update, gather context, output structured JSON for session resume. Output: `{timestamp}_handoff.json` in `.spectre/handoffs/{branch}/`.

**Performance Target**: 2-3 tool calls depending on session history

**CRITICAL**: Do not narrate or explain what you're doing. No "Session count is 0, so..." or "Let me gather context...". Just execute the steps silently and output ONLY the final confirmation message. Every token matters at end of session.

## ARGUMENTS

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1: Gather Context (Single Bash Call)

- **Action** — GatherContext: Run ONE bash command:

```bash
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
canonical_dir=".spectre/handoffs/${branch}"
legacy_dir="docs/tasks/${branch}/session_logs"
mkdir -p "$canonical_dir"

# Canonical history wins. Matching legacy history is read only when canonical
# history is absent, allowing the first canonical handoff to continue numbering.
canonical_count=$(find "$canonical_dir" -maxdepth 1 -type f -name '*_handoff.json' 2>/dev/null | wc -l | xargs)
if [ "$canonical_count" -gt 0 ]; then
  history_dir="$canonical_dir"
  session_count="$canonical_count"
else
  history_dir="$legacy_dir"
  session_count=$(find "$legacy_dir" -maxdepth 1 -type f -name '*_handoff.json' 2>/dev/null | wc -l | xargs)
fi
session_number=$((session_count + 1))
ts="$(date +%Y-%m-%d-%H%M%S)"
output_path="${canonical_dir}/${ts}_handoff.json"

beads_available=false
beads_tasks='[]'
beads_count=0

if command -v bd &>/dev/null && bd doctor &>/dev/null; then
  beads_available=true
  open=$(bd list --label "$branch" --status open --json 2>/dev/null || echo '[]')
  in_prog=$(bd list --label "$branch" --status in_progress --json 2>/dev/null || echo '[]')
  blocked=$(bd list --label "$branch" --status blocked --json 2>/dev/null || echo '[]')
  beads_tasks=$(echo "$open $in_prog $blocked" | jq -s 'add // []')
  beads_count=$(echo "$beads_tasks" | jq 'length' 2>/dev/null || echo 0)
fi

cat << EOF
{
  "branch": "$branch",
  "commit": "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)",
  "wip_count": $(git status --porcelain 2>/dev/null | wc -l | xargs),
  "ts": "$ts",
  "session_count": $session_count,
  "session_number": $session_number,
  "history_path": "$history_dir",
  "output_path": "$output_path",
  "beads_available": $beads_available,
  "beads_count": $beads_count,
  "beads": $beads_tasks
}
EOF
```

**Output**: JSON with branch, commit, wip_count, ts, session_count, session_number, literal history/output paths, beads_available, beads_count, beads[]

## Step 2: Compose Handoff Data

- **Action** — ComposeProgressUpdate: From session memory, compose using "WE" voice:

  | Field | Required | Description |
  |-------|----------|-------------|
  | summary | ✓ | Slack-style paragraph a human would read |
  | goal | ✓ | What we're building + success criteria |
  | accomplished | ✓ | What we completed (2-5 bullets) |
  | now | ✓ | **What you were actively working on when session ended** (critical!) |
  | next_steps | ✓ | Upcoming work (2-4 bullets); first item preserves the outer workflow's already-selected next skill + reason |
  | confidence | ✓ | high / medium / low |
  | constraints | | Known constraints or assumptions |
  | decisions | | Key decisions made (0-3 bullets) |
  | blockers | | Things blocking progress |
  | open_questions | | Questions needing answers |
  | risks | | Identified risks |

  **Tone**: "We finished the auth refactor and got tests passing. Hit a snag with OAuth callback - next we'll tackle session management."

- **Action** — BuildWorkingSet: Capture active context:
  - `key_files`: Files actively edited
  - `active_ids`: Beads task IDs in progress
  - `recent_commands`: Recent terminal commands (test, build, etc.)

Do not independently re-route the workflow. When the current outer skill already emitted `Next (recommended)`, preserve that exact skill and its observed reason as the first `next_steps` item; include canonical artifact paths in `key_files`.

- **Action** — BuildBeadsTree (if available): From beads array, build hierarchy (epic → tasks → subtasks). Include task IDs for resume.

- **Action** — BuildTodoSnapshot (when available): If the current runtime exposes a nonempty agent-native todo list in the current conversation/tool state, serialize that current list with its statuses. After the handoff write, save the exact snapshot to `${canonical_dir}/${ts}_todos.json` and update `${canonical_dir}/todos_history.json`, retaining the five newest snapshots. These are canonical-only writes: never write or update todo files in `legacy_dir`. If no nonempty agent-native todo state is available, do not invent a snapshot and do not create either file.

## Step 3: Conditional Write

Check `session_count` from Step 1:

### If session_count = 0 (First Session)

**Do not narrate. Just write the file and output the confirmation.**

Write directly to the literal `output_path` from Step 1: `.spectre/handoffs/{branch}/{ts}_handoff.json`.

**JSON Schema**:
```json
{
  "version": "1.1",
  "timestamp": "{ts}",
  "branch_name": "{branch}",
  "task_name": "{ARGUMENTS or branch}",
  "session_number": {session_number},
  "progress_update": {
    "summary": "string",
    "goal": "string",
    "accomplished": ["string"],
    "now": "string (critical for resume)",
    "next_steps": ["string"],
    "confidence": "high|medium|low",
    "constraints": ["string"],
    "decisions": ["string"],
    "blockers": ["string"],
    "open_questions": ["string"],
    "risks": ["string"]
  },
  "working_set": {
    "key_files": ["path"],
    "active_ids": ["bd-xxxxx"],
    "recent_commands": ["command"]
  },
  "beads": {  // OMIT ENTIRE SECTION if beads_available=false OR beads_count=0
    "available": true,
    "workspace_label": "{branch}",
    "task_count": "number",
    "epic_id": "bd-xxxxx|null",
    "epic_title": "string|null",
    "tasks": [{"id", "title", "status", "type", "parent", "children", "labels"}]
  },
  "context": {
    "wip_state": "uncommitted|clean",
    "last_commit": "abc1234"
  }
}
```

Then respond: "✓ Handoff saved: {path}. First session recorded. Next session auto-resumes from this context."

### If session_count >= 1 (Continuation)

**Do not narrate. Just spawn the subagent and output the confirmation when done.**

Spawn `@spectre:sync` subagent with the composed data and the literal paths returned by Step 1:

```
<current_session>
{full JSON object you composed above}
</current_session>

<session_history_path>{history_path}</session_history_path>
<handoff_output_path>{output_path}</handoff_output_path>
```

The sync agent will:
1. Read up to 3 previous `*_handoff.json` files from the literal history path
2. Synthesize current context with historical arc
3. Write the final `{ts}_handoff.json` to the literal canonical output path
4. Return the file path

Then respond: "✓ Handoff saved: {path}. Session {n} recorded with continuity from {x} previous sessions. Next session auto-resumes from this context."

## Path and Numbering Contract

- New handoffs write only to `.spectre/handoffs/{branch}/`; the raw branch name is used directly, so slash-containing branches intentionally create nested directories.
- Canonical history wins. Matching legacy `docs/tasks/{branch}/session_logs/` handoffs are fallback read input only when there is no canonical history, and at most the three newest matching legacy handoffs are read.
- `session_count` and `session_number` use canonical history, or matching legacy history only when there is no canonical history. The first canonical handoff therefore continues legacy numbering.
- Pass the resolved history directory and canonical output file as literal paths to `@spectre:sync`. Neither skill nor agent reconstructs branch identity from those paths.
- New todo snapshots and todo history, when agent-native todo state is available, write only to `${canonical_dir}/${ts}_todos.json` and `${canonical_dir}/todos_history.json`; matching legacy todo files are compatibility inputs for forget only.

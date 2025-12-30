---
description: 👻 | Save state snapshot to session_logs - primary agent
---

# handoff: Fast Session State Snapshot

## Description
- **What** — Generate a Slack-style progress update, gather context, output structured JSON for session resume
- **Outcome** — `{timestamp}_handoff.json` in session_logs (JSON is source of truth)

## Performance Target
**2 tool calls total**: 1 Bash (gather context) + 1 Write (JSON)

## Variables

### Dynamic Variables
- `user_input`: Task name override — (via ARGUMENTS: $ARGUMENTS)

### Static Variables
- `out_dir`: docs/active_tasks/{branch_name}

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/2) - Gather Context (Single Bash Call)

- **Action** — GatherContext: Run ONE bash command to get everything:

```bash
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
mkdir -p "docs/active_tasks/${branch}/session_logs"

# Check if beads (bd) is available and has a database
beads_available=false
beads_tasks='[]'
beads_count=0

if command -v bd &>/dev/null; then
  # Check if bd doctor succeeds (database exists)
  if bd doctor &>/dev/null; then
    beads_available=true
    # Fetch only actionable tasks (skip closed to reduce tokens)
    open=$(bd list --label "$branch" --status open --json 2>/dev/null || echo '[]')
    in_prog=$(bd list --label "$branch" --status in_progress --json 2>/dev/null || echo '[]')
    blocked=$(bd list --label "$branch" --status blocked --json 2>/dev/null || echo '[]')
    beads_tasks=$(echo "$open $in_prog $blocked" | jq -s 'add // []')
    beads_count=$(echo "$beads_tasks" | jq 'length' 2>/dev/null || echo 0)
  fi
fi

cat << EOF
{
  "branch": "$branch",
  "commit": "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)",
  "wip_count": $(git status --porcelain 2>/dev/null | wc -l | xargs),
  "ts": "$(date +%Y-%m-%d-%H%M%S)",
  "beads_available": $beads_available,
  "beads_count": $beads_count,
  "beads": $beads_tasks
}
EOF
```

- **Output**: JSON with `branch`, `commit`, `wip_count`, `ts`, `beads_available`, `beads_count`, `beads` array
- **Beads scope**: Only actionable tasks (open, in_progress, blocked) — closed tasks excluded to reduce tokens
- **Side effect**: Creates `docs/active_tasks/{branch}/session_logs/` directory

### Task Sources

SPECTRE captures tasks from two sources:

| Source | How It Works | When Used |
|--------|--------------|-----------|
| **TodoWrite** | Captured automatically by hook when `/handoff` runs | Always (built into Claude Code) |
| **Beads** | Fetched by bash script above | Only if `bd` is installed and project uses Beads |

You don't need to do anything special—the hook captures TodoWrite todos automatically. Beads is a bonus if the project uses it.

## Step (2/2) - Compose Progress Update & Write JSON

- **Action** — ComposeProgressUpdate: From agent's session memory, compose update using "WE" voice:

  **Required fields:**
  - `summary`: Human-readable paragraph (Slack-style update a human would read)
  - `goal`: What we're building and success criteria for this work
  - `accomplished`: What we completed (2-5 bullets)
  - `now`: What you were actively working on when session ended (critical for resume!)
  - `next_steps`: What's coming up (2-4 bullets)
  - `confidence`: high/medium/low

  **Optional fields (include if relevant):**
  - `constraints`: Known constraints or assumptions we're working under
  - `decisions`: Key decisions we made (0-3 bullets)
  - `blockers`: Things blocking progress (0-3 bullets)
  - `open_questions`: Questions that need answers (different from blockers)
  - `risks`: Identified risks

  **Example tone**: "We finished the auth refactor and got tests passing. Hit a snag with the OAuth callback - tomorrow we'll tackle session management."

- **Action** — BuildWorkingSet: Capture the active context:
  - `key_files`: Files you were actively editing
  - `active_ids`: Beads task IDs in progress (if using Beads)
  - `recent_commands`: Commands you ran recently (test, build, etc.)

- **Action** — BuildBeadsTree (if beads_available): From `beads` array in Step 1 output:
  - Find epic (task with `type: "epic"` or no parent and has children)
  - Build hierarchy: epic → tasks → subtasks
  - All tasks in output are actionable (closed tasks were filtered out)
  - Include task IDs for resume commands

- **Action** — WriteJSON: Save to `docs/active_tasks/{branch}/session_logs/{ts}_handoff.json`

**JSON Schema:**
```json
{
  "version": "1.1",
  "timestamp": "{ts}",
  "branch_name": "{branch}",
  "task_name": "{ARGUMENTS or branch}",

  "progress_update": {
    "summary": "Human-readable paragraph for Slack-style updates",
    "goal": "What we're building + success criteria",
    "constraints": ["constraint1"],
    "decisions": ["decision1"],
    "accomplished": ["what we completed"],
    "now": "What I was actively working on when session ended",
    "next_steps": ["upcoming items"],
    "blockers": ["blocker1"],
    "open_questions": ["question needing answer"],
    "confidence": "high|medium|low",
    "risks": ["risk1"]
  },

  "working_set": {
    "key_files": ["path1", "path2"],
    "active_ids": ["bd-xxxxx"],
    "recent_commands": ["npm test", "npm run build"]
  },

  "beads": {
    "available": true,
    "workspace_label": "{branch}",
    "task_count": 5,
    "epic_id": "bd-xxxxx|null",
    "epic_title": "Epic title|null",
    "tasks": [
      {
        "id": "bd-xxxxx",
        "title": "Task title",
        "status": "open|in_progress|blocked",
        "type": "task|epic|bug|feature",
        "parent": "bd-xxxxx|null",
        "children": ["bd-xxxxx.1"],
        "labels": ["worktree", "type"],
        "completed": false
      }
    ]
  },

  "context": {
    "wip_state": "uncommitted|clean",
    "last_commit": "abc1234"
  }
}
```

**If Beads is not available**, the `beads` section should be:
```json
{
  "beads": {
    "available": false,
    "workspace_label": "{branch}",
    "task_count": 0,
    "epic_id": null,
    "epic_title": null,
    "tasks": []
  }
}
```

- **Action** — RespondToUser:

  If beads available with tasks:
  ```
  ✓ Handoff saved: docs/active_tasks/{branch}/session_logs/{ts}_handoff.json
    Beads: {task_count} tasks tracked for workspace "{branch}"

  Start a new session or run /clear. Next session will auto-resume from this context.
  ```

  If beads not available or no tasks:
  ```
  ✓ Handoff saved: docs/active_tasks/{branch}/session_logs/{ts}_handoff.json

  Start a new session or run /clear. Next session will auto-resume from this context.
  ```

## Success Criteria

**Performance**:
- [ ] **1 Bash call**: Context gathered + beads checked + directory created
- [ ] **1 Write call**: JSON saved

**Task Capture**:
- [ ] TodoWrite todos captured automatically by hook (no action needed)
- [ ] Beads checked for availability (`command -v bd` + `bd doctor`)
- [ ] If beads available: tasks fetched with `bd list --status {open,in_progress,blocked}`
- [ ] If beads not available: `beads.available` set to `false`, tasks array empty

**Progress Update Quality**:
- [ ] `summary` written in collaborative "we" voice (human-readable)
- [ ] `goal` captures what we're building and success criteria
- [ ] `accomplished` lists what we completed
- [ ] `now` captures what was actively being worked on (critical!)
- [ ] `next_steps` lists upcoming work
- [ ] `confidence` level assessed (high/medium/low)
- [ ] Optional fields included where relevant (constraints, decisions, blockers, open_questions, risks)

**Working Set**:
- [ ] `key_files` lists actively edited files
- [ ] `active_ids` lists in-progress Beads task IDs (if using Beads)
- [ ] `recent_commands` lists recent terminal commands

**JSON Output**:
- [ ] Output directory created if missing
- [ ] JSON file saved with all required fields
- [ ] Schema version is "1.1"
- [ ] Timestamp format consistent (`YYYY-MM-DD-HHMMSS`)

**Response**:
- [ ] User notified with exact file path
- [ ] Beads task count reported (only if available and has tasks)
- [ ] Next steps clear (session will auto-resume)

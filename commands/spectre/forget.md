---
description: 👻 | Clear session memory - archive all session files so next session starts fresh
---

# forget: Clear Session Memory

## Description
- **What** — Archive all session files (handoffs, todos, history) so the SessionStart hook doesn't auto-resume
- **Outcome** — All session files moved to archive, user informed to start fresh session

## Step (1/2) - Archive Session Logs

- **Action** — ArchiveLogs: Move session logs to archive directory

```bash
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
session_dir="docs/active_tasks/${branch}/session_logs"
archive_dir="${session_dir}/archive"

# Check if session logs exist
if [ ! -d "$session_dir" ] || [ -z "$(ls -A ${session_dir}/*.json 2>/dev/null)" ]; then
    echo "NO_SESSIONS"
    exit 0
fi

# Create archive and move all session files
mkdir -p "$archive_dir"
mv ${session_dir}/*_handoff.json "$archive_dir/" 2>/dev/null || true
mv ${session_dir}/*_todos.json "$archive_dir/" 2>/dev/null || true
mv ${session_dir}/todos_history.json "$archive_dir/" 2>/dev/null || true

# Count archived
archived_count=$(ls -1 ${archive_dir}/*_handoff.json 2>/dev/null | wc -l | xargs)
echo "ARCHIVED:${archived_count}"
```

## Step (2/2) - Confirm to User

- **Action** — ConfirmCleared: Based on bash output, inform user

  **If** output is `NO_SESSIONS`:
  > No session logs found for this branch. Memory is already clear.

  **Else** (output is `ARCHIVED:N`):
  > ✓ Session memory cleared
  >
  > Archived {N} handoff file(s) to `docs/active_tasks/{branch}/session_logs/archive/`
  >
  > **Next**: Start a new session with `/clear` or close this terminal. Your next session will start fresh without auto-loaded context.

## Success Criteria

- [ ] Session logs directory checked for existence
- [ ] All `*_handoff.json` files moved to `archive/` subdirectory
- [ ] All `*_todos.json` files moved to `archive/` subdirectory
- [ ] `todos_history.json` moved to `archive/` subdirectory
- [ ] User informed of result (no sessions found OR count archived)
- [ ] Clear instructions provided for starting fresh session

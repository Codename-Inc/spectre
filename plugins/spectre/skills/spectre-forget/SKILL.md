---
name: spectre-forget
description: Clear session memory - archive all session files so next session starts fresh
user-invocable: true
---

# forget

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.


# forget: Clear Session Memory

## Description
- **What** — Archive all session files (handoffs, todos, history) so the SessionStart hook doesn't auto-resume
- **Outcome** — All session files moved to archive, user informed to start fresh session

## Step (1/2) - Archive Session Logs

- **Action** — ArchiveLogs: Move active session files for the current branch into each root's archive directory

```bash
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
canonical_dir=".spectre/handoffs/${branch}"
legacy_dir="docs/tasks/${branch}/session_logs"
archived_count=0

for session_dir in "$canonical_dir" "$legacy_dir"; do
  [ -d "$session_dir" ] || continue
  archive_dir="${session_dir}/archive"

  while IFS= read -r -d '' session_file; do
    mkdir -p "$archive_dir"
    mv "$session_file" "$archive_dir/"
    archived_count=$((archived_count + 1))
  done < <(
    find "$session_dir" -maxdepth 1 -type f \
      \( -name '*_handoff.json' -o -name '*_todos.json' -o -name 'todos_history.json' \) \
      -print0
  )
done

if [ "$archived_count" -eq 0 ]; then
  echo "NO_SESSIONS"
  exit 0
fi

echo "ARCHIVED:${archived_count}"
```

Archive only the current branch's active, top-level files in `.spectre/handoffs/{branch}/` and the matching legacy `docs/tasks/{branch}/session_logs/`. Do not scan another branch, descend into an existing `archive/`, merge the roots, or restore an archived file. The raw branch name is used directly; slash-containing branches intentionally nest.

## Step (2/2) - Confirm to User

- **Action** — ConfirmCleared: Based on bash output, inform user

  **If** output is `NO_SESSIONS`:
  > No session logs found for this branch. Memory is already clear.

  **Else** (output is `ARCHIVED:N`):
  > ✓ Session memory cleared
  >
  > Archived {N} session file(s) under the matching `.spectre/handoffs/{branch}/archive/` and legacy `docs/tasks/{branch}/session_logs/archive/` directories.
  >
  > **Next**: Start a new session with `/clear` or close this terminal. Your next session will start fresh without auto-loaded context.

## Success Criteria

- [ ] Canonical and matching legacy session directories checked for the current branch only
- [ ] All active `*_handoff.json` files in both roots moved to their own `archive/` subdirectory
- [ ] All active `*_todos.json` files in both roots moved to their own `archive/` subdirectory
- [ ] Active `todos_history.json` files in both roots moved to their own `archive/` subdirectory
- [ ] Existing archives remain excluded and cannot be resurrected by legacy fallback
- [ ] User informed of result (no sessions found OR count archived)
- [ ] Clear instructions provided for starting fresh session

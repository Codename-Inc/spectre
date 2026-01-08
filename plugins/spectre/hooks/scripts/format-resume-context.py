#!/usr/bin/env python3
"""
format-resume-context.py

Converts handoff JSON to markdown context for SessionStart hook injection.
Outputs JSON with hookSpecificOutput.additionalContext containing:
1. A brief user-visible notice
2. Full context in hidden <session-context> tag

Usage: python3 format-resume-context.py /path/to/handoff.json
"""

import json
import sys
import os
from datetime import datetime


def build_checkbox_tree(tasks: list) -> str:
    """Build a markdown checkbox tree from task list."""
    if not tasks:
        return "No tasks found."

    # Group tasks by parent
    by_parent = {}
    for task in tasks:
        parent = task.get("parent")
        if parent not in by_parent:
            by_parent[parent] = []
        by_parent[parent].append(task)

    def render_task(task: dict, indent: int = 0) -> list:
        """Recursively render a task and its children."""
        lines = []
        prefix = "  " * indent
        checkbox = "[x]" if task.get("completed") else "[ ]"
        status = task.get("status", "open")
        title = task.get("title", "Untitled")
        task_id = task.get("id", "unknown")

        if task.get("completed"):
            line = f"{prefix}- {checkbox} {title} ({task_id}) - COMPLETED"
        else:
            cmd = task.get("resume_command", f"bd update {task_id} --status in_progress")
            status_badge = f"[{status}]" if status != "open" else ""
            line = f"{prefix}- {checkbox} {title} ({task_id}) {status_badge} - `{cmd}`"

        lines.append(line)

        # Render children
        children_ids = task.get("children", [])
        if children_ids:
            # Find child tasks
            for child_task in tasks:
                if child_task.get("id") in children_ids or child_task.get("parent") == task_id:
                    lines.extend(render_task(child_task, indent + 1))

        return lines

    # Start with root tasks (no parent or parent is null)
    root_tasks = by_parent.get(None, []) + by_parent.get("null", [])

    # If no root tasks found, just list all tasks flat
    if not root_tasks:
        root_tasks = tasks

    lines = []
    rendered_ids = set()

    for task in root_tasks:
        if task.get("id") not in rendered_ids:
            task_lines = render_task(task)
            lines.extend(task_lines)
            rendered_ids.add(task.get("id"))
            # Mark children as rendered
            for t in tasks:
                if t.get("parent") == task.get("id"):
                    rendered_ids.add(t.get("id"))

    return "\n".join(lines)


def format_list(items: list, prefix: str = "- ") -> str:
    """Format a list of items as markdown bullets."""
    if not items:
        return f"{prefix}None"
    return "\n".join(f"{prefix}{item}" for item in items)


def main():
    if len(sys.argv) < 2:
        # No file provided, exit silently
        sys.exit(0)

    json_path = sys.argv[1]

    if not os.path.exists(json_path):
        sys.exit(0)

    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        sys.exit(0)

    # Extract fields with defaults
    timestamp = data.get("timestamp", "unknown")
    task_name = data.get("task_name", "unknown")
    branch_name = data.get("branch_name", "unknown")

    progress = data.get("progress_update", {})
    summary = progress.get("summary", "No summary available.")
    accomplished = progress.get("accomplished", [])
    decisions = progress.get("decisions", [])
    blockers = progress.get("blockers", [])
    next_steps = progress.get("next_steps", [])
    confidence = progress.get("confidence", "unknown")
    risks = progress.get("risks", [])

    beads = data.get("beads", {})
    epic_id = beads.get("epic_id", "unknown")
    epic_title = beads.get("epic_title", "Workspace Epic")
    tasks = beads.get("tasks", [])

    context = data.get("context", {})
    last_commit = context.get("last_commit", "unknown")
    wip_state = context.get("wip_state", "unknown")
    current_file = context.get("current_file", "unknown")

    # Build checkbox tree
    checkbox_tree = build_checkbox_tree(tasks)

    # Get just the filename for the notice
    json_filename = os.path.basename(json_path)

    # User-visible notice (shown via systemMessage)
    visible_notice = f"📋 Resuming: {task_name} | Branch: {branch_name} → Ready to get started! Ask to continue where we left off, for a status update, or anything else"

    # Hidden context for Claude (via additionalContext)
    hidden_context = f"""<session-context>
# Session Context: {task_name}

## Last Session Summary
{summary}

### What We Accomplished
{format_list(accomplished)}

### What's Next
{format_list(next_steps)}

### Blockers
{format_list(blockers) if blockers else "- None"}

### Decisions Made
{format_list(decisions) if decisions else "- None"}

**Confidence**: {confidence} | **Risks**: {format_list(risks, '') if risks else 'None identified'}

---

## Beads Task Status

### Epic: {epic_title} ({epic_id})

{checkbox_tree}

---

## Resume Commands
- View ready tasks: `bd ready --label {branch_name}`
- View all tasks: `bd list --label {branch_name}`
- Start a task: `bd update <task_id> --status in_progress`

## Context
- **Branch**: {branch_name}
- **Last Commit**: {last_commit}
- **WIP State**: {wip_state}
- **Last Active File**: {current_file}
</session-context>"""

    # Working format: hookEventName + additionalContext, plus systemMessage for user
    full_context = visible_notice + "\n\n" + hidden_context
    output = {
        "systemMessage": visible_notice,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": hidden_context
        }
    }
    print(json.dumps(output))
    sys.exit(0)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
handoff-resume.py

SessionStart hook that injects context from the last /spectre:handoff.
Consolidates the previous session-resume-hook.sh + format-resume-context.py.

Outputs JSON for Claude Code hook system:
- systemMessage: User-visible notice
- hookSpecificOutput.additionalContext: Full session context in <session-context> tags

Usage: Called automatically by SessionStart hook, or manually:
    python3 handoff-resume.py
"""

import json
import os
import select
import shutil
import subprocess
import sys
from pathlib import Path

# Timeout for reading stdin (seconds)
STDIN_TIMEOUT = 2


def read_stdin_with_timeout(timeout: float = STDIN_TIMEOUT) -> str | None:
    """Read stdin with a timeout to avoid blocking indefinitely."""
    if select.select([sys.stdin], [], [], timeout)[0]:
        return sys.stdin.read()
    return None


def write_todos_to_new_session(session_id: str, todos: dict) -> bool:
    """Write previous todos to the new session's todo file.

    This populates Claude Code's TodoWrite system with the previous session's
    non-completed todos, allowing seamless continuation.

    Args:
        session_id: The new session's ID from SessionStart hook input
        todos: The previous session's todos dict from *_todos.json

    Returns:
        True if todos were written, False otherwise
    """
    if not session_id or not todos:
        return False

    todos_dir = Path.home() / ".claude" / "todos"
    todos_dir.mkdir(parents=True, exist_ok=True)

    # Convert our todos format to Claude Code's TodoWrite format
    # TodoWrite expects: [{"content": "...", "status": "...", "activeForm": "..."}]
    todo_items = []

    for todo in todos.get("primary", []):
        # Only carry forward non-completed todos
        if todo.get("status") != "completed":
            todo_items.append({
                "content": todo.get("content", ""),
                "status": todo.get("status", "pending"),
                "activeForm": todo.get("activeForm", todo.get("content", ""))
            })

    if not todo_items:
        return False

    # Write to {session_id}-agent-{session_id}.json (primary agent pattern)
    filename = f"{session_id}-agent-{session_id}.json"
    filepath = todos_dir / filename

    with open(filepath, "w") as f:
        json.dump(todo_items, f, indent=2)

    return True


def copy_plugin_references():
    """Copy plugin reference files to .claude/spectre/ for command access.

    Workaround for ${CLAUDE_PLUGIN_ROOT} not expanding in command markdown files.
    See: https://github.com/anthropics/claude-code/issues/9354

    Also appends .claude/spectre/ to .gitignore if it exists and .claude/ not already ignored.
    """
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if not plugin_root:
        return

    references_src = Path(plugin_root) / "references"
    if not references_src.exists():
        return

    references_dst = Path(".claude/spectre")
    references_dst.mkdir(parents=True, exist_ok=True)

    for ref_file in references_src.glob("*.md"):
        dst_file = references_dst / ref_file.name
        if not dst_file.exists():  # Don't overwrite (like cp -n)
            shutil.copy2(ref_file, dst_file)

    # Append to .gitignore if it exists and .claude/ not already ignored
    gitignore = Path(".gitignore")
    if gitignore.exists():
        content = gitignore.read_text()
        if ".claude/" not in content and ".claude/spectre/" not in content:
            with open(gitignore, "a") as f:
                f.write("\n# SPECTRE plugin files\n.claude/spectre/\n")


def get_git_branch() -> str:
    """Get current git branch name."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return "unknown"


def find_latest_handoff(session_dir: Path) -> Path | None:
    """Find the most recently modified handoff JSON in session_logs (not archive)."""
    if not session_dir.exists():
        return None

    # Only look at top-level files, not in archive/
    handoff_files = list(session_dir.glob("*_handoff.json"))

    if not handoff_files:
        return None

    # Sort by modification time, newest first
    handoff_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return handoff_files[0]


def find_latest_todos(session_dir: Path) -> dict | None:
    """Find the most recently modified todos JSON in session_logs."""
    if not session_dir.exists():
        return None

    todos_files = list(session_dir.glob("*_todos.json"))
    if not todos_files:
        return None

    todos_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)

    try:
        with open(todos_files[0]) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def load_todos_history(session_dir: Path) -> dict | None:
    """Load accumulated todos history."""
    history_file = session_dir / "todos_history.json"
    if history_file.exists():
        try:
            with open(history_file) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return None


def format_todos_section(todos: dict) -> str:
    """Format captured todos for session context."""
    if not todos:
        return ""

    primary = todos.get("primary", [])
    subagents = todos.get("subagents", [])

    if not primary and not subagents:
        return ""

    lines = ["## Previous Session Todos"]

    summary = todos.get("summary", {})
    if summary:
        lines.append(
            f"**Summary**: {summary.get('completed', 0)} completed, "
            f"{summary.get('in_progress', 0)} in progress, "
            f"{summary.get('pending', 0)} pending"
        )

    if primary:
        lines.append("\n### Main Tasks")
        for todo in primary:
            status = todo.get("status", "pending")
            if status == "completed":
                icon = "x"
            elif status == "in_progress":
                icon = ">"
            else:
                icon = " "
            lines.append(f"- [{icon}] {todo.get('content', 'Unknown')}")

    for subagent in subagents:
        if subagent.get("todos"):
            lines.append(f"\n### Subagent {subagent.get('agent_id', 'unknown')}")
            for todo in subagent["todos"]:
                status = todo.get("status", "pending")
                if status == "completed":
                    icon = "x"
                elif status == "in_progress":
                    icon = ">"
                else:
                    icon = " "
                lines.append(f"- [{icon}] {todo.get('content', 'Unknown')}")

    return "\n".join(lines)


def format_history_summary(history: dict) -> str:
    """Format a brief history summary."""
    if not history or not history.get("sessions"):
        return ""

    aggregate = history.get("aggregate", {})
    sessions = len(history.get("sessions", []))

    return (
        f"\n**Todo History**: {aggregate.get('total_completed', 0)} tasks completed "
        f"across {sessions} recent session(s)"
    )


def format_list(items: list, prefix: str = "- ") -> str:
    """Format a list of items as markdown bullets."""
    if not items:
        return f"{prefix}None"
    return "\n".join(f"{prefix}{item}" for item in items)


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
            for t in tasks:
                if t.get("parent") == task.get("id"):
                    rendered_ids.add(t.get("id"))

    return "\n".join(lines)


def format_context(
    data: dict,
    todos: dict | None = None,
    history: dict | None = None
) -> dict:
    """Format handoff data into hook output structure."""
    # Extract fields with defaults
    task_name = data.get("task_name", "unknown")
    branch_name = data.get("branch_name", "unknown")

    # Progress update fields (v1.1 schema)
    progress = data.get("progress_update", {})
    summary = progress.get("summary", "No summary available.")
    goal = progress.get("goal", "")
    constraints = progress.get("constraints", [])
    decisions = progress.get("decisions", [])
    accomplished = progress.get("accomplished", [])
    now = progress.get("now", "")
    next_steps = progress.get("next_steps", [])
    blockers = progress.get("blockers", [])
    open_questions = progress.get("open_questions", [])
    confidence = progress.get("confidence", "unknown")
    risks = progress.get("risks", [])

    # Working set (v1.1 schema) - fall back to context.key_files for v1.0
    working_set = data.get("working_set", {})
    key_files = working_set.get("key_files", [])
    active_ids = working_set.get("active_ids", [])
    recent_commands = working_set.get("recent_commands", [])

    # Fall back to old context structure if working_set not present
    if not key_files:
        context = data.get("context", {})
        key_files = context.get("key_files", [])

    # Beads tasks
    beads = data.get("beads", {})
    beads_available = beads.get("available", True)  # Default true for v1.0 compat
    tasks = beads.get("tasks", [])

    # Context
    context = data.get("context", {})
    last_commit = context.get("last_commit", "unknown")
    wip_state = context.get("wip_state", "unknown")

    # Build checkbox tree for beads tasks
    checkbox_tree = build_checkbox_tree(tasks) if beads_available and tasks else ""

    # Format todos section if available
    todos_section = format_todos_section(todos) if todos else ""
    history_summary = format_history_summary(history) if history else ""

    # User-visible notice
    visible_notice = (
        f"Resuming: {task_name} | Branch: {branch_name} | "
        f"Ready to continue where we left off"
    )

    # Build the hidden context sections
    sections = []

    sections.append(f"# Session Context: {task_name}")

    # Todos section (if available)
    if todos_section:
        sections.append(todos_section)
        if history_summary:
            sections.append(history_summary)

    # Last session summary
    sections.append(f"\n## Last Session Summary\n{summary}")

    # Goal (if available - v1.1)
    if goal:
        sections.append(f"\n### Goal\n{goal}")

    # Constraints (if available - v1.1)
    if constraints:
        sections.append(f"\n### Constraints\n{format_list(constraints)}")

    # What we accomplished
    sections.append(f"\n### What We Accomplished\n{format_list(accomplished)}")

    # What we were working on (critical for resume - v1.1)
    if now:
        sections.append(f"\n### Active Work (Resume Here)\n**{now}**")

    # What's next
    sections.append(f"\n### What's Next\n{format_list(next_steps)}")

    # Blockers
    if blockers:
        sections.append(f"\n### Blockers\n{format_list(blockers)}")

    # Open questions (v1.1)
    if open_questions:
        sections.append(f"\n### Open Questions\n{format_list(open_questions)}")

    # Decisions
    if decisions:
        sections.append(f"\n### Decisions Made\n{format_list(decisions)}")

    # Confidence and risks
    risks_str = format_list(risks, '') if risks else 'None identified'
    sections.append(f"\n**Confidence**: {confidence} | **Risks**: {risks_str}")

    # Working set (v1.1)
    working_set_lines = []
    if key_files:
        working_set_lines.append(f"- **Key Files**: {', '.join(key_files)}")
    if active_ids:
        working_set_lines.append(f"- **Active IDs**: {', '.join(active_ids)}")
    if recent_commands:
        working_set_lines.append(f"- **Recent Commands**: {', '.join(recent_commands)}")

    if working_set_lines:
        sections.append("\n### Working Set\n" + "\n".join(working_set_lines))

    # Context
    sections.append(f"""
---

## Context
- **Branch**: {branch_name}
- **Last Commit**: {last_commit}
- **WIP State**: {wip_state}""")

    # Beads tasks (if available)
    if beads_available and checkbox_tree:
        sections.append(f"\n### Beads Tasks\n{checkbox_tree}")

    hidden_context = f"<session-context>\n{''.join(sections)}\n</session-context>"

    # Check if there are non-completed todos to restore
    restore_instruction = ""
    if todos:
        non_completed = [
            t for t in todos.get("primary", [])
            if t.get("status") != "completed"
        ]
        if non_completed:
            restore_instruction = (
                "\n\n**IMPORTANT**: Previous session had active todos. "
                "Use TodoWrite immediately to restore them so they appear in the UI. "
                f"There are {len(non_completed)} non-completed todos to restore."
            )

    return {
        "systemMessage": visible_notice,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": hidden_context + restore_instruction
        }
    }


def merge_todos_into_handoff(handoff_path: Path, todos: dict, history: dict | None):
    """Merge todos into handoff.json for observability. Runs in background."""
    try:
        with open(handoff_path, 'r') as f:
            data = json.load(f)

        # Add todos section
        data["todos"] = {
            "session_id": todos.get("session_id", "unknown"),
            "captured_at": todos.get("captured_at", "unknown"),
            "summary": todos.get("summary", {}),
            "primary": todos.get("primary", []),
            "subagents": todos.get("subagents", [])
        }

        # Add history summary if available
        if history:
            data["todos"]["history"] = {
                "total_sessions": history.get("aggregate", {}).get("total_sessions", 0),
                "total_completed": history.get("aggregate", {}).get("total_completed", 0)
            }

        # Write back
        with open(handoff_path, 'w') as f:
            json.dump(data, f, indent=2)

    except (json.JSONDecodeError, IOError):
        pass  # Silently fail


def main():
    """Main entry point for SessionStart hook."""
    # Read stdin FIRST to get new session_id (must happen before any forking)
    stdin_data = read_stdin_with_timeout()

    new_session_id = None
    if stdin_data:
        try:
            hook_input = json.loads(stdin_data)
            new_session_id = hook_input.get("session_id")
        except json.JSONDecodeError:
            pass

    # Fork to copy plugin references in background (non-blocking)
    pid = os.fork()
    if pid == 0:
        try:
            copy_plugin_references()
        except Exception:
            pass
        os._exit(0)

    # Get project directory from environment or cwd
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))

    # Get branch name
    branch_name = get_git_branch()

    # Find session logs directory
    session_dir = project_dir / "docs" / "active_tasks" / branch_name / "session_logs"

    # Find latest handoff
    latest_handoff = find_latest_handoff(session_dir)

    if not latest_handoff:
        # No session to resume - exit silently
        sys.exit(0)

    # Read and parse handoff JSON
    try:
        with open(latest_handoff, 'r') as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        # Malformed or unreadable - exit silently
        sys.exit(0)

    # Find latest todos and history (may be None)
    todos = find_latest_todos(session_dir)
    history = load_todos_history(session_dir)

    # CRITICAL: Write previous todos to new session's todo file SYNCHRONOUSLY
    # This must complete before output so Claude Code's TodoWrite picks them up
    if new_session_id and todos:
        try:
            write_todos_to_new_session(new_session_id, todos)
        except Exception:
            pass  # Don't fail the hook if todo restoration fails

    # Format and output context
    output = format_context(data, todos=todos, history=history)
    print(json.dumps(output))
    sys.stdout.flush()

    # Fork background process to merge todos into handoff.json for observability
    if todos:
        pid = os.fork()
        if pid == 0:
            # Child process - merge todos into handoff
            try:
                merge_todos_into_handoff(latest_handoff, todos, history)
            except Exception:
                pass
            os._exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()

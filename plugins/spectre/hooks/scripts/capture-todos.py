#!/usr/bin/env python3
"""
capture-todos.py

UserPromptSubmit hook that captures todos when /spectre:handoff is triggered.
Writes todos DIRECTLY to session_logs/ alongside handoff.json files.

This hook:
1. Listens for "handoff" in the user's prompt
2. Uses the session_id from hook input to find Claude Code's todo files
3. Writes {timestamp}_todos.json to docs/tasks/{branch}/session_logs/
4. Maintains todos_history.json with last 5 sessions

Output: JSON with {"decision": "allow"} to let the command proceed
"""
import json
import os
import select
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Timeout for reading stdin (seconds)
STDIN_TIMEOUT = 2


def read_stdin_with_timeout(timeout: float = STDIN_TIMEOUT) -> str | None:
    """Read stdin with a timeout to avoid blocking indefinitely."""
    # Check if stdin has data available
    if select.select([sys.stdin], [], [], timeout)[0]:
        return sys.stdin.read()
    return None


def get_git_branch() -> str:
    """Get current git branch name."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return "unknown"


def update_todos_history(session_dir: Path, todos: dict):
    """Append to history, keeping only last 5 sessions."""
    history_file = session_dir / "todos_history.json"

    history = {"sessions": []}
    if history_file.exists():
        try:
            with open(history_file) as f:
                history = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

    # Add new session
    history["sessions"].append(todos)

    # Keep only last 5
    history["sessions"] = history["sessions"][-5:]

    # Update aggregate stats
    total_completed = sum(
        s.get("summary", {}).get("completed", 0)
        for s in history["sessions"]
    )
    history["aggregate"] = {
        "total_sessions": len(history["sessions"]),
        "total_completed": total_completed
    }

    with open(history_file, "w") as f:
        json.dump(history, f, indent=2)


def capture_todos(session_id: str, cwd: str):
    """Capture todos for the given session - runs after response is sent."""
    todos_dir = Path.home() / ".claude" / "todos"

    if not todos_dir.exists():
        return

    todo_files = list(todos_dir.glob(f"{session_id}-agent-*.json"))

    all_todos = {
        "session_id": session_id,
        "captured_at": datetime.now().isoformat(),
        "primary": [],
        "subagents": [],
        "summary": {"completed": 0, "in_progress": 0, "pending": 0}
    }

    for todo_file in todo_files:
        try:
            with open(todo_file) as f:
                todos = json.load(f)
                if not todos or todos == []:
                    continue

                # Count statuses
                for todo in todos:
                    status = todo.get("status", "pending")
                    if status == "completed":
                        all_todos["summary"]["completed"] += 1
                    elif status == "in_progress":
                        all_todos["summary"]["in_progress"] += 1
                    else:
                        all_todos["summary"]["pending"] += 1

                # Extract agent ID from filename: {session}-agent-{agent}.json
                agent_id = ""
                if "-agent-" in todo_file.stem:
                    agent_id = todo_file.stem.split("-agent-")[1]

                if agent_id == session_id:
                    all_todos["primary"] = todos
                else:
                    all_todos["subagents"].append({
                        "agent_id": agent_id[:8],
                        "todos": todos
                    })
        except (json.JSONDecodeError, IOError):
            continue

    # Only write if we found todos
    if all_todos["primary"] or all_todos["subagents"]:
        branch = get_git_branch()
        session_dir = Path(cwd) / "docs" / "tasks" / branch / "session_logs"
        session_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        todos_file = session_dir / f"{timestamp}_todos.json"

        with open(todos_file, "w") as f:
            json.dump(all_todos, f, indent=2)

        update_todos_history(session_dir, all_todos)


def main():
    """Main entry point for UserPromptSubmit hook."""
    # Read stdin with timeout
    stdin_data = read_stdin_with_timeout()

    # Parse input first to check if we need to do anything
    if not stdin_data:
        sys.exit(0)  # Allow by default

    try:
        hook_input = json.loads(stdin_data)
    except json.JSONDecodeError:
        sys.exit(0)  # Allow by default

    prompt = hook_input.get("prompt", "").strip().lower()
    session_id = hook_input.get("session_id", "")
    cwd = hook_input.get("cwd", os.getcwd())

    # Only capture todos on handoff command
    if "handoff" not in prompt or not session_id:
        sys.exit(0)  # Allow by default

    # Fork a background process to do the work, then exit immediately
    pid = os.fork()
    if pid == 0:
        # Child process - do the work
        try:
            capture_todos(session_id, cwd)
        except Exception:
            pass  # Silently fail in background
        os._exit(0)
    else:
        # Parent process - exit immediately to unblock Claude Code
        sys.exit(0)


if __name__ == "__main__":
    main()

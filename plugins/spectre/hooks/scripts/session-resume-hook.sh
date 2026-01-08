#!/bin/bash
# session-resume-hook.sh
#
# SessionStart hook - inject last handoff context into new conversations

set -e

# Debug logging to file (check /tmp/claude-session-hook.log)
LOG="/tmp/claude-session-hook.log"
echo "=== $(date) ===" >> "$LOG"

# Get the project directory from environment or current directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
echo "PROJECT_DIR: $PROJECT_DIR" >> "$LOG"

# Get branch name for workspace identification
branch_name=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
echo "branch_name: $branch_name" >> "$LOG"

# Check for session_logs directory
session_dir="${PROJECT_DIR}/docs/active_tasks/${branch_name}/session_logs"
echo "session_dir: $session_dir" >> "$LOG"

if [ ! -d "$session_dir" ]; then
    echo "SKIP: session_dir does not exist" >> "$LOG"
    exit 0
fi

# Find the latest handoff JSON file
latest_json=$(ls -t "${session_dir}"/*_handoff.json 2>/dev/null | head -1)
echo "latest_json: $latest_json" >> "$LOG"

if [ -z "$latest_json" ]; then
    echo "SKIP: no handoff JSON found" >> "$LOG"
    exit 0
fi

if [ ! -r "$latest_json" ]; then
    echo "SKIP: JSON not readable" >> "$LOG"
    exit 0
fi

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Convert JSON to context using the Python formatter
echo "Running formatter..." >> "$LOG"
output=$(python3 "${SCRIPT_DIR}/format-resume-context.py" "$latest_json")
echo "Output length: ${#output}" >> "$LOG"

# Log full output to separate file for debugging
echo "=== $(date) ===" > /tmp/claude-session-hook-output.json
echo "$output" >> /tmp/claude-session-hook-output.json
echo "Full output logged to /tmp/claude-session-hook-output.json" >> "$LOG"
echo "SUCCESS" >> "$LOG"

# Output the formatted context
echo "$output"

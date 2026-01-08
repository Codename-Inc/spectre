"""
Main build loop logic.

Contains the core loop that invokes Claude iteratively, processing one
parent task per iteration until BUILD_COMPLETE or max iterations reached.
"""

import json
import re
import subprocess
import sys

from .prompt import build_prompt
from .stats import BuildStats
from .stream import process_stream_event


# Tools allowed to run without permission prompts
# Safety relies on: (1) directory scoping (Claude can only cd to children),
# (2) explicit tool allowlist, (3) git for rollback, (4) human oversight via streaming
ALLOWED_TOOLS = [
    "Bash",      # Run tests, lint, git commands
    "Read",      # Read files
    "Write",     # Create new files
    "Edit",      # Modify existing files
    "Glob",      # Find files by pattern
    "Grep",      # Search file contents
    "LS",        # List directories
    "TodoRead",  # Read task list
    "TodoWrite", # Update task list
]

# Tools explicitly denied - these would block the loop or are unsafe for automation
DENIED_TOOLS = [
    "AskUserQuestion",  # Would block waiting for user input
    "WebFetch",         # Network access - could hang or be slow
    "WebSearch",        # Network access
    "Task",             # Spawns subagents - unpredictable timing
    "Skill",            # Invokes skills - could have side effects
    "EnterPlanMode",    # Changes execution mode
    "NotebookEdit",     # Not needed for typical builds
]


def run_claude_iteration(
    prompt: str,
    timeout: int | None = None,
    stats: BuildStats | None = None,
) -> tuple[int, str, str]:
    """
    Execute Claude with the given prompt and stream formatted output.

    Uses subprocess.Popen to invoke `claude -p` with stream-json output,
    parsing events to display formatted tool calls and assistant messages
    while buffering text for promise detection.

    Args:
        prompt: The full prompt to send to Claude
        timeout: Optional timeout in seconds for the subprocess
        stats: Optional BuildStats to track token usage and tool calls

    Returns:
        Tuple of (exit_code, full_text_output, error_output)

    Raises:
        FileNotFoundError: If claude CLI is not installed
        subprocess.TimeoutExpired: If timeout is exceeded
    """
    # Build command for safe automated execution with structured output
    # - allowedTools: auto-approve these without prompting
    # - disallowedTools: block these entirely (prevents loop blocking)
    cmd = [
        "claude", "-p",
        "--allowedTools", ",".join(ALLOWED_TOOLS),
        "--disallowedTools", ",".join(DENIED_TOOLS),
        "--output-format", "stream-json",
        "--verbose",
    ]

    # Start subprocess with pipes for all streams
    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    # Pass prompt via stdin and close to signal end of input
    process.stdin.write(prompt)
    process.stdin.close()

    # Buffer for assistant text (needed for promise detection)
    text_buffer: list[str] = []

    # Process stream-json events line by line
    for line in process.stdout:
        line = line.strip()
        if not line:
            continue

        try:
            event = json.loads(line)
            process_stream_event(event, text_buffer, stats)
        except json.JSONDecodeError:
            # Not valid JSON, might be raw output - print it
            print(line)
            text_buffer.append(line)

    # Wait for process to complete (with optional timeout)
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
        raise

    # Capture stderr for error reporting
    error_output = process.stderr.read()

    # Combine buffered text for promise detection
    full_output = "\n".join(text_buffer)

    return process.returncode, full_output, error_output


def detect_promise(output: str) -> str | None:
    """
    Extract promise tag from Claude's output.

    Searches for [[PROMISE:...]] pattern and returns the promise text
    if found. Promise text is stripped of whitespace.

    Args:
        output: Full output from Claude subprocess

    Returns:
        Promise text ("TASK_COMPLETE" or "BUILD_COMPLETE") if found, None otherwise
    """
    match = re.search(r"\[\[PROMISE:(.*?)\]\]", output, re.DOTALL)
    if match:
        return match.group(1).strip()
    return None


def run_build_loop(
    tasks_file: str,
    context_files: list[str],
    max_iterations: int,
) -> tuple[int, int]:
    """
    Run the main build loop.

    Invokes Claude iteratively, processing one parent task per iteration
    until BUILD_COMPLETE or max iterations reached.

    Args:
        tasks_file: Absolute path to the tasks file
        context_files: List of absolute paths to additional context files
        max_iterations: Maximum number of iterations

    Returns:
        Tuple of (exit_code, iterations_completed)
        - exit_code: 0 for success, non-zero for failure
        - iterations_completed: Number of successfully completed iterations
    """
    # Display configuration
    print("\n--- Spectre Build Configuration ---")
    print(f"Tasks file: {tasks_file}")
    print(f"Context files: {context_files if context_files else 'None'}")
    print(f"Max iterations: {max_iterations}")
    print("-----------------------------------\n")

    # Initialize stats tracking
    stats = BuildStats()

    # Main build loop
    iteration = 0
    while iteration < max_iterations:
        iteration += 1

        # Print iteration header with promise reference
        print(f"\n{'='*60}")
        print(f"🔄 Iteration {iteration}/{max_iterations}")
        print(f"   Complete task: [[PROMISE:TASK_COMPLETE]]")
        print(f"   All done: [[PROMISE:BUILD_COMPLETE]]")
        print(f"{'='*60}\n")

        # Build fresh prompt each iteration
        prompt = build_prompt(tasks_file, context_files)

        # Invoke Claude subprocess with constructed prompt
        try:
            exit_code, output, stderr = run_claude_iteration(prompt, stats=stats)
        except FileNotFoundError:
            print(f"\n{'='*60}", file=sys.stderr)
            print("❌ ERROR: Claude CLI not found", file=sys.stderr)
            print(f"   Iteration: {iteration}/{max_iterations}", file=sys.stderr)
            print("", file=sys.stderr)
            print("The 'claude' command is not installed or not in PATH.", file=sys.stderr)
            print("Install Claude Code CLI: https://claude.ai/code", file=sys.stderr)
            print(f"{'='*60}", file=sys.stderr)
            stats.print_summary()
            return 127, stats.iterations_completed  # Command not found
        except subprocess.TimeoutExpired:
            print(f"\n{'='*60}", file=sys.stderr)
            print("❌ ERROR: Claude execution timed out", file=sys.stderr)
            print(f"   Iteration: {iteration}/{max_iterations}", file=sys.stderr)
            print("", file=sys.stderr)
            print("The Claude subprocess exceeded the allowed time.", file=sys.stderr)
            print("Consider increasing timeout or breaking down tasks.", file=sys.stderr)
            print(f"{'='*60}", file=sys.stderr)
            stats.iterations_failed += 1
            stats.print_summary()
            return 124, stats.iterations_completed  # Timeout

        # Check for promise FIRST - if agent completed its task, trust that
        promise = detect_promise(output)

        # Handle non-zero exit code, but only fail if there's no valid promise
        if exit_code != 0:
            if promise:
                # Agent completed task despite non-zero exit - warn but continue
                print(f"\n⚠ Claude exited with code {exit_code}, but task completed.")
            else:
                # No promise and non-zero exit - this is a real failure
                print(f"\n{'='*60}", file=sys.stderr)
                print(f"❌ ERROR: Claude exited with code {exit_code}", file=sys.stderr)
                print(f"   Iteration: {iteration}/{max_iterations}", file=sys.stderr)
                if stderr:
                    print("", file=sys.stderr)
                    print("stderr output:", file=sys.stderr)
                    print(stderr, file=sys.stderr)
                print(f"{'='*60}", file=sys.stderr)
                stats.iterations_failed += 1
                stats.print_summary()
                return exit_code, stats.iterations_completed

        # Handle promise-based flow control
        if promise == "BUILD_COMPLETE":
            stats.iterations_completed += 1
            print(f"\n{'='*60}")
            print("✅ BUILD COMPLETE - All tasks finished!")
            print(f"{'='*60}")
            stats.print_summary()
            return 0, stats.iterations_completed
        elif promise == "TASK_COMPLETE":
            stats.iterations_completed += 1
            print(f"\n✓ Task complete. Continuing to next iteration...")
            # Loop continues to next iteration
        else:
            # No promise detected - Claude may need more work
            print(f"\n⚠ No promise detected. Continuing to next iteration...")
            # Loop continues to next iteration

    # Max iterations reached
    print(f"\n{'='*60}")
    print(f"⚠ Max iterations ({max_iterations}) reached. Build incomplete.")
    print("   Review build_progress.md and tasks file to assess state.")
    print(f"{'='*60}")
    stats.print_summary()
    return 1, stats.iterations_completed

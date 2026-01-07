#!/usr/bin/env python3
"""
Spectre Build CLI - Execute Claude in a loop, one parent task per iteration.

The CLI handles the loop; Claude handles task tracking and progress writing.
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

# Prompt template - identical every iteration, only file paths are substituted
PROMPT_TEMPLATE = """\
# SPECTRE Build Loop

You are executing a multi-task build in a controlled loop. Each iteration you complete ONE parent task, then STOP.

---

## Files

- **Tasks**: `{tasks_file_path}`
- **Progress**: `{progress_file_path}`
- **Additional Context**: {additional_context_paths_or_none}

---

## Your Instructions

1. **Read the progress file** (if it exists)
   - Check the **Codebase Patterns** section at the top for patterns discovered in prior iterations
   - Review iteration logs to understand what was accomplished
   - Note any recommended task updates or learnings
   - Consider how these learnings affect remaining work

2. **Read the additional context files** (if provided)
   - These contain scope, requirements, or other guidance for this build
   - Understand the goals and constraints before starting work

3. **Read the tasks file** to see current completion state
   - Parent tasks marked `[x]` are complete
   - Review all incomplete parent tasks marked `[ ]`
   - Apply any recommended updates from prior progress (reorder, modify, skip if obsolete)

4. **Choose the RIGHT task to work on**
   - Based on scope, progress, and learnings, decide which incomplete parent task makes the most sense to tackle next
   - This is usually the next sequential task, but use your judgment:
     - If a later task is now blocking or more urgent, do that instead
     - If a task has become unnecessary based on learnings, mark it `[x]` with note "Skipped - {{reason}}" and choose another
     - If dependencies have shifted, reorder accordingly
   - Document your reasoning in your reflection

5. **Work on ONE parent task only**
   - Complete all sub-tasks under the chosen parent task
   - Mark the parent task and its sub-tasks as `[x]` in the tasks file when done
   - Do NOT work on multiple parent tasks — STOP after completing one

6. **Verify your work**
   - Run linting on all files you created or modified
   - Run tests relevant to the files you touched
   - Fix any lint errors or test failures before proceeding
   - Do NOT skip this step — verification must pass before commit

7. **Commit your changes**
   - Stage all files changed for this task
   - Commit with message format: `feat({{task_id}}): {{brief description}}`
   - Example: `feat(2.1): implement Claude subprocess execution with streaming`

8. **Update the progress file**

   If progress file doesn't exist, create it with this structure:
   ```markdown
   # Build Progress: Spectre Build CLI

   ## Codebase Patterns
   <!-- Patterns discovered during build - these persist and compound across iterations -->

   ---
   ```

   **First**, if you discovered any reusable patterns, add them to the **Codebase Patterns** section at the TOP.

   **Then**, append your iteration log:
   ```markdown
   ## Iteration — {{Parent Task Title}}
   **Status**: Complete
   **Why This Task**: [if not sequential, explain why you chose this task]
   **What Was Done**: [2-3 sentence summary]
   **Files Changed**: [list of files created/modified]
   **Key Decisions**: [bullet list or "None"]
   **Patterns Discovered**: [added to Codebase Patterns section, or "None"]
   **Recommended Task Updates**: [suggestions for remaining tasks, or "None"]
   **Blockers/Risks**: [any issues encountered, or "None"]
   ```

9. **Signal completion** with the appropriate promise tag:
   - If you completed a parent task and MORE tasks remain: output `<promise>TASK_COMPLETE</promise>`
   - If you completed the FINAL parent task (all tasks now `[x]`): output `<promise>BUILD_COMPLETE</promise>`

---

## CRITICAL — Promise Integrity

⚠️ **STRICT REQUIREMENTS — DO NOT VIOLATE:**
- Only output `<promise>` tags when the statement is **GENUINELY TRUE**
- Do NOT output false promises to escape the loop
- Do NOT lie even if you feel stuck or have been running too long
- The loop will continue until the promise is truthfully achieved

If you cannot complete the task, document the blocker in your reflection and continue trying. The loop handles iteration — your job is honest execution.

---

## Begin

1. Read progress file (check Codebase Patterns first)
2. Read context files (scope, requirements)
3. Read tasks file
4. Choose the right task
5. Implement it
6. Verify (lint + tests)
7. Commit
8. Update progress file
9. Output promise
"""


def build_prompt(tasks_file: str, context_files: list[str]) -> str:
    """
    Build the iteration prompt from the template.

    The prompt is identical every iteration - only file paths are substituted.
    Claude reads files directly; prompt just points to them.

    Args:
        tasks_file: Absolute path to the tasks file
        context_files: List of absolute paths to additional context files

    Returns:
        The constructed prompt string ready to send to Claude
    """
    # Derive progress file path (same directory as tasks file, named build_progress.md)
    tasks_path = Path(tasks_file)
    progress_file = str(tasks_path.parent / "build_progress.md")

    # Format additional context paths or "None"
    if context_files:
        additional_context = ", ".join(f"`{f}`" for f in context_files)
    else:
        additional_context = "None"

    # Substitute variables into template
    prompt = PROMPT_TEMPLATE.format(
        tasks_file_path=tasks_file,
        progress_file_path=progress_file,
        additional_context_paths_or_none=additional_context,
    )

    return prompt


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        prog="spectre-build",
        description="Execute Claude in a loop, completing one parent task per iteration.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode (prompts for inputs)
  python cli/build.py

  # Flag-based invocation
  python cli/build.py --tasks docs/tasks.md --context docs/scope.md

  # With multiple context files and custom iteration limit
  python cli/build.py --tasks docs/tasks.md --context docs/scope.md docs/plan.md --max-iterations 15
""",
    )

    parser.add_argument(
        "--tasks",
        type=str,
        help="Path to tasks.md file (required)",
    )

    parser.add_argument(
        "--context",
        type=str,
        nargs="*",
        default=[],
        help="Additional context file paths (optional, can specify multiple)",
    )

    parser.add_argument(
        "--max-iterations",
        type=int,
        default=10,
        help="Maximum number of iterations (default: 10)",
    )

    return parser.parse_args()


def prompt_for_tasks_file() -> str:
    """Interactively prompt for tasks file path."""
    while True:
        tasks_path = input("Tasks file path: ").strip()
        if tasks_path:
            return tasks_path
        print("Tasks file path is required.")


def prompt_for_context_files() -> list[str]:
    """Interactively prompt for optional context files."""
    print("Additional context files (comma-separated, or Enter to skip): ", end="")
    response = input().strip()

    if not response:
        return []

    # Split by comma and clean up each path
    paths = [p.strip() for p in response.split(",")]
    return [p for p in paths if p]  # Filter empty strings


def prompt_for_max_iterations() -> int:
    """Interactively prompt for max iterations with default."""
    default = 10
    print(f"Max iterations [{default}]: ", end="")
    response = input().strip()

    if not response:
        return default

    try:
        value = int(response)
        if value > 0:
            return value
        print(f"Must be positive. Using default: {default}")
        return default
    except ValueError:
        print(f"Invalid number. Using default: {default}")
        return default


def validate_inputs(
    tasks_file: str, context_files: list[str], max_iterations: int
) -> bool:
    """
    Validate all inputs before starting build loop.

    Returns True if valid, exits with error message if not.
    """
    errors = []

    # Check tasks file exists and is readable
    tasks_path = Path(tasks_file)
    if not tasks_path.exists():
        errors.append(f"Tasks file not found: {tasks_file}")
    elif not tasks_path.is_file():
        errors.append(f"Tasks path is not a file: {tasks_file}")
    elif not os.access(tasks_path, os.R_OK):
        errors.append(f"Tasks file is not readable: {tasks_file}")

    # Check context files exist if provided
    for ctx_file in context_files:
        ctx_path = Path(ctx_file)
        if not ctx_path.exists():
            errors.append(f"Context file not found: {ctx_file}")
        elif not ctx_path.is_file():
            errors.append(f"Context path is not a file: {ctx_file}")
        elif not os.access(ctx_path, os.R_OK):
            errors.append(f"Context file is not readable: {ctx_file}")

    # Check max-iterations is positive
    if max_iterations <= 0:
        errors.append(f"Max iterations must be positive: {max_iterations}")

    # Report errors and exit if any
    if errors:
        print("Validation errors:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        sys.exit(1)

    return True


def run_claude_iteration(prompt: str, timeout: int | None = None) -> tuple[int, str, str]:
    """
    Execute Claude with the given prompt and stream output.

    Uses subprocess.Popen to invoke `claude -p`, passing the prompt via stdin.
    Streams stdout line-by-line for real-time visibility while buffering
    the full output for promise detection.

    Args:
        prompt: The full prompt to send to Claude
        timeout: Optional timeout in seconds for the subprocess

    Returns:
        Tuple of (exit_code, full_output, error_output)

    Raises:
        FileNotFoundError: If claude CLI is not installed
        subprocess.TimeoutExpired: If timeout is exceeded
    """
    # Build command - use -p flag for print mode (non-interactive)
    cmd = ["claude", "-p"]

    # Start subprocess with pipes for all streams
    # FileNotFoundError is raised here if claude CLI is not installed
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

    # Buffer for full output (needed for promise detection)
    output_lines: list[str] = []

    # Stream stdout line-by-line, printing each immediately
    # Note: Timeout cannot be applied during streaming - only on final wait
    for line in process.stdout:
        print(line, end="", flush=True)
        output_lines.append(line)

    # Wait for process to complete (with optional timeout)
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()  # Clean up zombie process
        raise

    # Capture stderr for error reporting
    error_output = process.stderr.read()

    # Combine buffered output
    full_output = "".join(output_lines)

    return process.returncode, full_output, error_output


def detect_promise(output: str) -> str | None:
    """
    Extract promise tag from Claude's output.

    Searches for <promise>...</promise> pattern and returns the promise text
    if found. Promise text is stripped of whitespace.

    Args:
        output: Full output from Claude subprocess

    Returns:
        Promise text ("TASK_COMPLETE" or "BUILD_COMPLETE") if found, None otherwise
    """
    match = re.search(r"<promise>(.*?)</promise>", output, re.DOTALL)
    if match:
        return match.group(1).strip()
    return None


def main() -> None:
    """Main entry point for Spectre Build CLI."""
    args = parse_args()

    # Get tasks file - from args or interactive prompt
    tasks_file = args.tasks
    if not tasks_file:
        tasks_file = prompt_for_tasks_file()

    # Determine if running in flag mode (--tasks provided) or interactive mode
    flag_mode = args.tasks is not None

    # Get context files - from args in flag mode, prompt in interactive mode
    context_files = args.context if flag_mode else prompt_for_context_files()

    # Get max iterations - from args or interactive prompt (only if interactive mode)
    if flag_mode:
        # Flag mode - use args value directly
        max_iterations = args.max_iterations
    else:
        # Interactive mode - prompt for confirmation/override
        max_iterations = prompt_for_max_iterations()

    # Validate all inputs before proceeding
    validate_inputs(tasks_file, context_files, max_iterations)

    # Convert to absolute paths for consistency
    tasks_file = str(Path(tasks_file).resolve())
    context_files = [str(Path(f).resolve()) for f in context_files]

    # Display configuration
    print("\n--- Spectre Build Configuration ---")
    print(f"Tasks file: {tasks_file}")
    print(f"Context files: {context_files if context_files else 'None'}")
    print(f"Max iterations: {max_iterations}")
    print("-----------------------------------\n")

    # Main build loop
    iteration = 0
    while iteration < max_iterations:
        iteration += 1

        # Print iteration header with promise reference
        print(f"\n{'='*60}")
        print(f"🔄 Iteration {iteration}/{max_iterations}")
        print(f"   Complete task: <promise>TASK_COMPLETE</promise>")
        print(f"   All done: <promise>BUILD_COMPLETE</promise>")
        print(f"{'='*60}\n")

        # Build fresh prompt each iteration
        prompt = build_prompt(tasks_file, context_files)

        # Invoke Claude subprocess with constructed prompt
        try:
            exit_code, output, stderr = run_claude_iteration(prompt)
        except FileNotFoundError:
            print(f"\n{'='*60}", file=sys.stderr)
            print("❌ ERROR: Claude CLI not found", file=sys.stderr)
            print(f"   Iteration: {iteration}/{max_iterations}", file=sys.stderr)
            print("", file=sys.stderr)
            print("The 'claude' command is not installed or not in PATH.", file=sys.stderr)
            print("Install Claude Code CLI: https://claude.ai/code", file=sys.stderr)
            print(f"{'='*60}", file=sys.stderr)
            sys.exit(127)  # Standard exit code for command not found
        except subprocess.TimeoutExpired:
            print(f"\n{'='*60}", file=sys.stderr)
            print("❌ ERROR: Claude execution timed out", file=sys.stderr)
            print(f"   Iteration: {iteration}/{max_iterations}", file=sys.stderr)
            print("", file=sys.stderr)
            print("The Claude subprocess exceeded the allowed time.", file=sys.stderr)
            print("Consider increasing timeout or breaking down tasks.", file=sys.stderr)
            print(f"{'='*60}", file=sys.stderr)
            sys.exit(124)  # Standard exit code for timeout

        # Handle non-zero exit code from Claude
        if exit_code != 0:
            print(f"\n{'='*60}", file=sys.stderr)
            print(f"❌ ERROR: Claude exited with code {exit_code}", file=sys.stderr)
            print(f"   Iteration: {iteration}/{max_iterations}", file=sys.stderr)
            if stderr:
                print("", file=sys.stderr)
                print("stderr output:", file=sys.stderr)
                print(stderr, file=sys.stderr)
            print(f"{'='*60}", file=sys.stderr)
            sys.exit(exit_code)

        # Parse output for completion promises
        promise = detect_promise(output)

        if promise == "BUILD_COMPLETE":
            print(f"\n{'='*60}")
            print("✅ BUILD COMPLETE - All tasks finished!")
            print(f"{'='*60}\n")
            sys.exit(0)
        elif promise == "TASK_COMPLETE":
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
    print(f"{'='*60}\n")
    sys.exit(1)


if __name__ == "__main__":
    main()

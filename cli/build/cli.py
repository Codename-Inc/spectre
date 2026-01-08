"""
CLI argument parsing and interactive prompts for spectre-build.

This module handles command-line interface concerns separate from
the core build loop logic.
"""

import argparse
import os
import sys
from pathlib import Path

from .loop import run_build_loop
from ..notify import notify_build_complete, notify_build_error


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        prog="spectre-build",
        description="Execute Claude in a loop, completing one parent task per iteration.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode (prompts for inputs)
  spectre-build

  # Flag-based invocation
  spectre-build --tasks docs/tasks.md --context docs/scope.md

  # With multiple context files and custom iteration limit
  spectre-build --tasks docs/tasks.md --context docs/scope.md docs/plan.md --max-iterations 15
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

    parser.add_argument(
        "--notify",
        action="store_true",
        default=True,
        help="Send macOS notification on completion (default: enabled)",
    )

    parser.add_argument(
        "--no-notify",
        action="store_true",
        help="Disable completion notifications",
    )

    return parser.parse_args()


def normalize_path(path: str) -> str:
    """
    Normalize a file path by stripping @ prefix if present.

    The @ prefix is a common convention meaning "relative to current directory".
    This function strips it so paths like @docs/file.md work as docs/file.md.

    Args:
        path: File path, possibly with @ prefix

    Returns:
        Path with @ prefix removed (if present)
    """
    if path.startswith("@"):
        return path[1:]
    return path


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


def format_duration(seconds: float) -> str:
    """Format duration in human-readable form."""
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins}m {secs}s"
    else:
        hours = int(seconds // 3600)
        mins = int((seconds % 3600) // 60)
        return f"{hours}h {mins}m"


def main() -> None:
    """Main entry point for Spectre Build CLI."""
    import time

    args = parse_args()

    # Determine notification setting (--no-notify overrides --notify)
    send_notification = args.notify and not args.no_notify

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

    # Normalize paths (strip @ prefix if present)
    tasks_file = normalize_path(tasks_file)
    context_files = [normalize_path(f) for f in context_files]

    # Validate all inputs before proceeding
    validate_inputs(tasks_file, context_files, max_iterations)

    # Convert to absolute paths for consistency
    tasks_file = str(Path(tasks_file).resolve())
    context_files = [str(Path(f).resolve()) for f in context_files]

    # Track build duration
    start_time = time.time()

    # Run the build loop
    exit_code, iterations_completed = run_build_loop(
        tasks_file, context_files, max_iterations
    )

    # Calculate duration
    duration = time.time() - start_time
    duration_str = format_duration(duration)

    # Send notification if enabled
    if send_notification:
        notify_build_complete(
            tasks_completed=iterations_completed,
            total_time=duration_str,
            success=(exit_code == 0),
        )

    sys.exit(exit_code)

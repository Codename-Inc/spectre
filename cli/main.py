"""Spectre CLI - unified command-line interface.

This module provides the main entry point for the `spectre` command,
which unifies all subcommands:
  - spectre build - run build loop (one task per iteration)
  - spectre subagent - run specialized agents
  - spectre command - manage slash commands
  - spectre setup - install plugins and skills

Usage:
    spectre --help
    spectre --version
    spectre build --tasks tasks.md
    spectre subagent run "task"
    spectre command list
    spectre setup
"""

import sys
from pathlib import Path

import click

from cli.subagent import subagent
from cli.command import command


# Get version from package or fallback
def get_version() -> str:
    """Get version from pyproject.toml or fallback."""
    try:
        # Try importlib.metadata first (Python 3.8+)
        from importlib.metadata import version
        return version("spectre-cli")
    except Exception:
        pass

    # Fallback: read from pyproject.toml
    try:
        pyproject = Path(__file__).parent.parent / "pyproject.toml"
        if pyproject.exists():
            content = pyproject.read_text()
            for line in content.split("\n"):
                if line.strip().startswith("version"):
                    # Parse: version = "0.1.0"
                    return line.split("=")[1].strip().strip('"')
    except Exception:
        pass

    return "0.1.0"


@click.group()
@click.version_option(get_version(), "--version", "-V", prog_name="spectre")
def cli() -> None:
    """Spectre CLI - agentic workflow tools.

    Spectre provides tools for running Claude Code in automated workflows:

    \b
    COMMANDS:
      build     - Run build loop, completing one task per iteration
      subagent  - Run specialized agents in isolated sessions
      command   - Retrieve and manage slash commands
      setup     - Install plugins and skills

    \b
    EXAMPLES:
      spectre build --tasks docs/tasks.md --max-iterations 10
      spectre subagent run "explain this codebase"
      spectre subagent run tdd-agent "write tests for auth module"
      spectre command get /spectre:scope
      spectre setup
    """
    pass


# Build command - wrapper around argparse-based CLI
@cli.command()
@click.option("--tasks", type=click.Path(exists=True), help="Path to tasks.md file")
@click.option(
    "--context",
    multiple=True,
    type=click.Path(exists=True),
    help="Additional context files (can specify multiple)",
)
@click.option(
    "--max-iterations",
    type=int,
    default=10,
    show_default=True,
    help="Maximum number of iterations",
)
def build(tasks: str | None, context: tuple[str, ...], max_iterations: int) -> None:
    """Run build loop, completing one parent task per iteration.

    The build loop invokes Claude Code repeatedly, with each iteration
    focused on completing exactly one parent task from the tasks file.

    \b
    EXAMPLES:
      # Interactive mode (prompts for inputs)
      spectre build

      # Flag-based invocation
      spectre build --tasks docs/tasks.md --context docs/scope.md

      # Multiple context files
      spectre build --tasks docs/tasks.md --context a.md --context b.md
    """
    from cli.build.loop import run_build_loop
    from cli.build.cli import (
        prompt_for_tasks_file,
        prompt_for_context_files,
        prompt_for_max_iterations,
        validate_inputs,
        normalize_path,
    )

    # Get tasks file - from args or interactive prompt
    tasks_file = tasks
    if not tasks_file:
        tasks_file = prompt_for_tasks_file()

    # Determine if running in flag mode (--tasks provided) or interactive mode
    flag_mode = tasks is not None

    # Get context files - from args in flag mode, prompt in interactive mode
    context_files = list(context) if flag_mode else prompt_for_context_files()

    # Get max iterations - from args or interactive prompt (only if interactive mode)
    if not flag_mode:
        max_iterations = prompt_for_max_iterations()

    # Normalize paths (strip @ prefix if present)
    tasks_file = normalize_path(tasks_file)
    context_files = [normalize_path(f) for f in context_files]

    # Validate all inputs before proceeding
    validate_inputs(tasks_file, context_files, max_iterations)

    # Convert to absolute paths for consistency
    tasks_file = str(Path(tasks_file).resolve())
    context_files = [str(Path(f).resolve()) for f in context_files]

    # Run the build loop
    exit_code = run_build_loop(tasks_file, context_files, max_iterations)
    sys.exit(exit_code)


# Setup command - install plugins, agents, and skills
@cli.command()
@click.option(
    "--force",
    is_flag=True,
    help="Overwrite existing symlinks",
)
@click.option(
    "--skip-agents",
    is_flag=True,
    help="Skip agent symlinking",
)
@click.option(
    "--skip-skill",
    is_flag=True,
    help="Skip skill installation",
)
def setup(force: bool, skip_agents: bool, skip_skill: bool) -> None:
    """Install plugins and skills to Claude Code.

    This command sets up Spectre by:
      - Symlinking plugins to ~/.claude/plugins/
      - Installing agents to ~/.claude/agents/
      - Installing the Spectre skill for pattern recognition

    \b
    EXAMPLES:
      spectre setup                  # Install everything
      spectre setup --force          # Overwrite existing symlinks
      spectre setup --skip-agents    # Skip agent installation
      spectre setup --skip-skill     # Skip skill installation
    """
    from cli.setup import run_setup
    exit_code = run_setup(force=force, skip_agents=skip_agents, skip_skill=skip_skill)
    sys.exit(exit_code)


# Register command groups
cli.add_command(subagent)
cli.add_command(command)


def main() -> None:
    """Main entry point for Spectre CLI."""
    cli()


if __name__ == "__main__":
    main()

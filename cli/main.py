"""Spectre CLI - unified command-line interface.

This module provides the main entry point for the `spectre` command,
which unifies all subcommands:
  - spectre subagent - run specialized agents
  - spectre command - manage slash commands
  - spectre setup - install plugins and skills

Usage:
    spectre --help
    spectre --version
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
      subagent  - Run specialized agents in isolated sessions
      command   - Retrieve and manage slash commands
      setup     - Install plugins and skills

    \b
    EXAMPLES:
      spectre subagent run "explain this codebase"
      spectre subagent run tdd-agent "write tests for auth module"
      spectre command get /spectre:scope
      spectre setup
    """
    pass


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

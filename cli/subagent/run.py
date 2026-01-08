"""Run a single subagent or vanilla Claude."""

from __future__ import annotations

import sys
from pathlib import Path

import click

from cli.shared.discovery import AgentSource, find_agent, get_agent_sources
from cli.subagent.runner import run_agent, run_vanilla, validate_agent_name


@click.command("run")
@click.argument("args", nargs=-1, required=True)
@click.option(
    "--output",
    type=click.Choice(["text", "jsonl"]),
    default="text",
    help="Output format (jsonl for UI streaming)",
)
@click.option(
    "--timeout",
    type=int,
    default=600,
    help="Timeout in seconds (default: 600)",
)
@click.option(
    "--debug",
    is_flag=True,
    help="Enable debug output",
)
@click.option(
    "--agents-dir",
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    help="Override: use single directory instead of discovery",
)
def cmd_run(args: tuple, output: str, timeout: int, debug: bool, agents_dir: str | None) -> None:
    """Run a single agent or vanilla Claude.

    If one argument is provided, runs vanilla Claude with just that task.
    If two arguments are provided, first is the agent name and second is the task.

    Examples:

        spectre subagent run "explain this codebase"

        spectre subagent run tdd-agent "write tests for auth module"
    """
    if debug:
        from cli.shared import discovery
        discovery.DEBUG = True

    # Parse positional args: either [task] or [agent, task]
    positional = list(args)
    if len(positional) == 1:
        # Vanilla mode: just task, no agent
        agent_name = None
        task = positional[0]
    elif len(positional) == 2:
        # Agent mode: agent + task
        agent_name = positional[0]
        task = positional[1]
    else:
        click.echo("Error: Expected 1 or 2 arguments: [agent] <task>", err=True)
        sys.exit(1)

    if agent_name is None:
        # Vanilla Claude - no custom instructions
        exit_code = run_vanilla(
            task=task,
            output_format=output,
            timeout=timeout,
            enable_debug=debug,
        )
        sys.exit(exit_code)

    # Security: Validate agent name to prevent path traversal
    try:
        validate_agent_name(agent_name)
    except ValueError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    # Get agent sources (respects --agents-dir override)
    if agents_dir:
        sources = [AgentSource("override", Path(agents_dir).expanduser(), "override", 0)]
    else:
        sources = get_agent_sources()

    result = find_agent(agent_name, sources)
    if not result:
        click.echo(f"Error: Agent '{agent_name}' not found", err=True)
        sys.exit(1)

    agent_path, source = result

    exit_code = run_agent(
        agent_path=agent_path,
        task=task,
        output_format=output,
        timeout=timeout,
        enable_debug=debug,
    )
    sys.exit(exit_code)

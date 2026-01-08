"""Run multiple subagents in parallel."""

from __future__ import annotations

import sys
from pathlib import Path

import click

from cli.shared.discovery import AgentSource, get_agent_sources
from cli.subagent.runner import run_parallel


@click.command("parallel")
@click.argument("pairs", nargs=-1, required=True)
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
def cmd_parallel(
    pairs: tuple,
    output: str,
    timeout: int,
    debug: bool,
    agents_dir: str | None,
) -> None:
    """Run multiple agents in parallel.

    Each pair should be in format agent:task or agent:"task with spaces".

    Example:

        spectre subagent parallel tdd-agent:"write tests" coder:"implement feature"
    """
    if debug:
        from cli.shared import discovery
        discovery.DEBUG = True

    # Get agent sources (respects --agents-dir override)
    if agents_dir:
        sources = [AgentSource("override", Path(agents_dir).expanduser(), "override", 0)]
    else:
        sources = get_agent_sources()

    exit_code = run_parallel(
        pairs=list(pairs),
        sources=sources,
        output_format=output,
        timeout=timeout,
        enable_debug=debug,
    )
    sys.exit(exit_code)

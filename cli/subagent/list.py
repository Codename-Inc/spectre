"""List available subagents."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click

from cli.shared.discovery import AgentSource, get_agent_sources, list_all_agents


@click.command("list")
@click.option(
    "--output",
    type=click.Choice(["text", "json"]),
    default="text",
    help="Output format",
)
@click.option(
    "--agents-dir",
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    help="Override: use single directory instead of discovery",
)
def cmd_list(output: str, agents_dir: str | None) -> None:
    """List available agents.

    Agents are discovered from:
      - ./.claude/agents/ (project)
      - ./.codex/agents/ (project)
      - ~/.claude/agents/ (user)
      - ~/.codex/agents/ (user)
      - Installed plugins

    Example:

        spectre subagent list

        spectre subagent list --output json
    """
    # Get agent sources (respects --agents-dir override)
    if agents_dir:
        sources = [AgentSource("override", Path(agents_dir).expanduser(), "override", 0)]
    else:
        sources = get_agent_sources()

    agents = list_all_agents(sources)

    if not agents:
        click.echo("No agents found", err=True)
        sys.exit(1)

    if output == "json":
        click.echo(json.dumps(agents, indent=2))
    else:
        # Table format: NAME, SOURCE, TYPE
        click.echo(f"{'NAME':<20} {'SOURCE':<45} {'TYPE'}")
        click.echo("-" * 80)
        for agent in agents:
            path_display = agent["path"]
            if len(path_display) > 42:
                path_display = "..." + path_display[-39:]
            click.echo(f"{agent['name']:<20} {path_display:<45} {agent['source_type']}")

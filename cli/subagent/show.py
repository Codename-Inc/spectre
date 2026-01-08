"""Show details of a specific subagent."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click

from cli.shared.discovery import AgentSource, find_agent, get_agent_sources, load_agent_details
from cli.subagent.runner import validate_agent_name


@click.command("show")
@click.argument("agent")
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
def cmd_show(agent: str, output: str, agents_dir: str | None) -> None:
    """Show details of a specific agent.

    Displays the agent's metadata, source location, and instructions preview.

    Example:

        spectre subagent show tdd-agent

        spectre subagent show tdd-agent --output json
    """
    # Security: Validate agent name to prevent path traversal
    try:
        validate_agent_name(agent)
    except ValueError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    # Get agent sources (respects --agents-dir override)
    if agents_dir:
        sources = [AgentSource("override", Path(agents_dir).expanduser(), "override", 0)]
    else:
        sources = get_agent_sources()

    result = find_agent(agent, sources)
    if not result:
        click.echo(f"Error: Agent '{agent}' not found", err=True)
        sys.exit(1)

    agent_path, source = result
    details = load_agent_details(agent_path, source)

    if output == "json":
        click.echo(json.dumps(details, indent=2))
    else:
        click.echo(f"Agent: {details['name']}")
        click.echo(f"Source: {details['source']} ({details['source_type']})")
        click.echo(f"Path: {details['path']}")
        click.echo()
        if details.get("frontmatter"):
            click.echo("Frontmatter:")
            for k, v in details["frontmatter"].items():
                click.echo(f"  {k}: {v}")
            click.echo()
        click.echo("Instructions:")
        click.echo("-" * 40)
        # Show first 50 lines
        lines = details.get("body", "").strip().split("\n")
        preview = "\n".join(lines[:50])
        click.echo(preview)
        if len(lines) > 50:
            click.echo(f"\n... ({len(lines) - 50} more lines)")

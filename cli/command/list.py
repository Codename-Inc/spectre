"""Command list - list available slash commands."""

from __future__ import annotations

from pathlib import Path

import click

from cli.shared.discovery import (
    CommandSource,
    get_command_sources,
    list_all_commands,
    debug,
)


@click.command("list")
@click.option(
    "--output",
    type=click.Choice(["text", "json"]),
    default="text",
    help="Output format",
)
@click.option("--debug", "enable_debug", is_flag=True, help="Enable debug output")
@click.option(
    "--commands-dir",
    help="Override: use single directory instead of discovery",
)
def list_commands(
    output: str,
    enable_debug: bool,
    commands_dir: str | None,
) -> None:
    """List available slash commands."""
    import json as json_module

    import cli.shared.discovery as discovery_module

    if enable_debug:
        discovery_module.DEBUG = True
        debug("Listing commands")

    # Get command sources (respects --commands-dir override)
    if commands_dir:
        sources = [
            CommandSource("override", Path(commands_dir).expanduser(), "override", 0)
        ]
    else:
        sources = get_command_sources()

    commands = list_all_commands(sources)

    if not commands:
        click.echo("No commands found", err=True)
        click.echo("\nCommands are discovered from:", err=True)
        click.echo("  - ./.claude/commands/", err=True)
        click.echo("  - ./.codex/prompts/", err=True)
        click.echo("  - ~/.claude/commands/", err=True)
        click.echo("  - ~/.codex/prompts/", err=True)
        raise SystemExit(1)

    if output == "json":
        click.echo(json_module.dumps(commands, indent=2))
    else:
        # Table format: NAME, SOURCE, DESCRIPTION
        click.echo(f"{'COMMAND':<25} {'SOURCE':<20} {'DESCRIPTION'}")
        click.echo("-" * 80)
        for cmd in commands:
            desc = cmd.get("description", "")
            if len(desc) > 30:
                desc = desc[:27] + "..."
            click.echo(f"{cmd['name']:<25} {cmd['source_type']:<20} {desc}")

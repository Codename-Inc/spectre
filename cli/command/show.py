"""Command show - show details of a specific slash command."""

from __future__ import annotations

from pathlib import Path

import click

from cli.shared.discovery import (
    CommandSource,
    find_command,
    get_command_sources,
    load_command_details,
    validate_command_name,
    debug,
)


@click.command("show")
@click.argument("command")
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
def show(
    command: str,
    output: str,
    enable_debug: bool,
    commands_dir: str | None,
) -> None:
    """Show details of a specific slash command.

    COMMAND is the command name (e.g., /quick_tasks or quick_tasks).
    """
    import json as json_module

    import cli.shared.discovery as discovery_module

    if enable_debug:
        discovery_module.DEBUG = True
        debug(f"Showing command: {command}")

    # Validate command name
    try:
        clean_name = validate_command_name(command)
    except ValueError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

    # Get command sources (respects --commands-dir override)
    if commands_dir:
        sources = [
            CommandSource("override", Path(commands_dir).expanduser(), "override", 0)
        ]
    else:
        sources = get_command_sources()

    result = find_command(command, sources)
    if not result:
        click.echo(f"Error: Command '/{clean_name}' not found", err=True)
        raise SystemExit(1)

    command_path, source = result
    details = load_command_details(command_path, source)

    if output == "json":
        click.echo(json_module.dumps(details, indent=2))
    else:
        click.echo(f"Command: {details['name']}")
        click.echo(f"Source: {details['source']} ({details['source_type']})")
        click.echo(f"Path: {details['path']}")
        click.echo()
        if details.get("frontmatter"):
            click.echo("Frontmatter:")
            for k, v in details["frontmatter"].items():
                click.echo(f"  {k}: {v}")
            click.echo()
        click.echo("Prompt:")
        click.echo("-" * 40)
        # Show first 50 lines
        lines = details.get("body", "").strip().split("\n")
        preview = "\n".join(lines[:50])
        click.echo(preview)
        if len(lines) > 50:
            click.echo(f"\n... ({len(lines) - 50} more lines)")

"""Command get - retrieve command prompt text.

This is the primary interface for agents to retrieve executable prompts.
"""

from __future__ import annotations

from pathlib import Path

import click

from cli.shared.discovery import (
    CommandSource,
    find_command,
    get_command_sources,
    interpolate_arguments,
    load_command_prompt,
    validate_command_name,
    DEBUG,
    debug,
)


@click.command("get")
@click.argument("command")
@click.argument("args", nargs=-1)
@click.option(
    "--output",
    type=click.Choice(["text", "json"]),
    default="text",
    help="Output format (default: text for raw prompt)",
)
@click.option("--debug", "enable_debug", is_flag=True, help="Enable debug output")
@click.option(
    "--commands-dir",
    help="Override: use single directory instead of discovery",
)
def get(
    command: str,
    args: tuple[str, ...],
    output: str,
    enable_debug: bool,
    commands_dir: str | None,
) -> None:
    """Get the full prompt text for a slash command.

    COMMAND is the command name (e.g., /quick_tasks or quick_tasks).
    ARGS are optional arguments to interpolate ($1, $2, etc.).
    """
    import json as json_module
    import sys

    import cli.shared.discovery as discovery_module

    if enable_debug:
        discovery_module.DEBUG = True
        debug(f"Getting command: {command}")

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
    debug(f"Found command: {command_path} from {source.name}")

    # Load and optionally interpolate the prompt
    prompt = load_command_prompt(command_path)

    if args:
        prompt = interpolate_arguments(prompt, list(args))

    if output == "json":
        click.echo(
            json_module.dumps(
                {
                    "command": f"/{clean_name}",
                    "path": str(command_path),
                    "source": source.name,
                    "args": list(args),
                    "prompt": prompt,
                },
                indent=2,
            )
        )
    else:
        # Raw prompt output - ready for agent execution
        click.echo(prompt)

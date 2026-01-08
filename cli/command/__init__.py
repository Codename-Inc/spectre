"""Spectre command module - retrieve and manage slash commands.

This module provides CLI commands for working with slash commands:
- spectre command get - retrieve prompt text for a command
- spectre command list - list available commands
- spectre command show - show command details
"""

import click

from cli.command.get import get
from cli.command.list import list_commands
from cli.command.show import show


@click.group()
def command() -> None:
    """Retrieve and manage slash commands.

    Slash commands are markdown prompts that can be executed programmatically.
    They enable agents to reference reusable procedures and workflows.
    """
    pass


# Register subcommands
command.add_command(get)
command.add_command(list_commands, name="list")
command.add_command(show)

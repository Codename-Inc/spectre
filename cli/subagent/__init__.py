"""Spectre subagent module - run specialized agents in isolated sessions.

This module provides the `spectre subagent` command group for:
- Running single agents with custom instructions
- Running vanilla Claude without custom instructions
- Running multiple agents in parallel
- Listing and inspecting available agents
"""

import click

from cli.subagent.run import cmd_run
from cli.subagent.list import cmd_list
from cli.subagent.parallel import cmd_parallel
from cli.subagent.show import cmd_show


@click.group("subagent")
def subagent():
    """Run specialized subagents using agent definitions.

    Subagents are isolated Claude sessions with custom instructions
    loaded from agent definition files (.md files with optional frontmatter).

    Agents are discovered from multiple sources:
      - ./.claude/agents/ (project-level)
      - ./.codex/agents/ (project-level)
      - ~/.claude/agents/ (user-level)
      - ~/.codex/agents/ (user-level)
      - Installed Claude Code plugins
    """
    pass


# Register subcommands
subagent.add_command(cmd_run, "run")
subagent.add_command(cmd_list, "list")
subagent.add_command(cmd_parallel, "parallel")
subagent.add_command(cmd_show, "show")

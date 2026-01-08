"""Spectre shared utilities module.

Provides common functionality used across CLI modules:
- Agent and command discovery
- Frontmatter parsing
- Output formatting
"""

from cli.shared.discovery import (
    # Debug utilities
    DEBUG,
    debug,
    # Agent discovery
    AgentSource,
    get_agent_sources,
    find_agent,
    list_all_agents,
    load_agent_details,
    load_agent_instructions,
    # Command discovery
    CommandSource,
    get_command_sources,
    find_command,
    list_all_commands,
    load_command_details,
    load_command_prompt,
    validate_command_name,
    interpolate_arguments,
    # Shared utilities
    parse_frontmatter,
    strip_frontmatter,
    get_project_root,
    load_installed_plugins,
)

__all__ = [
    # Debug utilities
    "DEBUG",
    "debug",
    # Agent discovery
    "AgentSource",
    "get_agent_sources",
    "find_agent",
    "list_all_agents",
    "load_agent_details",
    "load_agent_instructions",
    # Command discovery
    "CommandSource",
    "get_command_sources",
    "find_command",
    "list_all_commands",
    "load_command_details",
    "load_command_prompt",
    "validate_command_name",
    "interpolate_arguments",
    # Shared utilities
    "parse_frontmatter",
    "strip_frontmatter",
    "get_project_root",
    "load_installed_plugins",
]

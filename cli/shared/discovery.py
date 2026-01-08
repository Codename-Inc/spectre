"""Agent and command discovery from multiple sources.

This module provides discovery logic for finding agents and commands
from project-level, user-level, and plugin directories.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path


# Module-level debug flag
DEBUG = False


def debug(*args, **kwargs) -> None:
    """Print debug message if DEBUG is enabled."""
    if DEBUG:
        import sys
        print("[DEBUG]", *args, file=sys.stderr, **kwargs)


@dataclass
class AgentSource:
    """Represents a source for agent definitions."""

    name: str           # e.g., "claude_project", "codex_user", "plugin:spectre"
    path: Path
    source_type: str    # "project", "user", "plugin", "override"
    priority: int       # Lower = higher priority


@dataclass
class CommandSource:
    """Represents a source for slash command definitions."""

    name: str           # e.g., "claude_project", "codex_user"
    path: Path
    source_type: str    # "project", "user", "override"
    priority: int       # Lower = higher priority


def load_installed_plugins() -> list[dict]:
    """Load installed plugins from ~/.claude/plugins/installed_plugins.json.

    Returns list of dicts with 'name' and 'path' keys for each installed plugin.
    The JSON format is:
    {
      "version": 2,
      "plugins": {
        "plugin-name@scope": [{"installPath": "...", ...}]
      }
    }
    """
    plugins_file = Path.home() / ".claude" / "plugins" / "installed_plugins.json"
    if not plugins_file.is_file():
        return []

    try:
        data = json.loads(plugins_file.read_text(encoding="utf-8"))
        plugins_dict = data.get("plugins", {})

        result = []
        for plugin_key, installations in plugins_dict.items():
            if not installations:
                continue
            # Take the first installation (most recent)
            install = installations[0]
            install_path = install.get("installPath", "")
            if install_path:
                # Extract plugin name from key (e.g., "spectre@scope" -> "spectre")
                name = plugin_key.split("@")[0] if "@" in plugin_key else plugin_key
                result.append({"name": name, "path": install_path})

        return result
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        debug(f"Failed to parse plugins file: {plugins_file}: {e}")
        return []


def get_project_root() -> Path:
    """Get the project root (current working directory)."""
    return Path.cwd()


# =============================================================================
# Agent Discovery
# =============================================================================


def get_agent_sources(project_root: Path | None = None) -> list[AgentSource]:
    """Return all agent sources in priority order, filtered to existing paths."""
    if project_root is None:
        project_root = get_project_root()

    sources: list[AgentSource] = []

    # Priority 1: Project-level Claude Code agents
    claude_project = project_root / ".claude" / "agents"
    if claude_project.is_dir():
        sources.append(AgentSource("claude_project", claude_project, "project", 1))
        debug(f"Found project claude agents: {claude_project}")

    # Priority 2: Project-level Codex agents
    codex_project = project_root / ".codex" / "agents"
    if codex_project.is_dir():
        sources.append(AgentSource("codex_project", codex_project, "project", 2))
        debug(f"Found project codex agents: {codex_project}")

    # Priority 3: User-level Claude Code agents
    claude_user = Path.home() / ".claude" / "agents"
    if claude_user.is_dir():
        sources.append(AgentSource("claude_user", claude_user, "user", 3))
        debug(f"Found user claude agents: {claude_user}")

    # Priority 4: User-level Codex agents
    codex_user = Path.home() / ".codex" / "agents"
    if codex_user.is_dir():
        sources.append(AgentSource("codex_user", codex_user, "user", 4))
        debug(f"Found user codex agents: {codex_user}")

    # Priority 5: Plugin agents
    for plugin in load_installed_plugins():
        plugin_path_str = plugin.get("path", "")
        if not plugin_path_str:
            continue
        plugin_path = Path(plugin_path_str)
        plugin_agents = plugin_path / "agents"
        if plugin_agents.is_dir():
            plugin_name = plugin.get("name", "unknown")
            sources.append(
                AgentSource(f"plugin:{plugin_name}", plugin_agents, "plugin", 5)
            )
            debug(f"Found plugin agents: {plugin_agents}")

    return sources


def find_agent(name: str, sources: list[AgentSource]) -> tuple[Path, AgentSource] | None:
    """Find agent by name, respecting source priority.

    Returns tuple of (agent_path, source) or None if not found.
    """
    # Strip @ prefix and .md suffix if present
    clean_name = name.lstrip("@")
    if clean_name.endswith(".md"):
        clean_name = clean_name[:-3]

    for source in sorted(sources, key=lambda s: s.priority):
        agent_path = source.path / f"{clean_name}.md"
        if agent_path.is_file():
            debug(f"Found agent '{clean_name}' at {agent_path}")
            return (agent_path, source)

    debug(f"Agent '{clean_name}' not found in any source")
    return None


def list_all_agents(sources: list[AgentSource]) -> list[dict]:
    """List all agents from all sources, first-match wins for duplicates."""
    seen: set[str] = set()
    agents: list[dict] = []

    for source in sorted(sources, key=lambda s: s.priority):
        if not source.path.is_dir():
            continue

        for agent_file in sorted(source.path.glob("*.md")):
            name = agent_file.stem
            if name not in seen:
                seen.add(name)
                frontmatter = parse_frontmatter(agent_file.read_text(encoding="utf-8"))
                agents.append({
                    "name": name,
                    "path": str(agent_file),
                    "source": source.name,
                    "source_type": source.source_type,
                    "description": frontmatter.get("description", ""),
                })

    return agents


def load_agent_details(agent_path: Path, source: AgentSource) -> dict:
    """Load full agent details including frontmatter and body."""
    content = agent_path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(content)
    body = strip_frontmatter(content)

    return {
        "name": agent_path.stem,
        "path": str(agent_path),
        "source": source.name,
        "source_type": source.source_type,
        "frontmatter": frontmatter,
        "body": body,
    }


def load_agent_instructions(agent_path: Path) -> str:
    """Load agent instructions (body without frontmatter)."""
    content = agent_path.read_text(encoding="utf-8")
    return strip_frontmatter(content)


# =============================================================================
# Command Discovery
# =============================================================================

# Valid command name pattern: alphanumeric, hyphen, underscore
# Supports namespaced commands with colon separator (e.g., spectre:sweep)
# Commands can optionally start with /
COMMAND_NAME_PATTERN = re.compile(r"^/?[a-zA-Z0-9_-]+$")
NAMESPACED_COMMAND_PATTERN = re.compile(r"^/?([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$")


def validate_command_name(name: str) -> str:
    """Validate and normalize command name.

    Strips leading / if present. Raises ValueError if name contains unsafe characters.
    Returns the normalized name (without leading /).

    Supports both simple names (e.g., "deploy") and namespaced names (e.g., "spectre:sweep").
    """
    if not name:
        raise ValueError("Command name cannot be empty")

    # Normalize: strip leading /
    clean_name = name.lstrip("/")

    if not clean_name:
        raise ValueError("Command name cannot be just '/'")

    # Check for namespaced command (namespace:command)
    if ":" in clean_name:
        if not NAMESPACED_COMMAND_PATTERN.match(name):
            raise ValueError(
                f"Invalid namespaced command '{name}': must be in format 'namespace:command' "
                "with only alphanumeric, hyphen, or underscore characters"
            )
    else:
        if not COMMAND_NAME_PATTERN.match(name):
            raise ValueError(
                f"Invalid command name '{name}': must contain only alphanumeric, "
                "hyphen, or underscore characters (optional leading /)"
            )

    # Check for leading hyphen in any part
    parts = clean_name.split(":")
    for part in parts:
        if part.startswith("-"):
            raise ValueError(f"Invalid command name '{name}': parts cannot start with hyphen")

    return clean_name


def get_command_sources(project_root: Path | None = None) -> list[CommandSource]:
    """Return all command sources in priority order, filtered to existing paths."""
    if project_root is None:
        project_root = get_project_root()

    sources: list[CommandSource] = []

    # Priority 1: Project-level Claude Code commands
    claude_project = project_root / ".claude" / "commands"
    if claude_project.is_dir():
        sources.append(CommandSource("claude_project", claude_project, "project", 1))
        debug(f"Found project claude commands: {claude_project}")

    # Priority 2: Project-level Codex prompts
    codex_project = project_root / ".codex" / "prompts"
    if codex_project.is_dir():
        sources.append(CommandSource("codex_project", codex_project, "project", 2))
        debug(f"Found project codex prompts: {codex_project}")

    # Priority 3: User-level Claude Code commands
    claude_user = Path.home() / ".claude" / "commands"
    if claude_user.is_dir():
        sources.append(CommandSource("claude_user", claude_user, "user", 3))
        debug(f"Found user claude commands: {claude_user}")

    # Priority 4: User-level Codex prompts
    codex_user = Path.home() / ".codex" / "prompts"
    if codex_user.is_dir():
        sources.append(CommandSource("codex_user", codex_user, "user", 4))
        debug(f"Found user codex prompts: {codex_user}")

    return sources


def find_command(name: str, sources: list[CommandSource]) -> tuple[Path, CommandSource] | None:
    """Find command by name, respecting source priority.

    Supports both simple names (e.g., "deploy") and namespaced names (e.g., "spectre:sweep").
    Namespaced commands are stored in subdirectories (e.g., commands/spectre/sweep.md).

    Args:
        name: Command name (with or without leading /)
        sources: List of command sources to search

    Returns:
        Tuple of (command_path, source) or None if not found.
    """
    # Validate and normalize name
    try:
        clean_name = validate_command_name(name)
    except ValueError:
        return None

    # Also strip .md suffix if present
    if clean_name.endswith(".md"):
        clean_name = clean_name[:-3]

    # Check if this is a namespaced command (namespace:command)
    if ":" in clean_name:
        namespace, cmd_name = clean_name.split(":", 1)
        for source in sorted(sources, key=lambda s: s.priority):
            # Look in namespace subdirectory
            command_path = source.path / namespace / f"{cmd_name}.md"
            if command_path.is_file():
                debug(f"Found command '/{clean_name}' at {command_path}")
                return (command_path, source)
    else:
        # Simple command - look directly in commands directory
        for source in sorted(sources, key=lambda s: s.priority):
            command_path = source.path / f"{clean_name}.md"
            if command_path.is_file():
                debug(f"Found command '/{clean_name}' at {command_path}")
                return (command_path, source)

    debug(f"Command '/{clean_name}' not found in any source")
    return None


def list_all_commands(sources: list[CommandSource]) -> list[dict]:
    """List all commands from all sources, first-match wins for duplicates.

    Scans both top-level .md files and namespace subdirectories.
    """
    seen: set[str] = set()
    commands: list[dict] = []

    for source in sorted(sources, key=lambda s: s.priority):
        if not source.path.is_dir():
            continue

        # Scan top-level .md files (non-namespaced commands)
        for command_file in sorted(source.path.glob("*.md")):
            name = command_file.stem
            if name not in seen:
                seen.add(name)
                frontmatter = parse_frontmatter(command_file.read_text(encoding="utf-8"))
                commands.append({
                    "name": f"/{name}",
                    "path": str(command_file),
                    "source": source.name,
                    "source_type": source.source_type,
                    "description": frontmatter.get("description", ""),
                })

        # Scan subdirectories for namespaced commands
        for namespace_dir in sorted(source.path.iterdir()):
            if not namespace_dir.is_dir():
                continue
            # Skip hidden directories
            if namespace_dir.name.startswith("."):
                continue

            namespace = namespace_dir.name
            for command_file in sorted(namespace_dir.glob("*.md")):
                cmd_name = command_file.stem
                full_name = f"{namespace}:{cmd_name}"
                if full_name not in seen:
                    seen.add(full_name)
                    frontmatter = parse_frontmatter(command_file.read_text(encoding="utf-8"))
                    commands.append({
                        "name": f"/{full_name}",
                        "path": str(command_file),
                        "source": source.name,
                        "source_type": source.source_type,
                        "namespace": namespace,
                        "description": frontmatter.get("description", ""),
                    })

    return commands


def load_command_details(command_path: Path, source: CommandSource) -> dict:
    """Load full command details including frontmatter and body.

    Detects namespaced commands by checking if the parent directory is not the source path.
    """
    content = command_path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(content)
    body = strip_frontmatter(content)

    # Detect if this is a namespaced command
    parent_dir = command_path.parent
    if parent_dir != source.path:
        # Namespaced command - parent directory is the namespace
        namespace = parent_dir.name
        name = f"/{namespace}:{command_path.stem}"
    else:
        # Simple command
        name = f"/{command_path.stem}"

    return {
        "name": name,
        "path": str(command_path),
        "source": source.name,
        "source_type": source.source_type,
        "frontmatter": frontmatter,
        "body": body,
    }


def load_command_prompt(command_path: Path) -> str:
    """Load command prompt text (body without frontmatter).

    This is the main function used by agents to get the executable prompt.
    """
    content = command_path.read_text(encoding="utf-8")
    return strip_frontmatter(content).strip()


def interpolate_arguments(prompt: str, args: list[str]) -> str:
    """Interpolate positional arguments into the prompt.

    Replaces $1, $2, etc. with corresponding arguments.
    Also supports $@ for all arguments joined by space.

    Args:
        prompt: The raw prompt text with placeholders
        args: List of positional arguments

    Returns:
        Prompt with arguments interpolated
    """
    result = prompt

    # Replace $@ with all arguments
    if "$@" in result:
        result = result.replace("$@", " ".join(args))

    # Replace positional arguments $1, $2, etc.
    for i, arg in enumerate(args, start=1):
        result = result.replace(f"${i}", arg)

    return result


# =============================================================================
# Shared Utilities
# =============================================================================


def parse_frontmatter(content: str) -> dict:
    """Parse YAML frontmatter from markdown content."""
    pattern = r"^---\s*\n(.*?)\n---\s*\n"
    match = re.match(pattern, content, flags=re.DOTALL)
    if not match:
        return {}

    frontmatter: dict[str, str] = {}
    for line in match.group(1).split("\n"):
        if ":" in line:
            key, value = line.split(":", 1)
            frontmatter[key.strip()] = value.strip().strip('"').strip("'")

    return frontmatter


def strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from markdown content."""
    pattern = r"^---\s*\n.*?\n---\s*\n"
    return re.sub(pattern, "", content, count=1, flags=re.DOTALL)

"""Spectre setup command - install plugins, agents, and skills.

This module handles installation of Spectre components to Claude Code:
  - Symlinks plugins to ~/.claude/plugins/
  - Symlinks agents to ~/.claude/agents/ (optional, merged)
  - Installs the Spectre skill for @agent and /command pattern recognition
"""

import os
import shutil
import sys
from pathlib import Path
from typing import NamedTuple


class SetupResult(NamedTuple):
    """Result of a setup operation."""
    success: bool
    message: str
    path: str | None = None


def get_repo_root() -> Path:
    """Get the repository root directory."""
    return Path(__file__).parent.parent


def get_plugins_dir() -> Path:
    """Get the plugins directory in the repo."""
    return get_repo_root() / "plugins"


def get_skills_dir() -> Path:
    """Get the skills directory in the repo."""
    return get_repo_root() / "skills"


def get_claude_home() -> Path:
    """Get Claude Code home directory (default: ~/.claude)."""
    claude_home = os.environ.get("CLAUDE_HOME")
    if claude_home:
        return Path(claude_home).expanduser()
    return Path.home() / ".claude"


def get_codex_home() -> Path:
    """Get Codex home directory (default: ~/.codex)."""
    codex_home = os.environ.get("CODEX_HOME")
    if codex_home:
        return Path(codex_home).expanduser()
    return Path.home() / ".codex"


def link_plugins(force: bool = False) -> list[SetupResult]:
    """Symlink plugins from repo to ~/.claude/plugins/.

    Args:
        force: If True, remove existing symlinks/dirs before creating new ones.

    Returns:
        List of SetupResult for each plugin.
    """
    results = []
    plugins_source = get_plugins_dir()
    plugins_target = get_claude_home() / "plugins"

    # Create plugins directory if needed
    plugins_target.mkdir(parents=True, exist_ok=True)

    # Find all plugins (directories containing plugin.json)
    if not plugins_source.exists():
        results.append(SetupResult(
            success=False,
            message="Plugins directory not found in repo",
            path=str(plugins_source),
        ))
        return results

    for plugin_dir in plugins_source.iterdir():
        if not plugin_dir.is_dir():
            continue

        plugin_json = plugin_dir / "plugin.json"
        if not plugin_json.exists():
            # Skip directories without plugin.json (e.g., shared/)
            continue

        plugin_name = plugin_dir.name
        target_link = plugins_target / plugin_name

        # Handle existing target
        if target_link.exists() or target_link.is_symlink():
            if not force:
                # Check if it's already pointing to us
                if target_link.is_symlink():
                    try:
                        existing_target = target_link.resolve()
                        if existing_target == plugin_dir.resolve():
                            results.append(SetupResult(
                                success=True,
                                message=f"Plugin '{plugin_name}' already linked (skipped)",
                                path=str(target_link),
                            ))
                            continue
                    except OSError:
                        pass

                results.append(SetupResult(
                    success=False,
                    message=f"Plugin '{plugin_name}' already exists (use --force to overwrite)",
                    path=str(target_link),
                ))
                continue

            # Force mode: remove existing
            if target_link.is_symlink():
                target_link.unlink()
            elif target_link.is_dir():
                shutil.rmtree(target_link)
            else:
                target_link.unlink()

        # Create symlink
        try:
            target_link.symlink_to(plugin_dir.resolve())
            results.append(SetupResult(
                success=True,
                message=f"Plugin '{plugin_name}' linked",
                path=str(target_link),
            ))
        except OSError as e:
            results.append(SetupResult(
                success=False,
                message=f"Failed to link plugin '{plugin_name}': {e}",
                path=str(target_link),
            ))

    if not results:
        results.append(SetupResult(
            success=False,
            message="No plugins found to install",
            path=str(plugins_source),
        ))

    return results


def link_agents(force: bool = False) -> list[SetupResult]:
    """Symlink agents from plugins to ~/.claude/agents/.

    Agents are symlinked individually (not the whole directory) to allow
    merging with user's existing agents.

    Args:
        force: If True, remove existing symlinks before creating new ones.

    Returns:
        List of SetupResult for each agent.
    """
    results = []
    agents_target = get_claude_home() / "agents"

    # Create agents directory if needed
    agents_target.mkdir(parents=True, exist_ok=True)

    # Find agents in each plugin
    plugins_source = get_plugins_dir()
    if not plugins_source.exists():
        return results

    for plugin_dir in plugins_source.iterdir():
        if not plugin_dir.is_dir():
            continue

        agents_source = plugin_dir / "agents"
        if not agents_source.exists():
            continue

        plugin_name = plugin_dir.name

        # Link each agent file
        for agent_file in agents_source.glob("*.md"):
            # Use namespaced name: plugin:agent
            # e.g., spectre/coder.md -> spectre:coder.md in ~/.claude/agents/
            # But also create a direct link for convenience
            agent_name = agent_file.stem
            target_link = agents_target / f"{plugin_name}:{agent_name}.md"

            # Handle existing target
            if target_link.exists() or target_link.is_symlink():
                if not force:
                    if target_link.is_symlink():
                        try:
                            existing_target = target_link.resolve()
                            if existing_target == agent_file.resolve():
                                results.append(SetupResult(
                                    success=True,
                                    message=f"Agent '{plugin_name}:{agent_name}' already linked (skipped)",
                                    path=str(target_link),
                                ))
                                continue
                        except OSError:
                            pass

                    results.append(SetupResult(
                        success=False,
                        message=f"Agent '{plugin_name}:{agent_name}' already exists (use --force)",
                        path=str(target_link),
                    ))
                    continue

                # Force mode: remove existing
                target_link.unlink()

            # Create symlink
            try:
                target_link.symlink_to(agent_file.resolve())
                results.append(SetupResult(
                    success=True,
                    message=f"Agent '{plugin_name}:{agent_name}' linked",
                    path=str(target_link),
                ))
            except OSError as e:
                results.append(SetupResult(
                    success=False,
                    message=f"Failed to link agent '{plugin_name}:{agent_name}': {e}",
                    path=str(target_link),
                ))

    return results


def install_skill(force: bool = False) -> SetupResult:
    """Install the Spectre skill to Claude/Codex skills directory.

    The skill teaches Claude to recognize @agent and /command patterns
    and dispatch to the spectre CLI.

    Args:
        force: If True, overwrite existing skill.

    Returns:
        SetupResult indicating success or failure.
    """
    skill_name = "spectre_agent_tools"

    # Find bundled skill
    skills_source = get_skills_dir()
    source_skill = skills_source / skill_name / "SKILL.md"

    if not source_skill.exists():
        return SetupResult(
            success=False,
            message=f"Bundled skill not found at {source_skill}",
            path=str(source_skill),
        )

    # Install to both Claude and Codex locations
    targets = [
        get_claude_home() / "skills" / skill_name,
        get_codex_home() / "skills" / skill_name,
    ]

    installed = []
    for target_dir in targets:
        target_skill = target_dir / "SKILL.md"

        # Check if exists
        if target_skill.exists() and not force:
            # Check if it's the same
            try:
                if target_skill.read_text() == source_skill.read_text():
                    installed.append(str(target_dir))
                    continue
            except OSError:
                pass

            return SetupResult(
                success=False,
                message=f"Skill already exists at {target_skill} (use --force)",
                path=str(target_skill),
            )

        # Create target directory and copy skill
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_skill, target_skill)
            installed.append(str(target_dir))
        except OSError as e:
            return SetupResult(
                success=False,
                message=f"Failed to install skill: {e}",
                path=str(target_skill),
            )

    return SetupResult(
        success=True,
        message=f"Skill installed to {', '.join(installed)}",
        path=installed[0] if installed else None,
    )


def check_claude_cli() -> bool:
    """Check if claude CLI is available."""
    return shutil.which("claude") is not None


def check_codex_cli() -> bool:
    """Check if codex CLI is available."""
    return shutil.which("codex") is not None


def run_setup(force: bool = False, skip_agents: bool = False, skip_skill: bool = False) -> int:
    """Run the full setup process.

    Args:
        force: Overwrite existing symlinks/files.
        skip_agents: Skip agent symlinking.
        skip_skill: Skip skill installation.

    Returns:
        Exit code (0 for success, 1 for failure).
    """
    import click

    success_count = 0
    failure_count = 0

    # Check for CLI availability
    claude_available = check_claude_cli()
    codex_available = check_codex_cli()

    if not claude_available and not codex_available:
        click.echo("Warning: Neither 'claude' nor 'codex' CLI found in PATH", err=True)
        click.echo("Install Claude Code from: https://claude.ai/code", err=True)
        click.echo()

    # 1. Link plugins
    click.echo("Installing plugins...")
    plugin_results = link_plugins(force=force)
    for result in plugin_results:
        if result.success:
            click.echo(f"  [OK] {result.message}")
            success_count += 1
        else:
            click.echo(f"  [FAIL] {result.message}", err=True)
            failure_count += 1

    # 2. Link agents (optional)
    if not skip_agents:
        click.echo("\nInstalling agents...")
        agent_results = link_agents(force=force)
        if agent_results:
            for result in agent_results:
                if result.success:
                    click.echo(f"  [OK] {result.message}")
                    success_count += 1
                else:
                    click.echo(f"  [FAIL] {result.message}", err=True)
                    failure_count += 1
        else:
            click.echo("  No agents to install")

    # 3. Install skill (optional)
    if not skip_skill:
        click.echo("\nInstalling skill...")
        skill_result = install_skill(force=force)
        if skill_result.success:
            click.echo(f"  [OK] {skill_result.message}")
            success_count += 1
        else:
            click.echo(f"  [FAIL] {skill_result.message}", err=True)
            failure_count += 1

    # Summary
    click.echo()
    if failure_count == 0:
        click.echo(f"Setup complete! ({success_count} items installed)")
        click.echo()
        click.echo("Claude Code can now use @agent and /command patterns.")
        click.echo()
        click.echo("Try these commands:")
        click.echo("  spectre subagent list    # See available agents")
        click.echo("  spectre command list     # See available commands")
        return 0
    else:
        click.echo(f"Setup completed with errors ({success_count} succeeded, {failure_count} failed)")
        return 1

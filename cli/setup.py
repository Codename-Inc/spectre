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
    """Get the plugins directory in the repo (integrations/claude-code)."""
    return get_repo_root() / "integrations" / "claude-code"


def get_skills_dir() -> Path:
    """Get the skills directory in the repo."""
    return get_repo_root() / "skills"


def get_assets_dir() -> Path:
    """Get the assets directory in the repo."""
    return get_repo_root() / "assets"


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
    """Symlink the spectre plugin from repo to ~/.claude/plugins/.

    Args:
        force: If True, remove existing symlinks/dirs before creating new ones.

    Returns:
        List of SetupResult for each plugin.
    """
    results = []
    plugin_dir = get_plugins_dir()  # integrations/claude-code
    plugins_target = get_claude_home() / "plugins"

    # Create plugins directory if needed
    plugins_target.mkdir(parents=True, exist_ok=True)

    # Check plugin exists
    plugin_json = plugin_dir / "plugin.json"
    if not plugin_json.exists():
        results.append(SetupResult(
            success=False,
            message="Plugin not found (missing plugin.json)",
            path=str(plugin_dir),
        ))
        return results

    plugin_name = "spectre"
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
                        return results
                except OSError:
                    pass

            results.append(SetupResult(
                success=False,
                message=f"Plugin '{plugin_name}' already exists (use --force to overwrite)",
                path=str(target_link),
            ))
            return results

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

    return results


def link_agents(force: bool = False) -> list[SetupResult]:
    """Symlink agents from plugin to ~/.claude/agents/.

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

    # Find agents in plugin
    plugin_dir = get_plugins_dir()
    agents_source = plugin_dir / "agents"
    if not agents_source.exists():
        return results

    plugin_name = "spectre"

    # Link each agent file
    for agent_file in agents_source.glob("*.md"):
        # Use namespaced name: plugin:agent
        # e.g., spectre/dev.md -> spectre:dev.md in ~/.claude/agents/
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


# Skills that should only be installed for Codex (not Claude Code)
# Claude Code has native subagent/slash command support, so spectre_agent_tools
# would override that behavior unnecessarily
CODEX_ONLY_SKILLS = {"spectre_agent_tools"}


def install_skills(force: bool = False) -> list[SetupResult]:
    """Install all skills from repo to Claude/Codex skills directories.

    Skills are copied (not symlinked) to ~/.codex/skills/ (and ~/.claude/skills/
    for skills not in CODEX_ONLY_SKILLS).

    Args:
        force: If True, overwrite existing skills.

    Returns:
        List of SetupResult for each skill installed.
    """
    results = []
    skills_source = get_skills_dir()

    if not skills_source.exists():
        results.append(SetupResult(
            success=False,
            message="Skills directory not found in repo",
            path=str(skills_source),
        ))
        return results

    # Find all skills (directories containing SKILL.md)
    for skill_dir in skills_source.iterdir():
        if not skill_dir.is_dir():
            continue

        source_skill = skill_dir / "SKILL.md"
        if not source_skill.exists():
            continue

        skill_name = skill_dir.name

        # Determine install targets based on skill
        # Some skills only go to Codex (Claude Code has native support)
        if skill_name in CODEX_ONLY_SKILLS:
            targets = [get_codex_home() / "skills" / skill_name]
        else:
            targets = [
                get_claude_home() / "skills" / skill_name,
                get_codex_home() / "skills" / skill_name,
            ]

        installed = []
        failed = False

        for target_dir in targets:
            target_skill = target_dir / "SKILL.md"

            # Check if exists
            if target_skill.exists() and not force:
                try:
                    if target_skill.read_text() == source_skill.read_text():
                        installed.append(str(target_dir))
                        continue
                except OSError:
                    pass

                results.append(SetupResult(
                    success=False,
                    message=f"Skill '{skill_name}' already exists (use --force)",
                    path=str(target_skill),
                ))
                failed = True
                break

            # Create target directory and copy entire skill directory
            try:
                if target_dir.exists():
                    shutil.rmtree(target_dir)
                shutil.copytree(skill_dir, target_dir)
                installed.append(str(target_dir))
            except OSError as e:
                results.append(SetupResult(
                    success=False,
                    message=f"Failed to install skill '{skill_name}': {e}",
                    path=str(target_skill),
                ))
                failed = True
                break

        if not failed and installed:
            results.append(SetupResult(
                success=True,
                message=f"Skill '{skill_name}' installed",
                path=installed[0],
            ))

    if not results:
        results.append(SetupResult(
            success=False,
            message="No skills found to install",
            path=str(skills_source),
        ))

    return results


def install_notification_sound(force: bool = False) -> SetupResult:
    """Install the notification sound to ~/Library/Sounds/.

    Only works on macOS. Copies assets/spectre.mp3 to ~/Library/Sounds/spectre.mp3.

    Args:
        force: If True, overwrite existing sound file.

    Returns:
        SetupResult indicating success or failure.
    """
    # Only install on macOS
    if sys.platform != "darwin":
        return SetupResult(
            success=True,
            message="Notification sound skipped (macOS only)",
            path=None,
        )

    source = get_assets_dir() / "spectre.mp3"
    if not source.exists():
        return SetupResult(
            success=False,
            message="Notification sound not found in assets/",
            path=str(source),
        )

    sounds_dir = Path.home() / "Library" / "Sounds"
    sounds_dir.mkdir(parents=True, exist_ok=True)

    target = sounds_dir / "spectre.mp3"

    if target.exists() and not force:
        # Check if it's the same file
        try:
            if target.read_bytes() == source.read_bytes():
                return SetupResult(
                    success=True,
                    message="Notification sound already installed (skipped)",
                    path=str(target),
                )
        except OSError:
            pass

        return SetupResult(
            success=False,
            message="Notification sound already exists (use --force)",
            path=str(target),
        )

    try:
        shutil.copy2(source, target)
        return SetupResult(
            success=True,
            message="Notification sound installed",
            path=str(target),
        )
    except OSError as e:
        return SetupResult(
            success=False,
            message=f"Failed to install notification sound: {e}",
            path=str(target),
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

    # 3. Install skills (optional)
    if not skip_skill:
        click.echo("\nInstalling skills...")
        skill_results = install_skills(force=force)
        if skill_results:
            for result in skill_results:
                if result.success:
                    click.echo(f"  [OK] {result.message}")
                    success_count += 1
                else:
                    click.echo(f"  [FAIL] {result.message}", err=True)
                    failure_count += 1
        else:
            click.echo("  No skills to install")

    # 4. Install notification sound (macOS only)
    click.echo("\nInstalling notification sound...")
    sound_result = install_notification_sound(force=force)
    if sound_result.success:
        click.echo(f"  [OK] {sound_result.message}")
        success_count += 1
    else:
        click.echo(f"  [FAIL] {sound_result.message}", err=True)
        failure_count += 1

    # Summary
    click.echo()
    if failure_count == 0:
        click.echo(f"Setup complete! ({success_count} items installed)")
        click.echo()
        click.echo("Try these commands:")
        click.echo("  spectre subagent list    # See available agents")
        click.echo("  spectre command list     # See available commands")
        return 0
    else:
        click.echo(f"Setup completed with errors ({success_count} succeeded, {failure_count} failed)")
        return 1

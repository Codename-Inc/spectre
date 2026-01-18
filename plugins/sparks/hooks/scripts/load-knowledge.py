#!/usr/bin/env python3
"""
load-knowledge.py

SessionStart hook that injects the apply skill and registry
directly into Claude's context.
"""

import json
import os
import sys
from pathlib import Path


def count_registry_entries(lines: list[str]) -> int:
    """Count registry entries (lines with | that aren't comments)."""
    return sum(
        1 for line in lines
        if line.strip() and '|' in line and not line.startswith('#')
    )


def main():
    """Main entry point for SessionStart hook."""
    project_dir = Path.cwd()

    # Apply skill is in the plugin directory
    plugin_root = Path(os.environ.get('CLAUDE_PLUGIN_ROOT', ''))
    if not plugin_root.exists():
        sys.exit(0)
    apply_skill_path = plugin_root / "skills" / "apply" / "SKILL.md"

    # Registry is in the project directory
    registry_path = project_dir / ".claude" / "skills" / "apply" / "references" / "sparks-registry.toon"

    if not registry_path.exists():
        sys.exit(0)

    # Read registry
    registry_content = registry_path.read_text().strip()
    lines = registry_content.split('\n') if registry_content else []

    # Count entries
    entry_count = count_registry_entries(lines)

    if entry_count == 0:
        sys.exit(0)

    # Read apply skill if it exists, otherwise use minimal fallback
    if apply_skill_path.exists():
        apply_skill_content = apply_skill_path.read_text().strip()
    else:
        apply_skill_content = """# Apply Knowledge

COMPLIANCE: Before searching codebase or dispatching agents, check if any
registered knowledge matches your current task. Load matching skills first
using the Skill tool: `Skill({skill-name})`"""

    # Build context with apply skill and registry
    context = f"""<sparks-knowledge>
This project has {entry_count} captured knowledge skills.

{apply_skill_content}

## Registry

{registry_content}
</sparks-knowledge>"""

    # Visible notice
    visible_notice = f"sparks: {entry_count} knowledge skills available"

    output = {
        "systemMessage": visible_notice,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context
        }
    }

    print(json.dumps(output), flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()

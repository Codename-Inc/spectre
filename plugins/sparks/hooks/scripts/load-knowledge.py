#!/usr/bin/env python3
"""
load-knowledge.py

SessionStart hook that injects the apply skill (with inline registry)
directly into Claude's context.
"""

import json
import re
import sys
from pathlib import Path


def count_registry_entries(content: str) -> int:
    """Count registry entries in the apply skill content."""
    # Find the ## Registry section
    registry_match = re.search(r'## Registry\s*\n(.*)', content, re.DOTALL)
    if not registry_match:
        return 0

    registry_section = registry_match.group(1)
    # Count non-empty lines that look like registry entries (contain |)
    entries = [
        line for line in registry_section.strip().split('\n')
        if line.strip() and '|' in line and not line.startswith('#')
    ]
    return len(entries)


def main():
    """Main entry point for SessionStart hook."""
    project_dir = Path.cwd()

    # Check if project has the apply skill with knowledge
    skill_path = project_dir / ".claude" / "skills" / "apply" / "SKILL.md"

    if not skill_path.exists():
        sys.exit(0)

    # Read apply skill (includes instructions + registry)
    skill_content = skill_path.read_text().strip()

    # Count registry entries
    entry_count = count_registry_entries(skill_content)

    if entry_count == 0:
        sys.exit(0)

    # Build context with full skill content
    context = f"""<project-knowledge>
This project has {entry_count} captured knowledge entries.

{skill_content}

Check triggers against current task and load relevant knowledge from references/.
</project-knowledge>"""

    # Visible notice
    visible_notice = f"sparks: {entry_count} knowledge entries available"

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

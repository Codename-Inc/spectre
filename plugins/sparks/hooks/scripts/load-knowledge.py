#!/usr/bin/env python3
"""
load-knowledge.py

SessionStart hook that injects the apply skill content with embedded registry
directly into Claude's context.

Reads:
- Apply skill from plugin: skills/sparks-apply/SKILL.md
- Registry from project: .claude/skills/sparks-find/references/registry.toon

Combines them by replacing the Registry Location section with actual registry content.
"""

import json
import os
import re
import sys
from pathlib import Path


def count_registry_entries(lines: list[str]) -> int:
    """Count registry entries (lines with | that aren't comments)."""
    return sum(
        1 for line in lines
        if line.strip() and '|' in line and not line.startswith('#')
    )


def strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from markdown content."""
    if content.startswith('---'):
        # Find the closing ---
        end = content.find('---', 3)
        if end != -1:
            return content[end + 3:].strip()
    return content


def main():
    """Main entry point for SessionStart hook."""
    project_dir = Path.cwd()
    plugin_root = Path(os.environ.get('CLAUDE_PLUGIN_ROOT', ''))

    # Paths
    registry_path = project_dir / ".claude" / "skills" / "sparks-find" / "references" / "registry.toon"
    apply_skill_path = plugin_root / "skills" / "sparks-apply" / "SKILL.md"

    if not registry_path.exists():
        sys.exit(0)

    if not apply_skill_path.exists():
        sys.exit(0)

    # Read registry
    registry_content = registry_path.read_text().strip()
    lines = registry_content.split('\n') if registry_content else []

    # Count entries
    entry_count = count_registry_entries(lines)

    if entry_count == 0:
        sys.exit(0)

    # Read apply skill and strip frontmatter
    apply_content = apply_skill_path.read_text()
    apply_content = strip_frontmatter(apply_content)

    # Replace the Registry Location section with embedded registry
    # The apply skill has a section that tells you to read the registry file
    # We replace that with the actual registry content
    registry_section = f"""## Registry

**Format**: `skill-name|category|triggers|description`

```
{registry_content}
```

Each entry corresponds to a skill that can be loaded via `Skill({{skill-name}})`

**Categories:** feature, gotchas, patterns, decisions, procedures, integration, performance, testing, ux, strategy"""

    # Replace the Registry Location section
    apply_content = re.sub(
        r'## Registry Location.*?(?=## Workflow)',
        registry_section + '\n\n',
        apply_content,
        flags=re.DOTALL
    )

    # Build final context
    context = f"<sparks-knowledge>\n{apply_content}\n</sparks-knowledge>"

    # Visible notice
    visible_notice = f"⚡️Sparks: {entry_count} knowledge skills available"

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

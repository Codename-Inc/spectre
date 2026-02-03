#!/usr/bin/env python3
"""
register_spark.py

Registers a spark learning and manages the project-level find skill.

Responsibilities:
1. Create/update registry at .claude/skills/find/references/registry.toon
2. Read find-template.md from plugin
3. Generate .claude/skills/find/SKILL.md with embedded registry

Usage:
    register_spark.py \
        --project-root "/path/to/project" \
        --skill-name "feature-my-feature" \
        --category "feature" \
        --triggers "keyword1, keyword2" \
        --description "Use when doing X or Y"
"""

import argparse
import os
import sys
from pathlib import Path


def get_registry_header() -> list[str]:
    """Return header lines for a new registry."""
    return [
        "# spectrl Knowledge Registry",
        "# Format: skill-name|category|triggers|description",
        ""
    ]


def update_registry(registry_path: Path, entry: str, skill_name: str) -> str:
    """Update registry file with new/updated entry. Returns full registry content."""
    entry_prefix = skill_name + '|'

    if registry_path.exists():
        content = registry_path.read_text()
        lines = content.strip().split('\n') if content.strip() else []
    else:
        lines = get_registry_header()

    # Check if entry already exists (by skill-name at start of line)
    entry_exists = False
    updated_lines = []

    for line in lines:
        if line.startswith(entry_prefix):
            # Update existing entry
            updated_lines.append(entry)
            entry_exists = True
        else:
            updated_lines.append(line)

    if not entry_exists:
        updated_lines.append(entry)

    # Ensure trailing newline
    content = '\n'.join(updated_lines)
    if not content.endswith('\n'):
        content += '\n'

    registry_path.write_text(content)
    return content


def generate_find_skill(find_skill_path: Path, template_path: Path, registry_content: str):
    """Generate the find skill with embedded registry."""
    if not template_path.exists():
        print(f"Warning: Template not found at {template_path}", file=sys.stderr)
        return

    template = template_path.read_text()

    # Replace placeholder with actual registry
    skill_content = template.replace("{{REGISTRY}}", registry_content.strip())

    # Ensure directory exists
    find_skill_path.parent.mkdir(parents=True, exist_ok=True)

    find_skill_path.write_text(skill_content)


def main():
    parser = argparse.ArgumentParser(
        description="Register a spark and update the project find skill"
    )
    parser.add_argument(
        "--project-root",
        required=True,
        help="Root directory of the project"
    )
    parser.add_argument(
        "--skill-name",
        required=True,
        help="Name of the skill (e.g., feature-my-feature)"
    )
    parser.add_argument(
        "--category",
        required=True,
        help="Category of the learning"
    )
    parser.add_argument(
        "--triggers",
        required=True,
        help="Comma-separated trigger keywords"
    )
    parser.add_argument(
        "--description",
        required=True,
        help="Short description starting with 'Use when...'"
    )

    args = parser.parse_args()

    project_root = Path(args.project_root)

    # New paths: registry lives inside spectrl-find skill
    find_dir = project_root / ".claude" / "skills" / "spectrl-find"
    registry_dir = find_dir / "references"
    registry_path = registry_dir / "registry.toon"
    find_skill_path = find_dir / "SKILL.md"

    # Template is in the plugin
    plugin_root = Path(os.environ.get('CLAUDE_PLUGIN_ROOT', ''))
    template_path = plugin_root / "skills" / "spectrl-learn" / "references" / "find-template.md"

    # Ensure directories exist
    registry_dir.mkdir(parents=True, exist_ok=True)

    # Build the registry entry
    entry = f"{args.skill_name}|{args.category}|{args.triggers}|{args.description}"

    # Update registry and get full content
    registry_content = update_registry(registry_path, entry, args.skill_name)

    # Generate find skill with embedded registry
    generate_find_skill(find_skill_path, template_path, registry_content)

    print(f"Registered: {entry}")


if __name__ == "__main__":
    main()

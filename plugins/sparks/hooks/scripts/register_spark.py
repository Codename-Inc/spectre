#!/usr/bin/env python3
"""
register_spark.py

Appends a registry entry to the project's apply skill.
Called by the learn skill after writing a learning file.

Usage:
    register_spark.py \
        --project-root "/path/to/project" \
        --path "references/feature/my-feature.md" \
        --category "feature" \
        --triggers "keyword1, keyword2" \
        --description "Short description"
"""

import argparse
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Append a registry entry to the project's apply skill"
    )
    parser.add_argument(
        "--project-root",
        required=True,
        help="Root directory of the project"
    )
    parser.add_argument(
        "--path",
        required=True,
        help="Relative path to the learning file (e.g., references/feature/my-feature.md)"
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
        help="Short description of the learning"
    )

    args = parser.parse_args()

    project_root = Path(args.project_root)
    skill_path = project_root / ".claude" / "skills" / "apply" / "SKILL.md"

    if not skill_path.exists():
        print(f"Error: Apply skill not found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    # Read current content
    content = skill_path.read_text()

    # Build the registry entry
    entry = f"{args.path}|{args.category}|{args.triggers}|{args.description}"

    # Find the ## Registry section and append
    registry_marker = "## Registry"
    if registry_marker not in content:
        print(f"Error: No '## Registry' section found in {skill_path}", file=sys.stderr)
        sys.exit(1)

    # Check if entry already exists (by path)
    if args.path in content:
        # Update existing entry - find and replace the line
        lines = content.split('\n')
        updated_lines = []
        for line in lines:
            if line.startswith(args.path + '|'):
                updated_lines.append(entry)
            else:
                updated_lines.append(line)
        content = '\n'.join(updated_lines)
    else:
        # Append new entry after ## Registry
        # Add entry on a new line after the registry marker
        content = content.replace(
            registry_marker,
            f"{registry_marker}\n\n{entry}"
        )

    # Write back
    skill_path.write_text(content)
    print(f"Registered: {entry}")


if __name__ == "__main__":
    main()

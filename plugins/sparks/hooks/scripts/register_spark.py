#!/usr/bin/env python3
"""
register_spark.py

Appends a registry entry to the project's sparks registry.
Called by the learn skill after writing a learning file.

Usage:
    register_spark.py \
        --project-root "/path/to/project" \
        --skill-name "feature-my-feature" \
        --category "feature" \
        --triggers "keyword1, keyword2" \
        --description "Use when doing X or Y"
"""

import argparse
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Append a registry entry to the project's sparks registry"
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
    registry_dir = project_root / ".claude" / "skills" / "apply" / "references"
    registry_path = registry_dir / "sparks-registry.toon"

    # Ensure the directory exists
    registry_dir.mkdir(parents=True, exist_ok=True)

    # Build the registry entry
    entry = f"{args.skill_name}|{args.category}|{args.triggers}|{args.description}"

    # Read current content or start fresh
    if registry_path.exists():
        content = registry_path.read_text()
        lines = content.strip().split('\n') if content.strip() else []
    else:
        # Initialize with header
        lines = [
            "# Sparks Knowledge Registry",
            "# Format: skill-name|category|triggers|description",
            ""
        ]

    # Check if entry already exists (by skill-name at start of line)
    entry_prefix = args.skill_name + '|'
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
        # Append new entry
        updated_lines.append(entry)

    # Write back
    content = '\n'.join(updated_lines)
    if not content.endswith('\n'):
        content += '\n'
    registry_path.write_text(content)

    print(f"Registered: {entry}")


if __name__ == "__main__":
    main()

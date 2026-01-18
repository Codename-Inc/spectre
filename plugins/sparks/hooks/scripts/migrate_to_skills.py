#!/usr/bin/env python3
"""
migrate_to_skills.py

Migration script for existing projects using the old sparks format.
Converts from:
  .claude/skills/apply/references/{category}/{slug}.md
To:
  .claude/skills/{category}-{slug}/SKILL.md

Usage:
    migrate_to_skills.py --project-root "/path/to/project" [--dry-run]
"""

import argparse
import re
import sys
from pathlib import Path


def parse_old_registry(skill_content: str) -> list[dict]:
    """Parse registry entries from old apply skill format."""
    # Find ## Registry section
    registry_match = re.search(r'## Registry\s*\n(.*)', skill_content, re.DOTALL)
    if not registry_match:
        return []

    registry_section = registry_match.group(1)
    entries = []

    for line in registry_section.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('#') or '|' not in line:
            continue

        parts = line.split('|')
        if len(parts) >= 4:
            path, category, triggers, description = parts[0], parts[1], parts[2], parts[3]
            # Extract slug from path like "references/feature/my-slug.md"
            path_parts = path.replace('references/', '').replace('.md', '').split('/')
            if len(path_parts) >= 2:
                slug = path_parts[1]
            else:
                slug = path_parts[0]

            entries.append({
                'old_path': path,
                'category': category,
                'slug': slug,
                'triggers': triggers,
                'description': description,
                'skill_name': f"{category}-{slug}"
            })

    return entries


def read_old_learning(project_root: Path, old_path: str) -> str | None:
    """Read content from old learning location."""
    full_path = project_root / ".claude" / "skills" / "apply" / old_path
    if full_path.exists():
        return full_path.read_text()
    return None


def convert_to_skill_format(content: str, entry: dict) -> str:
    """Convert old learning content to new skill format."""
    # Check if content already has frontmatter
    if content.strip().startswith('---'):
        # Already has frontmatter, update it
        # Find end of frontmatter
        end_match = re.search(r'^---\s*$', content[3:], re.MULTILINE)
        if end_match:
            end_pos = end_match.end() + 3
            old_frontmatter = content[:end_pos]
            body = content[end_pos:].strip()

            # Build new frontmatter
            new_frontmatter = f"""---
name: {entry['skill_name']}
description: {entry['description']}
user-invocable: false
---"""
            return f"{new_frontmatter}\n\n{body}"

    # No frontmatter, add it
    frontmatter = f"""---
name: {entry['skill_name']}
description: {entry['description']}
user-invocable: false
---"""
    return f"{frontmatter}\n\n{content}"


def main():
    parser = argparse.ArgumentParser(
        description="Migrate sparks from old format to per-skill format"
    )
    parser.add_argument(
        "--project-root",
        required=True,
        help="Root directory of the project"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )

    args = parser.parse_args()
    project_root = Path(args.project_root)
    dry_run = args.dry_run

    # Check for old apply skill
    old_skill_path = project_root / ".claude" / "skills" / "apply" / "SKILL.md"
    if not old_skill_path.exists():
        print("No old apply skill found at .claude/skills/apply/SKILL.md")
        sys.exit(0)

    # Parse old registry
    old_content = old_skill_path.read_text()
    entries = parse_old_registry(old_content)

    if not entries:
        print("No registry entries found in old apply skill")
        sys.exit(0)

    print(f"Found {len(entries)} entries to migrate")
    if dry_run:
        print("\n[DRY RUN - no changes will be made]\n")

    # Prepare new registry
    new_registry_lines = [
        "# Sparks Knowledge Registry",
        "# Format: skill-name|category|triggers|description",
        ""
    ]

    migrated = 0
    skipped = 0

    for entry in entries:
        skill_name = entry['skill_name']
        old_path = entry['old_path']

        print(f"\nMigrating: {old_path} -> .claude/skills/{skill_name}/SKILL.md")

        # Read old learning content
        old_content = read_old_learning(project_root, old_path)
        if not old_content:
            print(f"  WARNING: Could not read {old_path}, skipping")
            skipped += 1
            continue

        # Convert to skill format
        new_content = convert_to_skill_format(old_content, entry)

        # Create new skill directory and file
        new_skill_dir = project_root / ".claude" / "skills" / skill_name
        new_skill_path = new_skill_dir / "SKILL.md"

        if not dry_run:
            new_skill_dir.mkdir(parents=True, exist_ok=True)
            new_skill_path.write_text(new_content)
            print(f"  Created: .claude/skills/{skill_name}/SKILL.md")
        else:
            print(f"  Would create: .claude/skills/{skill_name}/SKILL.md")

        # Add to new registry
        registry_entry = f"{skill_name}|{entry['category']}|{entry['triggers']}|{entry['description']}"
        new_registry_lines.append(registry_entry)
        migrated += 1

    # Write new registry
    new_registry_dir = project_root / ".claude" / "skills" / "apply" / "references"
    new_registry_path = new_registry_dir / "sparks-registry.toon"

    registry_content = '\n'.join(new_registry_lines) + '\n'

    if not dry_run:
        new_registry_dir.mkdir(parents=True, exist_ok=True)
        new_registry_path.write_text(registry_content)
        print(f"\nCreated new registry: .claude/skills/apply/references/sparks-registry.toon")
    else:
        print(f"\nWould create registry: .claude/skills/apply/references/sparks-registry.toon")

    print(f"\nMigration complete: {migrated} migrated, {skipped} skipped")

    if not dry_run:
        print("\nNext steps:")
        print("1. Verify the migrated skills in .claude/skills/")
        print("2. Update the apply skill to reference the new registry location")
        print("3. Optionally remove old references/ directory after verification")


if __name__ == "__main__":
    main()

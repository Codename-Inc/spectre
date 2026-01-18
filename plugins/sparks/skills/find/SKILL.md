---
name: find
description: Use when user wants to search for existing knowledge, find a specific learning, or discover what knowledge is available.
---

# Find Knowledge

Help users discover and load relevant knowledge from the project's sparks.

## Path Convention

`{{project_root}}` refers to the root of the current project (typically the git repository root or cwd). Knowledge is stored in `{{project_root}}/.claude/skills/apply/`.

## Workflow

### 1. Read the Apply Skill

```
{{project_root}}/.claude/skills/apply/SKILL.md
```

This file contains the registry of all captured knowledge entries under the `## Registry` section.

### 2. Parse the Registry

Registry format: `{path}|{category}|{triggers}|{description}`

Example entries:
```
references/feature/sparks-plugin.md|feature|sparks, /sparks|How sparks works
references/gotchas/hook-timeout.md|gotchas|hook, timeout|Hook timeout pitfall
```

### 3. Search for Matches

Match the user's query against:
- **Triggers**: Keywords that indicate when knowledge is relevant
- **Description**: Short summary of what the knowledge covers
- **Category**: Type of knowledge (feature, gotchas, patterns, etc.)
- **Path**: File path (slug may be descriptive)

### 4. Present Results

**If matches found:**

```
Found {N} relevant entries:

1. **{category}/{slug}** - {description}
   Triggers: {triggers}

2. **{category}/{slug}** - {description}
   Triggers: {triggers}

Which would you like to load? [1/2/all/none]
```

**If no matches:**

```
No entries match "{query}".

Available categories:
- feature ({count} entries)
- gotchas ({count} entries)
- patterns ({count} entries)
...

Would you like to:
1. Search with different keywords
2. List all entries in a category
3. Create new knowledge via /learn
```

### 5. Load Selected Knowledge

For each selected entry, read the referenced file:

```
{{project_root}}/.claude/skills/apply/{path}
```

Present the content to the user.

## Examples

**User**: `/find react patterns`
**Action**: Search registry for entries with "react" or "patterns" in triggers/description
**Result**: Show matching entries, offer to load

**User**: `/find`
**Action**: Show summary of all available knowledge by category
**Result**: Category breakdown with counts

**User**: `/find authentication`
**Action**: Search for auth-related entries
**Result**: If none found, show categories and offer alternatives

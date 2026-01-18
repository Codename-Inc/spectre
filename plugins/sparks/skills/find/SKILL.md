---
name: find
description: Use when user wants to search for existing knowledge, find a specific learning, or discover what knowledge is available.
---

# Find Knowledge

Search and load relevant knowledge from the project's sparks into your context.

## How Sparks Works

This project uses **sparks** to capture durable knowledge across sessions:

- **Registry**: A list of knowledge entries at `.claude/skills/apply/references/sparks-registry.toon`
- **Skills**: Each learning is its own skill at `.claude/skills/{skill-name}/SKILL.md`
- **Triggers**: Keywords that indicate when knowledge is relevant

**Registry format**: `{skill-name}|{category}|{triggers}|{description}`

**Categories**: feature, gotchas, patterns, decisions, procedures, integration, performance, testing, ux, strategy

## Path Convention

`{{project_root}}` refers to the root of the current project (typically the git repository root or cwd).

## Workflow

### 1. Read the Registry

```
{{project_root}}/.claude/skills/apply/references/sparks-registry.toon
```

Parse each line to get skill entries. Lines starting with `#` are comments.

### 2. Search for Matches

Match the user's query against:
- **Skill name**: The `{skill-name}` portion (e.g., `feature-auth-flows`)
- **Triggers**: Keywords that indicate when knowledge is relevant
- **Description**: Short summary of when to use the knowledge
- **Category**: Type of knowledge (feature, gotchas, patterns, etc.)

### 3. Handle Results

**Single match → Load automatically:**

Read the skill immediately:
```
{{project_root}}/.claude/skills/{skill-name}/SKILL.md
```

The knowledge is now in your context. Use it to assist with the current task.

**Multiple matches → Ask user which to load:**

```
Found {N} relevant entries:

1. **{skill-name}** ({category}) - {description}
2. **{skill-name}** ({category}) - {description}

Which would you like to load? [1/2/all]
```

Then read the selected skill(s).

**No matches:**

```
No entries match "{query}".

Available categories:
- feature ({count} entries)
- gotchas ({count} entries)
...

Would you like to search with different keywords, or create new knowledge via /learn?
```

**No query provided (`/find` alone):**

Show summary of all available knowledge by category with counts.

### 4. Apply the Knowledge

After loading knowledge:

- **If there's an active task in the conversation**: Use the knowledge as context to help complete it. The knowledge tells you WHERE to look, WHAT patterns to follow, and WHAT pitfalls to avoid.

- **If this is the start of a thread (no task yet)**: Ask the user what they'd like to do with this knowledge. Example: "I've loaded the authentication feature knowledge. What would you like to know or do?"

## Examples

**User**: `/find hooks` (mid-task)
**Action**: Search registry, find 1 match for `gotchas-hook-timeout`, load `.claude/skills/gotchas-hook-timeout/SKILL.md`, use to help with current work

**User**: `/find sparks` (start of thread)
**Action**: Search, load match, then ask "I've loaded the sparks plugin knowledge. What would you like to know or do?"

**User**: `/find`
**Action**: Show category summary with counts

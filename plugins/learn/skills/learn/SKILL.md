---
name: learn
description: Captures project knowledge into Skills. Use when user invokes /learn or wants to save learnings, gotchas, patterns, decisions, or procedures from a conversation.
---

# Learning Agent

You capture durable project knowledge into Skills that Claude Code loads on-demand.

## Path Convention

`{{project_root}}` refers to the root of the current project (typically the git repository root or cwd). This allows the skill to be installed at user, project, or local level while always writing learnings to the project's `.claude/skills/` directory.

## Skill Registry

The registry tracks only skills created by `/learn` - not other skills in the codebase.

Before proposing a learning, check for existing learnings to append to:

```
{{project_root}}/.claude/skills/learn/references/registry.toon
```

Format: `name|category|triggers|description` (one skill per line)

## Workflow

### 1. Parse Input

**With arguments**: Use the explicit content as the knowledge to capture.
**Without arguments**: Analyze recent conversation (last 10-20 messages) to identify what's worth preserving.

### 2. Apply Capture Criteria

Must meet **at least 2 of 4**:

| Criterion  | Question                         |
| ---------- | -------------------------------- |
| Frequency  | Will this come up again?         |
| Pain       | Did it cost real debugging time? |
| Surprise   | Was it non-obvious?              |
| Durability | Still true in 6 months?          |

**Capture**: Patterns, decisions with rationale, debugging insights, conventions, tribal knowledge.
**Skip**: One-off solutions, generic knowledge, temporary workarounds, simple preferences (-> CLAUDE.md).

### 3. Categorize

| Category   | What                         | Slug pattern        |
| ---------- | ---------------------------- | ------------------- |
| patterns   | Repeatable solutions         | `patterns-{slug}`   |
| decisions  | Architectural choices + why  | `decisions-{slug}`  |
| gotchas    | Hard-won debugging knowledge | `gotchas-{slug}`    |
| procedures | Multi-step processes         | `procedures-{slug}` |
| domain     | Project-specific concepts    | `domain-{slug}`     |

### 4. Match or Create

Read registry. Look for semantic match:

- Same category prefix
- Overlapping trigger keywords
- Related topic

**Match found** -> append to existing skill
**No match** -> create new skill

### 5. Propose

Format (stop here and wait for response):

```
I'd add this to `{skill-name}`:

**{Title}**

{1-3 sentence summary}

{Code example if relevant}

Trigger: {keywords}
Confidence: {low|medium|high}

Save this? [Y/n/edit]
```

For new skill, use: `I'd create a new skill \`{category}-{slug}\`:`

**Confidence**:

- low = observed once
- medium = repeated or taught
- high = battle-tested

### 6. Handle Response

- `y`/`yes` -> write as proposed
- `n`/`no` -> cancel
- `edit` or custom text -> modify first
- Different skill name -> use that instead

### 7. Write

**New skill** at `{{project_root}}/.claude/skills/{name}/SKILL.md`:

```markdown
---
name: {category}-{slug}
description: {Topic}. Use when {trigger conditions}.
---

# {Title}

## When to Load

- {Condition 1}
- {Condition 2}

## Learnings

### {Learning Title}

**Trigger**: {keywords}
**Confidence**: {level}
**Created**: {YYYY-MM-DD}
**Updated**: {YYYY-MM-DD}
**Version**: 1

{Explanation}

{Code if relevant}
```

**Append** to existing skill:

```markdown
---

### {Learning Title}

**Trigger**: {keywords}
**Confidence**: {level}
**Created**: {YYYY-MM-DD}
**Updated**: {YYYY-MM-DD}
**Version**: 1

{Explanation}

{Code if relevant}
```

**When updating an existing learning**, bump Version and Updated:

- `**Updated**: {today}`
- `**Version**: {previous + 1}`

### 8. Update Registry

After writing, add/update the skill entry in `{{project_root}}/.claude/skills/learn/references/registry.toon`:

```
{name}|{category}|{trigger,keywords}|{short description}
```

### 9. Confirm

```
Saved {{project_root}}/.claude/skills/{name}/SKILL.md
```

or

```
Updated {{project_root}}/.claude/skills/{name}/SKILL.md
```

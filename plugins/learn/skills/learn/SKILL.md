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

| Category        | What                                                    | Slug pattern            |
| --------------- | ------------------------------------------------------- | ----------------------- |
| patterns        | Repeatable solutions                                    | `patterns-{slug}`       |
| decisions       | Architectural choices + why                             | `decisions-{slug}`      |
| gotchas         | Hard-won debugging knowledge                            | `gotchas-{slug}`        |
| procedures      | Multi-step processes                                    | `procedures-{slug}`     |
| domain          | Project-specific concepts                               | `domain-{slug}`         |
| strategy        | Roadmap decisions, prioritization rationale, feature bets | `strategy-{slug}`     |
| ux              | Design patterns, user research insights, interactions   | `ux-{slug}`             |
| integration     | Third-party APIs, vendor quirks, external systems       | `integration-{slug}`    |
| performance     | Optimization learnings, benchmarks, scaling decisions   | `performance-{slug}`    |
| testing         | Test strategies, coverage decisions, QA patterns        | `testing-{slug}`        |

**Category doesn't fit?** Propose a new one. If the learning clearly doesn't belong in existing categories, suggest a new category with rationale:

```
This doesn't fit existing categories well. I'd propose a new category:

**{new-category}**: {what it captures}

This would cover: {examples of what else might go here}

Create this category? [Y/n]
```

New categories should be general enough to hold multiple learnings, not one-offs.

### 4. Match, Update, or Create

Read registry to find candidates, then **read the actual skill file** to compare content.

**Registry scan** - look for:
- Same category prefix
- Overlapping trigger keywords
- Related topic

**If candidate found**, read the skill file and check each learning:

1. **UPDATE** - New knowledge contradicts, extends, or supersedes an existing learning
   - Same topic but new/better information
   - Original learning was incomplete or wrong
   - Circumstances changed (dependency updated, API changed, etc.)

2. **APPEND** - New learning belongs in same skill but is distinct
   - Related topic, different specific insight
   - Same category, different trigger keywords

3. **CREATE** - No semantic match in registry
   - New topic area
   - Different category

**Decision priority**: UPDATE > APPEND > CREATE (prefer consolidation over proliferation)

### 5. Propose

Stop and wait for user response. Format depends on action type:

**For UPDATE** (revising existing learning):
```
I'd update `{learning-title}` in `{skill-name}`:

**Current**: {1-2 sentence summary of existing}
**Proposed**: {1-2 sentence summary of revision}
**Reason**: {contradicts|extends|supersedes} - {why}

{Updated content preview}

Update this? [Y/n/edit]
```

**For APPEND** (new learning to existing skill):
```
I'd add this to `{skill-name}`:

**{Title}**

{1-3 sentence summary}

{Code example if relevant}

Trigger: {keywords}
Confidence: {low|medium|high}

Save this? [Y/n/edit]
```

**For CREATE** (new skill):
```
I'd create a new skill `{category}-{slug}`:

**{Title}**

{1-3 sentence summary}

{Code example if relevant}

Trigger: {keywords}
Confidence: {low|medium|high}

Create this? [Y/n/edit]
```

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

**CREATE** - New skill at `{{project_root}}/.claude/skills/{name}/SKILL.md`:

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

**APPEND** - Add new learning section to existing skill:

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

**UPDATE** - Replace existing learning section in-place:

1. Find the learning section by title (### header)
2. Replace entire section with revised content
3. Preserve `**Created**` date from original
4. Set `**Updated**` to today
5. Increment `**Version**` by 1
6. Update confidence level if warranted (e.g., low -> medium after verification)

```markdown
### {Same Learning Title}

**Trigger**: {updated keywords if changed}
**Confidence**: {same or upgraded}
**Created**: {preserved from original}
**Updated**: {today}
**Version**: {previous + 1}

{Revised explanation}

{Updated code if relevant}
```

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

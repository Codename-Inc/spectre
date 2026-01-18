---
name: learn
description: Use when user invokes /learn or wants to save patterns, decisions, gotchas, procedures, or feature knowledge from a conversation.
---

# Learning Agent

You capture durable project knowledge into Skills that Claude Code loads on-demand.

## Path Convention

`{{project_root}}` refers to the root of the current project (typically the git repository root or cwd).

## Storage Structure

Each learning becomes its own skill at the project level:

```
{{project_root}}/.claude/skills/
├── apply/
│   ├── SKILL.md                      # Apply skill (compliance instructions)
│   └── references/
│       └── sparks-registry.toon      # Registry of all learnings
├── {category}-{slug}/                # Learning = Skill
│   └── SKILL.md
├── {category}-{slug}/                # Learning = Skill
│   └── SKILL.md
└── ...
```

## Registry

The registry is stored at `{{project_root}}/.claude/skills/apply/references/sparks-registry.toon`

Before proposing a learning, read the registry to check for existing learnings:

```
{{project_root}}/.claude/skills/apply/references/sparks-registry.toon
```

Format: `{skill-name}|{category}|{triggers}|{description}` (one learning per line)

Example: `feature-sparks-plugin|feature|sparks, /learn, /find|Use when modifying sparks plugin or debugging hooks`

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

**ONLY use these categories.** Do not invent new ones.

| Category        | When to use                                              |
| --------------- | -------------------------------------------------------- |
| feature         | How a feature works end-to-end: design, flows, key files |
| gotchas         | Hard-won debugging knowledge, non-obvious pitfalls       |
| patterns        | Repeatable solutions used across the codebase            |
| decisions       | Architectural choices + rationale                        |
| procedures      | Multi-step processes (deploy, release, etc.)             |
| integration     | Third-party APIs, vendor quirks, external systems        |
| performance     | Optimization learnings, benchmarks, scaling decisions    |
| testing         | Test strategies, coverage decisions, QA patterns         |
| ux              | Design patterns, user research insights, interactions    |
| strategy        | Roadmap decisions, prioritization rationale              |

**Category selection guide:**
- "How does X feature work?" → `feature`
- "Why did we choose X over Y?" → `decisions`
- "X keeps breaking in weird ways" → `gotchas`
- "How do we deploy/release/migrate X?" → `procedures`
- "How do we talk to X API?" → `integration`

**Feature category structure**: Feature learnings are higher-level "dossiers" that help the LLM understand how a feature works end-to-end.

<CRITICAL>
Feature learnings MUST use this structure. Do not propose sparse summaries.

**Minimum requirements for feature learnings:**
- Overview (1-2 sentences)
- User Flows (at least 2 flows)
- Technical Design (architecture + key patterns)
- Key Files (at least 3 files with purposes)
- Common Tasks (at least 2 tasks with how-to)

**Quality gate before proposing**: Your content must answer:
1. What does this feature do for users?
2. How do users interact with it?
3. What's the technical architecture?
4. What files matter and why?
5. What tasks will someone need to do?

If you can't answer all 5, research more before proposing.
</CRITICAL>

### 4. Generate Skill Name

The skill name follows the pattern `{category}-{slug}`:

**Naming rules (CRITICAL for discoverability):**

```
VALID:   feature-auth-flows, gotchas-hook-timeout, patterns-retry-logic
INVALID: auth-flows (no category), feature/auth-flows (no slashes), feature_auth_flows (no underscores)
```

Rules:
- **{category}-{slug}** format: category prefix, then descriptive slug
- **lowercase-kebab-case ONLY**: letters, numbers, hyphens
- **NO special characters**: no colons, slashes, underscores, or parentheses
- **Descriptive slug**: `session-restore`, `handling-timeouts`
- **3-5 words max in slug**: enough to be specific, short enough to scan

### 5. Match, Update, or Create

Read the registry to find candidates, then **read the actual skill file** to compare content.

**Registry scan** - look for:
- Same category prefix
- Overlapping trigger keywords
- Related topic

**If candidate found**, read `{{project_root}}/.claude/skills/{skill-name}/SKILL.md` and check:

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

### 6. Propose

Stop and wait for user response. Format depends on action type:

**For UPDATE** (revising existing learning):
```
I'd update the skill: `{skill-name}`

**Current**: {1-2 sentence summary of existing}
**Proposed**: {1-2 sentence summary of revision}
**Reason**: {contradicts|extends|supersedes} - {why}

{Updated content preview}

Update this? [Y/n/edit]
```

**For APPEND** (adding to existing skill):
```
I'd append to the skill: `{skill-name}`

**{Title}**

{1-3 sentence summary}

{Code example if relevant}

Trigger: {keywords}
Confidence: {low|medium|high}

Save this? [Y/n/edit]
```

**For CREATE** (new skill):
```
I'd create a new skill: `{skill-name}`

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

### 7. Handle Response

- `y`/`yes` -> write as proposed
- `n`/`no` -> cancel
- `edit` or custom text -> modify first
- Different skill name -> use that instead

### 8. Write Learning

**Location**: `{{project_root}}/.claude/skills/{skill-name}/SKILL.md`

**Skill Template**:

```markdown
---
name: {skill-name}
description: Use when {triggering conditions - MUST start with "Use when"}
user-invocable: false
---

# {Title}

**Trigger**: {keywords}
**Confidence**: {level}
**Created**: {YYYY-MM-DD}
**Updated**: {YYYY-MM-DD}
**Version**: 1

{Content - follows category-specific structure}
```

**UPDATE** - Revise existing skill:

1. Preserve `**Created**` date
2. Set `**Updated**` to today
3. Increment `**Version**` by 1
4. Update confidence if warranted (e.g., low → medium after verification)

**APPEND** - For skills with multiple sections, add new section:

```markdown
---

## {New Section Title}

**Trigger**: {keywords}
**Confidence**: {level}
**Created**: {YYYY-MM-DD}
**Updated**: {YYYY-MM-DD}
**Version**: 1

{Explanation}
```

### 9. Register the Learning

After writing the skill file, register it by calling the register script:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/register_spark.py" \
  --project-root "{{project_root}}" \
  --skill-name "{skill-name}" \
  --category "{category}" \
  --triggers "{triggers}" \
  --description "{description}"
```

This adds/updates the entry in the registry at `.claude/skills/apply/references/sparks-registry.toon`.

<CRITICAL>
**Registry description format:**

The `--description` parameter is used to MATCH knowledge to tasks. It must describe WHEN to use the knowledge, not what it contains.

- MUST start with "Use when..."
- Describes triggering CONDITIONS
- Focuses on tasks/scenarios that need this knowledge

**Good descriptions:**
- `"Use when modifying sparks plugin, debugging hooks, or adding knowledge categories"`
- `"Use when auth fails silently or tokens expire unexpectedly"`
- `"Use when adding new API endpoints or modifying request handling"`

**Bad descriptions:**
- `"Sparks plugin architecture - how knowledge capture works"` (describes content, not when to use)
- `"Authentication system overview"` (too vague, no triggering conditions)
- `"API patterns"` (no actionable context)
</CRITICAL>

### 10. Confirm

```
Saved .claude/skills/{skill-name}/SKILL.md
```

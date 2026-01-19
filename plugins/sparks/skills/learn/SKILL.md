---
name: learn
description: Use when user invokes /learn or wants to save patterns, decisions, gotchas, procedures, or feature knowledge from a conversation.
---

# Learning Agent

You capture durable project knowledge into Skills that Claude Code loads on-demand.

## Goal

**Enable someone with zero context to become productive on this topic.**

Every learning you create should allow a new team member (human or AI) to complete a task without asking follow-up questions. If they'd need to dig further to actually DO something, the learning isn't complete.

## Content Principles

These principles apply to ALL categories. Structure varies by category, but depth is universal.

### 1. Lead with the insight
What's the ONE thing they must know? Put it first, not buried. Don't make them read 5 paragraphs to find the key point.

### 2. Orient before details
Why does this exist? What problem does it solve? 2-3 sentences max, then move on. Someone with zero context needs to understand WHY before HOW.

### 3. Make it actionable
Include something they can DO: commands to run, code to copy, steps to follow. Information without action is trivia. If there's nothing actionable, question whether it's worth capturing.

### 4. Show, don't tell
Examples > explanations. A code snippet is worth 100 words of description. Every learning should have at least one concrete example.

### 5. Anticipate mistakes
What will trip them up? Call out pitfalls explicitly. The best learnings prevent errors, not just explain concepts.

### 6. Keep it scannable
Headers, tables, code blocks. Someone should get 80% of the value in 60 seconds of skimming. Dense paragraphs bury knowledge.

## Quality Test

Before proposing ANY learning, ask yourself:

- **"Could someone complete a task using only this?"** - If they'd need to search elsewhere, add more.
- **"Does this tell them HOW, not just WHAT?"** - Facts without application aren't useful.
- **"Would I have saved hours if I'd had this when I started?"** - If the answer is "maybe 10 minutes", it might not be worth capturing.

If any answer is no, add more depth or reconsider capturing it.

## Path Convention

`{{project_root}}` refers to the root of the current project (typically the git repository root or cwd).

## Storage Structure

Each learning becomes its own skill at the project level:

```
{{project_root}}/.claude/skills/
├── sparks-find/
│   ├── SKILL.md                      # Find skill (discovery + embedded registry)
│   └── references/
│       └── registry.toon             # Registry source of truth
├── {category}-{slug}/                # Learning = Skill
│   └── SKILL.md
├── {category}-{slug}/                # Learning = Skill
│   └── SKILL.md
└── ...
```

## Registry

The registry is stored at `{{project_root}}/.claude/skills/sparks-find/references/registry.toon`

Before proposing a learning, read the registry to check for existing learnings:

```
{{project_root}}/.claude/skills/sparks-find/references/registry.toon
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

| Category    | When to use                                              |
| ----------- | -------------------------------------------------------- |
| feature     | How a feature works end-to-end: design, flows, key files |
| gotchas     | Hard-won debugging knowledge, non-obvious pitfalls       |
| patterns    | Repeatable solutions used across the codebase            |
| decisions   | Architectural choices + rationale                        |
| procedures  | Multi-step processes (deploy, release, etc.)             |
| integration | Third-party APIs, vendor quirks, external systems        |
| performance | Optimization learnings, benchmarks, scaling decisions    |
| testing     | Test strategies, coverage decisions, QA patterns         |
| ux          | Design patterns, user research insights, interactions    |
| strategy    | Roadmap decisions, prioritization rationale              |

**Category selection guide:**
- "How does X feature work?" → `feature`
- "Why did we choose X over Y?" → `decisions`
- "X keeps breaking in weird ways" → `gotchas`
- "How do we deploy/release/migrate X?" → `procedures`
- "How do we talk to X API?" → `integration`

### 4. Category-Specific Structure

Each category has expected sections. These are minimums - add more depth as needed to meet the Content Principles.

#### Feature Learnings

Feature learnings are comprehensive "dossiers" that enable someone to work on a feature without prior context.

**Required sections:**
- **What is {Feature}?** - 2-3 sentences explaining what it is and why it exists
- **Why Use It? / Use Cases** - Problem/solution pairs or concrete scenarios (at least 3)
- **User Flows** - How users interact with it (at least 2 flows)
- **Technical Design** - Architecture, key patterns, how it works
- **Key Files** - Files that matter with their purposes (at least 3)
- **Common Tasks** - Things someone will need to do, with how-to (at least 2)

#### Gotcha Learnings

Gotchas capture hard-won debugging knowledge.

**Required sections:**
- **Symptom** - What you observe when you hit this
- **Root Cause** - Why it happens (the non-obvious part)
- **Solution** - How to fix it, with code/commands
- **Prevention** - How to avoid hitting it again (if applicable)

#### Pattern Learnings

Patterns document repeatable solutions.

**Required sections:**
- **Problem** - What situation calls for this pattern
- **Solution** - The pattern itself, with code example
- **When to Use** - Specific scenarios where this applies
- **Trade-offs** - What you give up by using this pattern

#### Decision Learnings

Decisions preserve architectural choices and rationale.

**Required sections:**
- **Context** - What situation prompted this decision
- **Options Considered** - What alternatives existed
- **Decision** - What we chose
- **Rationale** - Why we chose it (the important part)
- **Consequences** - What this decision enables/prevents

#### Procedure Learnings

Procedures document multi-step processes.

**Required sections:**
- **When to Use** - What triggers this procedure
- **Prerequisites** - What you need before starting
- **Steps** - Numbered steps with commands/code
- **Verification** - How to confirm it worked

#### Integration Learnings

Integrations document external system connections.

**Required sections:**
- **What it is** - The external system and why we use it
- **How we connect** - Auth, endpoints, SDK usage
- **Key Operations** - Common tasks with code examples
- **Gotchas** - Vendor-specific quirks and workarounds

#### Other Categories (performance, testing, ux, strategy)

Follow the Content Principles. Include:
- Context (why this matters)
- The knowledge itself (specific, actionable)
- Examples (code, commands, or concrete scenarios)
- Pitfalls (what to watch out for)

### 5. Generate Skill Name

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

### 6. Match, Update, or Create

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

### 7. Propose

Stop and wait for user response. Format depends on action type:

**For UPDATE** (revising existing learning):
```
I'd update the skill: `{skill-name}`

**Current**: {1-2 sentence summary of existing}
**Proposed**: {1-2 sentence summary of revision}
**Reason**: {contradicts|extends|supersedes} - {why}

{Updated content preview - FULL content, not summary}

Update this? [Y/n/edit]
```

**For APPEND** (adding to existing skill):
```
I'd append to the skill: `{skill-name}`

**{Title}**

{Full content following category structure}

Trigger: {keywords}
Confidence: {low|medium|high}

Save this? [Y/n/edit]
```

**For CREATE** (new skill):
```
I'd create a new skill: `{skill-name}`

**{Title}**

{Full content following category structure}

Trigger: {keywords}
Confidence: {low|medium|high}

Create this? [Y/n/edit]
```

**Confidence**:
- low = observed once
- medium = repeated or taught
- high = battle-tested

<CRITICAL>
Always show FULL proposed content, not summaries. The user needs to see exactly what will be saved to approve it. Sparse proposals lead to sparse learnings.
</CRITICAL>

### 8. Handle Response

- `y`/`yes` -> write as proposed
- `n`/`no` -> cancel
- `edit` or custom text -> modify first
- Different skill name -> use that instead

### 9. Write Learning

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

{Content - follows category-specific structure from Section 4}
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

### 10. Register the Learning

After writing the skill file, register it by calling the register script:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/register_spark.py" \
  --project-root "{{project_root}}" \
  --skill-name "{skill-name}" \
  --category "{category}" \
  --triggers "{triggers}" \
  --description "{description}"
```

This updates the registry and regenerates the find skill at `.claude/skills/sparks-find/`.

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

### 11. Confirm

```
Saved .claude/skills/{skill-name}/SKILL.md
```

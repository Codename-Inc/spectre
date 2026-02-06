---
name: spectre-extract
description: Use when user invokes /extract or wants to save patterns, decisions, gotchas, procedures, or feature knowledge from a conversation for later re-use. Look for user requests like "please remember" or "what did we extract from this?".
---

# Extraction Agent

You capture durable project knowledge into Skills that Claude Code loads on-demand.

## Proactive Skill Updates

If you loaded a skill earlier in this session (via `Skill({name})`) and subsequently:
- Discovered the skill was incomplete, outdated, or wrong
- Learned something new that extends the skill's coverage
- Found better patterns, files, or approaches than documented
- Debugged an issue the skill should have warned about

**You should offer to update that skill** before the session ends.

When invoking `/extract` in this case:
1. Reference the skill you loaded: "I'd update the skill: `{skill-name}`"
2. Show what changed: current vs. proposed
3. Follow the UPDATE flow below

This keeps knowledge fresh without requiring users to remember to call `/extract`.

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
├── spectre-recall/
│   ├── SKILL.md                      # Recall skill (discovery + embedded registry)
│   └── references/
│       └── registry.toon             # Registry source of truth
├── {category}-{slug}/                # Learning = Skill
│   └── SKILL.md
├── {category}-{slug}/                # Learning = Skill
│   └── SKILL.md
└── ...
```

## Registry

The registry is stored at `{{project_root}}/.claude/skills/spectre-recall/references/registry.toon`

Before proposing an extraction, read the registry to check for existing extractions:

```
{{project_root}}/.claude/skills/spectre-recall/references/registry.toon
```

Format: `{skill-name}|{category}|{triggers}|{description}` (one extraction per line)

Example: `feature-spectre-plugin|feature|spectre, /extract, /recall|Use when modifying spectre plugin or debugging hooks`

## Workflow

### 1. Parse Input

**With arguments**: Use the explicit topic/content as the knowledge to capture.
**Without arguments**: Analyze recent conversation (last 10-20 messages) to identify what's worth preserving.

### 2. Check Context

Determine if you have sufficient context to create a quality learning.

**Ask yourself**: Can I answer the category's required questions (from Section 6) using:
- The current conversation context?
- My existing knowledge of this codebase from this session?

| Situation | Action |
|-----------|--------|
| Topic was discussed in detail in recent messages | Proceed to Step 4 (Apply Capture Criteria) |
| You already understand the topic from this session | Proceed to Step 4 (Apply Capture Criteria) |
| Topic is unfamiliar / not discussed / you'd be guessing | **Trigger Investigation Mode** (Step 2b) |

<CRITICAL>
Do NOT fabricate knowledge. If you haven't seen how something works in this session, you don't know how it works. Investigation Mode exists precisely for this situation.
</CRITICAL>

### 2b. Investigation Mode

When you lack context, investigate the codebase using subagents before creating a learning.

#### Step 1: Determine Category

Classify the topic into a likely category. If ambiguous, ask the user:
```
I'll investigate "{topic}" in the codebase. Which type of learning?
- feature (how it works end-to-end)
- gotchas (debugging knowledge)
- patterns (repeatable solutions)
- decisions (architectural choices)
- procedures (multi-step processes)
- integration (external systems)
```

#### Step 2: File Discovery

Dispatch an `Explore` agent to map relevant files:

```
Task(subagent_type="Explore", prompt="""
Find all files related to "{topic}" in this codebase:
- Entry points (routes, CLI commands, exports, event handlers)
- Core logic (main implementation files)
- Tests (unit tests, integration tests)
- Config (configuration, environment, constants)
- Docs (READMEs, comments, existing documentation)

Return a file map with:
- File path
- Brief description of what the file does
- Relevance to {topic} (high/medium/low)

Focus on HIGH and MEDIUM relevance files.
""")
```

#### Step 3: Parallel Investigation

Based on the category, dispatch 2-3 `general-purpose` agents in parallel. Each agent gets:
- The file map from Step 2
- 1-2 specific questions to answer
- Instructions to cite specific files and line numbers

**For feature investigations:**
```
Agent 1: "What is {topic} and what problem does it solve? How do users interact with it?
         Cite entry points and user-facing code."

Agent 2: "What is the technical architecture? How do components connect?
         Cite core implementation files."

Agent 3: "What are common tasks someone would need to do? What files would they modify?
         Cite specific functions/files for each task."
```

**For gotcha investigations:**
```
Agent 1: "What are the symptoms when {topic} goes wrong? What errors appear?
         Cite error handling code and logs."

Agent 2: "What is the root cause? What non-obvious behavior exists?
         Cite the specific code that causes confusion."

Agent 3: "What is the solution? How do you fix or work around it?
         Cite the correct approach with code examples."
```

**For other categories:** Generate investigation questions from the category's required sections.

#### Step 4: Synthesize Findings

After subagents return:

1. **Cross-reference** - Connect insights across agents. Look for:
   - Files mentioned by multiple agents (likely important)
   - Flows that span multiple components
   - Patterns that repeat

2. **Resolve conflicts** - If agents contradict each other:
   - Read the disputed code directly to verify
   - Note uncertainty in the learning if unresolved

3. **Identify gaps** - What required sections couldn't be answered?
   - If critical gaps exist, dispatch additional investigation
   - If minor gaps, note them as "needs investigation" in the learning

4. **Structure findings** - Map synthesized knowledge to the category template from Section 6

After synthesis, proceed to Step 7 (Generate Skill Name).

---

### 4. Apply Capture Criteria

Must meet **at least 2 of 4**:

| Criterion  | Question                         |
| ---------- | -------------------------------- |
| Frequency  | Will this come up again?         |
| Pain       | Did it cost real debugging time? |
| Surprise   | Was it non-obvious?              |
| Durability | Still true in 6 months?          |

**Capture**: Patterns, decisions with rationale, debugging insights, conventions, tribal knowledge.
**Skip**: One-off solutions, generic knowledge, temporary workarounds, simple preferences (-> CLAUDE.md).

### 5. Categorize

**ONLY use these categories.** Do not invent new ones.

| Category    | Categorize as this when the knowledge is about...        |
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

### 6. Category-Specific Structure

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

### 7. Generate Skill Name

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

### 8. Match, Update, or Create

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

### 9. Verify Learning

Before proposing, verify the learning is accurate. This is especially important for Investigation Mode learnings.

**Verification checklist:**

1. **Spot-check key claims** (2-3 minimum)
   - Pick specific claims from your draft ("File X handles Y")
   - Read the actual file to confirm
   - If wrong, correct the learning

2. **Verify file purposes**
   - For each file in "Key Files", quick-read to confirm description
   - Remove files that don't match their described purpose

3. **Trace one flow** (for feature learnings)
   - Pick a user flow from the learning
   - Trace through actual code to confirm accuracy
   - Note any discrepancies

**If verification fails:**
- Correct the learning before proposing
- If uncertainty remains, flag it explicitly:
  ```
  > **Note**: The {specific area} couldn't be fully verified.
  > This may need confirmation.
  ```

**Confidence calibration based on verification:**

| Verification Result | Confidence |
|---------------------|------------|
| All claims verified, flows traced | high |
| Most verified, minor gaps | medium |
| Significant uncertainty, partial verification | low |

For Investigation Mode learnings, default to `medium` unless verification is thorough.

### 10. Propose

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

**Confidence** (determined in Step 9 - Verify Learning):
- low = observed once, or Investigation Mode with partial verification
- medium = repeated/taught, or Investigation Mode with solid verification
- high = battle-tested, or fully verified with traced flows

<CRITICAL>
Always show FULL proposed content, not summaries. The user needs to see exactly what will be saved to approve it. Sparse proposals lead to sparse learnings.
</CRITICAL>

### 11. Handle Response

- `y`/`yes` -> write as proposed
- `n`/`no` -> cancel
- `edit` or custom text -> modify first
- Different skill name -> use that instead

### 12. Write Learning

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

{Content - follows category-specific structure from Section 6}
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

### 13. Register the Learning

After writing the skill file, register it by calling the register script:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/register_extraction.py" \
  --project-root "{{project_root}}" \
  --skill-name "{skill-name}" \
  --category "{category}" \
  --triggers "{triggers}" \
  --description "{description}"
```

This updates the registry and regenerates the recall skill at `.claude/skills/spectre-recall/`.

<CRITICAL>
**Registry description format:**

The `--description` parameter is used to MATCH knowledge to tasks. It must describe WHEN to use the knowledge, not what it contains.

- MUST start with "Use when..."
- Describes triggering CONDITIONS
- Focuses on tasks/scenarios that need this knowledge

**Good descriptions:**
- `"Use when modifying spectre plugin, debugging hooks, or adding knowledge categories"`
- `"Use when auth fails silently or tokens expire unexpectedly"`
- `"Use when adding new API endpoints or modifying request handling"`

**Bad descriptions:**
- `"spectre plugin architecture - how knowledge capture works"` (describes content, not when to use)
- `"Authentication system overview"` (too vague, no triggering conditions)
- `"API patterns"` (no actionable context)
</CRITICAL>

### 14. Confirm

```
Saved .claude/skills/{skill-name}/SKILL.md
```

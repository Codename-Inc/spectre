---
name: spectre-apply
description: Use when starting implementation, debugging, or feature work on a project with captured knowledge.
user-invocable: false
---

# Apply Knowledge

## Why This Exists

SPECTRE captures knowledge — patterns, gotchas, decisions, and feature context — across sessions. This knowledge:

- **Prevents repeated mistakes** — gotchas you've already debugged
- **Maintains consistency** — decisions and patterns the team has established
- **Provides instant context** — feature designs, key files, common tasks
- **Makes searching efficient** — know WHERE to look before searching

Without this, you'd waste time rediscovering what's already known or make decisions that contradict established patterns.

## The Rule

<CRITICAL>
If ANY entry's triggers or description match your current task, you MUST load the skill FIRST using the Skill tool.

**Trigger matches are sufficient.** If a trigger word appears in the user's request, load the skill—you don't need the description to also match. Don't reframe the user's request to avoid triggers.

The registry tells you exactly where relevant knowledge is. Loading it first makes you faster and more accurate.

DO NOT search the codebase or dispatch agents BEFORE loading relevant knowledge—even if you think you already have enough context. Partial context from Read results or error messages is not a substitute for the complete picture in the skill.

**When a command explicitly tells you to load a skill, you MUST call the Skill tool to load it.** Do not improvise the workflow based on what you think the skill does. The skill defines a specific workflow with precise steps, output formats, file locations, and integrations. Your improvised version will be wrong — you will miss output paths, registration steps, format requirements, or downstream integrations that only the skill knows about.

**You are also responsible for keeping knowledge current.** After completing significant work — implementing features, fixing bugs, discovering gotchas, making architectural decisions, or changing patterns — you MUST proactively check whether any loaded skills need updating, and whether new skills should be captured.

Do NOT wait for the user to say "/learn" or "update the skill." If you changed how something works, the skill that describes it is now stale. Fix it.
</CRITICAL>

## Path Convention

`{{project_root}}` refers to **the current working directory** (`$PWD`). NEVER traverse up to a parent git root or main worktree. If in a git worktree, `{{project_root}}` is the worktree — not the main repository.

## Registry Location

The registry is stored at `{{project_root}}/.claude/skills/spectre-recall/references/registry.toon`

**Format**: `{skill-name}|{category}|{triggers}|{description}`

Each entry corresponds to a skill that can be loaded via `Skill({skill-name})`

**Categories:** feature, gotchas, patterns, decisions, procedures, integration, performance, testing, ux, strategy

## Workflow

1. **Read the registry** at `{{project_root}}/.claude/skills/spectre-recall/references/registry.toon`
2. **Scan entries** — if ANY trigger word OR the description matches your task, that's a match
3. **For each match**, load the skill:
   ```
   Skill({skill-name})
   ```
4. **Apply the knowledge** — use it to guide your approach, know where to look
5. **Then proceed** — now you can search/implement with context
6. **No matches?** Proceed normally

## Keeping Knowledge Current

Loading skills is half the job. The other half is **leaving them better than you found them**.

### When to Update (Proactively — Don't Wait to Be Asked)

After completing work, ask yourself:

1. **Did I load a skill that's now outdated?** → Update it immediately
2. **Did I discover something capture-worthy?** (gotcha, pattern, decision) → Capture it directly via `Skill(spectre-learn)`
3. **Did I change key files, flows, or architecture?** → Update the relevant feature skill
4. **Did I make a decision with non-obvious rationale?** → Capture it before the session ends

### How to Update

- **Existing skill needs changes**: Read the skill file, Edit it directly, keep the same format
- **New knowledge worth capturing**: Use `Skill(spectre-learn)` to capture it directly — don't ask, just do it
- **Registry entry needs new triggers**: Edit `{{project_root}}/.claude/skills/spectre-recall/references/registry.toon`

### The Standard

When you finish a task that touched areas covered by loaded skills, **the skills should reflect the current state before you move on**. Stale knowledge is worse than no knowledge — it actively misleads future sessions.

## Red Flags

| Thought | Reality |
|---------|---------|
| "Let me search the codebase first" | Knowledge tells you WHERE to search. Load the skill first. |
| "I'll dispatch an agent to find this" | The skill name is in the registry. Just use `Skill({name})`. |
| "I need more context first" | The knowledge IS the context. |
| "This seems simple" | Simple tasks benefit from captured patterns too. |
| "I already have context from a Read/system message" | Partial context is dangerous. The skill has the full picture—including related changes you don't know about yet. |
| "The error/issue is narrow and specific" | Narrow symptoms often stem from broader changes (like namespace renames) that the skill documents. |
| "I can figure this out faster by just searching" | You're trading 1 skill load for multiple speculative searches. The skill tells you exactly where to look. |
| "This is really about X, not Y" | Don't reframe the user's words. If they said "release," match against "release"—not your interpretation of the underlying concern. |
| "I have the exact files I'm editing" | File contents ≠ architectural context. Skills tell you related files, patterns across the codebase, and what you don't know you don't know. |
| "The edit is surgical/mechanical" | Surgical edits in isolation risk inconsistency. Skills reveal if similar changes are needed elsewhere. |
| "I already know how to do this" | You know the concept, not the specific workflow. The skill has precise steps, output formats, file locations, and integrations that differ from what you'd improvise. Load it. |
| "I understand the intent, I don't need the skill" | Understanding intent ≠ knowing the implementation. Skills define WHERE files go, WHAT format to use, and HOW to register outputs. Improvising skips all of this. |
| "The command says to load a skill, but I can handle it directly" | No. When a command tells you to load a skill, that is a mandatory Skill tool call, not a suggestion. The skill IS the workflow. |
| "I'll update the skill later" | Later never comes. Update before moving to the next task. |
| "The user didn't ask me to update knowledge" | You don't need permission. Keeping skills current is part of the job. |
| "The change was small" | Small changes accumulate into large drift. Update now. |

## Real Failure Example

**Task**: Fix "Template not found at skills/learn/references/find-template.md"

**Rationalization**: "I already have register_learning.py in context from a Read result. The error points to the exact path. This is a simple path mismatch—I'll just Glob to find where the template actually is."

**What happened**: Skipped loading `feature-spectre-plugin` skill. Used Glob to find the file. Fixed it.

**What the skill would have provided**: Immediate knowledge that skills were renamed to `spectre-*` namespace, exact file paths in the "Key Files" table, no searching required.

**Cost**: Extra tool calls, wasted tokens, and reinforced bad habits.

## Real Failure Example #2

**Task**: User asks about "npm run release process"

**Rationalization**: "This is really about URL management for updates, not about the release mechanics itself. The procedure-release skill talks about signing and notarization, which isn't what they're asking about."

**What happened**: Skipped loading `procedure-release`. Searched the codebase for update URLs. Missed that the skill documents the entire release infrastructure including how URLs are configured.

**What the skill would have provided**: Complete context on release targets, URL configuration, and how staging vs production channels work.

**The lesson**: Trigger match ("release") was sufficient. The LLM shouldn't have required the description to also match, and shouldn't have reframed the task to avoid the trigger.

## Real Failure Example #3

**Task**: Add commit message to the commit step in `/spectre:clean` and `/spectre:test` commands

**Rationalization**: "I already have the full contents of both clean.md and test.md from Read results. The task is surgical—I know exactly which lines to edit. I don't need broader context to make this specific change."

**What happened**: Skipped loading `feature-spectre-plugin` despite triggers matching ("spectre", "clean", "test"). Made the edit successfully but without understanding the broader SPECTRE workflow architecture.

**What the skill would have provided**:
- Knowledge that similar commit patterns exist in other commands that might need the same change
- Understanding of how commands relate to each other in the workflow
- Commit message conventions used across SPECTRE
- Awareness of the artifact system and how commits are structured

**The lesson**: Having file contents is not the same as having architectural context. The skill tells you what you don't know you don't know—related files, patterns across commands, conventions. A "surgical" edit without skill context risks being inconsistent with the broader system.

## Real Failure Example #4

**Task**: `/spectre:learn how the cxo plugin/system works e2e`

**Rationalization**: "I see the topic ('how the cxo plugin works'). I have memory files and a codebase to analyze. I know what 'learning' means — analyze and capture knowledge. I can do this directly without loading the skill."

**What happened**: Skipped calling `Skill(spectre:spectre-learn)` despite the command explicitly saying "Load the spectre-learn skill and follow its instructions." Instead, the agent launched its own analyst subagent, wrote knowledge to the wrong location (auto memory instead of project skills), used the wrong format, and missed the registry integration entirely.

**What the skill would have provided**: The exact capture workflow — categorize the knowledge, propose it to the user, write the skill file to `.claude/skills/{category}-{slug}/SKILL.md`, register it in the registry, and regenerate the recall skill. None of this was improvised correctly.

**The lesson**: "I understand the intent" is the most dangerous rationalization because it feels true. You DO understand what "learn" means conceptually. But the skill defines a 5-step workflow with specific file paths, a registry format, a recall skill regeneration step, and user confirmation gates. Understanding the concept gave the agent zero of this. When a command says "load skill X," that is not a hint — it is a mandatory `Skill()` tool call.

## Example

User: "How does /spectre work?"

Registry entry: `feature-spectre-plugin|feature|spectre, /spectre, knowledge|Use when modifying spectre plugin or debugging hooks`

Action: `Skill(feature-spectre-plugin)`

Then: Use the key files and patterns from that knowledge to guide your work.

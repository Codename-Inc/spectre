---
name: spectre-apply
description: Use when starting implementation, debugging, or feature work on a project with captured knowledge.
user-invocable: false
---

# Apply Knowledge

## Why This Exists

SPECTRE captures knowledge — patterns, gotchas, decisions, and feature context — across sessions. Loading it first prevents repeated mistakes, maintains consistency, and tells you WHERE to look before searching.

## The Rule

<CRITICAL>
If ANY skill's triggers or description match your current task, you MUST load the skill FIRST using the Skill tool.

**Trigger matches are sufficient.** If a trigger word appears in the user's request, load the skill — you don't need the description to also match. Don't reframe the user's request to avoid triggers.

DO NOT search the codebase or dispatch agents BEFORE loading relevant knowledge — even if you think you already have enough context. Partial context from Read results or error messages is not a substitute for the complete picture in the skill.

**When a command explicitly tells you to load a skill, you MUST call the Skill tool to load it.** Do not improvise the workflow based on what you think the skill does. The skill defines a specific workflow with precise steps, output formats, file locations, and integrations. Your improvised version will be wrong.

**You are also responsible for keeping knowledge current.** After completing significant work, proactively check whether loaded skills need updating and whether new skills should be captured via `Skill(spectre-learn)`. Do NOT wait for the user to ask.
</CRITICAL>

## Path Convention

`{{project_root}}` refers to **the current working directory** (`$PWD`). NEVER traverse up to a parent git root or main worktree. If in a git worktree, `{{project_root}}` is the worktree — not the main repository.

## How to Find Skills

Your available skills are listed in context at the start of every session. Each skill's description includes `TRIGGER when:` keywords.

Scan the skill list for trigger matches against your current task. Load matches with `Skill({skill-name})`.

The registry at `{{project_root}}/.claude/skills/spectre-recall/references/registry.toon` remains the source of truth for registration, but you do NOT need to read it for discovery — the skill list already has what you need.

## Workflow

1. **Scan available skills** in your context — match trigger keywords or descriptions to your task
2. **For each match**, load the skill: `Skill({skill-name})`
3. **Apply the knowledge** — use it to guide your approach, know where to look
4. **Then proceed** — now you can search/implement with context
5. **No matches?** Proceed normally

## Keeping Knowledge Current

After completing work, check:

1. **Loaded skill now outdated?** → Update it immediately
2. **Discovered something capture-worthy?** (gotcha, pattern, decision) → Capture via `Skill(spectre-learn)`
3. **Changed key files, flows, or architecture?** → Update the relevant feature skill
4. **Made a decision with non-obvious rationale?** → Capture before the session ends

Stale knowledge is worse than no knowledge — it actively misleads future sessions. Update skills before moving to the next task.

## Red Flags

| Thought | Reality |
|---------|---------|
| "Let me search the codebase first" | Knowledge tells you WHERE to search. Load the skill first. |
| "I already have context from a Read/system message" | Partial context is dangerous. The skill has the full picture — including related changes you don't know about yet. |
| "This seems simple / the edit is surgical" | Simple tasks benefit from captured patterns. Skills reveal if similar changes are needed elsewhere. |
| "I understand the intent, I don't need the skill" | Understanding intent ≠ knowing the implementation. Skills define WHERE files go, WHAT format to use, and HOW to register outputs. |
| "The command says to load a skill, but I can handle it directly" | When a command tells you to load a skill, that is a mandatory Skill tool call, not a suggestion. |
| "I'll update the skill later" | Later never comes. Update before moving to the next task. |

## Failure Pattern

**Common scenario**: Task matches triggers (e.g., "spectre", "release", "learn"), but agent rationalizes skipping the skill load.

**Rationalizations that fail**: "I already have the file contents", "The error points to the exact path", "This is really about X not Y", "I can figure this out faster by searching."

**What skills provide that context doesn't**: Architectural relationships, related files you don't know about, exact workflows with registration steps, correct output paths. Partial context from Read results is not a substitute.

**The cost**: Extra tool calls, wrong output locations, missed registration steps, inconsistent changes.

## Example

User: "How does /spectre work?"

Skill list shows: `feature-spectre-plugin` with trigger `spectre`

Action: `Skill(feature-spectre-plugin)`

Then: Use the key files and patterns from that knowledge to guide your work.

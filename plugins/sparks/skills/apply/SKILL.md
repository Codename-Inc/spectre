---
name: apply
description: Use when starting implementation, debugging, or feature work on a project with captured knowledge.
user-invocable: false
---

# Apply Knowledge

## Why This Exists

This project has captured knowledge — patterns, gotchas, decisions, and feature context — from previous sessions. This knowledge:

- **Prevents repeated mistakes** — gotchas you've already debugged
- **Maintains consistency** — decisions and patterns the team has established
- **Provides instant context** — feature designs, key files, common tasks
- **Makes searching efficient** — know WHERE to look before searching

Without this, you'd waste time rediscovering what's already known or make decisions that contradict established patterns.

## The Rule

<CRITICAL>
If ANY entry's triggers or description match your current task, you MUST Read the skill FIRST.

The registry tells you exactly where relevant knowledge is. Reading it first makes you faster and more accurate.

DO NOT search the codebase or dispatch agents BEFORE loading relevant knowledge. The knowledge skills tell you WHERE to search and make you more token-efficient.
</CRITICAL>

## Registry Location

The registry is stored at `{{project_root}}/.claude/skills/apply/references/sparks-registry.toon`

**Format**: `{skill-name}|{category}|{triggers}|{description}`

Each entry corresponds to a skill at `{{project_root}}/.claude/skills/{skill-name}/SKILL.md`

**Categories:** feature, gotchas, patterns, decisions, procedures, integration, performance, testing, ux, strategy

## Workflow

1. **Read the registry** at `{{project_root}}/.claude/skills/apply/references/sparks-registry.toon`
2. **Scan entries** — match triggers AND description against current task
3. **For each match**, Read:
   ```
   {{project_root}}/.claude/skills/{skill-name}/SKILL.md
   ```
4. **Apply the knowledge** — use it to guide your approach, know where to look
5. **Then proceed** — now you can search/implement with context
6. **No matches?** Proceed normally

## Red Flags

| Thought | Reality |
|---------|---------|
| "Let me search the codebase first" | Knowledge tells you WHERE to search. Read it first. |
| "I'll dispatch an agent to find this" | The path is in the registry. Just Read. |
| "I need more context first" | The knowledge IS the context. |
| "This seems simple" | Simple tasks benefit from captured patterns too. |

## Example

User: "How does /sparks work?"

Registry entry: `feature-sparks-plugin|feature|sparks, /sparks, knowledge|Use when modifying sparks plugin or debugging hooks`

Action: `Read .claude/skills/feature-sparks-plugin/SKILL.md`

Then: Use the key files and patterns from that knowledge to guide your work.

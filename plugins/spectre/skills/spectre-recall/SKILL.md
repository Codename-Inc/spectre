---
name: spectre-recall
description: "👻 | Search Project Knowledge"
user-invocable: true
---

# recall

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# /recall - Search Project Knowledge

Read the project knowledge recall skill directly, then follow its instructions for the query below:

- Claude Code path: `{{project_root}}/.claude/skills/spectre-recall/SKILL.md`
- Codex path: `{{project_root}}/.agents/skills/spectre-recall/SKILL.md`

If neither file exists, report that no project knowledge registry exists yet and suggest `/spectre:learn` after the current work produces something worth preserving.

**Search query**: $ARGUMENTS

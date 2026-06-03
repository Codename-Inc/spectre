---
name: "caspar-recall"
description: "Use when the user wants to search the project's captured knowledge, recall a specific past learning, or discover what learnings already exist (e.g. \"/caspar:recall\", \"what do we know about X\", \"is there a learning for Y\"). Do NOT trigger to capture or write new knowledge — that is /caspar:learn."
user-invocable: true
---

# recall — Search Project Knowledge

## Purpose
Find and load the project's captured caspar learnings relevant to a query, so the answer is grounded in prior knowledge instead of re-derived.

## Inputs
- `$ARGUMENTS` — the search query. Empty = list everything by category.
- The knowledge registry, read just-in-time (not inlined here):
  - `{{project_root}}/.claude/skills/caspar-recall/SKILL.md` (Claude Code), or
  - `{{project_root}}/.agents/skills/caspar-recall/SKILL.md` (Codex).
  Each registry row is `skill-name|category|triggers|description`. Live trigger keywords also sit in each loaded skill's frontmatter description.

## Working Set
Read-only: the registry file above and the frontmatter descriptions already in context. No writes.

## Outputs + DONE
A grounded answer, plus the matching knowledge loaded into context. DONE when:
- The query was matched against registry triggers/descriptions AND in-context skill descriptions; and
- The match-count rule below was applied; and
- On any match, the chosen learning(s) were loaded via `Skill({skill-name})` before answering.

## Method / guardrails
- Match the query against registry `triggers` + `description` and the trigger keywords in loaded skills' frontmatter.
- Decision rule (load-bearing — apply exactly):
  - **Single match** → load it automatically: `Skill({skill-name})`.
  - **Multiple matches** → list the options and ask the user which to load (do not auto-load several).
  - **No match** → say so and suggest `/caspar:learn` to capture it.
- Empty query → list all available knowledge grouped by category; do not load.
- If no registry file exists at either path → report that no project knowledge registry exists yet and suggest `/caspar:learn` once the current work yields something worth preserving. Do not fabricate entries.

## Handoff
Return the loaded knowledge and a 1–2 line note on what was applied, in-thread. Persist nothing.

## Escalate-If
- Multiple plausible matches and the user's intent is ambiguous → ask which to load.
- Query implies knowledge that should exist but the registry lacks it → surface the gap and point to `/caspar:learn`.

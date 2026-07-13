---
name: "spectre-apply"
description: "Use when starting implementation, debugging, or feature work on a project with captured knowledge."
user-invocable: false
---

# Project Knowledge

This project captures hard-won knowledge (features, gotchas, procedures, decisions) as loadable skills. The registry below is the live index — it is the complete list, so you never need to read the registry file to discover what exists.

## Registry

Format: `name|category|triggers|description`

{{REGISTRY}}

## The Rule

If ANY entry's triggers or description match the current task, call `Skill({name})` FIRST — before searching the codebase, reading files, or dispatching agents. One matching trigger word in the request is sufficient; don't reframe the request to avoid a match. No match → proceed normally.

This holds even when it feels unnecessary, because these exact rationalizations precede real failures:

- **"This is simple / a one-liner"** — simple edits are where skills catch the second file you didn't know also needed changing.
- **"I can answer from CLAUDE.md / AGENTS.md / memory / the pasted error"** — those are summaries and snapshots. The skill holds current file paths, exact workflows, and registration steps. Context you already have is not the skill.
- **"A command told me to load a skill, but I can handle it directly"** — a commanded load is a mandatory Skill call, not a suggestion.

The cost of skipping: wrong output locations, missed registration steps, inconsistent changes, and re-debugging what was already solved.

## After Significant Work

Finishing a real piece of work — a resolved bug, an established procedure, a non-obvious decision, a change to architecture or key flows — is the moment knowledge is captured or lost. Before you hand back:

1. **Update** any loaded skill that your work just made stale. Do it now, not "later" — stale knowledge actively misleads future sessions.
2. **Offer** to capture what's new via `Skill(spectre-learn)`, naming what you'd capture. Don't wait to be asked; the user cannot see what you learned.

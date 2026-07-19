---
name: spectre-recall
description: Use when user wants to search for existing knowledge, recall a specific learning, or discover what knowledge is available.
user-invocable: true
---

# Recall Knowledge

Search and load relevant knowledge from the project's Spectre learnings into your context.

## Registry

# Spectre Knowledge Registry
# Format: skill-name|category|triggers|description

feature-codex-spectre-implementation|feature|codex, spectre, codex install, project skills, registry, spectre-learn, spectre-recall, config.toml, doctor|Use when modifying the Codex SPECTRE install flow, project skill syncing, learn/recall registry files, or Codex-specific runtime files.
release|workflow|release, version bump, changelog, github release, npm publish, codex sync, local codex install|Run the Spectre release workflow, including version bumps, Codex sync, local Codex install verification, GitHub release, and npm publish.

## How to Use

1. **Scan available skills** in your context — trigger keywords are visible in each skill's description
2. **Load matching skills**: `Skill({skill-name})`
3. **Apply knowledge** — use it to guide your approach

The registry above is a fallback reference. Discovery relies on each installed skill's frontmatter description.

## Search Commands

- `/recall {query}` — search registry for matches
- `/recall` — show all available knowledge by category

## Workflow

**Single match** → Load automatically via `Skill({skill-name})`

**Multiple matches** → List options, ask user which to load

**No matches** → Suggest `/learn` to capture new knowledge

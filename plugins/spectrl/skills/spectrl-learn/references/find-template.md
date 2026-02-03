---
name: spectrl-find
description: Use when user wants to search for existing knowledge, find a specific learning, or discover what knowledge is available.
---

# Find Knowledge

Search and load relevant knowledge from the project's spectrl into your context.

## Registry

{{REGISTRY}}

## How to Use

1. **Scan registry above** — match triggers/description against your current task
2. **Load matching skills**: `Skill({skill-name})`
3. **Apply knowledge** — use it to guide your approach

## Search Commands

- `/find {query}` — search registry for matches
- `/find` — show all available knowledge by category

## Workflow

**Single match** → Load automatically via `Skill({skill-name})`

**Multiple matches** → List options, ask user which to load

**No matches** → Suggest `/learn` to capture new knowledge

---
name: spectre-recall
description: Use when user wants to search for existing knowledge, recall a specific learning, or discover what knowledge is available.
---

# Recall Knowledge

Search and load relevant knowledge from the project's spectre learnings into your context.

## Registry

{{REGISTRY}}

## How to Use

1. **Scan registry above** — match triggers/description against your current task
2. **Load matching skills**: `Skill({skill-name})`
3. **Apply knowledge** — use it to guide your approach

## Search Commands

- `/recall {query}` — search registry for matches
- `/recall` — show all available knowledge by category

## Workflow

**Single match** → Load automatically via `Skill({skill-name})`

**Multiple matches** → List options, ask user which to load

**No matches** → Suggest `/learn` to capture new knowledge

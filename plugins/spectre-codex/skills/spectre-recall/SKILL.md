---
name: "spectre-recall"
description: "Use when the user wants to search the project's captured knowledge, recall a specific past learning, or discover what learnings already exist (e.g. \"spectre-recall\", \"what do we know about X\", \"is there a learning for Y\"). Do NOT trigger to capture or write new knowledge — that is spectre-learn."
user-invocable: true
---

# recall — Search Project Knowledge

## Purpose
Find and read the project's canonical knowledge relevant to a query, so the answer is grounded in prior knowledge instead of re-derived.

## Inputs
- `$ARGUMENTS` — the search query. Empty = list everything by category.
- Project root = `${CLAUDE_PROJECT_DIR:-$PWD}`. Do not traverse to a Git root or main worktree.
- Canonical results from the target-independent lexical CLI.

## Working Set
Read-only: JSON search results and the selected result's canonical `recordPath`. Persist nothing.

## Outputs + DONE
A grounded answer based on the selected canonical record. DONE when the lexical search completed, the match-count rule was applied, and every chosen result was read directly from its returned `recordPath` before answering.

## Method / guardrails
- Run:
  ```bash
  project_root="${CLAUDE_PROJECT_DIR:-$PWD}"
  spectre knowledge search "$ARGUMENTS" \
    --project-dir "$project_root" \
    --json
  ```
- Trust only successful JSON output. Results already contain the deterministic lexical ranking, active-state filtering, description, triggers, category, and canonical `recordPath`. Do not invent or semantically rerank entries.
- Decision rule (load-bearing — apply exactly):
  - **Single match** → read the selected result's `recordPath`, then apply that content.
  - **Multiple matches** → list ID, category, triggers, and description in returned order; ask which one to read. After selection, read the selected `recordPath`.
  - **No match** → say so and suggest `spectre-learn` to capture it.
- **Empty query** → list all results grouped by category; do not read a record until the user selects one.
- A missing store is a successful empty result, not an error. Report that no canonical project knowledge exists yet and suggest `spectre-learn` once the current work yields something durable.
- Never write, register, edit, or change lifecycle state during recall.

## Handoff
Return the grounded answer and a 1–2 line note naming the record that was read. Persist nothing.

## Escalate-If
- Multiple plausible matches and the user's intent is ambiguous → ask which to load.
- Search fails or returns an invalid/unreadable `recordPath` → surface the exact error; do not fabricate knowledge.
- Query implies knowledge that should exist but search returns none → surface the gap and point to `spectre-learn`.

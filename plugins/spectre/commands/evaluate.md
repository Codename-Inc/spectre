---
description: "\ud83d\udc7b | Architecture review + knowledge capture"
---

# evaluate: Review architecture and capture learnings

## Description
- **What** — Meta command that runs an architecture review in the background while you capture learnings from the session
- **Outcome** — Architecture review report + captured knowledge for future sessions

## ARGUMENTS

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions

This command runs two activities in parallel:

1. **Architecture Review** — dispatched as a background Opus 4.6 subagent via `/spectre:architecture_review`
2. **Learn** — run directly by loading the `spectre-learn` skill

## Step (1/2) - Dispatch Architecture Review

- **Action** — DispatchReview: Launch architecture review as a background subagent
  - Use the Task tool with `subagent_type="general-purpose"`, `model="opus"`, `run_in_background=true`
  - The subagent prompt should include the full architecture_review command instructions
  - Pass ARGUMENTS to the subagent as the review scope (feature description, paths, context)
  - **If** ARGUMENTS is empty: instruct the subagent to infer the review scope from recent work in the repository (e.g., git diff, recent commits)
  - Note the background task ID so the user can check results later

- **Output**: Inform the user that the architecture review is running in the background and they'll be notified when it completes.

## Step (2/2) - Capture Learnings

- **Action** — Learn: Load the spectre-learn skill and follow its workflow
  - Load skill: `Skill(spectre-learn)`
  - **If** ARGUMENTS is provided: use it as the learning topic
  - **If** ARGUMENTS is empty: the skill will analyze recent conversation to identify what's worth capturing
  - Follow the full learning workflow from the skill (categorize, propose, write, register)

## Completion

When the learn flow completes:
1. Check if the background architecture review has finished (read the output file)
2. **If finished**: Present the architecture review report to the user
3. **If still running**: Let the user know they can check back later or continue working

- **Action** — RenderFooter: Use @skill-spectre:spectre-next-steps for Next Steps

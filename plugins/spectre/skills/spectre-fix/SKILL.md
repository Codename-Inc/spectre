---
name: spectre-fix
description: Investigate bugs & implement fixes - primary agent
user-invocable: true
---

# spectre-fix

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# fix: Analyze bug and recommend fix

## Description

- **What** — Hypothesize root causes, investigate in parallel, recommend fix with logging
- **Outcome** — Root cause identified, solution recommendation with `[🪳 TEMP]` debug logging

## Variables

### Dynamic Variables

- `bug_report`: Error details, repro steps, context — (via ARGUMENTS: $ARGUMENTS)

### Static Variables

- `debug_prefix`: \[🪳 TEMP {TOPIC}\]

## ARGUMENTS Input

<ARGUMENTS> $ARGUMENTS </ARGUMENTS>

## Step (1/5) - Gather Bug Context

- **Action** — CheckInput: Verify bug report provided
  - **If**: ARGUMENTS empty
  - **Then**: Ask user for error message, repro steps, and relevant context
  - **Else**: Use ARGUMENTS as bug report; request missing details if needed
- **Wait** — Bug report with error details and repro steps

## Step (2/5) - Generate Hypotheses

- **Action** — Brainstorm: Reflect on 5-7 possible sources of the problem
- **Action** — Prioritize: Distill to 1-2 most likely root causes
  - Consider: the primary data flow for this component/module, recent changes, error patterns, stack traces, affected code paths

## Step (3/5) - Investigate in Parallel

- **Action** — DispatchAgents: Spawn parallel `@spectre:analyst` subagents to investigate top hypotheses
  - Each agent gets one hypothesis to trace through codebase
  - Agents search for: relevant code, recent commits, similar patterns, edge cases

## Step (4/5) - Summarize Findings

- **Action** — Synthesize: Summarize findings and solution recommendation
  - Include: root cause, affected files, proposed fix approach
  - **Rule**: Solution must include `{debug_prefix}` logging to verify fix and gather data if fix fails
- **Action** — HoldForApproval: Present analysis; do NOT write code yet
  - **Wait** — User approval before implementing fix

## Step (5/5) - Execute

- **Action** — Load TDD Skill: Load @spectre:spectre-tdd SKILL to use TDD
- **Action** — Execute Fix: Add Logs and Implement Fix using TDD
- **Action** — When finished, summarize what you delivered, including providing specific steps for the user to validate.

## Next Steps

Use the spectre-guide Skills and render the Next Steps Footer per the skill guidance

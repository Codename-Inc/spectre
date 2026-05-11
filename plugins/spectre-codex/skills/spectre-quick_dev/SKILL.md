---
name: "spectre-quick_dev"
description: "👻 | Quickly scope, research, & plan s/m tasks - primary agent"
user-invocable: true
---

# spectre-quick_dev

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.


# quick_dev: Scope → Research → Plan for Small/Medium Tasks

## Description
- **What** — Lightweight workflow for bug fixes and small features: confirm scope, research via parallel agents, create implementation plan
- **Outcome** — Validated scope, research synthesis, `quick_task_plan.md` with parent/sub-task structure

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1 - Gather Context

- **Action** — ImmediateReply: Respond before running tools
  - **If** ARGUMENTS has task context → proceed to Step 2
  - **Else** → ask: "What are you trying to build or fix? Share any docs or context."
  - **CRITICAL**: No tool calls here. No technical questions — research answers those.
- **Wait** — Only if ARGUMENTS empty

- **Action** — ReadFiles: Read any files mentioned by user completely (no limit/offset)

## Step 2 - Confirm Scope (Functional Only)

**Scope is about WHAT we're building, not HOW.** Technical approach comes from research.

**DO NOT ask about**: implementation approach or technical decisions — research answers those.

- **Action** — PresentScope:
  > **📋 Scope Confirmation**
  >
  > **Objective**: {functional outcome}
  >
  > **✅ In Scope**: {what the feature does — behaviors, not implementation}
  >
  > **❌ Out of Scope**: {what we're NOT building}
  >
  > **UX Assumptions**: {how you imagine the user flow working}
  >
  > **Constraints**: {user-provided only}
  >
  > Any items to move between IN/OUT? Clarify UX flow? Reply with changes or 'Confirmed'.

- **Wait** — User confirms or provides changes (apply and proceed)

## Step 3 - Research

- **Action** — SpawnAgents: Launch parallel research agents
  - `@finder` — find WHERE files/components live
  - `@analyst` — understand HOW code works
  - `@patterns` — find similar implementations
  - `@web-research` — external docs (only if user asks)
  - **Wait** for ALL agents to complete

- **Action** — Synthesize: Compile findings with file paths, patterns, architectural decisions

## Step 4 - Clarify Ambiguities

- **Action** — AskClarifyingQuestions: Use AskUserQuestion tool for 2-4 questions
  - **Only ask** what research revealed needs user decision: UX preferences, behavioral trade-offs
  - For multi-option questions: include Pros/Cons/Trade-offs
  - **Never ask** scope questions (settled in Step 2) or technical questions answerable by code

## Step 5 - Create Plan

- **Action** — DetermineOutputDir:
  - `OUT_DIR=docs/tasks/{branch_name}` (or user-specified)
  - `mkdir -p "${OUT_DIR}/specs"`

- **Action** — GeneratePlan: Create `{OUT_DIR}/specs/quick_task_plan.md` (use scoped name if exists)

  **Plan Structure**:
  1. Agreed Scope (Objective, In/Out of Scope, Constraints)
  2. Research Summary (key codebase findings)
  3. Approach Summary (strategy, integration points)
  4. Implementation Tasks (see format below)
  5. Success Criteria

  **Task Format**: `## Phase` → `### [1.1] Parent Task` → `- [ ] **1.1.1** Sub-task` → `- [ ] Criterion`

  **Sub-task guidance**:
  - Start with action verb, use technical terms, name files/components
  - Include: patterns, integration points, constraints
  - Exclude: code snippets, line-by-line steps
  - 2-3 acceptance criteria per sub-task

  **Bounds**: ~3 phases, ~8 parent tasks max. If exceeds → suggest `spectre-create_tasks`

- **Action** — ValidateCoverage: Verify all in-scope items have tasks; no out-of-scope tasks added

## Step 6 - Document & Handoff

- **Action** — PresentSummary:
  > **Task Plan Created**: `{path}`
  > ✅ Scope | ✅ Research | ✅ Plan

- **Action** — RenderFooter: Use `Skill(spectre-guide)` skill for Next Steps

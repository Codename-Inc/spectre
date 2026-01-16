---
description: 👻 | Unified planning entry point - researches, assesses complexity, routes to workflow - primary agent
---

# plan: Intelligent Planning Router

## Description
- **What** — Research codebase, assess complexity, route to appropriate workflow (direct tasks or plan-first)
- **Outcome** — Detailed task breakdown ready for execution

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions
- Research before routing; present architectural options for user buy-in
- Route based on hard-stops and clarity, not point-scoring
- Never overwrite existing `tasks.md` or `plan.md` — use scoped names

## Step 1 - Research Codebase

- **Action** — DetermineOutputDir:
  - `OUT_DIR=docs/active_tasks/{branch_name}` (or user-specified)
  - `mkdir -p "${OUT_DIR}"`

- **Action** — CheckExistingResearch: Read `{OUT_DIR}/task_context.md` for "## Technical Research"
  - **If** comprehensive → use existing, skip research
  - **Else** → proceed

- **Action** — AutomatedResearch: Spawn parallel agents
  - `@codebase-locator`, `@codebase-analyzer`, `@codebase-pattern-finder`
  - **Wait** for all; read identified files

- **Action** — SaveResearch: Update `{OUT_DIR}/task_context.md` with Architecture Patterns, Dependencies, Implementation Approaches, Impact Summary

## Step 2 - Present Architectural Options

- **Action** — PresentOptions: 2-4 strategies (simplest to most robust)
  - Each: core approach, trade-offs, when it makes sense
- **Wait** — User selects strategy
- **Action** — UpdateContext: Document selection in task_context.md

## Step 3 - Assess Complexity

Use research findings from Step 1 to determine appropriate planning depth.

- **Action** — AssessFromResearch: Score complexity signals from research:

  | Signal | Source | Assessment |
  |--------|--------|------------|
  | Files impacted | @codebase-locator | 1-3 files = Low, 4-8 = Med, 9+ = High |
  | Pattern match | @codebase-pattern-finder | Clear existing pattern = Low, Adapt pattern = Med, New pattern = High |
  | Components crossed | @codebase-analyzer | 1 component = Low, 2-3 = Med, 4+ = High |
  | Data model changes | Research findings | None = Low, Modify existing = Med, New models/schema = High |
  | Integration points | Research findings | Internal only = Low, 1-2 external = Med, 3+ external = High |

- **Action** — CheckHardStops: Any true = automatic COMPREHENSIVE
  | db_schema_destructive | new_service_or_component | auth_or_pii_change |
  | payment_billing_logic | public_api_change | caching_consistency | slo_sla_risk |

- **Action** — DetermineTier:
  - **LIGHT**: All/most Low signals, single component, clear pattern match, no hard-stops
  - **STANDARD**: Mix of Low/Med signals, multi-file but contained scope, no hard-stops
  - **COMPREHENSIVE**: Any High signal, multiple Med signals, or any hard-stop triggered

- **Action** — ConfirmTier:
  > "Based on research: [brief summary of key findings]. Assessed as **{TIER}**. Proceed or adjust?"

- **Wait** — User confirms or overrides tier

## Step 4 - Route to Workflow

**CRITICAL**: Use Skill tool to invoke slash commands. Do NOT just describe.

- **If LIGHT**:
  - **Action** — ExecuteSkill: `/spectre:create_tasks {OUT_DIR}/task_context.md --depth light`
  - **Wait** — Returns task breakdown with brief implementation approach
  - Skip to footer

- **ElseIf STANDARD**:
  - **Action** — ExecuteSkill: `/spectre:create_plan {OUT_DIR}/task_context.md --depth standard`
  - **Wait** — Returns focused plan (Overview, Approach, Out of Scope)
  - **Action** — PromptUser: "Review plan. Reply 'Approved' or provide feedback."
  - **Wait** — User approval
  - **Action** — ExecuteSkill: `/spectre:create_tasks {OUT_DIR}/task_context.md`
  - **Wait** — Returns task breakdown

- **ElseIf COMPREHENSIVE**:
  - **Action** — ExecuteSkill: `/spectre:create_plan {OUT_DIR}/task_context.md --depth comprehensive`
  - **Wait** — Returns full plan (all sections: Architecture, Phases, API Design, Testing Strategy, etc.)
  - **Action** — PromptUser: "Review plan. Reply 'Approved' or provide feedback."
  - **Wait** — User approval
  - **Action** — ExecuteSkill: `/spectre:create_tasks {OUT_DIR}/task_context.md`
  - **Wait** — Returns task breakdown

- **Action** — RenderFooter: Use `@skill-spectre:spectre` skill for Next Steps

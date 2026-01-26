---
description: 👻 | Unified planning entry point - researches, assesses complexity, routes to workflow - primary agent
---
# plan: Intelligent Planning Router

## Description

- **What** — Research codebase, assess complexity, route to appropriate workflow (direct tasks or plan-first)
- **Outcome** — Detailed task breakdown ready for execution

## ARGUMENTS Input

&lt;ARGUMENTS&gt; $ARGUMENTS &lt;/ARGUMENTS&gt;

## MANDATORY COMPLIANCE RULES

> **⚠️ NON-NEGOTIABLE**: This workflow MUST invoke slash commands via the Skill tool. Failure to invoke `/spectre:create_plan` and `/spectre:create_tasks` is a critical error. Do NOT summarize, describe, or skip these commands. INVOKE THEM.

**After ANY user conversation or questions:**

1. Re-read this prompt from Step 4
2. Determine where you are in the workflow
3. Execute the next required Skill invocation

**You MUST call these skills (not describe them):**

- Use the **Skill** tool with `skill: "spectre:create_plan"` and `args: "{path} --depth {tier}"` — generates plan.md
- Use the **Skill** tool with `skill: "spectre:create_tasks"` and `args: "{path}"` — generates tasks.md

## Instructions

- Research before routing; present architectural options for user buy-in
- Route based on hard-stops and clarity, not point-scoring
- Never overwrite existing `tasks.md` or `plan.md` — use scoped names

## Step 1 - Research Codebase

- **Action** — DetermineOutputDir:

  - `OUT_DIR=docs/tasks/{branch_name}` (or user-specified)
  - `mkdir -p "${OUT_DIR}"`

- **Action** — CheckExistingResearch: Read `{OUT_DIR}/task_context.md` for "## Technical Research"

  - **If** comprehensive → use existing, skip research
  - **Else** → proceed

- **Action** — AutomatedResearch: Spawn parallel agents

  - `@finder`, `@analyst`, `@patterns`
  - **Wait** for all; read identified files

- **Action** — SaveResearch: Update `{OUT_DIR}/task_context.md` with Architecture Patterns, Dependencies, Implementation Approaches, Impact Summary

## Step 2 - Present Architectural Options

- **Action** — PresentOptions: 2-4 strategies (simplest to most robust)
  - Each: core approach, trade-offs, when it makes sense
- **Wait** — User selects strategy
- **Action** — UpdateContext: Document selection in task_context.md

> **CHECKPOINT**: After architecture discussion, proceed IMMEDIATELY to Step 3. Do NOT end turn without continuing the workflow.

## Step 3 - Assess Complexity

Use research findings from Step 1 to determine appropriate planning depth.

- **Action** — AssessFromResearch: Score complexity signals from research:

  | Signal | Source | Assessment |
  | --- | --- | --- |
  | Files impacted | @finder | 1-3 files = Low, 4-8 = Med, 9+ = High |
  | Pattern match | @patterns | Clear existing pattern = Low, Adapt pattern = Med, New pattern = High |
  | Components crossed | @analyst | 1 component = Low, 2-3 = Med, 4+ = High |
  | Data model changes | Research findings | None = Low, Modify existing = Med, New models/schema = High |
  | Integration points | Research findings | Internal only = Low, 1-2 external = Med, 3+ external = High |

- **Action** — CheckHardStops: Any true = automatic COMPREHENSIVE | db_schema_destructive | new_service_or_component | auth_or_pii_change | | payment_billing_logic | public_api_change | caching_consistency | slo_sla_risk |

- **Action** — DetermineTier:

  - **LIGHT**: All/most Low signals, single component, clear pattern match, no hard-stops
  - **STANDARD**: Mix of Low/Med signals, multi-file but contained scope, no hard-stops
  - **COMPREHENSIVE**: Any High signal, multiple Med signals, or any hard-stop triggered

- **Action** — ConfirmTier:

  > "Based on research: \[brief summary of key findings\]. Assessed as **{TIER}**. Proceed or adjust?"

- **Wait** — User confirms or overrides tier

> **CHECKPOINT**: After tier confirmation, proceed IMMEDIATELY to Step 4. The ONLY valid next action is invoking a Skill. Do NOT end turn here.

## Step 4 - Route to Workflow

### ⛔ MANDATORY SKILL INVOCATION ⛔

```
┌────────────────────────────────────────────────────────────────────────┐
│  YOU MUST USE THE SKILL TOOL TO INVOKE THESE COMMANDS                  │
│                                                                        │
│  ❌ WRONG: "I'll now create the plan..."                               │
│  ❌ WRONG: "The next step would be to run /spectre:create_plan"        │
│  ❌ WRONG: Ending turn without invoking Skill tool                     │
│                                                                        │
│  ✅ CORRECT: Skill tool with skill: "spectre:create_plan", args: "..." │
│  ✅ CORRECT: Skill tool with skill: "spectre:create_tasks", args: "..."│
└────────────────────────────────────────────────────────────────────────┘
```

**DO NOT:**

- Say you’ll create a plan or set of tasks yourself without running the skill tool
- Describe what you would do
- Summarize the plan/task steps yourself
- End your turn without invoking Skill
- Write plan.md or tasks.md content directly

**YOU MUST:**

- Use the Skill tool: `skill: "spectre:create_plan"`, `args: "{OUT_DIR}/task_context.md --depth {tier}"`
- Use the Skill tool: `skill: "spectre:create_tasks"`, `args: "{OUT_DIR}/task_context.md"`

---

### Routing Logic

- **If LIGHT**:

  - **INVOKE NOW** → Skill tool with `skill: "spectre:create_tasks"`, `args: "{OUT_DIR}/task_context.md --depth light"`
  - **Wait** — Returns task breakdown with brief implementation approach
  - Skip to footer

- **ElseIf STANDARD**:

  - **INVOKE NOW** → Skill tool with `skill: "spectre:create_plan"`, `args: "{OUT_DIR}/task_context.md --depth standard"`
  - **Wait** — Returns focused plan (Overview, Approach, Out of Scope)
  - **Action** — PromptUser: "Review plan. Reply 'Approved' or provide feedback."
  - **Wait** — User approval
  - **INVOKE NOW** → Skill tool with `skill: "spectre:create_tasks"`, `args: "{OUT_DIR}/task_context.md"`
  - **Wait** — Returns task breakdown

- **ElseIf COMPREHENSIVE**:

  - **INVOKE NOW** → Skill tool with `skill: "spectre:create_plan"`, `args: "{OUT_DIR}/task_context.md --depth comprehensive"`
  - **Wait** — Returns full plan (all sections: Architecture, Phases, API Design, Testing Strategy, etc.)
  - **Action** — PromptUser: "Review plan. Reply 'Approved' or provide feedback."
  - **Wait** — User approval
  - **INVOKE NOW** → Skill tool with `skill: "spectre:create_tasks"`, `args: "{OUT_DIR}/task_context.md"`
  - **Wait** — Returns task breakdown

---

- **Action** — RenderFooter: Use `@skill-spectre:spectre` skill for Next Steps
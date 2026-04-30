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

- **Action** — ScanExistingContext: Read all existing artifacts in `{OUT_DIR}/ (if you haven’t already)` and assess coverage across 4 dimensions.

  Scan for: `task_context.md`, `specs/plan.md`, `concepts/scope.md`, `research/*.md`

  | Dimension | Covered if artifact contains... | Covered by |
  | --- | --- | --- |
  | **File locations** | Specific file paths relevant to this feature, entry points, config files | `@finder` |
  | **Code understanding** | Data flow analysis, dependency tracing, how current code works with file:line refs | `@analyst` |
  | **Codebase patterns** | Similar implementations found in codebase, reusable components, naming/style conventions | `@patterns` |
  | **External research** | Best practices, libraries/frameworks, prior art, common pitfalls with source links | `@web-research` |

  For each dimension, assess: **covered** (artifact has substantive findings for this feature) or **gap** (missing, superficial, or about a different feature).

- **Action** — DispatchResearch: Spawn agents **only for dimensions marked as gaps**. Skip agents whose dimensions are already covered. Each prompt must include the feature/problem description from ARGUMENTS so the agent has full context.

  - **If all 4 covered** → skip to SaveResearch (merge existing findings into task_context.md if scattered across files)

  - **If gaps exist** → spawn only the needed agents in parallel:

  - `@finder` *(if File locations = gap)* — "Find all files, components, entry points, routes, and configuration related to \[feature/problem\]. Include: (1) files that would need to be modified or extended, (2) entry points where this feature connects to the system (routes, handlers, event listeners, CLI commands), (3) configuration files, schemas, or migrations that may be affected, (4) test files covering the affected areas. Return file paths organized by relevance."

  - `@analyst` *(if Code understanding = gap)* — "Analyze how the code paths related to \[feature/problem\] work end-to-end. Trace: (1) data flow from input through processing to storage and output, (2) key dependencies and how components interact, (3) state management patterns and data access methods in the affected areas, (4) error handling and edge cases in the current implementation. Return findings with specific file:line references."

  - `@patterns` *(if Codebase patterns = gap)* — "Find existing implementations in this codebase that are similar to \[feature/problem\] and could serve as a reference. Look for: (1) analogous features already built — how were they structured?, (2) reusable components, utilities, or abstractions we should leverage, (3) conventions for naming, file organization, and code style in this area, (4) testing patterns used for similar features. Return concrete code examples with file:line references."

  - `@web-research` *(if External research = gap)* — "Research best practices, proven patterns, relevant libraries/frameworks, and how other projects solve \[feature/problem\]. Focus on: (1) industry best practices and common pitfalls, (2) libraries or frameworks that simplify this work, (3) how well-known open-source projects approach similar problems, (4) architectural patterns recommended for this type of feature. Return findings with source links."

  - **Wait** for all dispatched agents; read identified files

- **Action** — SaveResearch: Merge all findings (existing artifacts + new agent results) into `{OUT_DIR}/task_context.md` with sections: Architecture Patterns, Dependencies, Implementation Approaches, Impact Summary, and External Research (best practices, recommended libraries/frameworks, prior art, common pitfalls)

## Step 2 - Assess Complexity

Use research findings from Step 1 to determine appropriate planning depth.

- **Action** — AssessFromResearch: Score complexity signals from research:

  | Signal | Source | Assessment |
  | --- | --- | --- |
  | Files impacted | @finder | 1-3 files = Low, 4-8 = Med, 9+ = High |
  | Pattern match | @patterns | Clear existing pattern = Low, Adapt pattern = Med, New pattern = High |
  | Components crossed | @analyst | 1 component = Low, 2-3 = Med, 4+ = High |
  | Data model changes | Research findings | None = Low, Modify existing = Med, New models/schema = High |
  | Integration points | Research findings | Internal only = Low, 1-2 external = Med, 3+ external = High |
  | External complexity | @web-research | Well-documented with libraries = Low, Some prior art = Med, Novel/emerging = High |

- **Action** — CheckHardStops: Any true = automatic COMPREHENSIVE | db_schema_destructive | new_service_or_component | auth_or_pii_change | | payment_billing_logic | public_api_change | caching_consistency | slo_sla_risk |

- **Action** — DetermineTier:

  - **LIGHT**: All/most Low signals, single component, clear pattern match, no hard-stops
  - **STANDARD**: Mix of Low/Med signals, multi-file but contained scope, no hard-stops
  - **COMPREHENSIVE**: Any High signal, multiple Med signals, or any hard-stop triggered

- **Action** — LogTier: Note the assessed tier in your response for transparency, then proceed immediately to the next step. Do NOT ask for confirmation.

> **CHECKPOINT**: After determining tier, proceed IMMEDIATELY to the next step — Step 3 (High-Level Design) for STANDARD/COMPREHENSIVE, or Step 4 (Route) for LIGHT. Do NOT end turn here. Do NOT ask user to confirm the tier.

## Step 3 - High-Level Design

**SKIP IF LIGHT** — proceed directly to Step 4.

Goal: align on the *shape* of the solution before generating a full plan. This catches misalignments early and gives the user a chance to redirect before reading a long plan doc.

- **Action** — PresentDesign: Synthesize research from Step 1 into a single proposed approach with open questions. Present inline (do not write a separate design file).

  **Format**:

  > Here's the high-level design I'd take. Scan the shape, then resolve any open questions or push back on the approach.
  >
  > **Approach**: [1-2 paragraph summary of the solution shape — what changes structurally, not file-by-file]
  >
  > **Key components touched**:
  > - `path/file.ts` — [what shifts and why]
  > - `path/other.ts` — [what shifts and why]
  >
  > **Key decisions**:
  > - [decision] — [rationale; alternative considered]
  > - [decision] — [rationale; alternative considered]
  >
  > **Open questions** (with default assumption):
  > 1. [question] — *default: [assumption]*
  > 2. [question] — *default: [assumption]*
  >
  > Reply with answers, edits to the approach, or 'looks good' to continue.

  **CRITICAL**:
  - **Single proposed approach**, not a menu. If a true fork exists, surface it as an open question with your recommendation — not as parallel options.
  - Stay at the *shape* level: components, key decisions, structural changes. Defer file-by-file detail to `create_plan`.
  - Open questions should be specific and answerable; pair each with a default assumption so the user can skip if the default is fine.

- **Action** — IterateDesign: If the user replies with answers, edits, or pushback, update the design and re-present. Loop until user says 'looks good' (or equivalent).

- **Wait** — User signals alignment.

- **Action** — PersistDesign: Append a "Selected Design" section to `{OUT_DIR}/task_context.md` capturing the agreed approach, key decisions, and resolved questions. This is what `create_plan` consumes.

> **CHECKPOINT**: After alignment, proceed IMMEDIATELY to Step 4. The ONLY valid next action is invoking a Skill.

## Step 4 - Route to Workflow

### ⛔ MANDATORY SKILL INVOCATION ⛔

```plaintext
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

- **Action** — RenderFooter: Use `@skill-spectre:spectre-guide` skill for Next Steps
---
description: 👻 | Unified planning entry point - researches, assesses complexity, routes to workflow - primary agent
---

# plan: Intelligent Planning Router

## Description
- **What** — Research codebase, assess complexity, route to appropriate planning workflow (direct tasks or plan-first)
- **Outcome** — Detailed task breakdown ready for execution (always ends with a scoped tasks doc)

## Variables

### Dynamic Variables
- `user_input`: Planning context — (via ARGUMENTS: $ARGUMENTS)
- `target_dir`: Optional output directory override

### Static Variables
- `out_dir`: docs/active_tasks/{branch_name}

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions

- Research thoroughly before routing
- Present architectural options and get user buy-in on strategy
- Route based on hard-stops and clarity, not point-scoring
- Never overwrite existing `tasks.md` or `plan.md` — use scoped names

## Steps

### Step (1/4) - Research Codebase

- **Action** — ExtractScope: Get planning context from ARGUMENTS, existing docs (`task_summary.md`, `prd.md`), or conversation
- **Action** — DetermineOutputDir: Set output location
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies `target_dir` → `OUT_DIR={target_dir}`
  - **Else** → `OUT_DIR=docs/active_tasks/{branch_name}`
  - `mkdir -p "OUT_DIR"`
- **Action** — CheckExistingResearch: Read `{OUT_DIR}/task_context.md` for "## Technical Research"
  - **If** found with comprehensive analysis → use existing; skip research
  - **Else** → proceed with new research
- **Action** — AutomatedResearch: Spawn parallel research agents
  - `codebase-locator` — find related files
  - `codebase-analyzer` — understand patterns
  - `codebase-pattern-finder` — find reusable components
  - **Wait** for all agents; read identified files
- **Action** — DocumentationReview: Review `CLAUDE.md`, `README.md` for patterns, architecture, conventions
- **Action** — SaveResearch: Update `{OUT_DIR}/task_context.md`:
  ```markdown
  ## Technical Research
  *Created by: plan.md on {timestamp}*

  ### Architecture Patterns
  - {patterns, design, organization}

  ### Technical Dependencies
  - {dependencies, integrations, services}

  ### Implementation Approaches
  - {similar features, reusable components}

  ### Impact Summary
  - Files affected: {count}
  - Packages touched: {list}
  - Schema changes: {none|additive|destructive}
  - API changes: {none|internal|public}
  ```

### Step (2/4) - Present Architectural Options

- **Action** — AnalyzeStrategies: Based on research, identify 2-4 distinct approaches
- **Action** — PresentOptions: Show strategies ranging from simplest to most robust:

  For each strategy:
  - Core approach (2-3 sentences)
  - Key trade-offs
  - When this makes sense

  Present as options user can choose or combine.
- **Wait** — User selects preferred strategy
- **Action** — UpdateContext: Document selection in `{OUT_DIR}/task_context.md` under "## Selected Strategy"

### Step (3/4) - Decide Routing

- **Action** — EvaluateHardStops: Check these 7 criteria (any true = PLAN_FIRST)

  | Criteria | Question |
  |----------|----------|
  | `db_schema_destructive` | Drop/rename columns or tables? |
  | `new_service_or_component` | New microservice, worker, or major component? |
  | `auth_or_pii_change` | Auth flow changes or new PII access? |
  | `payment_billing_logic` | Payments, billing, or money movement? |
  | `public_api_change` | Public/partner API contract changes? |
  | `caching_consistency_change` | Caching, consistency, or concurrency changes? |
  | `slo_sla_risk` | Risk of SLO/SLA violation? |

- **Action** — AssessClarity: After architectural options presented, evaluate:
  - Did user select a clear strategy?
  - Is implementation path unambiguous?
  - Are there open design questions?

- **Action** — MakeDecision:
  - **If** any hard-stop true → `PLAN_FIRST`
  - **ElseIf** architectural ambiguity or open design questions → `PLAN_FIRST`
  - **ElseIf** user requests deeper design → `PLAN_FIRST`
  - **Else** → `DIRECT_TASKS`

- **Action** — AnnounceRoute: Tell user which path and why
  - "Routing to direct task creation — scope is clear, no hard-stops triggered."
  - OR "Routing to plan-first — {reason: hard-stop or ambiguity explanation}."

### Step (4/4) - Route to Workflow

#### If DIRECT_TASKS:

- **Route** — `/spectre:create_tasks {OUT_DIR}/task_context.md`
- **Result** — Task breakdown with execution strategies
- **Done** — Present completion summary with next steps

#### If PLAN_FIRST:

- **Route** — `/spectre:create_plan {OUT_DIR}/task_context.md`
- **Result** — Technical design saved (scoped name if `plan.md` exists)
- **Action** — PromptUser: "Review the plan and reply 'Approved' or provide feedback"
- **Wait** — User approval
- **Route** — `/spectre:create_tasks` (uses approved plan)
- **Result** — Task breakdown saved (scoped name if `tasks.md` exists)
- **Done** — Present completion summary with next steps

## Next Steps

- **Action** — ReadNextStepsGuide: Read `.claude/spectre/next_steps_guide.md`
- **Action** — RenderFooter: End with Next Steps footer

**Footer format:**
```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ 🧭 Phase: {phase} | 🟢 {status} | 🚧 {blockers}           ║
║ 🎯 Next — {recommended next step}                         ║
║ ➡️ Options: {sourced from next_steps_guide.md}            ║
║ 💬 Reply — {what to reply, if any}                        ║
╚══════════════════════════════════════════════════════════╝
```

## Success Criteria

**Step 1 - Research Codebase**:
- [ ] Scope extracted from ARGUMENTS, docs, or context
- [ ] Output directory determined
- [ ] Research completed or reused from existing task_context.md
- [ ] Research saved with required sections

**Step 2 - Present Architectural Options**:
- [ ] 2-4 strategies presented with trade-offs
- [ ] User selected preferred strategy
- [ ] Selection documented in task_context.md

**Step 3 - Decide Routing**:
- [ ] All 7 hard-stop criteria evaluated
- [ ] Clarity assessed (strategy clear? path unambiguous?)
- [ ] Decision made: DIRECT_TASKS or PLAN_FIRST
- [ ] Route announced with reasoning

**Step 4 - Route to Workflow**:
- [ ] Correct slash command executed
- [ ] For PLAN_FIRST: plan created, user approved, then tasks created
- [ ] Tasks doc created without overwriting existing files
- [ ] Next steps guide read and footer rendered

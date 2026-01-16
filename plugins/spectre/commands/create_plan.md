---
description: 👻 | Create implementation plan from PRD - primary agent
---

# create_plan: Transform PRD into Technical Implementation Plan

## Description
- **What** — Conduct codebase research, collect clarifications, generate implementation plan
- **Outcome** — Complete `plan.md` with technical approach, phases, and architecture; ready for task breakdown
- **Role** — Sr. staff engineer biasing to YAGNI + SOLID + KISS + DRY

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1 - Codebase Research

- **Action** — DetermineOutputDir:
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - `OUT_DIR=docs/active_tasks/{branch_name}` (or user-specified path)
  - `mkdir -p "${OUT_DIR}/specs" "${OUT_DIR}/clarifications"`

- **Action** — CheckExistingResearch: Read `{OUT_DIR}/task_context.md` for "## Technical Research"
  - **If** comprehensive analysis exists → use it, skip to Step 2
  - **Else** → proceed with research

- **Action** — AutomatedResearch: Spawn parallel agents
  - `@codebase-locator` — find files related to feature
  - `@codebase-analyzer` — understand implementation patterns, data access
  - **Wait** for ALL agents to complete
  - Read ALL identified files into context

- **Action** — DocumentationReview: Review `CLAUDE.md`, `README.md` for patterns, architecture, data flow

- **Action** — SaveResearch: Update `{OUT_DIR}/task_context.md` with "## Technical Research" section:
  - Architecture Patterns, Technical Dependencies, Implementation Approaches, Integration Requirements

## Step 2 - Technical Clarifications

- **Action** — GenerateClarifications: Create `{OUT_DIR}/clarifications/plan_clarifications_{timestamp}.md`
  - Generate up to 10 targeted questions based on research
  - **Only ask** questions genuinely not answered in PRD or discoverable via code
  - For choice questions: include Options with Pros/Cons/Trade-offs/Impact
  - Use `<response></response>` blocks for answers

- **Action** — RequestUserInput:
  > "Clarifications saved to `{path}`. Add answers in `<response>` blocks. Leave empty to proceed with assumptions. Reply 'Read it' when ready."

- **Wait** — User replies "Read it"

- **Action** — ReadClarifications: Re-read file from disk; use responses or proceed with assumptions

## Step 3 - Create Implementation Plan

- **Action** — DetermineDepth: Read `--depth` from ARGUMENTS
  - Default: `standard` if not specified
  - Options: `standard`, `comprehensive`

- **Action** — DesignTechnicalApproach: Create plan with sections **based on depth**:

  | Section | STANDARD | COMPREHENSIVE | Content |
  |---------|----------|---------------|---------|
  | Overview | ✓ | ✓ | What we're implementing and why |
  | Current State | | ✓ | What exists, constraints, key discoveries with file:line refs |
  | Desired End State | ✓ | ✓ | Target state and verification approach |
  | Out of Scope | ✓ | ✓ | Explicit exclusions to prevent scope creep |
  | Technical Approach | ✓ | ✓ | Architecture, tech choices, integration points |
  | System Architecture | | ✓ | Component diagram, data flow, boundaries |
  | Implementation Phases | | ✓ | Logical progression, dependencies, risks |
  | Component/Data Architecture | | ✓ | Modules, data models, schema, access patterns |
  | API Design | | ✓ (if applicable) | Endpoints, schemas, error handling, auth flow |
  | Testing Strategy | | ✓ | Unit/integration/e2e approach, performance testing |

  **STANDARD** depth: Focused plan for contained changes. 4-5 sections, concise.
  **COMPREHENSIVE** depth: Full technical design for complex/risky changes. All applicable sections.

- **Action** — DocumentPlan: Save to `{OUT_DIR}/specs/plan.md` (use scoped name if exists)

- **Action** — RequestReview:
  > "Implementation plan saved to `{path}`. Review and reply with feedback or 'Approved' to proceed."

- **Wait** — User provides feedback or approval

## Step 4 - Finalize

- **Action** — ConfirmCompletion:
  > "🎯 Implementation Planning Complete. Documents: {plan_path}, task_context.md"

- **Action** — RenderFooter: Use `@skill-spectre:spectre` skill for Next Steps footer

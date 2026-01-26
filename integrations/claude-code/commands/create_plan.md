---
description: 👻 | Create implementation plan from PRD - primary agent
---
# create_plan: Transform PRD into Technical Implementation Plan

## Description

- **What** — Conduct codebase research, collect clarifications, generate implementation plan
- **Outcome** — Complete `plan.md` with technical approach, phases, and architecture; ready for task breakdown
- **Role** — Sr. staff engineer biasing to YAGNI + SOLID + KISS + DRY

## ARGUMENTS Input

&lt;ARGUMENTS&gt; $ARGUMENTS &lt;/ARGUMENTS&gt;

## Step (1/4) - Codebase Architecture Research

- **Action** — CheckExistingResearch: Check if technical research already completed.
  - Read `TASK_DIR/task_context.md`; look for "## Technical Research" section.
  - **If** found with comprehensive analysis → use existing research; skip to Step 3.
  - **Else** → proceed with new research below.
- **Action** — AutomatedResearch: Spawn parallel research agents for comprehensive analysis.
  - Use `codebase-locator` to find all files related to feature area.
  - Dispatch multiple parallel `codebase-analyzer` subagents to understand current implementation patterns. Pay particular attention to how and where data is accessed that will be needed for this feature.
  - Wait for ALL agents to complete before proceeding.
  - Read ALL identified files into context.
- **Action** — DocumentationReview: Review core architecture documentation.
  - Review `CLAUDE.md` for rules and key patterns.
  - Review `README.md` for major components.
  - Cross-reference automated findings with documentation.
  - Identify architectural patterns, data flow, state management.
  - Review authentication, routing, API patterns.
- **Action** — PatternAnalysis: Synthesize findings.
  - Synthesize agent findings with manual analysis.
  - Analyze implementation approaches from discovered code.
  - Identify reusable components and utilities from research.
  - Note integration patterns with existing systems.
  - Validate agent discoveries through code inspection.
- **Action** — TechnicalStackAssessment: Assess current technology stack.
  - Identify technologies currently in use.
  - Review build/deployment configurations.
  - Understand testing frameworks and patterns.
  - Check dependency management approaches.
- **Output Location** — DetermineOutputDir: Decide where to save artifacts for this workflow.
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies `target_dir/path` → `OUT_DIR={that value}`
  - **Else** → `OUT_DIR=docs/active_tasks/{branch_name}`
  - `mkdir -p "OUT_DIR/specs"` && `mkdir -p "OUT_DIR/clarifications"`
- **Action** — SaveResearch: Save technical research to task context (if newly completed).
  - **If** research was just completed → update `{OUT_DIR}/task_context.md` with "## Technical Research" section using template below.
  - **Else** → skip (existing research already in context).

**Technical Research Template:**
```markdown
## Technical Research
*Created by: create_plan.md on {timestamp}*

### Architecture Patterns
- {Key architectural patterns found}
- {Design patterns in use}
- {Code organization approach}

### Technical Dependencies
- {Core dependencies identified}
- {Integration requirements}
- {External service dependencies}

### Implementation Approaches
- {Similar features analyzed}
- {Reusable components identified}
- {Common patterns for this type of feature}

### Integration Requirements
- {API patterns}
- {Data flow patterns}
- {Authentication/authorization approach}
```

## Step (2/4) - Technical Clarifications

- **Action** — GenerateClarifications: Create targeted technical questions document.
  - Create directory if missing: `{OUT_DIR}/clarifications/`
  - Create file: `{OUT_DIR}/clarifications/plan_clarifications_{YYYY-MM-DD_HHMMSS}.md`
  - Dynamically generate up to 10 most important technical questions based on research findings.
  - **IMPORTANT**: Only ask questions that are genuinely not answered in the PRD or that you genuinely cannot answer through code investigation. You can ask for scope clarifications, but never ask questions if the requirements already specify the answer.
  - Goal: eliminate scope and design ambiguity.
  - Use Clarifications Document Template below with `<response></response>` blocks for each question.
  - **If** question involves choosing between approaches → list Options inline beneath that question (≥2 options with Pros/Cons/Trade-offs/Impact) and capture Preferred option in response.

**Clarifications Document Template:**
```markdown
# Plan Clarifications for {task_name}
*Created by: create_plan.md on {timestamp}*

Instructions:
- Please answer inside each `<response></response>` block.
- Keep your edits within the tags so I can parse reliably.
- If a question involves choosing between approaches, list the **Options inline under that question**, then select the **Preferred option** inside the response.

## Questions
1) {question 1}
Options (if applicable):
- Option A — {short name}
  - Pros: {2–4 bullets}
  - Cons: {2–4 bullets}
  - Trade-offs: {what you gain vs. lose}
  - Impact: {performance | maintainability | complexity | UX}
- Option B — {short name}
  - Pros: {2–4 bullets}
  - Cons: {2–4 bullets}
  - Trade-offs: {what you gain vs. lose}
  - Impact: {performance | maintainability | complexity | UX}
<response>
Preferred option: {Option A|Option B|Other}
Notes: {Any additional guidance}
</response>

2) {question 2}
<response>
{Answer here if no options}
</response>

{… up to 10 questions}
```

- **Action** — RequestUserInput: Direct user to answer clarifications.
  - Message: "I saved implementation-planning technical clarifications here: `{clarifications_file_path}`. Please add answers inside `<response></response>` blocks. If you prefer me to proceed with intelligent assumptions, leave blocks empty. When ready, reply 'Read it' and I will re-open the file from disk."
  - Render ACTION REQUIRED footer (see Next Steps section for format).
- **Wait** — User replies "Read it" after updating clarifications document.
- **Action** — ReadClarifications: Re-open clarifications file from disk.
  - **If** user provides path → use it.
  - **Else** → open most recent `{OUT_DIR}/clarifications/plan_clarifications_*.md`.
  - Read entire file; use responses when provided; proceed with assumptions if empty.

## Step (3/4) - Create Implementation Plan

- **Action** — DetermineDepth: Read `--depth` from ARGUMENTS

  - Default: `standard` if not specified
  - Options: `standard`, `comprehensive`

- **Action** — DesignTechnicalApproach: Create plan with sections **based on depth**:

  | Section | STANDARD | COMPREHENSIVE | Content |
  | --- | --- | --- | --- |
  | Overview | ✓ | ✓ | What we're implementing and why |
  | Current State |  | ✓ | What exists, constraints, key discoveries with file:line refs |
  | Desired End State | ✓ | ✓ | Target state and verification approach |
  | Out of Scope | ✓ | ✓ | Explicit exclusions to prevent scope creep |
  | Technical Approach | ✓ | ✓ | Architecture, tech choices, integration points |
  | System Architecture |  | ✓ | Component diagram, data flow, boundaries |
  | Implementation Phases |  | ✓ | Logical progression, dependencies, risks |
  | Component/Data Architecture |  | ✓ | Modules, data models, schema, access patterns |
  | API Design |  | ✓ (if applicable) | Endpoints, schemas, error handling, auth flow |
  | Testing Strategy |  | ✓ | Unit/integration/e2e approach, performance testing |

  **STANDARD** depth: Focused plan for contained changes. 4-5 sections, concise. **COMPREHENSIVE** depth: Full technical design for complex/risky changes. All applicable sections.

- **Action** — DocumentPlan: Save to `{OUT_DIR}/specs/plan.md` (use scoped name if exists)

- **Action** — RequestReview:

  > "Implementation plan saved to `{path}`. Review and reply with feedback or 'Approved' to proceed."

- **Wait** — User provides feedback or approval

## Step (4/4) - Finalize and Present Next Steps

- **Action** — ConfirmCompletion:

  > "🎯 Implementation Planning Complete. Documents: {plan_path}, task_context.md"

- **Action** — RenderFooter: Use `@skill-spectre:spectre` skill for Next Steps footer
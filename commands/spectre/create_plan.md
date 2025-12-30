---
description: 👻 | Create implementation plan from PRD - primary agent
---

# create_plan: Transform PRD into Technical Implementation Plan

## Description
- Description — Conduct codebase research, collect technical clarifications, and generate comprehensive implementation plan with architecture, phases, and risk assessment.
- Desired Outcome — Complete plan document (default `plan.md`, but use scoped filename if one already exists) with technical approach, system architecture, implementation phases, and testing strategy; ready for plan review or task breakdown.
- Role - You are a sr. staff engineer, and pride yourself on delivering the exact right technical design required of the task given its size/complexity and the stage of the company. You working at a fast-moving startup and bias to YAGNI + SOLID + KISS + DRY principles.

## ARGUMENTS Input

Optional user input to seed this workflow.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

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

## Step (4/5) - Create Implementation Plan

- **Action** — DesignTechnicalApproach: Create comprehensive implementation plan.
  - Adapt structure to task needs; include relevant sections from list below.
  - Tailor emphasis based on feature type (new data models, frontend/backend focus, LLM integration, etc.).
  - Include component diagrams, data flow visualizations, system architecture diagrams.

**Implementation Plan Sections** (expand, combine, or omit as fits feature complexity):

```
# [Feature/Task Name] Implementation Plan

## Overview

[Brief description of what we're implementing and why]

## Current State Analysis

[What exists now, what's missing, key constraints discovered]

## Desired End State

[A Specification of the desired end state after this plan is complete, and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## What We're NOT Doing

[Explicitly list out-of-scope items to prevent scope creep]

##  1. **Technical Approach**
   - High-level architectural design tailored to the feature
   - Technology choices and rationale
   - Integration points with existing systems and data flows

## 2. **System Architecture & Visual Documentation**
   - Component diagram with major pieces and responsibilities
   - Data flow visualization showing information movement
   - System architecture diagram with integration points
   - Visual representation of component boundaries and interactions

## 3. **Implementation Phases**
   - Logical development progression customized to task
   - Dependencies between phases
   - Risk mitigation strategies

## 4. **Component and Data Architecture**
   - Major components/modules/services and responsibilities
   - Data models and schema changes (if any)
   - Database schema design with indexes and query optimization
   - Data flow and interaction patterns
   - Data access pattern optimization
   - Reuse or extension of existing components

## 5. **API & Data Contract Design**
   - API endpoint specification with OpenAPI/GraphQL schema examples
   - Request/response schema design optimized for frontend
   - Real-time event specifications (WebSocket events, polling)
   - Structured error handling contracts
   - Authentication/authorization flow documentation
   - Rate limiting and caching strategies

## 6. **Testing Strategy**
   - Unit, integration, end-to-end testing approaches
   - Test data and mocking requirements
   - Performance testing and load testing strategies
   - Automation and CI/CD integration

## 7. **Performance Optimization Planning**
   - [Any performance implications or optimizations needed]
```

- **Action** — DocumentPlan: Save implementation plan immediately after generation.
  - Determine `PLAN_FILE` (default `{OUT_DIR}/specs/plan.md`; if it already exists, create a scoped name like `{OUT_DIR}/specs/{task_name}_plan.md` or `plan_{timestamp}.md` to avoid overwriting).
  - Create `PLAN_FILE` with complete plan: all sections, timestamps, technical requirements, testing/deployment considerations.
- **Action** — RequestReview: Direct user to review implementation plan document.
  - Message: "I've created a comprehensive implementation plan and saved it to: `{PLAN_FILE}`. I've also: {if newly researched} Saved technical research findings to task_context.md; Please review the document directly and provide feedback on: technical approach alignment, missing considerations, implementation phases. Respond with specific feedback for revisions, or reply 'Approved' to proceed."
- **Wait** — User provides feedback or approval.

## Step (4/4) - Finalize and Present Next Steps

- **Action** — ConfirmCompletion: Summarize completion.
  - Message: "🎯 Implementation Planning Complete — Ready for Next Phase. Process Completed: ✅ Codebase research consolidated; ✅ Technical clarifications addressed; ✅ Implementation plan documented and saved. Documents Updated: {PLAN_FILE}, task_context.md, task_summary.md"
- **Action** — ReadNextStepsGuide: Read `.claude/spectre/next_steps_guide.md` to source relevant next step options.
- **Action** — RenderFooter: End reply with single 60-column Next Steps footer using options from guide.
  - **If** awaiting user input → include "💬 Reply" line.
  - **Else** → omit "💬 Reply" line.

## Next Steps

**Footer format:**
```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ 🧭 Phase: Technical Planning | 🟢 Complete | 🚧 None     ║
║ 🎯 Next — {recommended next step}                         ║
║ ➡️ Options: {sourced from next_steps_guide.md}            ║
║ 💬 Reply — {what to reply, if any}                        ║
╚══════════════════════════════════════════════════════════╝
```

## Success Criteria
- [ ] Output directory determined inline (`OUT_DIR`) using branch name or user-specified path; directories created if missing
- [ ] ARGUMENTS input reviewed (if provided) and incorporated into workflow
- [ ] Existing technical research checked; reused if available
- [ ] Automated research agents spawned and completed (if new research needed)
- [ ] All identified files read into context
- [ ] Core architecture documentation reviewed
- [ ] Pattern analysis and technical stack assessment completed
- [ ] Technical research saved to task context (if newly completed)
- [ ] Clarifications document created in `{OUT_DIR}/clarifications/` with `<response>` blocks
- [ ] Inline Decision Options included beneath relevant questions (≥2 options) where choices exist
- [ ] User directed to answer clarifications; ACTION REQUIRED footer rendered
- [ ] Updated clarifications document read from disk (or acknowledged empty and proceeding with assumptions)
- [ ] Clarifications summary saved to task context
- [ ] Implementation plan created with all relevant sections tailored to task needs
- [ ] Implementation plan saved without overwriting existing docs (scoped filename used if `plan.md` already present)
- [ ] Task context updated with technical research and clarifications
- [ ] User directed to review plan document file directly (not in chat)
- [ ] User feedback collected or approval received
- [ ] Completion message rendered with process summary
- [ ] Single Next Steps footer rendered (no duplicates)
- [ ] Next steps guide read and relevant options sourced for footer

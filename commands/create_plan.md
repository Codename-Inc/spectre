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
- **Action** — TraceCodePaths: Trace through relevant execution paths.
  - Identify the key entry points for the feature area (routes, handlers, event listeners, CLI commands).
  - Follow the data flow end-to-end: from input → processing → storage → output.
  - Find similar features already implemented in the codebase and study how they work — these are your implementation reference.
  - Read the actual code at each step; do not rely on file names or agent summaries alone.
- **Action** — DocumentationReview: Review core architecture documentation.
  - Review `CLAUDE.md` for rules and key patterns.
  - Review `README.md` for major components.
  - Cross-reference automated findings with documentation.
- **Action** — PatternAnalysis: Synthesize findings.
  - Synthesize agent findings with manual code path analysis.
  - Identify reusable components and utilities from research.
  - Note integration patterns with existing systems.
  - Validate agent discoveries through code inspection.
- **Output Location** — DetermineOutputDir: Decide where to save artifacts for this workflow.
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies `target_dir/path` → `OUT_DIR={that value}`
  - **Else** → `OUT_DIR=docs/active_tasks/{branch_name}`
  - `mkdir -p "OUT_DIR/specs"` && `mkdir -p "OUT_DIR/clarifications"`
- **Action** — SaveResearch: Save technical research to task context (if newly completed).
  - **If** research was just completed → update `{OUT_DIR}/task_context.md` with a "## Technical Research" section summarizing architecture patterns, dependencies, similar features found, and integration requirements.
  - **Else** → skip (existing research already in context).

## Step (2/4) - Technical Clarifications

Dynamically generate up to 10 technical questions based on research findings. **IMPORTANT**: Only ask questions genuinely not answered in the PRD or discoverable through code investigation. Goal: eliminate scope and design ambiguity. If a question involves choosing between approaches, present options with Pros/Cons/Trade-offs.

- **Action** — DetectClarificationMethod: Check if `AskUserQuestion` tool is available.
  - **If available** → use inline clarification flow (Path A).
  - **If not available** → use file-based clarification flow (Path B).

### Path A: Inline Clarifications (AskUserQuestion available)

- **Action** — AskInline: Present questions directly using AskUserQuestion.
  - Ask the most critical questions (up to 4 at a time, the tool limit).
  - For approach decisions, present options as choices.
  - If more than 4 questions, ask in batches — most important first.
  - Use responses (and intelligent defaults for any skipped) to proceed.

### Path B: File-Based Clarifications (no AskUserQuestion)

- **Action** — GenerateClarifications: Create targeted technical questions document.
  - Create directory if missing: `{OUT_DIR}/clarifications/`
  - Create file: `{OUT_DIR}/clarifications/plan_clarifications_{YYYY-MM-DD_HHMMSS}.md`
  - Format each question with `<response></response>` blocks for user answers.
  - For approach decisions, list options inline with Pros/Cons/Trade-offs/Impact.
- **Action** — RequestUserInput: Direct user to answer clarifications.
  - Message: "I saved technical clarifications here: `{clarifications_file_path}`. Please add answers inside `<response></response>` blocks. Leave blocks empty for me to proceed with intelligent assumptions. When ready, reply 'Read it'."
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

- **Action** — DesignTechnicalApproach: Create the implementation plan.

  **STANDARD** depth — Focused plan for contained changes. Include the sections that matter for THIS feature. Typical sections: Overview, Desired End State, Out of Scope, Technical Approach. Keep it concise.

  **COMPREHENSIVE** depth — Full technical design for complex/risky changes. Consider all of the following, but only include sections relevant to the feature: Overview, Current State (with file:line refs), Desired End State, Out of Scope, Technical Approach, System Architecture, Implementation Phases, Component/Data Architecture, API Design, Testing Strategy.

  Use your judgment — the goal is a plan that gives a developer everything they need to implement, not a template with empty sections.

- **Action** — AppendCriticalFiles: End the plan with a "Critical Files for Implementation" section.
  - List 3-7 files most critical for implementing this plan.
  - Format: `path/to/file.ts` — brief reason (e.g., "Core logic to modify", "Pattern to follow", "Interface to implement").
  - These should be specific files discovered during research, not guesses.

- **Action** — DocumentPlan: Save to `{OUT_DIR}/specs/plan.md` (use scoped name if exists)

- **Action** — RequestReview:

  > "Implementation plan saved to `{path}`. Review and reply with feedback or 'Approved' to proceed."

- **Wait** — User provides feedback or approval

## Step (4/4) - Finalize and Present Next Steps

- **Action** — ConfirmCompletion:

  > "🎯 Implementation Planning Complete. Documents: {plan_path}, task_context.md"

- **Action** — RenderFooter: Use `@skill-spectre:spectre-next-steps` skill for Next Steps footer
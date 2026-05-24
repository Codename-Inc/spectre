---
name: "spectre-create_plan"
description: "👻 | Create implementation plan from PRD - primary agent"
user-invocable: true
---

# create_plan

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

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
  - **If** ARGUMENTS contains `--depth light` and `TASK_DIR/task_context.md` already contains substantive router research (file locations, code understanding, codebase patterns, and impact summary) → use existing research; skip to Step 3.
  - **Else** → proceed with new research below.
- **Action** — AutomatedResearch: Spawn parallel research agents for comprehensive analysis.
  - Use `@finder` to find all files related to feature area.
  - Dispatch multiple parallel `@analyst` subagents to understand current implementation patterns. Pay particular attention to how and where data is accessed that will be needed for this feature.
  - Use `@patterns` to surface canonical reference implementations already in the codebase — these become "follow this file" anchors in the plan.
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
  - **Else** → `OUT_DIR=docs/tasks/{branch_name}`
  - `mkdir -p "OUT_DIR/specs"` && `mkdir -p "OUT_DIR/clarifications"`
- **Action** — SaveResearch: Save technical research to task context (if newly completed).
  - **If** research was just completed → update `{OUT_DIR}/task_context.md` with a "## Technical Research" section summarizing architecture patterns, dependencies, similar features found, and integration requirements.
  - **Else** → skip (existing research already in context).

## Step (2/4) - Technical Clarifications

Dynamically generate up to 10 technical questions based on research findings. **IMPORTANT**: Only ask questions genuinely not answered in the PRD or discoverable through code investigation. Goal: eliminate scope and design ambiguity. If a question involves choosing between approaches, present options with Pros/Cons/Trade-offs.

- **Action** — LightModeClarifications: If ARGUMENTS contains `--depth light`, do NOT stop for user clarifications. Use conservative, codebase-consistent defaults and record them in the plan's **Filled Assumptions** section, then skip to Step 3. If an unresolved question would affect canonical scope, security/privacy, data correctness, or public API behavior, return control to `plan` with a tier reassessment recommendation instead of guessing.

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
  - Options: `light`, `standard`, `comprehensive`
- **Action** — DetectOrchestratedMode: If ARGUMENTS contains `--no-review`, this workflow is being invoked by `plan` as part of the meta-flow. Generate and save the plan, then return control to `plan` without asking for standalone user review.

- **Action** — DesignTechnicalApproach: Create the implementation plan.

  Every plan, regardless of depth, MUST include the verification spine. LIGHT is concise, not shallow: keep it brief and decisive, but still explain the solution shape, codebase pattern to follow, risks/assumptions, and how the work will be verified.

  **Required for LIGHT, STANDARD, and COMPREHENSIVE:**
  1. **Overview** — 1–2 paragraphs: what problem, what shape the solution takes, why this approach.
  2. **Technical Approach** — How the change actually lands: components touched, data flow, key decisions with rationale. Reference existing patterns from `@patterns` research by file:line (e.g., "follow the shape of `src/widgets/HotDogWidget.ts:42` for the registration step").
  3. **Critical Files for Implementation** — 1–7 specific files from research. Format: `path/to/file.ts` — *reason* (Core logic to modify / Pattern to follow / Interface to implement / Test to extend). No guesses — only files surfaced during Step 1 research.
  4. **External Dependencies — Verify Before Implementation** — Every third-party package required, with exact version and a one-line existence check. Format: `package@1.2.3 — verify: npm view package@1.2.3` (or pip equivalent). Required even if "no new packages" (write that explicitly). This is the slopsquatting fence: ~20% of AI-suggested packages don't exist; we catch that here, not in production.
  5. **Verification — How We Know This Works** — For each major change in Technical Approach, 1–3 falsifiable signals: a test name, an observable behavior, or a state/file condition. Prose like "the feature works" is not acceptable — it must be checkable. Format: `<change> → verifies by: <test name | observable behavior | state condition>`. These become acceptance criteria in `create_tasks` downstream.
  6. **Out-of-Bounds — DO NOT add** — 4–8 concrete things the implementation must NOT add, even if "best practice." Examples: rate limiting, retry/backoff, caching layer, optimistic UI, soft-delete, telemetry events, feature flags, admin UI. This is the YAGNI fence against familiar-shape bias (agents reproduce mature-system patterns unprompted). Be specific to this feature, not generic.
  7. **Risks & Filled Assumptions** — Two short subsections:
     - *Risks*: what could go wrong (e.g., concurrent write race, migration ordering, third-party rate limit). Each with a one-line mitigation or "accept and monitor."
     - *Filled Assumptions*: things the plan defaulted because the spec didn't say (e.g., "Assumed Postgres; spec didn't specify DB." "Assumed retry count = 0; spec didn't mention failure modes."). Reviewer-visible by design — these are the silent decisions that bite at execution.

  **LIGHT constraints:**
  - Keep the seven required sections compact: usually 1 short paragraph or 3–5 bullets per section.
  - Prefer one clear implementation path that follows existing codebase patterns; do not enumerate broad alternatives.
  - Do not add standalone clarification gates, review gates, plan_review, or expanded architecture sections.
  - If the plan needs more than 3 critical files, a new abstraction, data migration, public API change, or unresolved scope/security/data correctness decision, stop and return a tier reassessment recommendation to `plan`.

  **COMPREHENSIVE additionally requires:**
  8. **Current State** — How the affected code path works today, with file:line refs. Anchored to research findings.
  9. **Implementation Phases** — Ordered phases, each with its own Verification subsection (Phase N succeeds when …). Phases must be sequenced by dependency, not by file. Migration phases come before consumer phases.
  10. **Component / Data Architecture** — Where data is created, mutated, and read. Schema deltas if any.
  11. **API Design** — Endpoint signatures, request/response shapes, error contracts. Required if any external or internal API surface changes.
  12. **Migration Plan** — Required if any data-layer change. Up + down migration sketch, backfill strategy, rollback plan.
  13. **Testing Strategy** — What test types cover what (unit / integration / e2e), where new tests live, what's deferred to the post-feature coverage task.

  Use your judgment on section length, not on inclusion. If a required section is genuinely N/A for this feature, write the section header followed by *"N/A — <one-line reason>"*. Empty section headers are not acceptable; absent section headers are not acceptable.

- **Action** — DocumentPlan: Save to `{OUT_DIR}/specs/plan.md` (use scoped name if exists)

- **Action** — RequestReview:

  - **If `--no-review` is present**:

    > "Draft implementation plan saved to `{path}`. Returning to `plan` for the next routed step."

    Do NOT wait for user approval. Return control to the invoking `plan` workflow.

  - **Else**:

    > "Implementation plan saved to `{path}`. Review and reply with feedback or 'Approved' to proceed."

- **Wait** — User provides feedback or approval, unless `--no-review` is present.

## Step (4/4) - Finalize and Present Next Steps

- **Action** — ConfirmCompletion:

  - **If `--no-review` is present**:

    > "Draft implementation plan saved to `{plan_path}`. Returning to `plan`."

    Stop here. Do not render the standalone Next Steps footer.

  > "🎯 Implementation Planning Complete. Documents: {plan_path}, task_context.md"

- **Action** — RenderFooter: Use `Skill(spectre-guide)` skill for Next Steps footer

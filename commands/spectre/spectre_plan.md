---
description: 👻 | Research & plan from locked scope - SPECTRE subworkflow
---

# spectre_plan: Research → Plan → Review → Finalize

## Description
- **What** — Deep codebase research, implementation planning, and plan review for SPECTRE workflow. Accepts pre-locked scope boundaries and produces execution-ready plan.
- **Outcome** — `spectre_plan.md` with researched implementation tasks in wave structure, reviewed and ready for execute_parallel

## Variables

### Dynamic Variables
- `scope_summary`: Locked scope from SPECTRE — (via ARGUMENTS: $ARGUMENTS)
- `feature_name`: Feature identifier — (extracted from scope)

### Static Variables
- `out_dir`: docs/active_tasks/{branch_name}/specs
- `plan_file`: {topic}_plan.md

## Instructions

- **Scope is locked**: Do NOT re-negotiate scope boundaries; work within confirmed in/out
- **Autonomous decisions**: Make technical decisions without user input; document rationale
- **Research-driven planning**: Base all tasks on actual codebase findings, not assumptions
- **Wave structure required**: Plan must be formatted for parallel execution

## ARGUMENTS Input

Locked scope from SPECTRE Step 1.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/6) - Parse Locked Scope

- **Action** — ParseScope: Extract scope details from ARGUMENTS
  - **If** ARGUMENTS empty → error: "spectre_plan requires locked scope from SPECTRE"
  - **Else** → extract:
    - Feature name / objective
    - In-scope items
    - Out-of-scope exclusions
    - Constraints
    - Parent branch (for context)
- **Action** — ReadReferencedFiles: If scope references specific files/docs, read them fully
  - Use Read tool WITHOUT limit/offset for complete files
  - Read in main context before spawning research agents

## Step (2/6) - Research & Analyze

**Goal**: Build comprehensive understanding of codebase before planning

- **Action** — DecomposeResearchAreas: Break scope into composable research areas
  - Identify components, patterns, concepts to investigate
  - Consider architectural implications
  - Use confirmed scope boundaries to focus research
  - Generate research questions for each area

- **Action** — SpawnResearchAgents: Launch specialized agents in parallel
  - **codebase-locator**: Find WHERE relevant files/components live
    - Entry points, related modules, test files
  - **codebase-analyzer**: Understand HOW specific code works
    - Data flow, state management, integration patterns
  - **codebase-pattern-finder**: Find similar implementation examples
    - Existing patterns to follow, conventions to match
  - Run multiple agents in parallel when searching different areas
  - **Do NOT spawn web-search-researcher** unless scope explicitly mentions external dependencies

- **Action** — SynthesizeFindings: Wait for ALL agents, then compile
  - Prioritize live codebase findings as source of truth
  - Connect findings across components
  - Include specific file paths and line numbers
  - Highlight patterns, connections, architectural decisions
  - Note any discoveries that affect implementation approach

## Step (3/6) - Resolve Ambiguities (Autonomous)

**Goal**: Make technical decisions based on research findings without user input

- **Action** — IdentifyAmbiguities: Based on research, identify technical questions
  - Edge cases not covered by scope
  - Implementation approach trade-offs
  - Integration decisions
  - Pattern choices (existing vs new)

- **Action** — ResolveAutonomously: For each ambiguity, make a decision
  - **Prefer**: Existing codebase patterns over new approaches
  - **Prefer**: Simpler implementation over flexible/extensible
  - **Prefer**: Explicit scope interpretation (conservative)
  - Document decision and rationale in plan

- **Action** — DocumentDecisions: Record all autonomous decisions
  - Format: "Decision: {choice} | Rationale: {why} | Alternatives considered: {options}"
  - These become part of the plan for transparency

## Step (4/6) - Create Implementation Plan

- **Action** — DetermineOutputDir: Set output location
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - `OUT_DIR=docs/active_tasks/{branch_name}/specs`
  - `mkdir -p "{OUT_DIR}"`

- **Action** — ValidateAgainstScope: Before creating tasks, verify alignment
  - [ ] Can cite specific scope items for each planned task?
  - [ ] Each task is minimal implementation to satisfy scope?
  - [ ] All in-scope items addressed?
  - [ ] No tasks beyond confirmed scope?
  - **If validation fails** → revise to match scope exactly

- **Action** — CreatePlanStructure: Generate `{OUT_DIR}/spectre_plan.md`

  **Plan Structure**:
  ```markdown
  # SPECTRE Plan: {feature_name}

  ## Locked Scope
  **Objective**: {1-2 sentence summary}

  **✅ In Scope**:
  - {item 1}
  - {item 2}

  **❌ Out of Scope**:
  - {exclusion 1}
  - {exclusion 2}

  **Constraints**: {any constraints}

  ## Research Summary
  **Key Findings**:
  - {finding 1 with file:line references}
  - {finding 2}

  **Existing Patterns to Follow**:
  - {pattern 1} — see `path/to/example.ts`
  - {pattern 2}

  **Integration Points**:
  - {component 1} — {how it connects}
  - {component 2}

  ## Autonomous Decisions
  | Decision | Rationale | Alternatives |
  |----------|-----------|--------------|
  | {choice} | {why} | {options considered} |

  ## Implementation Tasks

  ### Wave 1: {Theme - independent tasks}

  #### [1.1] {Parent Task Title}
  - [ ] **1.1.1** {Sub-task with technical specifics}
    - [ ] {Acceptance criterion 1}
    - [ ] {Acceptance criterion 2}
  - [ ] **1.1.2** {Sub-task}
    - [ ] {Criterion}

  #### [1.2] {Parent Task Title}
  - [ ] **1.2.1** {Sub-task}
    - [ ] {Criterion}

  ### Wave 2: {Theme - depends on Wave 1}

  #### [2.1] {Parent Task Title}
  **Depends on**: 1.1, 1.2
  - [ ] **2.1.1** {Sub-task}
    - [ ] {Criterion}

  ### Wave 3: {Theme - integration/polish}
  ...

  ## Parallel Execution Plan
  | Wave | Tasks | Dependencies | Can Parallelize |
  |------|-------|--------------|-----------------|
  | 1 | 1.1, 1.2 | None | Yes |
  | 2 | 2.1 | Wave 1 | After Wave 1 |
  | 3 | 3.1, 3.2 | Wave 2 | Yes |

  ## Success Criteria
  - [ ] {Overall success criterion 1}
  - [ ] {Overall success criterion 2}

  ## Review Feedback
  *To be populated after plan_review*
  ```

- **Action** — CreateWaveStructure: Organize tasks into parallel waves
  - **Wave 1**: Independent tasks (no dependencies)
  - **Wave 2+**: Tasks depending on earlier waves
  - Within each wave, identify tasks that can run in parallel
  - Document dependencies explicitly

- **Action** — BreakdownTasks: For each parent task, create detailed sub-tasks
  - **Sub-task requirements**:
    - Start with action verb (Create, Implement, Add, Update)
    - Include technical specifics (components, patterns, files)
    - 2-3 acceptance criteria each (verifiable outcomes)
    - Completable as single focused change
  - **Include**: Technical terms, architecture patterns, file names
  - **Avoid**: Code snippets, exact function signatures

- **Action** — VerifyCoverage: Cross-reference tasks against scope
  - Map each in-scope item to at least one task
  - Flag uncovered scope items → add missing tasks
  - Flag tasks without scope justification → remove

## Step (5/6) - Plan Review

- **Action** — SpawnPlanReview: Dispatch @independent-review-engineer subagent
  - Instruct subagent to run `/spectre:plan_review` on `{OUT_DIR}/{topic}_plan.md`
  - Focus areas: simplifications, over-engineering, missed requirements, testing approach
  - Wait for review findings

- **Action** — EvaluateFeedback: Review plan_review output
  - Categorize findings by impact: Critical / High / Medium / Low
  - For each finding, decide: Incorporate / Decline
  - **Incorporate if**: Simplifies, catches missed requirement, prevents over-engineering
  - **Decline if**: Expands scope, adds complexity, contradicts research findings

- **Action** — IncorporateFeedback: Update plan with incorporated changes
  - Modify affected tasks
  - Update wave structure if dependencies changed
  - Document in plan's "Review Feedback" section:
    ```markdown
    ## Review Feedback

    **Incorporated**:
    - {Change 1}: {rationale}
    - {Change 2}: {rationale}

    **Declined**:
    - {Suggestion 1}: {why declined}
    ```

## Step (6/6) - Finalize Plan

- **Action** — ValidateFinalPlan: Final validation pass
  - [ ] All in-scope items have corresponding tasks
  - [ ] No tasks exceed confirmed scope
  - [ ] Wave dependencies are correct
  - [ ] Sub-tasks have acceptance criteria
  - [ ] Review feedback section populated

- **Action** — SaveFinalPlan: Ensure `{OUT_DIR}/{topic}_plan.md` is saved with all updates

- **Action** — GenerateSummary: Return completion report to SPECTRE
  ```
  SPECTRE_PLAN COMPLETE
  ─────────────────────
  Plan: {OUT_DIR}/spectre_plan.md
  Waves: {N}
  Parent Tasks: {M}
  Sub-tasks: {P}

  Research Agents Used:
  - codebase-locator: {files found}
  - codebase-analyzer: {components analyzed}
  - codebase-pattern-finder: {patterns identified}

  Autonomous Decisions: {count}
  Review Feedback: {incorporated}/{total} incorporated

  Ready for: /spectre:execute
  ```

## Success Criteria

**Step 1 - Parse Locked Scope**:
- [ ] Scope extracted from ARGUMENTS (error if empty)
- [ ] Feature name, in-scope, out-of-scope, constraints identified
- [ ] Referenced files read completely in main context

**Step 2 - Research & Analyze**:
- [ ] Research areas decomposed from scope
- [ ] Parallel agents spawned (codebase-locator, analyzer, pattern-finder)
- [ ] All agents completed before synthesis
- [ ] Findings include file paths, line numbers, patterns
- [ ] Architectural implications documented

**Step 3 - Resolve Ambiguities**:
- [ ] Technical ambiguities identified from research
- [ ] Decisions made autonomously (no user input)
- [ ] Preference given to existing patterns, simpler approaches
- [ ] All decisions documented with rationale

**Step 4 - Create Implementation Plan**:
- [ ] Output directory created (`{OUT_DIR}`)
- [ ] Tasks validated against locked scope
- [ ] Plan created with all required sections
- [ ] Tasks organized into waves with dependencies
- [ ] Each sub-task has 2-3 acceptance criteria
- [ ] Coverage verified (all scope items mapped to tasks)

**Step 5 - Plan Review**:
- [ ] @independent-review-engineer dispatched for plan_review
- [ ] Review feedback received and categorized
- [ ] Incorporate/decline decisions made with rationale
- [ ] Plan updated with incorporated changes
- [ ] Review Feedback section populated

**Step 6 - Finalize Plan**:
- [ ] Final validation passed
- [ ] Plan saved to `{OUT_DIR}/{topic}_plan.md`
- [ ] Completion summary returned to SPECTRE

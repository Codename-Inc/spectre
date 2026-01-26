---
description: 👻 | Research & plan from locked scope - SPECTRE subworkflow
---

# spectre_plan: Research → Plan → Review → Finalize

Deep codebase research and implementation planning for SPECTRE workflow. Accepts pre-locked scope, makes autonomous technical decisions, produces execution-ready plan in wave structure.

**Key Rules**: Scope is locked (no re-negotiation), make autonomous technical decisions (document rationale), research-driven planning (no assumptions), wave structure required.

## ARGUMENTS

Locked scope from SPECTRE Step 1.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1: Parse Locked Scope

- **Action** — ParseScope: Extract from ARGUMENTS (error if empty):
  - Feature name/objective, in-scope items, out-of-scope exclusions, constraints, parent branch
- **Action** — ReadReferencedFiles: Read any referenced files fully (no limit/offset) in main context before spawning agents

## Step 2: Research & Analyze

- **Action** — DecomposeResearchAreas: Break scope into research areas. Identify components, patterns, architectural implications. Generate research questions.

- **Action** — SpawnResearchAgents: Launch parallel agents:
  - `@finder` — find WHERE files/components live (entry points, modules, tests)
  - `@analyst` — understand HOW code works (data flow, state, integration)
  - `@patterns` — find similar implementations (patterns, conventions)
  - **No web-search** unless scope explicitly mentions external deps
  - Wait for ALL agents

- **Action** — SynthesizeFindings: Compile with file:line references. Prioritize codebase as source of truth. Note discoveries affecting approach.

## Step 3: Resolve Ambiguities (Autonomous)

- **Action** — IdentifyAmbiguities: From research, identify: edge cases, approach trade-offs, integration decisions, pattern choices

- **Action** — ResolveAutonomously: For each ambiguity, decide:
  - **Prefer**: Existing patterns > new approaches
  - **Prefer**: Simple > flexible/extensible
  - **Prefer**: Conservative scope interpretation
  - Document: "Decision: {choice} | Rationale: {why} | Alternatives: {options}"

## Step 4: Create Implementation Plan

- **Action** — DetermineOutputDir: `OUT_DIR=docs/tasks/{branch}/specs`, mkdir

- **Action** — ValidateAgainstScope: Before creating tasks:
  - Can cite scope items for each task?
  - Each task is minimal implementation?
  - All in-scope addressed, nothing beyond scope?

- **Action** — CreatePlanStructure: Generate `{OUT_DIR}/spectre_plan.md`

  **Sections**: Locked Scope (objective, in/out, constraints) → Research Summary (findings with file:line, patterns to follow, integration points) → Autonomous Decisions (table: decision|rationale|alternatives) → Implementation Tasks (wave structure) → Parallel Execution Plan (table: wave|tasks|dependencies|parallelizable) → Success Criteria → Review Feedback (populated after review)

  **Task Format**: `### Wave 1: {theme}` → `#### [1.1] Parent` → `- [ ] **1.1.1** Sub-task` → `- [ ] Criterion`

  **Wave Structure**: Wave 1 (independent) → Wave 2+ (dependencies on earlier waves). Document dependencies explicitly.

- **Action** — BreakdownTasks: For each parent, create sub-tasks:
  - Action verb + technical specifics + file names
  - 2-3 acceptance criteria (verifiable outcomes)
  - Include: technical terms, patterns, files
  - Avoid: code snippets, function signatures

- **Action** — VerifyCoverage: Map scope items to tasks. Flag gaps → add. Flag unjustified → remove.

## Step 5: Plan Review

- **Action** — SpawnPlanReview: Dispatch `@reviewer` to run `/spectre:plan_review`
  - Focus: simplifications, over-engineering, missed requirements, testing approach
  - Wait for findings

- **Action** — EvaluateFeedback: Categorize by impact (Critical/High/Medium/Low). For each:
  - **Incorporate if**: Simplifies, catches missed requirement, prevents over-engineering
  - **Decline if**: Expands scope, adds complexity, contradicts research

- **Action** — IncorporateFeedback: Update plan, modify wave structure if needed. Document in "Review Feedback" section (Incorporated: {change + rationale}, Declined: {suggestion + why})

## Step 6: Finalize Plan

- **Action** — ValidateFinalPlan:
  - All in-scope items have tasks
  - No tasks exceed scope
  - Wave dependencies correct
  - Sub-tasks have criteria
  - Review feedback populated

- **Action** — SaveFinalPlan: Save `{OUT_DIR}/spectre_plan.md`

- **Action** — GenerateSummary: Return to SPECTRE:
  > **SPECTRE_PLAN COMPLETE**
  > Plan: {path} | Waves: {N} | Parents: {M} | Sub-tasks: {P}
  > Autonomous Decisions: {count} | Review: {incorporated}/{total}
  > Ready for: `/spectre:execute`

---
description: 👻 | Transform requirements into executable tasks - primary agent
---

# create_tasks: Unified Task Breakdown

## Description
- Transform requirements into detailed, actionable task lists with dependency analysis and execution options.
- Adapts to available context: uses existing research when sufficient, conducts research when needed.
- Outputs both sequential and parallel execution strategies.
- Scales naturally: generates as many phases and tasks as the scope requires.

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

---

## Step 1 - Establish Context

### 1a. Determine Output Location
- `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
- **If** user specifies path → `TASK_DIR={that value}`
- **Else** → `TASK_DIR=docs/active_tasks/{branch_name}`
- Ensure dirs exist: `mkdir -p "${TASK_DIR}/specs" "${TASK_DIR}/research" "${TASK_DIR}/clarifications"`

### 1b. Scan Available Artifacts
Inventory what exists in `TASK_DIR/`:
- [ ] `task_summary.md` — scope/objectives
- [ ] `prd.md` — detailed requirements
- [ ] `ux.md` — user experience specs
- [ ] `plan.md` — technical approach
- [ ] `task_context.md` — technical research
- [ ] `research/*.md` — analysis docs

Also note: thread context, user-provided docs, ARGUMENTS content.

### 1c. Assess Complexity
**Simple task** (research likely unnecessary):
- Single file/component change
- Clear pattern already exists in codebase
- Scope explicitly stated, no ambiguity

**Complex task** (research likely needed):
- Multi-component or cross-cutting
- New patterns or integrations
- Unclear technical approach

---

## Step 2 - Research Decision

### 2a. Do We NEED Research?
Based on complexity assessment from 1c:
- **If** simple task with clear scope → `NEED_RESEARCH=false`
- **If** complex task or unclear approach → `NEED_RESEARCH=true`

### 2b. Do We HAVE Research? (if NEED_RESEARCH=true)
Assess existing artifacts with judgment:

| Artifact | Check For |
|----------|-----------|
| `task_context.md` | "## Technical Research" section with relevant analysis |
| `research/*.md` | Docs covering codebase patterns, integration points |
| `plan.md` | Technical approach, file locations, architecture decisions |

**Judgment call**: Do existing artifacts sufficiently cover:
- Codebase patterns relevant to this scope?
- Integration points and dependencies?
- Technical approach and target files?

- **If** sufficient coverage → `HAVE_RESEARCH=true`
- **If** gaps exist → `HAVE_RESEARCH=false` (note specific gaps)

### 2c. Action
- **If** `NEED_RESEARCH=false` → proceed to Step 3
- **If** `NEED_RESEARCH=true` AND `HAVE_RESEARCH=true` → read existing, proceed to Step 3
- **If** `NEED_RESEARCH=true` AND `HAVE_RESEARCH=false` → conduct research (Step 2d)

### 2d. Conduct Research (conditional)
- Spawn parallel agents: @codebase-locator, @codebase-analyzer, @codebase-pattern-finder
- Review: `CLAUDE.md`, `README.md`, architecture docs
- Identify: patterns, integration points, technical constraints
- Save to `${TASK_DIR}/task_context.md` under "## Technical Research"

---

## Step 3 - Extract Requirements

### 3a. Gather From All Sources
Read completely (no limits):
- Planning docs: `task_summary.md`, `prd.md`, `plan.md`, `ux.md`
- Thread context: discussed requirements, user goals
- ARGUMENTS: any provided scope

### 3b. Synthesize Requirements
- Extract: what must be built, who uses it, success criteria
- Extract: out of scope, constraints, boundaries
- Number each: REQ-001, REQ-002, etc.
- Categorize: Core functionality, UX, Technical constraints

### 3c. Requirements Boundary Check
- [ ] Clear on what IS explicitly requested?
- [ ] Clear on what is NOT mentioned (exclude)?
- [ ] **Scope Litmus Test**: Would user recognize this as exactly what they asked?

**STRICT COMPLIANCE**: Tasks deliver ONLY what's explicitly stated. No performance optimizations, extra features, future-proofing, or "best practices" unless requested.

---

## Step 4 - Generate Tasks

### 4a. Synthesize Architecture Context
- **Action** — SynthesizeArchitectureContext: Based on research findings, document where this work fits and how we'll approach it.
  - **Where This Fits**: Which system/component this extends, how it connects to existing architecture (with file references)
  - **Technical Approach**: Key pattern we're following, why this approach vs alternatives, what existing code we're leveraging
  - **Key Decisions**: Important technical decisions made and their rationale
  - This section helps the user understand how the work integrates with the product before diving into tasks

### Task Hierarchy (4 Levels)
- **📦 Phase**: Organizational header (no checkbox) — groups related parent tasks
- **📋 Parent Task**: Cohesive deliverable (small-medium scope) — one component/file
- **✓ Sub-task**: Atomic work (single focused change) — single action, 2-3 acceptance criteria
- **✓ Acceptance Criteria**: Verifiable outcomes (not implementation steps)

**Numbering**: Phase 1 → Parent 1.1, 1.2 → Sub-tasks 1.1.1, 1.1.2 → Criteria ✓

### 4b. Create Parent Tasks
- **Action** — CreateParentTasks: Draft as many phases as needed to logically organize work, each with as many parent tasks (📋) as required to cover complete scope.
  - Each parent task = single cohesive deliverable (small-medium scope)
  - Cover ALL extracted requirements with no gaps
  - Group related work into phases for clarity
  - Align with technical approach (from research or existing docs)

### 4c. Break Down Sub-tasks
- **Action** — BreakdownSubTasks: For each parent, generate as many detailed sub-tasks as needed to complete the parent.
  - **Sub-task structure**:
    - Start with action verb (Create, Implement, Add, Update, Configure, Enable)
    - Use technical language freely (components, endpoints, middleware, hooks, schemas)
    - Specify technical patterns and architecture decisions
    - Name specific files, components, or modules when helpful
    - Describe technical behavior and integration points
    - Be specific enough for junior dev to know where to start
    - Completable as a single focused change

  - **What to INCLUDE in sub-tasks:**
    - ✅ Technical terms (JWT, REST, WebSocket, React hooks, SQL queries)
    - ✅ Architecture patterns (middleware, pub/sub, observer, factory)
    - ✅ Integration points (which components connect, API contracts)
    - ✅ File/component names (UserProfileComponent, authMiddleware.ts)
    - ✅ Technical constraints (max file size, timeout duration, data format)

  - **What to AVOID in sub-tasks:**
    - ❌ Code snippets or pseudo-code
    - ❌ Exact function signatures or variable names
    - ❌ Line-by-line implementation steps
    - ❌ Specific library API calls (unless architecturally significant)

  - **Acceptance criteria**:
    - Describe technical behaviors and observable outcomes
    - Include integration expectations and error handling
    - 2-3 verifiable outcomes per sub-task
    - Be specific about technical requirements

  - **Decomposition**: Split if 5+ criteria or multiple concerns

### 4d. Validate Task Structure
- **Action** — VerifyCoverage: Cross-reference tasks against extracted requirements.
  - Map each requirement from Step 3 to at least one task
  - Flag any uncovered requirements → add missing tasks
  - Flag any tasks without requirement justification → remove or justify

- **Action** — ValidateTasks: Validate complete task structure.
  - **Coverage Validation**:
    - [ ] All extracted requirements from Step 3 addressed by tasks?
    - [ ] No gaps in requirement coverage?
  - **Exclusion Validation**:
    - [ ] Adding anything beyond explicit requests?
    - [ ] Avoiding "nice-to-have" additions not requested?
  - **Structure Validation**:
    - [ ] Parent tasks are small-medium scope, sub-tasks are atomic?
    - [ ] Each sub-task has 2-3 acceptance criteria?
    - [ ] Acceptance criteria verifiable (not implementation steps)?

---

## Step 5 - Dependency Analysis & Execution Strategies

### 5a. Map Dependencies
- Review parent tasks (📋 level) for dependencies
- Identify which parent tasks can be completed in parallel vs sequential
- Dependency rules:
  - Parent tasks requiring output from other parents must be sequenced
  - Tasks modifying same files need sequencing or coordination
  - Testing tasks run after implementation tasks
  - Setup/configuration tasks complete before dependent work

### 5b. Generate Sequential Execution Order
Define step-by-step execution order based on dependencies:
```markdown
## Sequential Execution
1. 1.1 - [Name] (no dependencies)
2. 1.2 - [Name] (depends on 1.1)
3. 2.1 - [Name] (depends on 1.1)
4. 2.2 - [Name] (depends on 1.2, 2.1)
...
```

### 5c. Generate Parallel Execution Waves
Group independent parent tasks into waves for parallel execution:
```markdown
## Parallel Execution

### Wave 1 (concurrent)
- 1.1, 2.1 — no dependencies, can start immediately
- Rationale: {why these can run concurrently}

### Wave 2 (after Wave 1)
- 1.2, 2.2 — depend on Wave 1 outputs
- Rationale: {why these depend on Wave 1}

### Wave 3 (after Wave 2)
- 3.1 — integration, needs prior waves complete
- Rationale: {why this needs prior waves}
```

**Note**: Phases (📦) are organizational; execution planning happens at parent task (📋) level.

---

## Step 6 - Document & Output

### 6a. Write tasks.md
- Determine `TASKS_FILE` (default `${TASK_DIR}/specs/tasks.md`; if it already exists, create a scoped name like `${TASK_DIR}/specs/{task_name}_tasks.md` or `tasks_{timestamp}.md` to avoid overwriting).
Save to `${TASKS_FILE}`:

```markdown
# Tasks — {feature name}
*Generated by create_tasks on {timestamp}*

## Objective
{single sentence describing outcome}

## Scope
- **In Scope**: {bullet list}
- **Out of Scope**: {bullet list}

## Requirements Traced
| ID | Description | Source | Tasks |
|----|-------------|--------|-------|
| REQ-001 | ... | prd.md | 1.1, 1.2 |
| REQ-002 | ... | task_summary.md | 2.1 |

---

## Architecture Context

### Where This Fits
- {Which system/component this work extends or modifies}
- {How it connects to existing architecture — with file references}

### Technical Approach
- {Key pattern/approach we're following — reference existing code if applicable}
- {Why this approach vs alternatives}
- {What existing code we're leveraging}

### Key Decisions
- {Decision 1 and rationale}
- {Decision 2 and rationale}

---

## Tasks

### Phase 1: {Phase Name}

#### [1.1] {Parent Task Title}
- [ ] **1.1.1** {Sub-task with technical specifics}
  - [ ] {Technical outcome 1}
  - [ ] {Technical outcome 2}
  - [ ] {Technical outcome 3}

- [ ] **1.1.2** {Sub-task with technical specifics}
  - [ ] {Technical outcome 1}
  - [ ] {Technical outcome 2}

#### [1.2] {Parent Task Title}
- [ ] **1.2.1** {Sub-task with technical specifics}
  - [ ] {Technical outcome 1}
  - [ ] {Technical outcome 2}

### Phase 2: {Phase Name}
...

---

## Execution Strategies

### Sequential Execution
1. Task 1.1 - [Name] (no dependencies)
2. Task 1.2 - [Name] (depends on 1.1)
3. Task 2.1 - [Name] (depends on 1.1)
...

### Parallel Execution

**Wave 1 (concurrent)**: 1.1, 2.1
- Rationale: {why concurrent}

**Wave 2 (after Wave 1)**: 1.2, 2.2
- Rationale: {why sequenced}

**Wave 3 (after Wave 2)**: 3.1
- Rationale: {why sequenced}

---

## Coverage Summary
- Total Requirements Extracted: [X]
- Requirements with Task Coverage: [X] (100%)
- Phases: [N]
- Parent Tasks: [Y]
- Sub-tasks: [Z]
```

### 6b. Present Summary

- **Action** — SummarizeStructure: "Task Breakdown Complete. Structure: {X} phases, {Y} parents, {Z} sub-tasks. \[List phases with parent titles\]. Execution: Sequential ({N} steps) | Parallel ({M} waves). Saved to: {path}"

### 6c. Next Steps Footer

Action — RenderFooter: Use @skill-spectre:spectre skill for Next Steps footer
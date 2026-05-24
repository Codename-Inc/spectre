---
name: "spectre-create_tasks"
description: "👻 | Transform requirements into executable tasks - primary agent"
user-invocable: true
---

# create_tasks

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.


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
- **Else** → `TASK_DIR=docs/tasks/{branch_name}`
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
- **Phase**: Organizational header (no checkbox) — groups related parent tasks
- **Parent Task**: Cohesive deliverable (small-medium scope) — one component/file
- **Sub-task**: Atomic work (single focused change) — single action, 2-3 acceptance criteria
- **Acceptance Criteria**: Executable, verifiable outcomes (see Acceptance Criteria Types below)

**Numbering**: Phase 1 → Parent 1.1, 1.2 → Sub-tasks 1.1.1, 1.1.2 → Criteria

### Right-Sized for AI Execution

Published data on AI agent execution (Cognition's Devin reviews, Anthropic's Claude Code guidance) converges on a bounded sweet spot: each sub-task should be completable in roughly the time a junior would take in a 4–8 hour window — not a multi-day epic, not a 10-line tweak.

**Hard size cap — split a sub-task if ANY of these is true:**
- Touches more than 3 files
- Has more than 5 acceptance criteria
- Would require more than ~200 lines of diff
- Requires a mid-execution judgment call about scope (split the judgment into its own predecessor task)
- Spans more than one concern (e.g., schema + UI in one sub-task)

When splitting, keep the integration-aware principle intact: each split task still names its Producer / Consumer / Replaces.

### Acceptance Criteria Types

Every acceptance criterion MUST be one of three executable types. Prose criteria like "feature works correctly" or "behavior is consistent" are forbidden — an executor cannot self-check them.

1. **Test passes** — `Test \`<test_name>\` passes` (or `tests in <file_path> pass`)
2. **Observable behavior** — A specific, checkable runtime signal: `GET /api/x returns 200 with field \`y\``, `Console logs \`event=loaded params={...}\``, `Button click triggers <handler> within 100ms`
3. **State / file condition** — `File \`<path>\` exists and contains <pattern>`, `Migration \`<id>\` applied`, `Env var \`X\` is read at startup`

Mixing types within a sub-task is fine. What's not fine: criteria the agent cannot verify without asking the user.

### Test-First Task Pairing

For any sub-task that changes observable behavior (not pure refactors or cleanup), pair it with a preceding RED task. Pattern:

- **N.M.k RED**: Write failing test `<test_name>` asserting `<behavior>`. Acceptance: test exists and fails for the documented reason.
- **N.M.(k+1) Build**: Implement `<change>`. Acceptance: the RED test passes; no other tests regress.

This is the TDAD pattern (test-driven agentic development): the failing test is the executor's self-correction signal. Without it, the executor is guessing whether the implementation is right.

Pure refactors, cleanups, and config-only tasks don't require RED pairing — but if behavior changes, the RED comes first.

### Integration-Aware Task Principle

> **"A feature isn't done when pieces exist. It's done when data flows from user action to rendered pixels."**

Every task that creates something must specify:
1. **What it produces** — exact output (variable, return value, prop, event)
2. **What consumes it** — exact consumer (component, hook, handler) that uses the output
3. **What it replaces** — old code path being deprecated (if any)

Tasks without consumers are incomplete. Tasks that don't address old code paths leave dead/duplicate logic.

**Task Types**:
- **Build tasks**: Create a component/hook/utility/function
- **Integration tasks**: Wire producer output to consumer input (MANDATORY for every build task)
- **Cleanup tasks**: Remove/redirect old code paths (MANDATORY when replacing patterns)

### 4b. Create Parent Tasks
- **Action** — CreateParentTasks: Draft as many phases as needed to logically organize work, each with as many parent tasks as required to cover complete scope.
  - Each parent task = single cohesive deliverable (small-medium scope)
  - Cover ALL extracted requirements with no gaps
  - Group related work into phases for clarity
  - Align with technical approach (from research or existing docs)
  - Every parent task carries explicit sequencing in its body:
    - **Predecessor**: parent task IDs that must complete first (or "none")
    - **Unblocks**: parent task IDs this unblocks (or "terminal")
  - The first phase is always **Phase 0 — Dependency Verification** (see 4a-Phase0 below). Other phases start at Phase 1.

### 4a-Phase0. Phase 0 — Dependency Verification (always present)

Before any implementation, generate a Phase 0 containing one sub-task per external dependency listed in `plan.md`'s "External Dependencies — Verify Before Implementation" section. Each sub-task verifies the package exists at the named version and exposes the API the plan assumed.

- Acceptance type: state condition (`npm view <pkg>@<ver>` returns valid metadata) and/or test passes (a minimal import-and-call smoke test).
- If `plan.md` declared "no new packages," Phase 0 is a single sub-task that confirms no new dependencies were silently introduced during implementation (cross-check `package.json` diff at end).
- Phase 0 unblocks Phase 1; it cannot be skipped or run in parallel with Phase 1.

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
    - Technical terms (JWT, REST, WebSocket, React hooks, SQL queries)
    - Architecture patterns (middleware, pub/sub, observer, factory)
    - Integration points (which components connect, API contracts)
    - File/component names (UserProfileComponent, authMiddleware.ts)
    - Technical constraints (max file size, timeout duration, data format)
    - **Produces**: What output this creates (variable name, return value, prop)
    - **Consumed by**: What uses this output (component, hook, render path)
    - **Replaces**: What old code path this supersedes (if any)
    - **Context** (required): a self-contained payload an executor can use without re-reading the full plan. Include:
      - 2–4 file:line refs pulled from research (the exact code being modified or extended)
      - 1 canonical reference pointer (a file:line from `@patterns` research that shows the shape to follow)
      - 1 link/anchor into `plan.md` for the relevant section
    - **Predecessor** (sub-task level, optional): a sub-task ID this depends on. Only when intra-parent ordering is non-obvious.

  - **What to AVOID in sub-tasks:**
    - ❌ Code snippets or pseudo-code
    - ❌ Exact function signatures or variable names
    - ❌ Line-by-line implementation steps
    - ❌ Specific library API calls (unless architecturally significant)

  - **Acceptance criteria**:
    - Every criterion MUST be one of the three executable types (see "Acceptance Criteria Types" above): test passes / observable behavior / state condition.
    - 2–3 criteria per sub-task. If a sub-task needs more than 3 to be checkable, split it.
    - Prose criteria ("works correctly", "is consistent", "user-friendly") are forbidden — they're not self-checkable.

  - **Decomposition (hard size cap)**: Split if ANY of: >3 files touched, >5 criteria, >~200 LOC, mid-task scope judgment required, or more than one concern.

### 4d. Validate Task Structure
- **Action** — VerifyCoverage: Cross-reference tasks against extracted requirements.
  - Map each requirement from Step 3 to at least one task
  - Flag any uncovered requirements → add missing tasks
  - Flag any tasks without requirement justification → remove or justify

- **Action** — ValidateTasks: Validate complete task structure.
  - **Coverage Validation**:
    - [ ] All extracted requirements from Step 3 addressed by tasks?
    - [ ] No gaps in requirement coverage?
    - [ ] Every "Verification" entry from `plan.md` mapped to at least one acceptance criterion?
  - **Exclusion Validation**:
    - [ ] No additions beyond explicit requests?
    - [ ] `plan.md`'s "Out-of-Bounds — DO NOT add" list carried forward verbatim into tasks.md banner?
    - [ ] No task implements anything in the Out-of-Bounds list?
  - **Structure Validation**:
    - [ ] Parent tasks are small-medium scope, sub-tasks are atomic?
    - [ ] Each sub-task has 2-3 acceptance criteria, each one of the three executable types?
    - [ ] No sub-task exceeds the size cap (>3 files / >5 criteria / >~200 LOC / multi-concern / mid-task scope judgment)?
    - [ ] Every behavior-changing sub-task is preceded by a RED test sub-task?
    - [ ] Every sub-task has a Context payload (2–4 file:line refs, 1 canonical reference, 1 plan.md anchor)?
    - [ ] Every parent task has Predecessor and Unblocks declared?
    - [ ] Phase 0 — Dependency Verification is present and unblocks Phase 1?

- **Action** — ValidateIntegration: Verify every build task is wired to consumers.
  - **Consumer Specified**:
    - [ ] Does every "create X" task specify what consumes X?
    - [ ] No orphaned computations (values produced but never used)?
  - **Integration Explicit**:
    - [ ] Is there a task for wiring producer output → consumer input?
    - [ ] For UI features: is there a task verifying data reaches the render path?
  - **Old Paths Addressed**:
    - [ ] If replacing old code, is removal/redirect a task?
    - [ ] No duplicate data sources for the same concern?
  - **Last Mile Covered**:
    - [ ] For every feature affecting what users SEE: task exists to wire to JSX render?

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

## Out-of-Bounds — DO NOT add
*Carried forward verbatim from plan.md. Executors: if a task tempts you to add any of these, stop and ask.*
- {Forbidden addition 1, e.g. "rate limiting"}
- {Forbidden addition 2, e.g. "retry/backoff"}
- {Forbidden addition 3, e.g. "telemetry events"}
- {Forbidden addition 4, e.g. "admin UI"}

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

### Phase 0: Dependency Verification
*Confirms every external dependency in plan.md exists at the declared version before any implementation begins.*

#### [0.1] Verify external dependencies
- **Predecessor**: none
- **Unblocks**: 1.1
- [ ] **0.1.1** Verify each package@version from plan.md "External Dependencies" section exists
  - **Produces**: confirmation log of resolved package metadata
  - **Consumed by**: Phase 1 implementation tasks
  - **Context**:
    - plan.md anchor: `## External Dependencies — Verify Before Implementation`
    - check commands listed in plan section
  - [ ] State condition: `npm view <pkg>@<ver>` returns valid metadata for every package
  - [ ] State condition: no package in the list is flagged as deprecated or security-advised
  - [ ] Test passes: minimal import-and-call smoke for each new package

### Phase 1: {Phase Name}

#### [1.1] {Parent Task Title}
- **Predecessor**: 0.1
- **Unblocks**: 1.2

- [ ] **1.1.1 RED** Write failing test `{test_name}` asserting `{behavior}`
  - **Produces**: a failing test that pins the desired behavior
  - **Consumed by**: 1.1.2 (turns this red to green)
  - **Replaces**: N/A
  - **Context**:
    - `path/to/existing/code.ts:42` — current behavior being changed
    - `path/to/similar/test.ts:18` — canonical test shape to follow
    - plan.md anchor: `### Verification — How We Know This Works`
  - [ ] State condition: file `path/to/test.ts` exists and contains test `{test_name}`
  - [ ] Test passes: the new test fails, with failure message referencing the unimplemented behavior

- [ ] **1.1.2 Build** {Implement the change}
  - **Produces**: {output variable/value/prop}
  - **Consumed by**: {component/hook that uses this}
  - **Replaces**: {old code path, or "N/A" if new}
  - **Context**:
    - `path/to/file.ts:120` — code to modify
    - `path/to/file.ts:180` — adjacent code that must not regress
    - `path/to/canonical/example.ts:55` — pattern to follow (from @patterns research)
    - plan.md anchor: `## Technical Approach`
  - [ ] Test passes: `{test_name}` (from 1.1.1) now passes
  - [ ] Test passes: existing tests in `path/to/related.test.ts` still pass
  - [ ] Observable behavior: `{specific runtime signal, e.g. log line, HTTP response shape}`

#### [1.2] {Parent Task Title} — Integration
- **Predecessor**: 1.1
- **Unblocks**: {next parent or "terminal"}

- [ ] **1.2.1** Wire {1.1.2 output} to {consumer}
  - **Wires**: {1.1.2 output} → {consumer component/render}
  - **Removes**: {old code path being replaced}
  - **Context**:
    - `path/to/consumer.tsx:30` — where the wire lands
    - `path/to/old/path.ts:12` — old code path to remove
    - plan.md anchor: `### Technical Approach`
  - [ ] Test passes: integration test asserting consumer renders new data source
  - [ ] State condition: old code path file `path/to/old/path.ts` deleted or import removed
  - [ ] Observable behavior: data flows from producer to rendered output (with `{specific assertion}`)

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

Action — RenderFooter: Use Skill(spectre-guide) skill for Next Steps footer
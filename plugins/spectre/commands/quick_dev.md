---
description: 👻 | Quickly scope, research, & plan s/m tasks - primary agent
---

# quick_dev: Capture → Scope → Research → Clarify → Plan → Document

## Description
- **What** — Lightweight task workflow for bug fixes and small features. Confirms scope boundaries early, researches efficiently using parallel agents, clarifies ambiguities interactively, and produces implementation plan with descriptive tasks.
- **Outcome** — Validated scope boundaries, comprehensive research synthesis, implementation plan with technically-detailed tasks (no code samples), all documented in a scoped quick task plan file (default `quick_task_plan.md`, but use a scoped filename if one already exists).

## ARGUMENTS Input

Optional user input to seed this workflow.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/7) - Immediate Reply & Gather Context

- **Action** — ImmediateReply: Respond immediately before running any commands or tools.
  - Send structured template to gather comprehensive task information without preamble
  - **If** ARGUMENTS section provided → acknowledge under "Initial Context" heading, then request any missing details
  - **Else** → send request without assumptions from branch/path
  - Template: "I'm excited to help! Let's gather context. Please share: **Task Description** (what/why/type), **Supporting Materials** (docs/designs/tickets/mockups), **Additional Context** (requirements/scope/constraints/dependencies). Don't organize perfectly - just dump everything."
  - **CRITICAL**: Do NOT run any tool calls in this step
- **Wait** — User provides complete task description and materials

## Step (2/7) - Read Referenced Files

- **Action** — ReadFiles: Read any files mentioned by user FULLY before confirming scope.
  - **CRITICAL**: Use Read tool WITHOUT limit/offset to get complete files.
  - Read in main context before spawning sub-agents.

## Step (3/7) - Confirm Scope Boundaries

**Goal**: Establish clear in-scope/out-of-scope boundaries BEFORE research to prevent wasted effort.

- **Action** — SummarizeUnderstanding: Based on user input and referenced files, present scope summary for confirmation:
  > **📋 Scope Confirmation**
  >
  > **Objective**: [1-2 sentence summary of what we're building/fixing]
  >
  > **✅ In Scope**:
  > - [Specific item 1]
  > - [Specific item 2]
  > - [Specific item 3]
  >
  > **❌ Out of Scope**:
  > - [Explicit exclusion 1 - e.g., "No UI changes"]
  > - [Explicit exclusion 2 - e.g., "No database migrations"]
  > - [Explicit exclusion 3 - e.g., "No performance optimization"]
  >
  > **Constraints**: [Any mentioned constraints - scope, tech stack, etc.]
  >
  > Does this match your expectations? Reply with corrections or 'Confirmed' to proceed.

- **Wait** — User confirms or corrects scope boundaries
- **Action** — UpdateScope: If user provides corrections, update understanding and re-confirm if needed.

## Step (4/7) - Research & Analyze

- **Action** — DecomposeTask: Break request into composable research areas.
  - Consider patterns, connections, architectural implications.
  - Identify components/patterns/concepts to investigate.
  - Generate task name: `{type}-{descriptive-name}`.
  - Use confirmed scope boundaries to focus research.
- **Action** — SpawnAgents: Launch specialized agents in parallel for comprehensive research.
  - **codebase-locator**: Find WHERE files/components live
  - **codebase-analyzer**: Understand HOW specific code works
  - **codebase-pattern-finder**: Find similar implementation examples
  - **web-search-researcher**: External docs (only if user asks; return LINKS)
  - Run multiple agents in parallel when searching different things.
- **Action** — WaitAndSynthesize: Wait for ALL agents to complete, then compile findings.
  - Prioritize live codebase findings as source of truth.
  - Connect findings across components.
  - Include specific file paths and line numbers.
  - Highlight patterns, connections, architectural decisions.

## Step (5/7) - Clarifications (via AskUserQuestion)

- **Action** — IdentifyAmbiguities: Based on research findings, identify 3-5 questions that would eliminate remaining ambiguity.
  - **Important**: Do NOT ask questions answerable by codebase research (you just did that).
  - Focus on: scope edge cases, trade-off decisions, UX specifics, integration preferences.

- **Action** — AskClarifyingQuestions: Use the `AskUserQuestion` tool to ask clarifying questions.
  - For questions with multiple approaches, include options with:
    - **Label**: Short option name (1-5 words)
    - **Description**: Include Pros, Cons, Trade-offs, Impact, and Recommendation
  - Example option description format:
    ```
    Pros: Simpler implementation, faster delivery
    Cons: Less flexible for future changes
    Trade-offs: Speed vs extensibility
    Impact: Maintainability
    Recommendation: Good for MVP, revisit if needs expand
    ```
  - For simple yes/no or single-choice questions, use straightforward options.

- **Action** — ProcessAnswers: Incorporate user's answers into planning. If user selects "Other", use their custom input.

## Step (6/7) - Create Implementation Plan

- **Action** — DetermineOutputDir: Decide where to save artifacts for this workflow.
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies `target_dir/path` → `OUT_DIR={that value}`
  - **Else** → `OUT_DIR=docs/active_tasks/{branch_name}`
  - `mkdir -p "OUT_DIR/specs"`

### Task Hierarchy (4 Levels)
- **📦 Phase**: Organizational header (no checkbox) — groups related parent tasks
- **📋 Parent Task**: Cohesive deliverable (small-medium scope) — one component/file/command
- **✓ Sub-task**: Atomic work (single focused change) — single action verb, 2-3 acceptance criteria
- **✓ Acceptance Criteria**: Verification checklist — verifiable outcomes, not implementation steps

**Numbering**: Phase 1 → Parent 1.1, 1.2 → Sub-tasks 1.1.1, 1.1.2 → Criteria ✓

- **Action** — ValidateRequirements: Before creating plan, verify against confirmed scope.
  - [ ] Can you cite specific scope items for each planned task?
  - [ ] Is each task minimal implementation needed to satisfy scope?
  - [ ] Do all tasks collectively address ALL in-scope items?
  - [ ] Are you adding anything beyond confirmed scope?
  - [ ] **User Recognition Test**: Would user recognize this as exactly what they confirmed?
  - **If validation fails** → revise plan to focus solely on confirmed scope.

- **Action** — GeneratePlan: Determine `QUICK_PLAN_FILE` (default `{OUT_DIR}/specs/quick_task_plan.md`; if it already exists, create a scoped name like `{OUT_DIR}/specs/{task_name}_quick_task_plan.md` or `quick_task_plan_{timestamp}.md` to avoid overwriting) and create the plan there with parent/sub-task structure.
  - Plan Structure (in order):
    1. Agreed Scope (Objective, In Scope, Out of Scope, Constraints)
    2. Task Overview (clear description of what will be built)
    3. Problem Statement (user problem this solves)
    4. Research Summary (key findings from codebase research)
    5. Approach Summary (strategy and integration points)
    6. Implementation Tasks (parent/sub-task hierarchy with acceptance criteria)
    7. Best Practices Integration (recommendations from research)
    8. Supporting Materials (links and references)
    9. Success Criteria (how we'll know it's complete)

- **Action** — CreateParentTasks: Draft phases and parent tasks to cover scope.
  - Each parent task = single cohesive deliverable (small-medium scope)
  - Cover ALL in-scope items with no gaps
  - Group related work into phases for clarity
  - Align with mentioned technical approach (if any)

- **Action** — GovernorCheck: Verify scope fits quick_dev bounds.
  - **Soft limits**: ~3 phases max, ~8 parent tasks max
  - **If scope exceeds limits**:
    - Message: "This scope is growing beyond quick_dev bounds (~3 phases, ~8 parent tasks). The work may benefit from the deeper research and architecture context that `/spectre:create_tasks` provides. Would you like to: (A) Continue with quick_dev and keep it tight, or (B) Escalate to create_tasks for more thorough treatment?"
    - **Wait** for user decision
    - **If escalate** → Use SlashCommand tool: `/spectre:create_tasks` with current context
  - **If within limits** → proceed with task breakdown

- **Action** — BreakdownSubTasks: For each parent, generate as many detailed sub-tasks as needed to complete the parent (typically 2-8).
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
  - Assume reader is junior dev with codebase awareness

  - Format:
    ```markdown
    ## Phase 1: {Phase Name}

    ### [1.1] {Parent Task Title - e.g., Implement JWT authentication middleware}
    - [ ] **1.1.1** {Sub-task with technical specifics - e.g., Create Express middleware for token verification}
      - [ ] {Technical outcome 1 - e.g., Middleware extracts JWT from Authorization header}
      - [ ] {Technical outcome 2 - e.g., Invalid/missing tokens return 401 with error message}
      - [ ] {Technical outcome 3 - e.g., Valid tokens attach user object to request}

    - [ ] **1.1.2** {Sub-task with technical specifics - e.g., Implement token refresh endpoint}
      - [ ] {Technical outcome 1 - e.g., POST /auth/refresh accepts refresh token in body}
      - [ ] {Technical outcome 2 - e.g., Returns new access token if refresh token valid}

    ### [1.2] {Parent Task Title}
    - [ ] **1.2.1** {Sub-task with technical specifics}
      - [ ] {Technical outcome 1}
      - [ ] {Technical outcome 2}
    ```

- **Action** — VerifyCoverage: Cross-reference tasks against confirmed scope.
  - Map each in-scope item to at least one task
  - Flag any uncovered scope items → add missing tasks
  - Flag any tasks without scope justification → remove or justify

- **Action** — ValidateTasks: Validate complete task structure.
  - **Coverage Validation**:
    - [ ] All in-scope items addressed by tasks?
    - [ ] No gaps in scope coverage?
  - **Exclusion Validation**:
    - [ ] Adding anything beyond confirmed scope?
    - [ ] Avoiding "nice-to-have" additions not in scope?
  - **Structure Validation**:
    - [ ] Parent tasks are small-medium scope, sub-tasks are atomic?
    - [ ] Each sub-task has 2-3 acceptance criteria?
    - [ ] Acceptance criteria verifiable (not implementation steps)?
  - **If validation fails** → revise tasks to focus solely on confirmed scope

## Step (7/7) - Document & Handoff

- **Action** — PresentToUser: Show brief summary: "Task Documentation Created" with path, brief overview, and ready checklist (Scope ✅, Research ✅, Approach ✅, Plan ✅, Best practices ✅).
- **Action** — ReadNextStepsGuide: Read `.claude/spectre/next_steps_guide.md` to source relevant next step options for current phase.
- **Action** — RenderFooter: End reply with single 60-column Next Steps footer using options from guide; include up to 2 manual actions when appropriate (no additional lists in body).

### Next Steps Footer Format

**Footer format:**
```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ 🧭 Phase: {phase} | 🟢 {status} | 🚧 {blockers}           ║
╟──────────────────────────────────────────────────────────╢
║ 🎯 Next — {concise recommendation; 1–2 lines max}         ║
║                                                          ║
║ ➡️ Options:                                              ║
║ - /create_tasks — {why}                                   ║
║ - /execute — {why}                                        ║
║ - {manual action} — {why}                                 ║
║   … up to 5 total; ≤2 manual                              ║
║                                                          ║
║ 💬 Reply — {only if textual reply expected}               ║
╚══════════════════════════════════════════════════════════╝
```

Set Status to `Pending Input` when awaiting user; otherwise use `Active`, `Blocked`, `On Hold`, or `Complete`.

## Success Criteria

- [ ] Immediate reply sent; context request sent (Step 1 - no tool calls)
- [ ] User provided complete task description and materials
- [ ] Referenced files read completely in main context (Step 2)
- [ ] Scope summary presented with In Scope / Out of Scope / Constraints (Step 3)
- [ ] User confirmed or corrected scope boundaries (Step 3)
- [ ] Task decomposed using confirmed scope; agents spawned and completed in parallel (Step 4)
- [ ] Research synthesized with file paths, patterns, architectural implications (Step 4)
- [ ] Ambiguities identified and clarifying questions asked via AskUserQuestion tool (Step 5)
- [ ] Questions with multiple approaches include options with Pros/Cons/Trade-offs/Impact/Recommendation (Step 5)
- [ ] User answers incorporated into planning (Step 5)
- [ ] Output directory determined (`OUT_DIR`) using branch name or user-specified path (Step 6)
- [ ] Requirements validation against confirmed scope passed (Step 6)
- [ ] Governor check performed: scope within ~3 phases, ~8 parent tasks (Step 6)
- [ ] If scope exceeded limits: user chose to continue tight OR escalated to create_tasks (Step 6)
- [ ] Phases and parent tasks (📋) created within quick_dev bounds (Step 6)
- [ ] Parent tasks sized at small-medium scope each (Step 6)
- [ ] Each parent task has as many detailed sub-tasks as needed (typically 2-8, each atomic) (Step 6)
- [ ] Each sub-task has 2-3 acceptance criteria (verifiable outcomes) (Step 6)
- [ ] Tasks include technical specificity (components, patterns, integration points) but NO code samples (Step 6)
- [ ] Coverage verification completed (all in-scope items mapped to tasks) (Step 6)
- [ ] Task validation completed (coverage, exclusion, structure checks passed) (Step 6)
- [ ] `quick_task_plan` saved without overwriting existing docs (scoped filename used if default exists) with all 9 required sections under `{OUT_DIR}/specs/` (Step 6)
- [ ] User presented with complete documentation and aligned next steps (Step 7)
- [ ] Next steps guide read and relevant options sourced for footer (Step 7)
- [ ] Single Next Steps footer rendered (Step 7)

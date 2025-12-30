---
description: 👻 | Project kickoff with deep research & MVP pathfinding - primary agent
---

# kickoff: Deep Codebase Research + Implementation Path Discovery

## Description
- **What** — Conduct comprehensive codebase research, gather external best practices, synthesize deep understanding with file:line evidence, and identify MVP implementation path with clear decision points
- **Outcome** — Comprehensive kickoff document with architecture insights, concrete code references, gap analysis, and implementation options saved to a scoped kickoff file under `OUT_DIR/` (default `{task_name}_kickoff.md`, but use a scoped filename if one already exists), followed by scoping conversation to eliminate ambiguities before planning

## Variables

### Dynamic Variables
- `project_context`: Project description, goals, prior docs — (via ARGUMENTS: $ARGUMENTS)

### Static Variables
- `out_dir`: docs/active_tasks/{task_name}/kickoff

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/8) - Acknowledge & Clarify Intent

- **Action** — ImmediateReply: Respond immediately before running any tools.
  - **If** ARGUMENTS exists → acknowledge project context; identify:
    - What are we exploring?
    - What decision are we heading toward?
    - What does "success" look like for this kickoff?
  - **Else** → prompt: "I'm ready to help kick off a project. What are we building? Share any prior thinking, docs, or context and I'll help establish a deep understanding of the codebase and identify the path forward."
  - **CRITICAL**: No tool calls in this step
- **Wait** — User provides project context (if needed)

## Step (2/8) - Gather Prior Context & Decompose Research

- **Action** — ReadMentionedDocs: Read any referenced documents FULLY before research.
  - Roadmaps, specs, prior discussions, tickets
  - **CRITICAL**: Read in main context (not subagent) to inform research strategy
  - Extract: original vision, constraints, decisions already made, open questions

- **Action** — DecomposeResearchAreas: Break project into composable research areas.
  - Ultrathink about underlying patterns, connections, architectural implications
  - Identify specific components, patterns, concepts to investigate
  - Consider relevant directories, files, architectural patterns
  - What existing code will this touch or extend?
  - What data flows through the relevant systems?
  - What patterns does this codebase use that we need to understand?

- **Action** — CreateResearchPlan: Use TodoWrite to track all research subtasks.
  - Create todo items for each research area identified
  - Include both codebase investigation and external research needs
  - Track progress as agents complete their work

## Step (3/8) - Deep Parallel Research Phase

- **Action** — SpawnResearchAgents: Launch parallel agents for COMPREHENSIVE context gathering.

  **Codebase Research** (DEEP - not surface-level):

  - **@codebase-locator**: Find WHERE relevant files/components live
    - Search for all files related to the project area
    - Identify entry points, handlers, data models, utilities
    - Map the directory structure for relevant domains

  - **@codebase-analyzer**: Understand HOW existing code works IN DETAIL
    - Instruct to trace data flow through the system
    - Identify dependencies and integration points
    - Document behavior, edge cases, error handling
    - **Request specific file:line references for ALL findings**
    - Analyze function signatures, return types, side effects
    - Look for existing tests that document expected behavior

  - **@codebase-pattern-finder**: Find similar implementations we can model after
    - Look for existing patterns we should follow
    - Find anti-patterns or tech debt we should avoid
    - Identify code we can reuse or extend
    - Find examples of similar features already implemented
    - **Return concrete code examples with file:line references**

  **Agent Strategy** (CRITICAL - follow this sequence):
  - Start with locator → identify promising areas
  - Use analyzer on ALL promising findings (don't stop at first result)
  - Run multiple agents in parallel for different search areas
  - Each agent MUST return FILE:LINE references, not just descriptions
  - **If initial findings are shallow, spawn follow-up agents for deeper investigation**
  - Don't accept surface-level "this file exists" — demand understanding of HOW it works

  **Web Research** (MANDATORY - always spawn):
  - **@web-search-researcher**: Search for similar solutions, best practices, production examples
    - Search for: "[problem domain] best practices", "[similar product] architecture", "[technology] production examples"
    - Look for: how others solved similar problems, common pitfalls, recommended patterns
    - **IMPORTANT**: Return LINKS with findings for reference
    - Search GitHub for similar implementations in production apps
    - Find relevant blog posts, case studies, documentation
  - **CRITICAL**: Web research is NOT optional. Every kickoff benefits from external context.

  **3rd Party Libraries** (if relevant):
  - Use Context7 MCP tool for library documentation
  - When specific libraries are central to implementation

- **Action** — WaitForAgents: ALL agents must complete before synthesis.
  - Update TodoWrite as each agent completes
  - If any agent returns shallow findings, spawn follow-up agents
  - Do not proceed until you have DEEP understanding with concrete evidence

## Step (4/8) - Synthesize Deep Understanding

- **Action** — CompileCodebaseFindings: Rigorous synthesis of codebase research.
  - **Prioritize live codebase findings as primary source of truth**
  - Connect findings across different components
  - **Include specific file paths and line numbers for ALL references**
  - Highlight patterns, connections, architectural decisions
  - Document data flow through the relevant systems
  - Answer: "How does this codebase currently handle [relevant area]?"

- **Action** — ExtractArchitectureInsights: Identify patterns and conventions.
  - What patterns does this codebase use? (with examples)
  - What conventions should we follow? (naming, structure, error handling)
  - What design decisions constrain our options?
  - What can we reuse vs. what must we build new?
  - What tech debt or anti-patterns should we avoid propagating?

- **Action** — CompileExternalInsights: Synthesize web research findings.
  - **Prior Vision**: What was originally envisioned and why
  - **Industry Patterns**: How do others solve this? (with links)
  - **Best Practices**: What should we adopt?
  - **Pitfalls**: What should we avoid?

- **Action** — PerformGapAnalysis: What we have vs what we need.
  - Current capabilities (with file references)
  - Required capabilities for this project
  - Clear articulation of the gap
  - What's missing vs what needs modification

- **Action** — IdentifyMVP: Surface the smallest valuable increment.
  - What's the core value proposition?
  - What's the minimum that delivers that value?
  - What can be deferred without losing the core benefit?
  - Based on codebase research: what's actually easy vs hard to build?

- **Action** — MapOptions: Identify 2-3 implementation approaches.
  - For each option:
    - Approach summary (1-2 sentences)
    - Key technical decisions
    - What existing code we'd leverage (with file refs)
    - What we'd build new
    - Dependencies and unknowns
    - Effort sense (informed by codebase complexity, not time estimate)
    - Trade-offs

- **Action** — IdentifyDecisionPoints: Surface decisions that need user input.
  - Architecture choices (informed by current patterns)
  - Scope boundaries (what's in MVP vs later)
  - Technology selections
  - Integration approach
  - Pattern choices (follow existing vs introduce new)

## Step (5/8) - Generate & Save Kickoff Document

- **Output Location** — DetermineOutputDir: Decide where to save artifacts.
  - Derive `task_name` from project context (kebab-case, e.g., "user-authentication", "dark-mode-toggle")
  - **If** user specifies `target_dir/path` → `OUT_DIR={that value}`
  - **Else** → `OUT_DIR=docs/active_tasks/{task_name}/kickoff`
  - `mkdir -p "OUT_DIR"`

- **Action** — GatherMetadata: Collect document metadata for YAML frontmatter.
  - Current date/time with timezone (ISO format)
  - Current commit hash (`git rev-parse HEAD`)
  - Current branch name
  - Repository name

- **Action** — CreateDocument: Structure kickoff document with YAML frontmatter and comprehensive findings.
  - **Frontmatter** (YAML at top):
    ```yaml
    ---
    date: [ISO format with timezone]
    git_commit: [commit hash]
    branch: [branch name]
    repository: [repo name]
    topic: "[Project Name] Kickoff"
    tags: [kickoff, research, relevant-component-names]
    status: complete
    last_updated: [YYYY-MM-DD]
    last_updated_by: Claude
    ---
    ```
  - **Document Sections** (in order):
    1. Title: `# Kickoff: [Project Name]`
    2. Metadata header (Date, Git Commit, Branch, Repository)
    3. Project Context (original user input/vision)
    4. Research Summary (high-level synthesis answering "what did we learn?")
    5. **Detailed Codebase Findings** (by component/area with file:line references)
       - Organize by logical area (e.g., "Authentication Flow", "Data Layer", "API Handlers")
       - Each finding must have concrete file:line references
       - Include code snippets for key patterns
    6. **Code References** (consolidated path/to/file:line with descriptions)
       - Quick-reference table of all files discovered
       - Purpose of each file in context of this project
    7. **Architecture Insights** (patterns, conventions, design decisions)
       - Patterns to follow (with examples)
       - Conventions observed (naming, structure, error handling)
       - Constraints that affect our options
    8. External Research (best practices, similar solutions, links)
       - What others do (with links)
       - Recommended patterns
       - Pitfalls to avoid
    9. Gap Analysis (what we have → what we need)
    10. MVP Suggestion (core value, must-haves, deferred items)
    11. Implementation Options (2-3 approaches with trade-offs)
        - Each option references specific code we'd modify/extend
    12. Decision Points (choices that need user input)
    13. Open Questions (areas needing clarification before planning)
    14. Related Resources (links to external docs, examples, references)

- **Action** — AddGitHubPermalinks: Generate GitHub permalinks if applicable.
  - Check if on main branch or commit pushed: `git branch --show-current` and `git status`
  - **If** on main/master OR pushed → generate permalinks:
    - Get repo info: `gh repo view --json owner,name`
    - Create: `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}`
    - Replace local file references with permalinks in document
  - **Else** → keep local file references

- **Action** — SaveDocument: Save kickoff document BEFORE presenting to user.
  - Filename: `{task_name}_kickoff.md` (if this already exists, use a scoped variant like `{task_name}_kickoff_{timestamp}.md` to avoid overwriting)
  - Path: `{OUT_DIR}/{filename_selected}` (use actual saved path in messaging)
  - **CRITICAL**: Document must be saved before proceeding to Step 6

## Step (6/8) - Present Summary & Scoping Questions

- **Action** — PresentSummary: Share concise, energizing summary with reference to full document and a clear MVP path.

  **Format:**
  ```
  ## Kickoff Complete — Ready to Move

  I've saved the full research document to `{path}`. This will be our shared knowledge base as we plan and build.

  ### Quick Summary

  **The Vision**: [1-2 sentences on what we're building and why]

  **What Exists Today**:
  - [Key component 1] — `path/to/file:line` — [what it does]
  - [Key component 2] — `path/to/file:line` — [what it does]
  - [Key component 3] — `path/to/file:line` — [what it does]

  **Architecture Insights**:
  - [Pattern 1 we should follow] — see `path/to/example:line`
  - [Convention 2 to maintain]
  - [Constraint 3 that affects our approach]

  **What I Learned from External Research**:
  - [Key insight #1 with link]
  - [Key insight #2 with link]
  - [Key insight #3 with link]

  **The Gap**: [What we have → what we need, 1-2 sentences]

  **Recommended MVP Path**:
  - [1-2 sentences on the smallest valuable slice to build first, tied to existing code and constraints]

  ---

  ### Scoping Questions (Before We Lock the Plan)

  Before we proceed to planning, I'd like to clarify a few things:

  1. **[Specific question about scope/boundaries]**
     - Option A: [description] — would leverage `existing/code:line`
     - Option B: [description] — would require new [component]

  2. **[Specific question about technical approach]**
     - Based on the codebase patterns, I'd suggest [X], but [Y] is also viable
     - [Why this matters for implementation]

  3. **[Specific question about priorities/constraints]**
     - [Context on why this affects the plan]

  What are your thoughts on these? I want to make sure we're aligned before creating a plan.
  ```

- **Action** — EngageInScoping: Wait for user response and continue clarifying.
  - Ask follow-up questions as needed
  - Update understanding based on user input
  - **DO NOT** offer planning paths until ambiguities are resolved
  - **DO NOT** ask questions for things that can easily be learned with more codebase research — do the research instead

## Step (7/8) - Handle Follow-ups

- **Action** — HandleFollowUps: If user has follow-up questions, update the kickoff document.
  - **If** clarifications provided:
    - Update frontmatter: `last_updated`, add `last_updated_note: "Clarified [brief description]"`
    - Add new section: `## Scoping Clarifications [timestamp]`
    - Document the decisions made
  - **If** more research needed:
    - Spawn additional agents for deeper investigation
    - **Demand file:line evidence from follow-up research**
    - Update document with new findings
  - **If** user asks "how does X work?" or "show me the code for Y":
    - This is a research request — investigate thoroughly
    - Add findings to the document with full evidence
  - Continue scoping conversation until ambiguities resolved

## Step (8/8) - Transition to Scope Flow

- **Action** — SummarizeKickoffFindings: Present concise summary of what kickoff established.
  ```
  ## Kickoff Complete — Ready for Scope Definition

  Based on our research and scoping conversation, here's what we've established:

  **Core Understanding:**
  - **User Problem**: [1-2 sentences on the problem we're solving]
  - **User Value**: [Why this matters]

  **What We Learned:**
  - [Key codebase finding 1] — `path/to/file:line`
  - [Key codebase finding 2] — `path/to/file:line`
  - [Key external insight with link]

  **Key Decisions Made:**
  - [Decision 1 from scoping conversation]
  - [Decision 2]
  - [Decision 3]

  **Remaining Ambiguities** (to resolve in scope definition):
  - [Ambiguity 1 — e.g., "Exact scope boundaries for MVP"]
  - [Ambiguity 2 — e.g., "Success criteria specifics"]
  - [Ambiguity 3 — e.g., "UX details"]
  ```

- **Action** — OfferScopeTransition: Present option to proceed with structured scope definition.
  ```
  ---

  ### Next: Lock Down the Scope

  The kickoff research is complete and saved to `{OUT_DIR}/{task_name}_kickoff.md`.

  **Recommended**: Proceed with `/spectre:scope` to create a structured scope document with:
  - Clear in/out boundaries
  - Success criteria
  - User journeys
  - Key decisions documented

  This produces a `scope.md` that pairs with the kickoff doc — together they form the complete foundation for planning.

  **Options:**
  1. **"Proceed with scope"** → I'll run the scope flow now, skipping the exploration phase (we just did that)
  2. **"Skip to planning"** → If scope feels clear enough, go directly to `/spectre:plan`
  3. **"I need to think"** → Park this with `/spectre:handoff` and resume later

  What would you like to do?
  ```

- **Wait** — User chooses direction

- **Action** — ExecuteScopespectre: If user chooses to proceed with scope:
  - Run `/spectre:scope` slash command with the following context in ARGUMENTS:
    ```
    FROM_KICKOFF=true
    KICKOFF_DOC={OUT_DIR}/{task_name}_kickoff.md
    SKIP_EXPLORATION=true

    Context from kickoff:
    - Core Problem: [from summary above]
    - User Value: [from summary above]
    - Decisions Made: [list from summary]
    - Remaining Ambiguities: [list from summary]
    - Key Code References: [file:line refs from kickoff]
    ```
  - The scope flow will skip Step 2 (Interactive Exploration) and proceed directly to Step 3 (Targeted Clarifications)
  - Scope flow will use kickoff findings to inform clarification questions

- **Action** — AlternatePaths: If user chooses different direction:
  - **If** "Skip to planning" → suggest `/spectre:plan` with kickoff doc as context
  - **If** "I need to think" → run `/spectre:handoff` to save session state

## Success Criteria

**Step 1 - Acknowledge**:
- [ ] Immediate reply sent (no tool calls)
- [ ] Project context acknowledged
- [ ] Exploration goal and success criteria identified

**Step 2 - Prior Context & Decomposition**:
- [ ] All mentioned docs read FULLY in main context
- [ ] Original vision and constraints extracted
- [ ] Research areas decomposed with ultrathinking about patterns/connections
- [ ] TodoWrite used to create research plan tracking all subtasks

**Step 3 - Deep Research**:
- [ ] @codebase-locator dispatched to find all relevant files
- [ ] @codebase-analyzer dispatched with instructions for DEEP analysis and file:line refs
- [ ] @codebase-pattern-finder dispatched to find similar implementations with code examples
- [ ] Agent strategy followed (locator → analyzer on findings → parallel for breadth)
- [ ] @web-search-researcher dispatched (MANDATORY)
- [ ] Web researcher instructed to return LINKS
- [ ] All agents completed before synthesis
- [ ] Follow-up agents spawned if initial findings were shallow
- [ ] ALL findings include file:line references (not just file names)

**Step 4 - Synthesize**:
- [ ] Codebase findings compiled with file:line references throughout
- [ ] Data flow through relevant systems documented
- [ ] Architecture insights extracted (patterns, conventions, constraints)
- [ ] External insights compiled with links
- [ ] Gap clearly articulated (have vs need)
- [ ] MVP scope identified (informed by what's actually easy/hard in codebase)
- [ ] 2-3 implementation options mapped with trade-offs
- [ ] Options reference specific code we'd modify/extend
- [ ] Decision points surfaced

**Step 5 - Generate Document**:
- [ ] Task name derived from project context (kebab-case)
- [ ] Output directory determined (`docs/active_tasks/{task_name}/kickoff`)
- [ ] Kickoff doc saved without overwriting existing files (scoped filename used if `{task_name}_kickoff.md` already present)
- [ ] Metadata gathered for frontmatter
- [ ] Kickoff document created with YAML frontmatter
- [ ] All 14 required sections included
- [ ] Detailed Codebase Findings section has file:line refs for every finding
- [ ] Code References section provides quick-reference table
- [ ] Architecture Insights section documents patterns to follow
- [ ] GitHub permalinks generated if applicable
- [ ] Document SAVED before presenting to user

**Step 6 - Present & Scope**:
- [ ] Summary presented with file:line references for key components
- [ ] Architecture insights highlighted
- [ ] External research insights highlighted with links
- [ ] Scoping questions posed with options tied to code realities
- [ ] Waiting for user response (not jumping to planning)

**Step 7 - Follow-ups**:
- [ ] Clarifications documented in kickoff file
- [ ] Additional deep research performed if needed (with file:line evidence)
- [ ] Scoping conversation continues until ambiguities resolved

**Step 8 - Transition to Scope Flow**:
- [ ] Kickoff findings summarized (problem, value, learnings, decisions, ambiguities)
- [ ] Scope transition options presented to user
- [ ] User choice received
- [ ] **If** "Proceed with scope" → `/spectre:scope` invoked with FROM_KICKOFF context
- [ ] **If** "Skip to planning" → `/spectre:plan` suggested with kickoff doc reference
- [ ] **If** "I need to think" → `/spectre:handoff` executed
- [ ] Scope flow skips Step 2 when FROM_KICKOFF=true

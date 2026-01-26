---
description: 👻 | Project kickoff with deep research & MVP pathfinding - primary agent
---

# kickoff: Deep Codebase Research + MVP Path Discovery

Comprehensive codebase research, external best practices, and MVP implementation path with file:line evidence. Output: kickoff document with architecture insights, gap analysis, and implementation options saved to `docs/tasks/{task_name}/kickoff/`.

## ARGUMENTS

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1: Acknowledge & Clarify

- **Action** — ImmediateReply: Respond before any tools.
  - **If** ARGUMENTS → acknowledge context, identify: what we're exploring, what decision we're heading toward, what success looks like
  - **Else** → prompt for project context
  - **CRITICAL**: No tool calls in this step

## Step 2: Gather Context & Decompose

- **Action** — ReadMentionedDocs: Read referenced docs FULLY in main context (not subagent). Extract: vision, constraints, decisions made, open questions.
- **Action** — DecomposeResearchAreas: Break project into research areas. Consider: components to investigate, directories/files, architectural patterns, data flows, existing code to extend.
- **Action** — CreateResearchPlan: Use TodoWrite to track research subtasks.

## Step 3: Deep Parallel Research

- **Action** — SpawnResearchAgents: Launch parallel agents for comprehensive context.

| Agent | Task | Required Output |
|-------|------|-----------------|
| @finder | Find relevant files, entry points, handlers, models | File paths by domain |
| @analyst | Trace data flow, dependencies, behavior, edge cases | file:line refs for ALL findings |
| @patterns | Find similar implementations, patterns to follow/avoid | Code examples with file:line |
| @researcher | Best practices, similar solutions, pitfalls | Findings WITH LINKS |

**Strategy**: locator → analyzer on findings → parallel for breadth. Spawn follow-ups if shallow. Demand file:line evidence.

**3rd Party Libs**: Use Context7 MCP for central libraries.

- **Action** — WaitForAgents: ALL agents must complete before synthesis. Update TodoWrite as each completes.

## Step 4: Synthesize Understanding

- **Action** — CompileFindings: Synthesize with file:line refs throughout.
  - Codebase: Connect findings across components, document data flow, answer "how does codebase handle [area]?"
  - Architecture: Patterns to follow (with examples), conventions, constraints, reuse vs build new
  - External: Industry patterns (with links), best practices, pitfalls

- **Action** — PerformGapAnalysis: Current capabilities (with file refs) vs required capabilities. What's missing vs needs modification.

- **Action** — IdentifyMVPAndOptions:
  - MVP: Core value, minimum for value, what to defer (informed by codebase complexity)
  - Options: 2-3 approaches with: summary, key decisions, code to leverage (file refs), new work, effort sense, trade-offs
  - Decision points: Architecture, scope, technology, integration, patterns

## Step 5: Generate Document

- **Action** — DetermineOutputDir:
  - Derive `task_name` from context (kebab-case)
  - `OUT_DIR = user_specified || docs/tasks/{task_name}/kickoff`
  - `mkdir -p "$OUT_DIR"`

- **Action** — CreateDocument: Structure with YAML frontmatter (date, git_commit, branch, repo, topic, tags, status).

  **Sections**: Title → Metadata → Project Context → Research Summary → Detailed Codebase Findings (by area, file:line refs, code snippets) → Code References (table) → Architecture Insights (patterns, conventions, constraints) → External Research (with links) → Gap Analysis → MVP Suggestion → Implementation Options (2-3 with trade-offs) → Decision Points → Open Questions → Related Resources

- **Action** — AddGitHubPermalinks: If on main/pushed, convert file refs to `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}`

- **Action** — SaveDocument: Save as `{task_name}_kickoff.md` (timestamp variant if exists). **CRITICAL**: Save before Step 6.

## Step 6: Present & Scope

- **Action** — PresentSummary:
  > **Kickoff Complete** — saved to `{path}`
  >
  > **Vision**: [1-2 sentences]
  > **What Exists**: [key components with file:line refs]
  > **Architecture Insights**: [patterns, conventions, constraints]
  > **External Learnings**: [key insights with links]
  > **Gap**: [have → need]
  > **MVP Path**: [smallest valuable slice]
  >
  > **Scoping Questions** (before planning):
  > 1. [Scope/boundary question] — Option A (leverages `code:line`) vs Option B
  > 2. [Technical approach] — suggested vs alternative
  > 3. [Priority/constraint question]

- **Action** — EngageInScoping: Wait for response, ask follow-ups. No planning until ambiguities resolved. Research answerable questions instead of asking.

## Step 7: Handle Follow-ups

- **Action** — HandleFollowUps:
  - **If** clarifications → update doc with `## Scoping Clarifications [timestamp]`
  - **If** more research needed → spawn agents, demand file:line evidence, update doc
  - Continue until ambiguities resolved

## Step 8: Transition to Scope

- **Action** — SummarizeAndTransition:
  > **Ready for Scope Definition**
  >
  > **Established**: User problem, user value, key findings (file:line), decisions made, remaining ambiguities
  >
  > **Options**:
  > 1. "Proceed with scope" → `/spectre:scope` with FROM_KICKOFF=true, SKIP_EXPLORATION=true
  > 2. "Skip to planning" → `/spectre:plan` with kickoff doc context
  > 3. "Need to think" → `/spectre:handoff`

- **Action** — ExecuteChoice:
  - **If** scope → invoke `/spectre:scope` with: FROM_KICKOFF=true, KICKOFF_DOC={path}, SKIP_EXPLORATION=true, context summary
  - **If** planning → suggest `/spectre:plan`
  - **If** pause → run `/spectre:handoff`

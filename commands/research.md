---
description: 👻 | Research codebase with parallel agents - primary agent
---

# research_codebase: Parallel Evidence-Based Codebase Analysis

## Description
- Description — Conduct comprehensive codebase research by spawning parallel specialized sub-agents and synthesizing their findings into structured documentation. Prioritizes direct readings of live code with specific file paths and line numbers. Supports follow-up questions with document updates.
- Desired Outcome — Complete research document with YAML frontmatter, concrete evidence (file paths/line numbers), architectural insights, GitHub permalinks (when applicable), saved to `TASK_DIR/research/{topic}_{date}.md`, ready for task formalization or planning.

## ARGUMENTS Input

Optional user input to seed this workflow.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/8) - Immediate Reply & Gather Context

- **Action** — ImmediateReply: Respond immediately before running any commands or tools.
  - Check for ARGUMENTS and extract research topic
  - **If** ARGUMENTS exists → acknowledge topic; extract research question
  - **Else** → prompt user: "I'm ready to research the codebase. Please provide your research question or area of interest, and I'll analyze it thoroughly by exploring relevant components and connections."
  - **CRITICAL**: Do NOT run any tool calls in this step
- **Wait** — User provides research query (if needed)

## Step (2/8) - Read Mentioned Files

- **Action** — ReadMentionedFiles: Read any directly mentioned files FULLY before decomposition.
  - **If** user mentions specific files (tickets, docs, JSON) → read them FULLY using Read tool WITHOUT limit/offset
  - **CRITICAL**: Read these files in main context before spawning sub-agents
  - Ensures full context before decomposing research

## Step (3/8) - Decompose & Plan Research

- **Action** — AnalyzeQuestion: Break down research query into composable areas.
  - Ultrathink about underlying patterns, connections, architectural implications user seeking
  - Identify specific components, patterns, concepts to investigate
  - Consider relevant directories, files, architectural patterns
  - Create research plan using TodoWrite to track all subtasks
- **Action** — SpawnSpecializedAgents: Launch parallel sub-agents for comprehensive research.
  - **Codebase Research**:
    - **finder**: Find WHERE files and components live
    - **analyst**: Understand HOW specific code works
    - **patterns**: Find examples of similar implementations
  - **Web Research** (when task requires 3rd party frameworks/platforms/services/libraries/SDKs):
    - **researcher**: External documentation and resources
    - **IMPORTANT**: Instruct to return LINKS with findings; include links in final report
  - **3rd Party Libraries** (only if user explicitly asks):
    - Use Context 7 MCP tool to search external documentation
  - **Linear Tickets** (if relevant):
    - **linear-ticket-reader**: Get full details of specific ticket
    - **linear-searcher**: Find related tickets or historical context
  - **Agent Strategy**: Start with locator → use analyzer on promising findings → run multiple agents in parallel for different searches; each agent knows its job (tell what you're looking for, not how to search)

## Step (4/8) - Synthesize Findings

- **Action** — WaitForAgents: Wait for ALL sub-agent tasks to complete before proceeding.
- **Action** — CompileResults: Synthesize all sub-agent results into coherent findings.
  - Prioritize live codebase findings as primary source of truth
  - Connect findings across different components
  - Include specific file paths and line numbers for reference
  - Highlight patterns, connections, architectural decisions
  - Answer user's specific questions with concrete evidence
- **Action** — GatherMetadata: Collect document metadata for YAML frontmatter.
  - Current date/time with timezone (ISO format)
  - Current commit hash (`git rev-parse HEAD`)
  - Current branch name (`git rev-parse --abbrev-ref HEAD`)
  - Repository name

## Step (5/8) - Generate Research Document

- **Output Location** — DetermineOutputDir: Decide where to save artifacts for this workflow.
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies `target_dir/path` → `OUT_DIR={that value}`
  - **Else** → `OUT_DIR=docs/tasks/{branch_name}`
  - `mkdir -p "OUT_DIR/research"`
- **Action** — CreateDocument: Structure research document with YAML frontmatter and comprehensive findings.
  - **Frontmatter** (YAML at top):
    - date: [ISO format with timezone]
    - git_commit: [commit hash]
    - branch: [branch name]
    - repository: [repo name]
    - topic: "[User's Question/Topic]"
    - tags: [research, codebase, relevant-component-names]
    - status: complete
    - last_updated: [YYYY-MM-DD]
    - last_updated_by: [Researcher name]
  - **Document Sections** (in order):
    1. Title: `# Research: [User's Question/Topic]`
    2. Metadata header (Date, Git Commit, Branch, Repository)
    3. Research Question (original user query)
    4. Summary (high-level findings answering question)
    5. Detailed Findings (by Component/Area with file:line references)
    6. Code References (path/to/file:line with descriptions)
    7. Architecture Insights (patterns, conventions, design decisions)
    8. Related Research (links to other research docs in `docs/` (look for /research directories))
    9. Open Questions (areas needing further investigation)

## Step (6/8) - Add Permalinks & Save

- **Action** — AddGitHubPermalinks: Generate GitHub permalinks if applicable.
  - Check if on main branch or commit pushed: `git branch --show-current` and `git status`
  - **If** on main/master OR pushed → generate permalinks:
    - Get repo info: `gh repo view --json owner,name`
    - Create: `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}`
    - Replace local file references with permalinks in document
  - **Else** → keep local file references
- **Action** — SaveDocument: Save research document to standardized location under `{OUT_DIR}/research/`.
  - Filename: `{research_topic}_{MMDDYY}.md`
  - Path: `{OUT_DIR}/research/{filename}`
- **Action** — PresentFindings: Present concise summary to user.
  - Concise summary of key findings
  - Include key file references for easy navigation
  - Ask if they have follow-up questions or need clarification

## Step (7/8) - Handle Follow-ups & Handoff

- **Action** — HandleFollowUps: If user has follow-up questions, update same document.
  - **If** follow-up questions asked:
    - Update frontmatter: `last_updated`, `last_updated_by`, add `last_updated_note: "Added follow-up research for [brief description]"`
    - Add new section: `## Follow-up Research [timestamp]`
    - Spawn new sub-agents as needed for additional investigation
    - Continue updating document
 - **Else** → proceed to handoff
- **Action** — RenderFooter: Render Next Steps footer using `@skill-spectre:spectre-next-steps` skill (contains format template and SPECTRE command options)

## Next Steps

See `@skill-spectre:spectre-next-steps` skill for footer format and command options.

## Success Criteria

- [ ] Immediate reply sent; research topic requested (Step 1 - no tool calls)
- [ ] User research query received
- [ ] Output directory determined inline (`OUT_DIR`) using branch name or user-specified path
- [ ] Directly mentioned files read FULLY in main context before decomposition
- [ ] Research question decomposed into composable areas with ultra-thinking about patterns/connections
- [ ] Research plan created using TodoWrite to track subtasks
- [ ] Specialized sub-agents spawned in parallel (finder, analyst, patterns, researcher as needed, linear agents if relevant)
- [ ] Agent strategy followed (locator → analyzer → parallel execution)
- [ ] Web research agents instructed to return LINKS (if used)
- [ ] ALL sub-agents completed before synthesis
- [ ] Findings compiled with live codebase prioritized as source of truth
- [ ] Results include specific file paths and line numbers
- [ ] Cross-component connections and patterns highlighted
- [ ] Concrete evidence provided for user's questions
- [ ] Metadata gathered for frontmatter (date/time ISO, commit hash, branch, repo name)
- [ ] Research document created with YAML frontmatter at top
- [ ] Frontmatter fields consistent (snake_case for multi-word: git_commit, last_updated)
- [ ] Document includes all 9 required sections in order
- [ ] GitHub permalinks generated if on main/master or pushed commit
- [ ] Local file references replaced with permalinks (when applicable)
- [ ] Document saved to `{OUT_DIR}/research/{topic}_{MMDDYY}.md`
- [ ] Concise findings summary presented to user with key file references
- [ ] Follow-up questions handled with document updates (frontmatter updated, new section added)
 
- [ ] Next steps guide read and relevant options sourced for footer

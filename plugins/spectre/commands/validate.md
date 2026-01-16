---
description: 👻 | Comprehensive post implementation requirement validation using subagents
---

# validate: Scope delivery verification and gap analysis

## Description

- **What** — Validate implementation against scope/tasks docs, dispatch parallel subagents per area, produce single actionable gap remediation document.
- **Approach** — Primary agent chunks work by scope items or parent tasks, dispatches one @analyst per area IN PARALLEL. Each subagent validates their area including E2E UX accessibility.
- **Outcome** — Single `validation_gaps.md` with actionable tasks ready for immediate implementation.

## ARGUMENTS Input

**REQUIRED**: User must provide scope documents to validate against.

&lt;ARGUMENTS&gt; $ARGUMENTS &lt;/ARGUMENTS&gt;

## Step (1/4) - Gather Validation Inputs

- **Action** — CheckArguments: Verify user provided scope documents.

  - **If** ARGUMENTS contains file paths or "use thread context" → proceed

  - **Else** → Immediately reply:

    > "What should I validate against? Please provide:
    >
    > - Path to scope document (e.g., `docs/tasks/main/scope.md`)
    > - Path to tasks document (e.g., `docs/tasks/main/tasks.md`)
    > - Or say 'use thread context' to validate against our conversation"

  - **Wait** — User provides validation inputs

- **Action** — ReadScopeDocs: Read provided documents completely (no limits).

  - Extract all requirements, acceptance criteria, deliverables
  - Document scope boundaries (in-scope / out-of-scope)
  - Note constraints and success metrics

- **Action** — ChunkIntoValidationAreas: Break scope into discrete validation areas.

  - **From tasks.md**: Each parent task (e.g., \[1.1\], \[1.2\]) = one validation area
  - **From scope.md**: Each "In Scope" item = one validation area
  - **From thread context**: Each discussed feature/requirement = one validation area
  - Aim for 3-8 validation areas (merge small items, split large ones)

- **Action** — CreateValidationManifest: Document chunks before dispatch.

  ```plaintext
  Validation Areas:
  1. {Area Name} — {What to validate}
     - Source: {requirement text from scope doc}
     - Expected: {what should exist}
  2. ...
  ```

## Step (2/4) - Dispatch Parallel Validation Agents

**CRITICAL**: Dispatch ALL validation agents in parallel in a SINGLE message with multiple Task tool calls. Do NOT dispatch sequentially.

- **Action** — DispatchValidators: Launch one @analyst per validation area IN PARALLEL.

  **Subagent Prompt Template**:

  ```plaintext
  You are validating scope delivery for ONE specific area.
  
  ## Context Documents
  - Scope: {path or "thread context"}
  - Tasks: {path if provided}
  - Branch: {branch_name}
  
  ## Your Validation Area
  **Area**: {area_name}
  **Source Requirement**: {exact text from scope/tasks doc}
  **Expected Deliverables**: {what should exist}
  
  ## Your Task
  1. Investigate YOUR SPECIFIC AREA only
  2. For each requirement, determine:
     - **Status**: ✅ Delivered | ⚠️ Partial | ❌ Missing | 🔍 Unclear
     - **Evidence**: Specific files, functions, line numbers
     - **Gap**: What's missing (if any)
  
  3. **CRITICAL - E2E UX Validation**:
     - Is this feature accessible from the UI? (menu, button, route, etc.)
     - Can a user actually reach this functionality?
     - Is it hooked up end-to-end, or is the code orphaned/unreachable?
     - Check: routes, navigation, component imports, event handlers
  
  4. Check for scope creep: anything beyond the requirement
  
  ## Output Format
  ```

  AREA: {area_name} STATUS: {overall: Delivered | Partial | Missing}

  REQUIREMENTS:

  - \[REQ-1\] {requirement} Status: {status} Evidence: {file:line} Gap: {what's missing} UX Accessible: {Yes/No - how user reaches it}

  SCOPE CREEP: {any features beyond scope}

  SUMMARY: {1-2 sentences}

  ```plaintext
  
  ```

- **Wait** — All validation agents complete

## Step (3/4) - Consolidate & Create Gap Remediation Tasks

- **Action** — ConsolidateFindings: Merge all subagent outputs.

  - Aggregate status across all areas
  - Compile gaps by priority (Critical/Medium/Low)
  - Note any scope creep findings

- **Action** — DetermineOutputDir:

  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies path → `OUT_DIR={that value}`
  - **Else** → `OUT_DIR=docs/tasks/{branch_name}`
  - `mkdir -p "${OUT_DIR}/validation"`

- **Action** — CreateValidationGapsDoc: Generate `{OUT_DIR}/validation/validation_gaps.md`.

  **Document Structure**:

  ```markdown
  # Validation Gaps: {task_name}
  *Generated: {timestamp}*
  
  ## Summary
  - **Overall Status**: {Complete | Needs Work | Significant Gaps}
  - **Requirements**: {X of Y} delivered
  - **Gaps Found**: {count} requiring remediation
  - **Scope Creep**: {count} items (document or remove)
  
  ## Gap Remediation Tasks
  
  ### Phase 1: Critical Gaps
  
  #### [1.1] {Gap Title - e.g., "Connect auth flow to login page"}
  **Requirement**: {original requirement text}
  **Current State**: {what exists now}
  **Gap**: {what's missing}
  
  - [ ] **1.1.1** {Specific action - e.g., "Add login route to app router"}
    - [ ] {Acceptance criterion 1}
    - [ ] {Acceptance criterion 2}
  - [ ] **1.1.2** {Specific action - e.g., "Wire LoginButton onClick to auth handler"}
    - [ ] {Acceptance criterion 1}
    - [ ] {Acceptance criterion 2}
  
  #### [1.2] {Next Gap Title}
  ...
  
  ### Phase 2: Medium Priority Gaps
  ...
  
  ### Phase 3: Low Priority / Polish
  ...
  
  ## Scope Creep Review
  Items implemented beyond original scope:
  - [ ] **{Feature}**: {Keep and document | Remove | Discuss}
    - Evidence: {file:line}
    - Recommendation: {action}
  
  ## Validation Coverage
  | Area | Status | Evidence | UX Accessible |
  |------|--------|----------|---------------|
  | {area 1} | ✅ | {files} | Yes - {how} |
  | {area 2} | ⚠️ | {files} | No - needs hookup |
  | {area 3} | ❌ | — | — |
  ```

## Step (4/4) - Present Results

- **Action** — PresentResults: Show validation summary.

  > ## Validation Complete
    **> **Status**: {Complete | Needs Work | Significant Gaps}
  >
  > - {X of Y} requirements delivered
  > - {N} gaps requiring remediation
  > - {N} scope creep items to review
    **> **Gap Remediation Doc**: `{OUT_DIR}/validation/validation_gaps.md`
  >
  > {1-2 sentence summary of key findings}

- **Action** — RenderFooter: Render Next Steps footer using `@spectre:spectre` skill

## Next Steps

See `/skill-spectre:spectre` skill for footer format and command options. 
---
description: 👻 | Comprehensive post implementation requirement validation using subagents
---

# validate: Scope delivery verification and gap analysis

## Description

- **What** — Validate implementation against scope/tasks docs, dispatch parallel subagents per area, produce single actionable gap remediation document.
- **Approach** — Primary agent chunks work by scope items or parent tasks, dispatches one @analyst per area IN PARALLEL. Each subagent validates their area including E2E UX accessibility.
- **Outcome** — Single `validation_gaps.md` with actionable tasks ready for immediate implementation.

## Core Validation Principle

> **"Definition ≠ Connection ≠ Reachability"**

Three levels of implementation completeness:
1. **Defined**: Code exists in a file
2. **Connected**: Code is imported/called by other code
3. **Reachable**: A user action can trigger the code path

Validation must verify all three levels. A feature with Level 1 but not Level 2 or 3 is NOT complete—it's dead code that happens to match the requirement description.

When verifying any implementation:
- Don't stop at "function X exists in file Y"
- Continue to "function X is called by Z at file:line"
- Continue to "Z is triggered when user does W"

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
     - **Status**: ✅ Delivered | ⚠️ Partial | 🔌 Dead Code | ❌ Missing
       - ✅ **Delivered**: Defined AND connected AND reachable from user action
       - ⚠️ **Partial**: Code exists but has broken/missing connections
       - 🔌 **Dead Code**: Code exists but has zero usage sites
       - ❌ **Missing**: Code does not exist
     - **Evidence**: Must include BOTH:
       1. Definition site: `file:line` where code is defined
       2. Usage site: `file:line` where code is called/rendered
       - If you can only cite definition without usage → status is ⚠️ or 🔌
     - **Gap**: What's missing (if any)

  3. **CRITICAL - Reachability Verification**:
     - Trace the COMPLETE chain from user action to implementation:
       - Entry point: What user action triggers this? (click, route, event)
       - Call chain: How does execution flow to the implementation?
       - Terminal point: What side effect/UI change occurs?
     - A broken link at ANY point = ⚠️ NOT FULLY DELIVERED
     - For every function/component, grep for USAGE not just DEFINITION:
       - Functions: Search for `functionName(` to find invocations
       - Components: Search for `<ComponentName` to find render sites
       - Hooks: Search for `useHookName(` to find consumers
       - Props: Search for `propName={` to find where passed
     - Zero usage sites = 🔌 Dead Code

  4. Check for scope creep: anything beyond the requirement
  
  ## Output Format
  ```

  AREA: {area_name} STATUS: {overall: Delivered | Partial | Dead Code | Missing}

  REQUIREMENTS:

  - \[REQ-1\] {requirement}
    Status: {✅|⚠️|🔌|❌}
    Definition: {file:line where defined}
    Usage: {file:line where called/rendered, or "NONE FOUND"}
    Reachability: {user action → ... → this code, or "NOT REACHABLE"}
    Gap: {what's missing}

  SCOPE CREEP: {any features beyond scope}

  SUMMARY: {1-2 sentences}

  ```plaintext

  ```

**Verification Patterns for Subagents**:

| Checking | Search Pattern | Meaning |
|----------|---------------|---------|
| Function called | `functionName\(` | Invocation exists |
| Component renders | `<ComponentName` | JSX usage exists |
| Hook consumed | `useHookName\(` | Hook is used |
| Prop passed | `propName={` | Parent passes prop |
| Export imported | `import.*Name` | Module consumed |

**Common broken link patterns to check**:
- Callback defined but never passed as prop
- Prop received but never used in component body
- Function exported but never imported elsewhere
- Type defined but never used in signatures
- Switch case exists but condition never triggers

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
  | Area | Status | Definition | Usage | Reachable |
  |------|--------|------------|-------|-----------|
  | {area 1} | ✅ | {file:line} | {file:line} | Yes - {user action} |
  | {area 2} | ⚠️ | {file:line} | {file:line} | No - broken at {link} |
  | {area 3} | 🔌 | {file:line} | NONE | No - dead code |
  | {area 4} | ❌ | — | — | — |
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
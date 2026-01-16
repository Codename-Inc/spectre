---
description: 👻 | Complete cleanup flow - clean, inspect, lint, test - primary agent
---

# clean: Dead Code Cleanup with Duplication Detection

## Description
- **What** — Analyze for dead code, dispatch @analyst subagents to validate, present findings, execute approved removals
- **Outcome** — Clean code with dead artifacts removed, lint clean, tests pass, conventional commits

## ARGUMENTS Input

Optional scope: empty = uncommitted changes, commit SHA = from that commit, "only {sha}" = single commit.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions
- Primary agent analyzes; @analyst subagents validate findings
- Be conservative: NEEDS_REVIEW when uncertain, not SAFE_TO_REMOVE

## Step 1 - Determine Scope & Analyze

- **Action** — DetermineScope:
  - **If** empty → staged + unstaged + untracked (`git diff --cached --name-only` + `git diff --name-only`)
  - **ElseIf** commit SHA → changes from {sha}^..HEAD + uncommitted
  - **ElseIf** "only {sha}" → just that commit's changes
  - **Else** → ask user to clarify

- **Action** — ScanPatterns: Detect in scoped files:
  1. Orphaned imports
  2. Unused functions/variables
  3. Commented-out code (>5 lines)
  4. Debug artifacts (debugger, TODO/FIXME)
  5. Temp logging (console.log, "DEBUG:", "TEMP:")
  6. Dead branches
  7. Orphaned exports
  8. Test artifacts (.only, skipped tests)
  9. AI slop (excessive comments, unnecessary checks, `any` casts)

- **Action** — DetectDuplication: Find copy-paste (>5 similar lines, 2+ instances)
- **Action** — ChunkFindings: Group by file/area (2-4 chunks) for parallel investigation

## Step 2 - Dispatch Validators

- **Action** — SpawnAnalyzers: Launch @analyst subagents (up to 3 parallel)
  ```
  Validate dead code findings in {area_name}.
  Files: {file_list} | Findings: {patterns_detected}

  For each: verify unused (check imports, calls, dynamic refs), categorize:
  - SAFE_TO_REMOVE: Confirmed dead
  - NEEDS_REVIEW: Likely dead but uncertain
  - KEEP: Actually used

  Output: Each finding with verdict and evidence.
  ```
- **Wait** — All analyzers complete

## Step 3 - Present & Execute

- **Action** — ConsolidateResults: Group by SAFE_TO_REMOVE, NEEDS_REVIEW, KEEP
- **Action** — PresentToUser:
  > **Safe to Remove** ({count}): {file}:{line} — {description}
  > **Needs Review** ({count}): {file}:{line} — {why uncertain}
  > **Duplication Clusters** ({count}): {pattern} at {locations}
  > **Kept** ({count}): {file}:{line} — {why}

- **Action** — GetApproval: "Remove all SAFE items? (y/n/select specific)"
- **Wait** — User approves
- **Action** — ExecuteRemovals: Remove approved items; rollback if tests fail

## Step 4 - Verify & Commit

- **Action** — RunLint: Fix violations
- **Action** — RunTests: Fix failures or rollback
- **Action** — CommitChanges: Group by type (chore/refactor/fix/test), conventional format
- **Action** — RenderFooter: Use `@skill-spectre:spectre` skill for Next Steps

---
description: 👻 | Complete cleanup flow - clean, inspect, lint, test - primary agent
---

# clean: Dead code cleanup with duplication detection

## Description
- **What** — Analyze working set for dead code patterns and duplication, dispatch codebase-analyzers, present findings, execute approved removals, commit
- **Outcome** — Clean code with dead artifacts removed, duplications flagged, lint clean, tests pass, conventional commits

## Variables

### Dynamic Variables
- `scope`: Optional scope specification — (via ARGUMENTS: $ARGUMENTS)
  - If empty: defaults to uncommitted changes (staged + unstaged + untracked)
  - If commit SHA provided: from that commit through HEAD + uncommitted
  - If "only {commit}": just that single commit's changes

### Static Variables
- `max_parallel_agents`: 3

## ARGUMENTS Input

Optional scope specification.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions

- Primary agent analyzes and coordinates; @codebase-analyzer subagents validate findings
- Default scope is uncommitted changes — no ceremony needed for common case
- Be conservative: when in doubt, mark NEEDS_REVIEW not SAFE_TO_REMOVE
- Focus on artifacts from recent work: unused functions, orphaned imports, debug logging, abandoned code paths

## Steps

### Step (1/4) - Determine Scope & Analyze

- **Action** — DetermineScope: Identify files to analyze
  - **If** ARGUMENTS empty:
    - Scope = staged + unstaged + untracked (uncommitted changes)
    - `git diff --cached --name-only` + `git diff --name-only` + `git ls-files --others --exclude-standard`
  - **ElseIf** ARGUMENTS contains commit SHA:
    - Validate: `git rev-parse --verify {sha}^{commit} 2>/dev/null`
    - **If** invalid → ask user for valid commit
    - **Else** → Scope = changes from {sha}^..HEAD + uncommitted
  - **ElseIf** ARGUMENTS says "only {sha}":
    - Scope = just that commit's changes: `git show --name-only --pretty=format: {sha}`
  - **Else** (ambiguous):
    - Ask: "Please specify scope: (1) uncommitted changes, (2) from commit {sha}, or (3) only commit {sha}"
    - **Wait** — User clarifies

- **Action** — ScanPatterns: Analyze scoped files for dead code indicators

  **Patterns to detect** (ordered by likelihood after recent work):
  1. **Orphaned imports** — imports with no usage in the file
  2. **Unused functions/variables** — declared but never called/referenced
  3. **Commented-out code blocks** — large blocks (>5 lines)
  4. **Debug artifacts** — debugger statements, TODO/FIXME from current work
  5. **Temporary logging** — console.log without context, "DEBUG:", "TEMP:", checkpoint logs
  6. **Dead branches** — unreachable code, always-false conditions
  7. **Orphaned exports** — exports not imported anywhere
  8. **Test artifacts** — `.only`, skipped tests, leftover test data
  9. **AI slop** — excessive comments, unnecessary defensive checks, `any` casts, over-documentation

- **Action** — DetectDuplication: Find repeated code in scoped files
  - Copy-pasted logic (>5 similar lines, 2+ instances)
  - Nearly-identical functions (same logic, different variable names)
  - For each cluster: locations, pattern description, extraction recommendation

- **Action** — ChunkFindings: Group by file/area for parallel investigation (2-4 chunks)

### Step (2/4) - Dispatch codebase-analyzers

- **Action** — Spawncodebase-analyzers: Launch @codebase-analyzer subagents (up to `max_parallel_agents`)

**investigation prompt**:
```
You are validating dead code findings in {area_name}.

**Files**: {file_list}
**Initial findings**: {patterns_detected}

**Task**:
1. For EACH finding, verify it's actually unused (check imports, calls, dynamic refs)
2. Check if it's a remnant from failed implementation (git history if needed)
3. Categorize:
   - SAFE_TO_REMOVE: Confirmed dead, no dependencies
   - NEEDS_REVIEW: Likely dead but uncertain
   - KEEP: Actually used

**Output**: List each finding with verdict and evidence.
Be conservative — NEEDS_REVIEW when uncertain.
```

- **Wait** — All codebase-analyzers complete

### Step (3/4) - Present Findings & Execute

- **Action** — ConsolidateResults: Merge codebase-analyzer outputs
  - Group: SAFE_TO_REMOVE, NEEDS_REVIEW, KEEP
  - Include duplication clusters separately

- **Action** — PresentToUser: Show findings summary
  ```
  ## Dead Code Analysis

  ### Safe to Remove ({count})
  - {file}:{line} — {description} — {evidence}

  ### Needs Review ({count})
  - {file}:{line} — {description} — {why uncertain}

  ### Duplication Clusters ({count})
  - Cluster: {pattern} ({N} instances)
    - {file1}:{lines}, {file2}:{lines}
    - Recommendation: Extract to {location}

  ### Kept ({count})
  - {file}:{line} — {why kept}
  ```

- **Action** — GetApproval: Ask user what to remove
  - "Remove all SAFE items? (y/n/select specific)"
  - "Address any NEEDS_REVIEW items? (list numbers)"
  - **Wait** — User approves

- **Action** — ExecuteRemovals: Remove approved items
  - **If** file deletion → `rm {path}`
  - **If** code removal → Edit tool
  - **If** tests fail after removal → rollback that item, note failure

### Step (4/4) - Verify & Commit

- **Action** — RunLint: Execute linter; fix violations
  - **If** lint fails → autofix, then manual fix
  - **Else** → continue

- **Action** — RunTests: Execute test suite
  - **If** tests fail → analyze, fix or rollback
  - **Else** → continue

- **Action** — CommitChanges: Group changes into logical commits
  - Group by type:
    - Dead code removal (chore)
    - Refactors/consolidation from duplication fixes (refactor)
    - Any bug fixes discovered during cleanup (fix)
    - Test updates if tests were modified (test)
  - Format: `type(scope): description`
  - Each commit answers: What changed and why?

- **Action** — ReadNextStepsGuide: Read `.claude/spectre/next_steps_guide.md`
- **Action** — RenderFooter: End with Next Steps footer
  - Include: files cleaned, lines removed, duplications flagged

## Next Steps

**Footer format:**
```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ 🧭 Phase: {phase} | 🟢 {status} | 🚧 {blockers}           ║
║ 🎯 Next — {recommended next step}                         ║
║ ➡️ Options: {sourced from next_steps_guide.md}            ║
║ 💬 Reply — {what to reply, if any}                        ║
╚══════════════════════════════════════════════════════════╝
```

## Success Criteria

**Step 1 - Determine Scope & Analyze**:
- [ ] Scope determined (default: uncommitted, or user-specified)
- [ ] If commit provided, validated as existing
- [ ] Dead code patterns scanned
- [ ] Duplication clusters identified
- [ ] Findings chunked for investigation

**Step 2 - Dispatch codebase-analyzers**:
- [ ] @codebase-analyzer subagents dispatched (not primary agent validating)
- [ ] Each finding categorized: SAFE_TO_REMOVE / NEEDS_REVIEW / KEEP
- [ ] Evidence documented for each verdict

**Step 3 - Present Findings & Execute**:
- [ ] Findings presented in structured format
- [ ] User approval obtained before any removal
- [ ] Only approved items removed
- [ ] Failed removals rolled back

**Step 4 - Verify & Commit**:
- [ ] Lint passes
- [ ] Tests pass
- [ ] Changes grouped logically (chore/refactor/fix/test)
- [ ] Conventional commit format used
- [ ] Each commit message explains what and why
- [ ] Single Next Steps footer rendered
- [ ] Next steps guide read and options sourced

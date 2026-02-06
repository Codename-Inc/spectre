---
description: 👻 | Complete cleanup flow - clean, inspect, lint, test - primary agent
---
# clean: Analyze recent changes for dead code and artifacts from failed branches

## Description

- **What** — Analyze a scoped working set (commit range, unstaged changes, or context window) to identify dead code, orphaned artifacts, and remnants from abandoned implementation attempts; dispatch parallel subagents to investigate and validate findings
- **Outcome** — Clean code with all dead artifacts from recent work removed; validated removal tasks ready for execution

## Variables

### Dynamic Variables

- `commit_id`: Optional starting commit - analyzes all changes **from and including this commit** through HEAD plus staged/unstaged/untracked — (via ARGUMENTS: $ARGUMENTS)
  - **INCLUDES** the commit_id commit itself and all subsequent commits through HEAD
  - If commit_id equals HEAD, working set will be staged + unstaged + untracked only
  - If commit_id is invalid or not in history, **STOP and ask user for guidance**
- `scope_mode`: One of: `commit_range`, `unstaged`, `context` — determines working set
- `target_out_dir`: Optional OUT_DIR override

### Static Variables

- `out_dir`: docs/active_tasks/{branch_name}
- `analysis_dir`: {out_dir}/cleanup_analysis
- `reports_subdir`: {analysis_dir}/area_reports
- `validation_subdir`: {analysis_dir}/validations
- `max_parallel_agents`: 4

## ARGUMENTS Input

Optional scope specification. If ambiguous, ask user to clarify.

&lt;ARGUMENTS&gt; $ARGUMENTS &lt;/ARGUMENTS&gt;

## Codebase Structure

**Relevant Files**:

- Working set files determined by scope
- `package.json` — Dependencies context
- `tsconfig.json` — TypeScript configuration
- `.gitignore` — Exclusion patterns to respect

## Instructions

- **Primary goal**: Remove dead code artifacts left behind from recent work, especially failed implementation branches
- Never mark production code as safe to remove without validation
- Respect .gitignore patterns when analyzing files
- Document uncertainty clearly; flag items requiring manual review
- All file paths must be absolute from repository root
- Focus on artifacts likely created during recent work: unused functions, orphaned imports, commented-out code, debug statements
- **File safety**: Default filenames (`working_set.json`, `initial_findings.md`, `duplication_report.md`, `naming_report.md`, `cleanup_summary.md`) must never overwrite existing files—if a target exists, create a scoped variant (append scope/task/timestamp) and use that path in messaging.
- when committing, —no-verify and eslint-disable, or committing code with eslint-disable, is expressly forbidden without the user’s explicit permission. 

## Step (1/8) - Determine Working Set Scope

- **Action** — DetermineScope: Identify which files to analyze
  - **If** ARGUMENTS contains `commit_id` or commit SHA:
    - **First**: Validate commit_id exists: `git rev-parse --verify {commit_id}^{commit} 2>/dev/null`
      - **If validation fails**: STOP and ask user "Commit {commit_id} is invalid or not found in history. Please provide a valid commit SHA or ref."
      - **Else**: proceed with discovery
    - Committed changes: `git log --name-only --pretty=format: {commit_id}^..HEAD | sort -u`
      - **IMPORTANT**: Uses `{commit_id}^..HEAD` to INCLUDE the commit_id commit itself
    - Staged changes: `git diff --cached --name-only`
    - Unstaged changes: `git diff --name-only`
    - Untracked files: `git ls-files --others --exclude-standard`
    - **Working Set** = UNION of all four sets above
  - **ElseIf** ARGUMENTS specifies "unstaged" or "staged":
    - Staged changes: `git diff --cached --name-only`
    - Unstaged changes: `git diff --name-only`
    - Untracked files: `git ls-files --others --exclude-standard`
    - **Working Set** = UNION of all three
  - **ElseIf** ARGUMENTS specifies "context" or mentions current session:
    - Ask user: "Which files from our current session should I analyze? List the files/directories or say 'all discussed files'"
    - **Wait** — User specifies files
    - **Working Set** = User-specified files
  - **Else** (scope ambiguous):
    - Ask user: "How should I scope the cleanup analysis?"
      - `1` — From a specific commit (provide SHA)
      - `2` — Current unstaged/staged changes only
      - `3` — Files we've discussed in this session
    - **Wait** — User selects scope mode
- **Action** — RecordWorkingSet: Save working set to `{analysis_dir}/working_set.json`
  - Include: file list, scope mode, commit range (if applicable)
- **Action** — DetermineOutputDir: Set output location
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies `target_out_dir` → `OUT_DIR={target_out_dir}`
  - **Else** → `OUT_DIR={out_dir}`
  - `mkdir -p "OUT_DIR/{analysis_dir}/{reports_subdir}"`
  - `mkdir -p "OUT_DIR/{analysis_dir}/{validation_subdir}"`

## Step (2/8) - Analyze Working Set for Dead Code Patterns

- **Action** — IdentifyDeadCodePatterns: Scan working set files for common dead code indicators
  - **Patterns to detect** (ordered by likelihood after failed branches):
     1. **Orphaned imports** — imports with no usage in the file
     2. **Unused functions/variables** — declared but never called/referenced
     3. **Commented-out code blocks** — large blocks of commented code (&gt;5 lines)
     4. **Debug artifacts** — debugger statements, TODO/FIXME from current work
     5. **Temporary logging** — development-time logging to remove:
        - console.log/warn/error without structured context (bare strings, variable dumps)
        - Logging inside loops or hot paths (per-iteration logging)
        - Debug prefixes: "DEBUG:", "TODO:", "TEMP:", "XXX:", "HACK:"
        - Variable dumps: `console.log(varName)`, `console.log({var1, var2})`
        - Checkpoint logs: "here", "got here", "reached X", "entering/exiting"
        - Timing logs not part of production observability
        - Commented-out logging statements
     6. **Dead branches** — unreachable code paths, always-false conditions
     7. **Orphaned exports** — exports not imported anywhere in codebase
     8. **Duplicate implementations** — similar code suggesting abandoned refactor
     9. **Test artifacts** — `.only`, skipped tests, test data that should be removed
    10. **AI code slop** — patterns inconsistent with codebase style:
    - Excessive comments a human wouldn't add or inconsistent with file style
    - Unnecessary defensive checks/try-catch in trusted codepaths
    - Casts to `any` to bypass type issues
    - Over-documentation of obvious code
    - Verbose patterns where codebase uses concise ones
  - For each file in working set: identify potential issues with file:line references
- **Action** — ChunkAnalysis: Group findings by file/module for parallel investigation
  - Create 2-5 investigation chunks based on working set size
  - Each chunk: area name, files, identified patterns, investigation focus
- **Action** — SaveInitialFindings: Write to `{analysis_dir}/initial_findings.md` (use a scoped variant like `initial_findings_{timestamp}.md` if the default exists; never overwrite)
  - Include: pattern counts, file list per pattern, investigation priorities

## Step (3/8) - Analyze Duplication & Naming

- **Action** — DetectDuplication: Find repeated code patterns in working set

  - **Patterns to detect**:
    - Copy-pasted logic (&gt;5 similar lines, 2+ instances)
    - Nearly-identical functions with cosmetic differences (variable names differ, same logic)
    - Repeated type definitions or interfaces
    - Same validation/transform/fetch patterns across files
  - **Output per cluster**:
    - All instance locations (file:line)
    - Pattern description
    - Extraction recommendation (where to consolidate)
    - Effort estimate (low/medium/high)
  - Ignore intentional duplication (test fixtures, generated code)

- **Action** — GenerateDuplicationReport: Write `{analysis_dir}/duplication_report.md` (or a scoped variant if it already exists; do not overwrite)

  - **Format**:

    ```plaintext
    ## Duplicate Code Clusters
    
    ### Cluster 1: {pattern_name} ({instance_count} instances)
    - `{file1}:{lines}`
    - `{file2}:{lines}`
    - `{file3}:{lines}`
    
    **Pattern**: {description}
    **Recommendation**: Extract to `{suggested_location}`
    **Effort**: {low|medium|high}
    ```

## Step 4/8 - ESLint Compliance Planning

**Purpose**: Systematically eliminate tech debt from eslint-disable comments.

**3a. Collect ESLint Bypasses**:

```bash
grep -rn "eslint-disable\|@ts-ignore\|@ts-expect-error" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
```

**3b. Group by Module**: Cluster findings by directory or logical module (files that import each other).

**3c. For each group with ≥2 bypasses**, dispatch @analyst in parallel:

```plaintext
Analyze ESLint bypasses in: {file_list}

For each bypass:
1. Identify the disabled rule(s)
2. Understand WHY it was disabled (type issue? legacy code? third-party types?)
3. Determine the proper fix (type narrowing, interface update, refactor, etc.)

Output a refactor plan:
- File: path
- Line: number
- Rule: disabled-rule-name
- Reason: why it exists
- Fix: specific refactor steps
- Effort: trivial / moderate / significant
- Risk: low / medium / high
```

**3d. Present Refactor Summary**:

- Group by effort level (trivial fixes first)
- Flag high-risk items for user decision
- Create actionable items for future cleanup sprints

**Note**: This step is diagnostic. Actual refactoring happens in follow-up tasks, not during clean.

## Step (5/8) - Dispatch Investigation Subagents

- **Action** — PrepareSubagentPrompts: Generate investigation prompts for each chunk

**Subagent Investigation Instructions Template**:

```markdown
You are investigating recent changes in {area_name} for dead code artifacts.

**Context**: These files were recently modified. Look for artifacts from failed implementation attempts, abandoned branches, or incomplete refactors.

**Files in scope**: {file_list}
**Initial patterns detected**: {patterns_for_area}

**Your task**:
1. Review all files in scope thoroughly
2. For EACH potential issue, verify:
   - Is this code actually unused? (check imports, calls, references)
   - Is this a remnant from a failed approach? (check git history if needed)
   - Could this break something if removed? (check dependencies)
3. Categorize findings:
   - SAFE_TO_REMOVE: Confirmed dead code, no dependencies
   - NEEDS_VALIDATION: Likely dead but needs confirmation
   - KEEP: Actually used or unclear
4. Document evidence for each finding

**Output format**: Markdown report with sections per issue type.
**Critical**: Be conservative. When in doubt, mark NEEDS_VALIDATION.

Save your report to: {reports_subdir}/{area_name}_report.md (if that file exists, append a unique identifier such as `{area_name}_{timestamp}.md`; never overwrite)
```

- **Action** — SpawnSubagents: Launch parallel investigation agents (up to {max_parallel_agents})
  - For each chunk: spawn subagent with investigation prompt
  - Set output path: `{reports_subdir}/{area_name}_report.md` (or scoped variant if default exists)
- **Wait** — All investigation subagents complete and save reports

## Step (6/8) - Validate High-Risk Findings

- **Action** — ConsolidateReports: Read all investigation reports from `{reports_subdir}/`
  - Group findings: SAFE_TO_REMOVE, NEEDS_VALIDATION, KEEP
  - Extract SAFE_TO_REMOVE items involving:
    - Function/class deletions
    - File deletions
    - Export removals
- **Action** — PrepareValidationPrompts: Generate validation prompts for high-risk items

**Subagent Validation Instructions Template**:

```markdown
You are validating a finding from dead code analysis.

**Original finding**:
{finding_description}
{file_path}:{line_numbers}
{reasoning_from_investigation}

**Your task**:
1. Search codebase for ANY usage (dynamic imports, string refs, reflection)
2. Check test files for usage
3. Verify the code is actually dead, not just indirectly used
4. Determine: CONFIRMED_SAFE, UNSAFE, or UNCERTAIN

**Output format**: Markdown with verdict, evidence, reasoning.

Save to: {validation_subdir}/{task_id}_validation.md (if that file exists, append a unique identifier; never overwrite)
```

- **Action** — SpawnValidationAgents: Launch validation agents (up to {max_parallel_agents})
- **Wait** — All validation subagents complete

## Step (7/8) - Generate Removal Tasks

- **Action** — ReadValidations: Load validation results from `{validation_subdir}/`
  - Group by verdict: CONFIRMED_SAFE, UNSAFE, UNCERTAIN
- **Action** — ReconcileFindings: Create final removal list
  - CONFIRMED_SAFE → approved for removal
  - UNSAFE → document why, exclude from removal
  - UNCERTAIN → flag for manual review
- **Action** — GenerateSummary: Create `{analysis_dir}/cleanup_summary.md` (or a scoped variant if it already exists; do not overwrite)
  - Sections:
    - **Executive Summary**: Scope analyzed, findings count, safe removals
    - **Safe Removals**: List with file:line, what to remove, why it's safe
    - **Manual Review Required**: Items needing human decision
    - **Excluded Items**: What was kept and why
    - **Estimated Impact**: Lines of dead code to remove
- **Action** — CreateRemovalTasks: Generate removal task files
  - For each CONFIRMED_SAFE: task with exact removal instructions
  - Save to `{analysis_dir}/removal_tasks/task_{id}.md`
- **Action** — ReadNextStepsGuide: Read `commands/flow/docs/next_steps_guide.md`
- **Action** — RenderFooter: End reply with single 60-column Next Steps footer
  - Present summary: X files analyzed, Y items safe to remove, Z need review

## Step (8/8) - Verify & Commit

- Execute Approved Removals (User-Triggered)
- Run lint, fix violations
- Run tests, fix failures or rollback
- **Action** — CommitPlanningArtifacts: Gather and commit planning/working docs
  - Check for uncommitted files in `{out_dir}` and `{analysis_dir}`:
    - `working_set.json`, `initial_findings.md`, `duplication_report.md`
    - `naming_report.md`, `cleanup_summary.md`
    - Area reports in `{reports_subdir}/`
    - Validation reports in `{validation_subdir}/`
    - Any other `.md` or `.json` artifacts created during this flow
  - **If** uncommitted planning artifacts exist:
    - Stage all: `git add {out_dir}/ {analysis_dir}/`
    - Commit: `docs(clean): add cleanup analysis artifacts for {branch_name}`
- Commit code changes by type (chore/refactor/fix/test), conventional format
- Render Next Steps via `@skill-spectre:spectre-next-steps`
---
description: 👻 | Safe guided rebase w/conflict handling - primary agent
---

# rebase_workspectre: Safe Git rebase with automatic conflict resolution

## Description
- **What** — Guide rebase process with safety refs, automatic conflict resolution, test verification, and detailed decision summary
- **Outcome** — Successfully rebased branch with resolved conflicts, passing tests, and clear smoketest guide for verification

## Variables

### Static Variables
- `safety_ref_prefix`: backup/rebase
- `auto_commit_message`: chore: snapshot before rebase
- `summary_sections`: overview, decisions, smoketest_guide, safety

## ARGUMENTS Input

Optional target branch to rebase onto.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions

- Auto-commit uncommitted changes before rebase (no confirmation needed)
- Auto-resolve conflicts favoring target branch conventions (no y/n prompts)
- Track every resolution decision with rationale for summary
- Actually run the test suite, don't just suggest it
- Generate smoketest guide based on files touched

## Steps

### Step (1/5) - Confirm Target Branch

- **Action** — CheckArguments: Look for target branch in ARGUMENTS
  - **If** ARGUMENTS contains branch → proceed to Step 2
  - **Else** → ask user directly
- **Action** — AskTargetBranch: Request target branch specification
  - "What branch should we rebase onto? Include remote if applicable (e.g., `origin/main` vs `main`)."
  - **Wait** — User provides target branch

### Step (2/5) - Prepare & Assess

- **Action** — EnsureCleanTree: Handle uncommitted changes automatically
  - **If** uncommitted changes exist:
    - Auto-commit: `git commit -am "{auto_commit_message}"`
    - Note in summary: "Auto-committed working changes"
  - **Else** → continue

- **Action** — FetchLatest: Ensure up-to-date refs
  - `git fetch origin`
  - Verify target branch exists

- **Action** — CreateSafetyRef: Create backup before rebase
  - `git branch {safety_ref_prefix}-$(date +%Y%m%d-%H%M%S)`

- **Action** — AssessComplexity: Estimate rebase scope (for summary detail level)
  - Commits ahead/behind target
  - Files likely to conflict (diff analysis)
  - **Light**: ≤5 commits, <10 files changed
  - **Moderate**: 5-20 commits, 10-30 files
  - **Large**: >20 commits or >30 files

### Step (3/5) - Execute Rebase & Resolve Conflicts

- **Action** — StartRebase: Begin rebase
  - `git rebase {target_branch}`
  - **If** no conflicts → skip to Step 4
  - **Else** → proceed to conflict resolution

- **Action** — ResolveAllConflicts: Handle each conflict automatically
  - For each conflicted file:
    1. Read conflict markers
    2. Determine resolution (favor target branch patterns/conventions)
    3. Apply resolution
    4. **Track decision**: Record file, choice made, rationale
    5. Stage: `git add {file}`
  - `git rebase --continue`
  - **If** more conflicts → repeat
  - **Else** → continue

- **Decision Tracking Format** (internal, for summary):
  ```
  {file}: {decision} — {rationale}
  ```

### Step (4/5) - Verify & Test

- **Action** — RunLint: Execute linter
  - **If** failures → fix automatically where possible
  - **Else** → continue

- **Action** — RunTestSuite: Execute project test command
  - Detect test command:
    - Node: `npm test` or `yarn test` or check package.json scripts
    - Python: `pytest` or `python -m pytest`
    - Rust: `cargo test`
    - Go: `go test ./...`
    - Other: Check for Makefile test target, or ask user
  - Run full suite
  - Record: pass/fail count, any failures

- **Action** — ValidateRebase: Basic integrity checks
  - Confirm expected commit count
  - Verify no unexpected file changes

### Step (5/5) - Generate Summary & Finalize

- **Action** — GenerateSummary: Create comprehensive rebase summary

```markdown
## Rebase Summary

### Overview
- **Branch**: {current_branch} rebased onto {target_branch}
- **Commits integrated**: {count}
- **Conflicts resolved**: {count}
- **Test suite**: {PASS (X tests) | FAIL (X passed, Y failed)}

### Decisions Made
| File | Decision | Rationale |
|------|----------|-----------|
| {file1} | {what was chosen} | {why} |
| {file2} | {what was chosen} | {why} |

### Smoketest Guide
Based on files touched during this rebase, manually verify:

**{Feature Area 1}** (files: {file_list})
- [ ] {Specific behavior to test}
- [ ] {Another behavior}

**{Feature Area 2}** (files: {file_list})
- [ ] {Specific behavior to test}

### Safety
- **Backup branch**: {safety_ref_prefix}-{timestamp}
- **Restore command**: `git reset --hard {backup_branch_name}`
- **Push command**: `git push --force-with-lease`
```

- **Action** — DetermineSmoketestAreas: Map touched files to features
  - Group files by directory/module
  - Identify user-facing functionality affected
  - Generate specific test suggestions (not generic "test the app")

- **Action** — ReadNextStepsGuide: Read `.claude/spectre/next_steps_guide.md`
- **Action** — RenderFooter: End with Next Steps footer

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

**Step 1 - Confirm Target Branch**:
- [ ] Target branch obtained (from ARGUMENTS or user)
- [ ] No options presented, direct question asked

**Step 2 - Prepare & Assess**:
- [ ] Uncommitted changes auto-committed (if any)
- [ ] Latest refs fetched
- [ ] Safety backup branch created
- [ ] Complexity assessed

**Step 3 - Execute Rebase & Resolve Conflicts**:
- [ ] Rebase executed
- [ ] All conflicts resolved automatically (no y/n prompts)
- [ ] Each resolution decision tracked with rationale
- [ ] `git rebase --continue` completed successfully

**Step 4 - Verify & Test**:
- [ ] Lint executed and passing
- [ ] Test suite actually run (not just suggested)
- [ ] Test results recorded (pass/fail counts)
- [ ] Rebase integrity validated

**Step 5 - Generate Summary & Finalize**:
- [ ] Summary includes all sections (Overview, Decisions, Smoketest, Safety)
- [ ] Decisions table populated with file/decision/rationale
- [ ] Smoketest guide maps files to specific behaviors to verify
- [ ] Backup restore command provided
- [ ] Next steps guide read and options sourced
- [ ] Single footer rendered

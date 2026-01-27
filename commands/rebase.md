---
description: 👻 | Safe guided rebase w/conflict handling - primary agent
---

# rebase: Safe Git Rebase with Automatic Conflict Resolution

## Description
- **What** — Guide rebase with safety refs, automatic conflict resolution, test verification
- **Outcome** — Successfully rebased branch with resolved conflicts, passing tests, smoketest guide

## ARGUMENTS Input

Optional target branch to rebase onto.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions
- Auto-commit uncommitted changes (no confirmation)
- Auto-resolve conflicts favoring target branch conventions (no prompts)
- Track every resolution decision for summary
- Actually run tests, don't just suggest

## Step 1 - Confirm Target Branch

- **Action** — CheckArguments:
  - **If** ARGUMENTS has branch → proceed
  - **Else** → ask: "What branch to rebase onto? (e.g., `origin/main`)"
- **Wait** — If needed

## Step 2 - Prepare

- **Action** — EnsureCleanTree:
  - **If** uncommitted changes → `git commit -am "chore: snapshot before rebase"`
- **Action** — FetchLatest: `git fetch origin`
- **Action** — CreateSafetyRef: `git branch backup/rebase-$(date +%Y%m%d-%H%M%S)`
- **Action** — AssessComplexity: Light (≤5 commits), Moderate (5-20), Large (>20)

## Step 3 - Execute Rebase

- **Action** — StartRebase: `git rebase {target_branch}`
  - **If** no conflicts → skip to Step 4

- **Action** — ResolveAllConflicts: For each conflict:
  1. Read conflict markers
  2. Resolve (favor target branch patterns)
  3. Track: `{file}: {decision} — {rationale}`
  4. `git add {file}`
  5. `git rebase --continue`
  - Repeat until complete

## Step 4 - Verify

- **Action** — RunLint: Fix violations
- **Action** — RunTestSuite: Detect command (npm test, pytest, cargo test, go test), run full suite
- **Action** — ValidateRebase: Confirm commit count, no unexpected changes

## Step 5 - Summary

- **Action** — GenerateSummary:
  > **Rebase Summary**
  > - Branch: {current} → {target}
  > - Commits: {count} | Conflicts: {count} | Tests: {PASS/FAIL}
  >
  > **Decisions**: | File | Decision | Rationale |
  >
  > **Smoketest Guide** (based on files touched):
  > - {Feature Area}: [ ] {behavior to verify}
  >
  > **Safety**: Backup `{branch}` | Restore: `git reset --hard {backup}`

- **Action** — RenderFooter: Use `@skill-spectre:spectre-next-steps` skill for Next Steps

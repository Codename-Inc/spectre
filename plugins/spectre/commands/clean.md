---
description: 👻 | Complete cleanup flow - clean, inspect, lint, test - primary agent
---

# clean: Dead Code Cleanup

## Description
- **What** — Fast pattern-based dead code detection, escalate to @analyst only for uncertain cases
- **Outcome** — Clean code, lint clean, tests pass, conventional commits

## ARGUMENTS Input

Optional scope: empty = uncommitted, commit SHA = from that commit, "only {sha}" = single commit.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Execution Style
**Default**: Fast checklist — no subagents, no approval gates for obvious dead code.
**Escalate**: Dispatch @analyst only when NEEDS_REVIEW count > 3.

## Step 1 - Scope & Fast Scan

**DetermineScope**:
- Empty → `git diff --cached --name-only` + `git diff --name-only` + untracked
- Commit SHA → changes from {sha}^..HEAD + uncommitted
- "only {sha}" → just that commit's changes

**PatternScan** — Check each file for:
- [ ] Orphaned imports — no usage in file
- [ ] Unused functions/variables — declared, never called
- [ ] Commented-out code — blocks >5 lines
- [ ] Debug artifacts — debugger, TODO/FIXME
- [ ] Temp logging — console.log, "DEBUG:", "TEMP:"
- [ ] Dead branches — unreachable, always-false
- [ ] Orphaned exports — not imported anywhere
- [ ] Test artifacts — .only, skipped tests
- [ ] AI slop — excessive comments, unnecessary checks, `any` casts

**Categorize immediately**:
- **SAFE_TO_REMOVE**: No refs, no dynamic usage hints, obviously dead
- **NEEDS_REVIEW**: Possible dynamic refs, reflection, string interpolation

**DetectDuplication**: Flag copy-paste (>5 similar lines, 2+ instances).

## Step 2 - Conditional Validation

**If** NEEDS_REVIEW ≤ 3 → Skip subagents, go to Step 3
**Else** → Dispatch @analyst for NEEDS_REVIEW items only:
```
Validate uncertain findings: {needs_review_list}
For each: check dynamic refs, reflection, indirect calls.
Return: SAFE_TO_REMOVE or KEEP with evidence.
```

## Step 3 - Execute

**Remove SAFE items** — No approval needed for obvious dead code.
**Present NEEDS_REVIEW** — User decides (remove/keep).
**Rollback** if tests fail after removal.

## Step 4 - Verify & Commit

- Run lint, fix violations
- Run tests, fix failures or rollback
- Commit by type (chore/refactor/fix/test), conventional format
- Render Next Steps via `@skill-spectre:spectre`

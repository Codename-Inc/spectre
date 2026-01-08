---
description: 👻 Document work + review architecture in parallel - primary agent
---

# evaluate: Feature Documentation & Architecture Review

## Description
- **What** — Dispatch parallel agents to document delivered work and review its architecture
- **Outcome** — Two artifacts: feature documentation for future reference, architecture review with improvement opportunities

## Variables

### Dynamic Variables
- `feature_name`: Feature identifier — (via ARGUMENTS: $ARGUMENTS)
- `paths_or_files`: Relevant paths to examine — (via ARGUMENTS or git diff)

### Static Variables
- `out_dir`: specs/{branch_name}

## ARGUMENTS Input

Feature name and/or paths to evaluate. If empty, derives from current branch and recent changes.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions

- Dispatch both agents in parallel (they're independent analyses)
- Both agents examine the same scope for consistency
- Documentation captures "what IS", review captures "what COULD BE"
- Synthesize outputs to cross-reference decisions vs findings
- Commit both artifacts together

## Steps

### Step (1/4) - Determine Scope

- **Action** — GatherContext: Identify what to evaluate
  ```bash
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
  mkdir -p "specs/${branch}"
  echo "Branch: $branch"
  git diff --name-only HEAD~10..HEAD 2>/dev/null || git diff --name-only
  ```

- **Action** — SetVariables:
  - **If** ARGUMENTS has feature name → `feature_name={ARGUMENTS}`
  - **Else** → `feature_name={branch}`
  - **If** ARGUMENTS has paths → `paths_or_files={ARGUMENTS paths}`
  - **Else** → `paths_or_files={files from git diff}`

- **Action** — ValidateScope:
  - **If** no files identified → ask user to specify paths
  - **Else** → continue with identified scope

### Step (2/4) - Parallel Dispatch

- **Action** — DispatchDocumentAgent: Spawn @independent-review-engineer subagent for documentation

**Agent A prompt (Documentation)**:
```
You are documenting a delivered feature for future agent reference.

**Feature**: {feature_name}
**Files**: {paths_or_files}
**Output**: specs/{branch}/{feature_name}_documentation.md

**Task**:
1. Read the implementation files
2. Identify key files (max 5 primary + tests)
3. Extract architecture decisions with rationale
4. Map 3-5 common future tasks to entry points
5. Document gotchas/constraints discovered

**Template**:
# Feature: {feature_name}

## Overview
{2-3 sentences: what problem solved, high-level approach}

## Key Files
- `path/to/file.ts` - {3-5 word description}

## Architecture Decisions
- **Choice**: {what was chosen}
  - **Why**: {1 sentence rationale}

## Common Tasks
| Task | Start Here |
|------|------------|
| {likely task} | `path/file.ts:functionName()` |

## Gotchas / Constraints
- {thing to avoid or be aware of}

## Related
- {links to specs or related docs}

**Output**: Write the documentation file, then return the file path.
```

- **Action** — DispatchReviewAgent: Spawn @independent-review-engineer for architecture review

**Agent B prompt (Architecture Review)**:
```
You are a principal systems architect reviewing delivered work.

**Feature**: {feature_name}
**Files**: {paths_or_files}
**Output**: specs/{branch}/{feature_name}_architecture_review.md

**Review Philosophy**:
- Focus on what gets harder to change later, not what's easy to fix now
- Simplicity is a feature—fewer abstractions, fewer moving parts
- Be specific: exact files, functions, concrete alternatives
- "No concerns" is valid—don't manufacture feedback

**Task**:
1. Read the implementation thoroughly
2. Trace data flow and dependencies
3. Produce architecture review with sections below

**Template**:
# Architecture Review: {feature_name}

## Executive Summary
{2-3 sentences: architectural story, setting us up well or creating pain?}

## Critical Issues
{Issues that compound over time—address before moving on}
- **What**: {specific problem}
- **Where**: {file:line}
- **Why it matters**: {compounding cost}
- **Suggested fix**: {concrete alternative}

## Simplification Opportunities
{Overengineering, unnecessary abstractions, simpler approaches}

## Architecture Alignment
{Following existing patterns or diverging? Intentional or accidental?}

## Future-Proofing Considerations
{Assumptions that might not hold, what breaks at 10x scale}

## Performance Notes
{Only if clear problem or clear win—no speculation}

## What's Done Well
{Patterns worth preserving or spreading}

**Output**: Write the review file, then return the file path and key findings summary.
```

- **Wait** — Both agents complete

### Step (3/4) - Synthesize Outputs

- **Action** — CollectResults: Gather outputs from both agents
  - Documentation file path from Agent A
  - Review file path + findings summary from Agent B

- **Action** — ExtractImprovements: From Agent B's review, extract actionable items
  - Critical Issues → High priority improvements
  - Simplification Opportunities → Medium priority improvements
  - Future-Proofing Considerations → Backlog items

- **Action** — CrossReference: Check for alignment gaps
  - Do documented decisions align with review findings?
  - Flag any contradictions (e.g., "documented as intentional, review flags as concern")

### Step (4/4) - Present & Commit

- **Action** — PresentSummary: Show unified evaluation results

```markdown
## Evaluation Complete

### Artifacts Created
- Documentation: `specs/{branch}/{feature_name}_documentation.md`
- Architecture Review: `specs/{branch}/{feature_name}_architecture_review.md`

### Key Findings
**Architecture Assessment**: {executive summary from review}

**Critical Issues** ({count}):
- {issue 1}
- {issue 2}

**Simplification Opportunities** ({count}):
- {opportunity 1}

**What's Done Well**:
- {positive pattern}

### Future Improvements
| Priority | Improvement | Rationale |
|----------|-------------|-----------|
| High | {from critical issues} | {why} |
| Medium | {from simplifications} | {why} |
| Backlog | {from future-proofing} | {why} |
```

- **Action** — CommitArtifacts: Commit both files
  - `git add specs/{branch}/{feature_name}_documentation.md specs/{branch}/{feature_name}_architecture_review.md`
  - `git commit -m "docs({feature_name}): add feature documentation and architecture review"`

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

**Step 1 - Determine Scope**:
- [ ] Branch identified
- [ ] Output directory created
- [ ] Feature name determined (from ARGUMENTS or branch)
- [ ] Files to evaluate identified (from ARGUMENTS or git diff)

**Step 2 - Parallel Dispatch**:
- [ ] Documentation agent dispatched with correct scope
- [ ] Review agent dispatched with correct scope
- [ ] Both agents use @independent-review-engineer
- [ ] Both agents complete successfully

**Step 3 - Synthesize Outputs**:
- [ ] Documentation file path collected
- [ ] Review file path collected
- [ ] Improvements extracted from review findings
- [ ] Cross-reference check performed

**Step 4 - Present & Commit**:
- [ ] Summary presented with both artifact paths
- [ ] Key findings surfaced (critical issues, simplifications, what's done well)
- [ ] Future improvements listed with priority
- [ ] Both files committed together
- [ ] Conventional commit format used
- [ ] Next steps footer rendered

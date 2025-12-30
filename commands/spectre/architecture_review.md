---
description: 👻 | Conduct principal architecture review
---

# architecture_review: Technical review of completed features

## Description
- **What** — Principal systems architect review focusing on compounding decisions: architectural debt, missed abstractions, performance cliffs, unnecessary complexity
- **Outcome** — Architecture review report with actionable findings organized by severity and type

## Variables

### Dynamic Variables
- `feature_description`: Feature being reviewed — (via ARGUMENTS). If
- `paths_or_files`: Relevant paths to examine — (via ARGUMENTS)
- `arch_notes_or_docs`: Existing architecture context — (via ARGUMENTS, optional)

### ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Instructions

**Review Philosophy** (cross-cutting guidelines):
- **Compounding matters**: Focus on what gets harder to change later, not what's easy to fix now
- **Simplicity is a feature**: The best code is often less code, fewer abstractions, fewer moving parts
- **Context is king**: A "bad" pattern in isolation might be the right choice given project constraints
- **Be specific**: Vague feedback like "could be more modular" is useless. Point to exact files, functions, and concrete alternatives

**Constraints**:
- Don't suggest changes that would take longer to implement than the feature itself unless they're critical
- Don't recommend adding abstractions "for future flexibility" unless there's concrete evidence we'll need them
- If you don't have concerns in a section, say "No concerns" and move on—don't manufacture feedback
- Be direct. "This is fine" is a valid assessment.

**Adapt**
- If ARGUMENTS is empty, gather the review scope from the current thread context.
- If the current thread context is also ambigious, ask the user to clarify the scope of the review.

## Step (1/2) - Explore Implementation

- **Action** — ExploreCode: Thoroughly examine the implementation
  - Read the code at `paths_or_files`
  - Understand the data flow
  - Trace the dependencies
  - Review `arch_notes_or_docs` if provided
  - **If**: Paths unclear or missing
  - **Then**: Ask for clarification before proceeding
  - **Else**: Continue to review

## Step (2/2) - Produce Review Report

- **Action** — GenerateReview: Create structured architecture review using Report format below
  - Apply Review Philosophy guidelines throughout
  - Apply Constraints (no manufactured feedback, proportionate suggestions)
  - **If**: No concerns in a section
  - **Then**: State "No concerns" and move on
  - **Else**: Provide specific, actionable feedback

## Report

**Output Format** — Architecture review with these sections:

### Executive Summary
2-3 sentences: What's the architectural story here? Is this feature setting us up well or creating future pain?

### Critical Issues (address before moving on)
Issues that will cause significant pain if left unaddressed—architectural violations, major performance problems, or patterns that will spread.

For each issue:
- **What**: The specific problem
- **Where**: Exact file(s) and line(s)
- **Why it matters**: The compounding cost over time
- **Suggested fix**: Concrete, implementable alternative

### Simplification Opportunities
Places where we're overengineering, where a simpler approach would work, or where we've introduced abstractions we don't yet need.

### Architecture Alignment
- Does this follow existing project patterns, or introduce new ones?
- If new patterns: Are they intentional improvements or accidental divergence?
- Are there existing utilities/patterns in the codebase this should have used?

### Future-Proofing Considerations
- What assumptions is this code making that might not hold?
- If this feature grows 10x in usage/complexity, what breaks first?
- Are there integration points that need better contracts/interfaces?

### Performance Notes
Only mention performance if there's a clear problem or a clear win—don't speculate about micro-optimizations.

### What's Done Well
Briefly note architectural choices worth preserving or patterns worth spreading to other parts of the codebase.

## Success Criteria

**Step 1 - Explore Implementation**:
- [ ] All specified paths/files read and understood
- [ ] Data flow traced through implementation
- [ ] Dependencies identified and examined
- [ ] Architecture context reviewed if provided

**Step 2 - Produce Review Report**:
- [ ] Executive Summary provides clear architectural assessment (2-3 sentences)
- [ ] Critical Issues include What/Where/Why/Suggested fix for each
- [ ] Simplification Opportunities identify overengineering (or "No concerns")
- [ ] Architecture Alignment addresses pattern consistency
- [ ] Future-Proofing identifies assumptions and scaling concerns
- [ ] Performance Notes only included if clear problem/win exists
- [ ] What's Done Well acknowledges good patterns
- [ ] All feedback is specific with exact files/lines
- [ ] No manufactured feedback—"No concerns" used when appropriate
- [ ] Suggestions proportionate to feature scope
---
description: 👻 Document work + review architecture in parallel - primary agent
---

# evaluate: Feature Documentation & Architecture Review

## Description
- **What** — Dispatch parallel agents to document delivered work and review architecture
- **Outcome** — Two artifacts: feature documentation + architecture review with improvement opportunities

## ARGUMENTS Input

Feature name and/or paths. If empty, derives from branch and recent changes.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1 - Determine Scope

- **Action** — GatherContext:
  ```bash
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
  mkdir -p "specs/${branch}"
  git diff --name-only HEAD~10..HEAD 2>/dev/null || git diff --name-only
  ```
- **Action** — SetVariables:
  - `feature_name` = ARGUMENTS or branch name
  - `paths_or_files` = ARGUMENTS paths or git diff files
  - **If** no files → ask user to specify paths

## Step 2 - Parallel Dispatch

**Dispatch BOTH agents in a single message (parallel).**

- **Action** — DispatchDocumentAgent: Spawn @reviewer
  ```
  Document feature for future reference.
  Feature: {feature_name} | Files: {paths_or_files}
  Output: specs/{branch}/{feature_name}_documentation.md

  Template: Overview, Key Files (max 5), Architecture Decisions (what/why),
  Common Tasks table (task → entry point), Gotchas/Constraints, Related docs
  ```

- **Action** — DispatchReviewAgent: Spawn @reviewer
  ```
  Principal architect review of delivered work.
  Feature: {feature_name} | Files: {paths_or_files}
  Output: specs/{branch}/{feature_name}_architecture_review.md

  Focus: What gets harder to change later. Simplicity is a feature.
  Template: Executive Summary, Critical Issues (what/where/why/fix),
  Simplification Opportunities, Architecture Alignment, Future-Proofing,
  Performance Notes (only if clear), What's Done Well
  ```

- **Wait** — Both agents complete

## Step 3 - Synthesize

- **Action** — CollectResults: Get file paths from both agents
- **Action** — ExtractImprovements: From review → Critical (high), Simplifications (medium), Future-proofing (backlog)
- **Action** — CrossReference: Flag contradictions between documented decisions and review findings

## Step 4 - Present & Commit

- **Action** — PresentSummary:
  > **Artifacts**: `{documentation_path}`, `{architecture_review_path}`
  >
  > **Assessment**: {executive summary}
  > **Critical Issues**: {count} | **Simplifications**: {count} | **Done Well**: {highlights}
  >
  > | Priority | Improvement | Rationale |
  > |----------|-------------|-----------|
  > | High | {from critical} | {why} |
  > | Medium | {from simplifications} | {why} |

- **Action** — CommitArtifacts:
  ```bash
  git add specs/{branch}/*
  git commit -m "docs({feature_name}): add documentation and architecture review"
  ```

- **Action** — RenderFooter: Use `@skill-spectre:spectre-next-steps` skill for Next Steps

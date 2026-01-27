---
name: spectre-next-steps
description: Use when rendering the Next Steps footer after any Spectre workflow prompts complete, or selecting contextual navigation options at the end of any SPECTRE command.
---

# SPECTRE Next Steps Skill

Provides workflow navigation, command reference, and Next Steps footer rendering for SPECTRE commands.

## When to Load

- After completing any SPECTRE command (scope, plan, execute, clean, test, rebase, evaluate)
- When rendering the workflow navigation footer
- When suggesting next actions to the user

---

## Footer Rendering

**Always render a 60-column ASCII box footer at the end of command output.**

### Template

```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ 🧭 Phase: {phase} | 🟢 {status} | 🚧 {blockers}           ║
╟──────────────────────────────────────────────────────────╢
║ 🎯 Next — {concise recommendation; 1–2 lines max}         ║
║                                                          ║
║ ➡️ Options:                                              ║
║ - {/spectre:command or action} — {why}                   ║
║ - {/spectre:command or action} — {why}                   ║
║ - {/spectre:command or action} — {why}                   ║
║   … up to 5 total; ≤2 manual actions                     ║
║                                                          ║
║ 💬 Reply — {only if textual reply expected}               ║
╚══════════════════════════════════════════════════════════╝
```

### Status Values

- `Active` — work in progress, no blockers
- `Pending Input` — awaiting user decision/confirmation
- `Blocked` — external dependency or unresolved issue
- `On Hold` — paused, waiting for external factor
- `Complete` — phase finished successfully

### Rules

1. **Width**: Always 60 columns
2. **Options**: Max 5 total, max 2 manual (non-slash) actions
3. **Slash commands**: Use full `/spectre:` prefix
4. **Manual actions**: No slash prefix (e.g., "Run manual tests")
5. **Divider**: Include `╟──────╢` between status and next rows

---

## SPECTRE Workflow — Next Steps Guide

### Slash Command Usage Rules

**CRITICAL:**

1. **SPECTRE Prompts = Slash Commands**: All prompts listed below are invoked with `/spectre:` prefix (e.g., `/spectre:scope`, `/spectre:execute`)
2. **Manual Actions ≠ Slash Commands**: When recommending manual actions (e.g., "Run tests", "Review PR feedback"), do NOT prefix them with `/`
3. **Never Invent Slash Commands**: Only use slash commands that exist in this guide

**Examples of CORRECT usage:**
```
✅ /spectre:scope — Interactive feature scoping
✅ /spectre:execute — Coordinate parallel agent execution
✅ /spectre:clean — Dead code cleanup
✅ Run manual tests — Execute test guide checklist
✅ Review PR feedback — Address reviewer comments
```

**Examples of INCORRECT usage:**
```
❌ /scope — Missing spectre: prefix
❌ /run tests — Not a slash command
❌ /commit — Does not exist
```

**Stage Awareness**: Only offer next steps that align with the user's current stage. Don't suggest `/spectre:scope` after tasks exist—the next step is clearly execution.

---

## The SPECTRE Workflow

Core meta-workflow phases with their primary prompts:

| Phase | Primary Prompt | Purpose |
|-------|----------------|---------|
| **S**cope | `/spectre:scope` | Define boundaries and requirements |
| **P**lan | `/spectre:plan` | Research, assess, create tasks |
| **E**xecute | `/spectre:execute` | Parallel agent development |
| **C**lean | `/spectre:clean` | Dead code removal, duplication fixes |
| **T**est | `/spectre:test` | Risk-aware test coverage |
| **R**elease | `/spectre:rebase` | Safe rebase, prepare for merge |
| **E**valuate | `/spectre:evaluate` | Document + architecture review |

---

## Phase: Scope

Discovery and requirements definition.

- **/spectre:kickoff**
  - Purpose: Project kickoff with mandatory web research for best practices, saves comprehensive kickoff document, then engages in scoping conversation.
  - When to use: At the start of any new project or feature to establish knowledge baseline.

- **/spectre:research**
  - Purpose: Conducts comprehensive codebase research with parallel specialized agents, generating evidence-based findings with file:line references.
  - When to use: For ambiguous topics, unfamiliar systems, or when you need deep understanding before planning.

- **/spectre:scope**
  - Purpose: Interactive feature scoping through structured questions and contextual suggestions, producing a comprehensive scope document.
  - When to use: When exploring ideas, defining boundaries, or clarifying concepts before formal requirements.

- **/spectre:ux_spec**
  - Purpose: Transform requirements into detailed UX specification through two-stage flow alignment then behavioral spec generation.
  - When to use: **After scope, when the feature has significant UI/UX components** that need detailed screen layouts, user flows, component states, and interaction definitions before implementation.

---

## Phase: Plan

Research, assessment, and task breakdown.

- **/spectre:plan**
  - Purpose: Unified planning entry point that researches codebase, presents architectural options, assesses complexity, and routes to direct tasks or plan-first workflow.
  - When to use: When you're unsure which planning workflow to use—let the assessment decide.

- **/spectre:create_plan**
  - Purpose: Produces a technical implementation plan with architecture discussion, phases, and risk assessment informed by parallel codebase research.
  - When to use: After scope exists, for complex work requiring architectural design before tasking.

- **/spectre:create_tasks**
  - Purpose: Breaks requirements/plan into detailed, parallelizable tasks with dependency analysis, acceptance criteria, and execution strategies.
  - When to use: When requirements and plan are ready to become concrete, traceable tasks.

- **/spectre:plan_review**
  - Purpose: Independently reviews the implementation plan/task list to prevent over-engineering and verify alignment with codebase patterns.
  - When to use: When a plan and/or tasks exist and need a sanity check before execution.

---

## Phase: Execute

Development and verification.

- **/spectre:execute**
  - Purpose: Adaptive wave-based execution dispatching parallel @dev subagents, with reflection after each wave and code review loop until no critical issues remain.
  - When to use: When tasks.md exists and you want coordinated multi-agent parallel execution.

- **/spectre:code_review**
  - Purpose: Comprehensive code analysis covering functionality, quality, security, and production readiness with severity-based findings.
  - When to use: After implementation is complete and ready for in-depth review.

- **/spectre:validate**
  - Purpose: Verifies delivered implementation against original scope requirement-by-requirement, detecting gaps and scope creep.
  - When to use: After implementation to confirm completeness and generate remediation plan if needed.

- **/spectre:create_test_guide**
  - Purpose: Generates a manual test checklist based on implemented features and risk areas.
  - When to use: When preparing for manual QA or creating acceptance test documentation.

---

## Phase: Clean

Codebase hygiene and dead code removal.

- **/spectre:clean**
  - Purpose: Analyzes working set for dead code patterns and duplication, dispatches investigators, presents findings, executes approved removals.
  - When to use: After feature work to clean up artifacts, or periodically for codebase hygiene.

---

## Phase: Test

Risk-aware test coverage.

- **/spectre:test**
  - Purpose: Analyzes current diff, assesses risk tiers (P0-P3), dispatches @test-writer for coverage, verifies, and commits.
  - When to use: After making changes that need test coverage before committing.

---

## Phase: Release

Prepare for merge and deployment.

- **/spectre:rebase**
  - Purpose: Safe guided rebase with automatic conflict resolution, test verification, and detailed decision summary with smoketest guide.
  - When to use: When rebasing a working branch onto a target branch before merge.

---

## Phase: Evaluate

Documentation and architectural assessment.

- **/spectre:evaluate**
  - Purpose: Dispatches parallel agents to document delivered work and review its architecture, producing both artifacts and improvement backlog.
  - When to use: After feature completion for comprehensive documentation and architectural assessment.

- **/spectre:document**
  - Purpose: Generates agent-ready feature documentation capturing delivered work, key files, architecture decisions, and common task entry points.
  - When to use: After feature completion to document for future agent orientation.

- **/spectre:architecture_review**
  - Purpose: Principal systems architect review focusing on compounding decisions, architectural debt, missed abstractions, and complexity.
  - When to use: When you want independent architectural assessment of completed work.

---

## Standalone Commands

### Full Workflows

- **/spectre:spectre**
  - Purpose: Complete SPECTRE workflow from scope through evaluate—interactive scoping, then independent execution through all phases.
  - When to use: For end-to-end feature delivery when you want the full guided workflow.

- **/spectre:quick_dev**
  - Purpose: Lightweight scope + plan workflow for small to medium tasks—confirms scope early, researches efficiently, creates implementation plan.
  - When to use: For straightforward changes (1-5 tasks) that don't require the full SPECTRE ceremony.

### Context Management

- **/spectre:handoff**
  - Purpose: Generates session state snapshot with Beads integration, outputs structured context for cross-session continuity.
  - When to use: At the end of a coding session, when approaching context limits, or when switching contexts on a long-running task.

---

## Quick Reference

### By Stage

**Starting fresh?**
→ `/spectre:kickoff` or `/spectre:scope`

**Have scope, UI-heavy feature?**
→ `/spectre:ux_spec` → then `/spectre:plan`

**Have scope, need plan?**
→ `/spectre:plan`

**Have tasks, ready to build?**
→ `/spectre:execute`

**Code complete, need review?**
→ `/spectre:code_review` then `/spectre:validate`

**Ready to clean up?**
→ `/spectre:clean` then `/spectre:test`

**Ready to merge?**
→ `/spectre:rebase`

**Feature done, need docs?**
→ `/spectre:evaluate`

**Ending session?**
→ `/spectre:handoff`

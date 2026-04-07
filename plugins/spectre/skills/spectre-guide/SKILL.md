---
name: spectre-guide
description: Use when rendering the Next Steps footer after any spectre command, suggesting next actions, or when users need guidance on which SPECTRE command to run.
user-invocable: false
---

# SPECTRE Guide

The single reference for how to use SPECTRE — for both humans and agents.

## When to Load

- After completing any spectre command (to render Next Steps footer)
- When suggesting next actions to the user
- When users ask "what command should I run?" or "how does SPECTRE work?"
- When onboarding a new user to SPECTRE

---

## Core Philosophy

SPECTRE exists because **ambiguity is death** for AI coding agents. When scope, UX, and plans are vague, you rely on the LLM to fill in the blanks — and that's how you end up with spaghetti code, conflicts, and AI slop.

SPECTRE uses **structured workflows that generate canonical docs** — scope documents, UX specs, technical plans, task breakdowns — so you and your agent are aligned on exactly what's being built before a single line of code is written.

The better the inputs, the better the outputs. SPECTRE makes it easy to provide great inputs.

### Principles

- **Great Inputs → Great Outputs** — specificity up front forces clarity
- **Ambiguity is Death** — never let the LLM guess what you meant
- **One Workflow, Every Feature, Any Size** — same process for a button or a backend rewrite
- **Obvious > Clever** — boring solutions that work beat clever ones that break

### Rapid Waterfall

SPECTRE is essentially rapid waterfall: specificity up front → working code → iterate.

AI agents are 10x better at working around *working* existing code. That's why they're great at refactors — they have an established baseline. SPECTRE gets you to working code faster, then you iterate.

---

## Getting Started

### Installation

```bash
# In Claude Code
/plugin marketplace add Codename-Inc/spectre
/plugin install spectre@codename
```

### Your First Feature

```plaintext
/spectre:scope
```

That's it. Start with scope, follow the prompts, and SPECTRE will guide you through the rest. Every command ends with "Next Steps" suggestions — you never have to remember what to run next.

### Session Memory

SPECTRE accumulates context across sessions:

1. Turn off auto-compact in Claude Code `/config`
2. Run `/spectre:handoff` before session ends or when context window is getting full
3. Run `/clear` — next session auto-loads your progress
4. `/spectre:forget` when switching gears to start fresh

---

## The SPECTRE Workflow

**S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate

| Phase | Command | What It Does |
|-------|---------|--------------|
| **S**cope | `/spectre:scope` | Define requirements, constraints, what's IN and OUT |
| **P**lan | `/spectre:plan` | Research codebase, create implementation plan + tasks |
| **E**xecute | `/spectre:execute` | Parallel subagent development in waves |
| **C**lean | `/spectre:clean` | Remove dead code, fix duplication, lint |
| **T**est | `/spectre:test` | Risk-aware test coverage (not brute-force 100%) |
| **R**ebase | `/spectre:rebase` | Safe merge preparation with conflict handling |
| **E**valuate | `/spectre:evaluate` | Architecture review + knowledge capture |

You can use any command standalone — they don't require running in order.

---

## Typical Daily Usage

This is how the creator of SPECTRE uses it daily:

### Building a Feature (the main loop)

1. **`/spectre:scope`** — Get crisp on what's in/out. Non-negotiable unless it's a one-liner.
   - If UX is unclear: run `/spectre:ux_spec` first for user flows and components

2. **`/spectre:plan`** — Build a well-researched technical design or task set
   - Once you have scope/plan/tasks, run `/spectre:handoff` for a fresh context window

3. **`/spectre:execute`** — Parallel subagents work through the tasks
   - Execute also calls code review and validation automatically
   - When done, run `/spectre:handoff` again for clean context

4. **Manual testing + fixes** — Test the feature yourself
   - Use Claude Code's built-in `/plan` mode for small fixes
   - Use `/spectre:fix` for structured debugging of tough bugs
   - New scope needed? Run another `/spectre:scope` cycle
   - Use `/spectre:handoff` liberally to keep context clean

5. **`/spectre:sweep`** — Commit accumulated changes with lint + test
   - Groups changes logically with descriptive conventional commits

6. **`/spectre:clean`** then **`/spectre:test`** — Deep cleanup and risk-aware testing

7. **`/spectre:rebase`** — Rebase onto parent branch, prepare for merge

8. **`/spectre:evaluate`** — Architecture review + capture knowledge for future sessions

9. **Merge/PR** — Address PR comments, get it checked in

### Quick Tasks (skip the ceremony)

For small/medium changes (1-5 tasks):
```plaintext
/spectre:quick_dev
```
Lightweight scope + plan that gets you to execution fast.

### Autonomous Ship (zero gates)

For low-complexity features/fixes where you trust the agent:
```plaintext
/spectre:ship
```
Brain dump context, walk away, review the PR. Zero confirmation gates — scope, TDD, sweep, rebase, and PR creation happen autonomously.

---

## Command Reference

### Phase: Scope — Discovery & Requirements

| Command | When to Use |
|---------|-------------|
| `/spectre:scope` | Starting any new feature — interactive scoping with IN/OUT boundaries |
| `/spectre:kickoff` | High-ambiguity projects — includes web research for best practices |
| `/spectre:research` | Need deep codebase understanding before planning |
| `/spectre:ux_spec` | UI-heavy features that need screen layouts, user flows, component states |

### Phase: Plan — Research & Task Breakdown

| Command | When to Use |
|---------|-------------|
| `/spectre:plan` | Unified entry — researches, assesses complexity, routes to right workflow |
| `/spectre:create_plan` | Complex work needing architectural design before tasking |
| `/spectre:create_tasks` | Requirements/plan ready to become concrete tasks |
| `/spectre:plan_review` | Sanity check a plan/task list for over-engineering |

### Phase: Execute — Development & Verification

| Command | When to Use |
|---------|-------------|
| `/spectre:execute` | Tasks exist, ready for coordinated multi-agent parallel execution |
| `/spectre:code_review` | Implementation complete, ready for in-depth review |
| `/spectre:validate` | Verify implementation against original scope requirement-by-requirement |
| `/spectre:create_test_guide` | Generate manual QA checklist based on features and risks |

### Phase: Clean — Codebase Hygiene

| Command | When to Use |
|---------|-------------|
| `/spectre:clean` | Deep cleanup — dead code, duplication, artifacts |
| `/spectre:sweep` | Light pass — lint, test, descriptive commits for accumulated changes |

### Phase: Test — Risk-Aware Coverage

| Command | When to Use |
|---------|-------------|
| `/spectre:test` | After changes — analyzes risk tiers (P0-P3), writes behavioral tests |

### Phase: Rebase — Merge Preparation

| Command | When to Use |
|---------|-------------|
| `/spectre:rebase` | Rebase working branch onto target with conflict handling |

### Phase: Evaluate — Review & Learn

| Command | When to Use |
|---------|-------------|
| `/spectre:evaluate` | Full evaluate — architecture review (background) + knowledge capture |
| `/spectre:learn` | Just capture knowledge from this session |
| `/spectre:architecture_review` | Just run the architecture review |
| `/spectre:recall {query}` | Find and load existing knowledge |

### Session & Utilities

| Command | When to Use |
|---------|-------------|
| `/spectre:handoff` | Save session state — end of session, context full, switching gears |
| `/spectre:forget` | Clear memory, archive logs, start fresh |
| `/spectre:fix` | Structured debugging for tough bugs |
| `/spectre:quick_dev` | Lightweight scope + plan for small/medium tasks |
| `/spectre:ship` | Autonomous end-to-end: brain dump → scope → TDD → commit → rebase → PR |

---

## Quick Decision Tree

**Starting a feature?**
-> `/spectre:scope` (always start here unless it's trivial)

**Feature has complex UI?**
-> `/spectre:ux_spec` after scope, before plan

**High ambiguity / new project?**
-> `/spectre:kickoff` (includes web research)

**Need to understand code first?**
-> `/spectre:research`

**Have scope, need plan?**
-> `/spectre:plan` (auto-routes based on complexity)

**Have tasks, ready to build?**
-> `/spectre:execute`

**Code complete, need review?**
-> `/spectre:code_review` then `/spectre:validate`

**Accumulated uncommitted changes?**
-> `/spectre:sweep` (light) or `/spectre:clean` (deep)

**Need test coverage?**
-> `/spectre:test`

**Ready to merge?**
-> `/spectre:rebase`

**Feature done?**
-> `/spectre:evaluate` (review + learn)

**Ending session?**
-> `/spectre:handoff`

**Switching contexts?**
-> `/spectre:forget`

**Bug to fix?**
-> `/spectre:fix`

**Small task, skip ceremony?**
-> `/spectre:quick_dev`

**Low-complexity task, full autonomy?**
-> `/spectre:ship` (brain dump → PR, zero gates)

---

## Subagents

SPECTRE dispatches these automatically — you don't need to call them directly. But `@spectre:web-research` is useful for ad-hoc web research (like mini deep-research).

| Agent | Purpose | Model |
|-------|---------|-------|
| `@spectre:dev` | Implementation with MVP focus | sonnet |
| `@spectre:analyst` | Understand how code works | haiku |
| `@spectre:finder` | Find where code lives | haiku |
| `@spectre:patterns` | Find reusable patterns | sonnet |
| `@spectre:web-research` | Web research | sonnet |
| `@spectre:tester` | Test automation | sonnet |
| `@spectre:reviewer` | Independent code review | opus |
| `@spectre:sync` | Session memory consolidation | haiku |

---

## Canonical Docs

SPECTRE generates these documents in `docs/tasks/{branch_name}/`:

| Document | Generated By | Purpose |
|----------|-------------|---------|
| `concepts/scope.md` | `/spectre:scope` | What's IN and OUT |
| `specs/ux.md` | `/spectre:ux_spec` | User flows, components, interactions |
| `specs/plan.md` | `/spectre:create_plan` | Technical design and phasing |
| `specs/tasks.md` | `/spectre:create_tasks` | Concrete tasks with acceptance criteria |
| `reviews/code_review.md` | `/spectre:code_review` | Severity-based code review findings |
| `validation/validation_gaps.md` | `/spectre:validate` | Gaps between scope and implementation |
| `testing/*_test_guide.md` | `/spectre:create_test_guide` | Manual QA checklists |
| `session_logs/*_handoff.json` | `/spectre:handoff` | Session state snapshots |

Keep these checked into git — they're the context in context engineering.

---

## For Agents: Footer Rendering

**Always render a 60-column ASCII box footer at the end of command output.**

### Template

```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ Phase: {phase} | {status} | {blockers}                   ║
╟──────────────────────────────────────────────────────────╢
║ Next — {concise recommendation; 1–2 lines max}           ║
║                                                          ║
║ Options:                                                 ║
║ - {/spectre:command or action} — {why}                   ║
║ - {/spectre:command or action} — {why}                   ║
║ - {/spectre:command or action} — {why}                   ║
║   … up to 5 total; max 2 manual actions                  ║
║                                                          ║
║ Reply — {only if textual reply expected}                  ║
╚══════════════════════════════════════════════════════════╝
```

### Status Values

- `Active` — work in progress, no blockers
- `Pending Input` — awaiting user decision/confirmation
- `Blocked` — external dependency or unresolved issue
- `On Hold` — paused, waiting for external factor
- `Complete` — phase finished successfully

### Footer Rules

1. **Width**: Always 60 columns
2. **Options**: Max 5 total, max 2 manual (non-slash) actions
3. **Slash commands**: Use full `/spectre:` prefix
4. **Manual actions**: No slash prefix (e.g., "Run manual tests")
5. **Divider**: Include `╟──────╢` between status and next rows
6. **Stage Awareness**: Only suggest commands that match current stage

## For Agents: Slash Command Rules

**CRITICAL:**

1. **All SPECTRE commands use `/spectre:` prefix** (e.g., `/spectre:scope`, `/spectre:execute`)
2. **Manual actions are NOT slash commands** (e.g., "Run tests", "Review PR feedback")
3. **Never invent slash commands** — only suggest commands listed in this guide

**Correct:**
```
/spectre:scope — Interactive feature scoping
/spectre:execute — Parallel agent execution
Run manual tests — Execute test guide checklist
```

**Incorrect:**
```
/scope — Missing spectre: prefix
/run tests — Not a slash command
/commit — Does not exist
```

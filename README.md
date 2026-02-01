# SPECTRE

**S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate

A simple, powerful, and **proven** structured development workflow plugin for Claude Code.

## Core Principles

- Great Inputs -&gt; Great Outputs
- Ambiguity is Death
- One Workflow, Every Feature, Any Size, Any Codebase
- Agent Agnostic (aspirational, right now this is Claude Code coupled)

## Why SPECTRE?

Prompt based workflows are how you get better, higher quality, and more consistent results from AI Coding Agents.

The better your prompt based workflows, the more AI can take on, the longer AI can work autonomously, the more easily you can multi-task, and suddently you are 100x'ing your output.

I created Spectre because I wanted:

- a repeatable daily driver workflow that works on brand new projects, and large existing codebases.

- a single workflow that works on both small & big features without being overwhelmed with process

- a workflow that delivers robusts engineering plans when needed, or a concise set of tasks if not

- hands on planning but hands off execution

- higher quality INPUT with LESS WORK so i can ensure the outputs are more aligned with my vision

- ***stupid. simple. memory.*** agent sessions are aware of the ongoing thread of work (/spectre:handoff)

## About Spectre

Spectre is the result of over 12 months of daily Claude Code use. I used and iterated on Spectre ***every single day***.

These are the *actual* prompts I use non stop every day.

With Spectre, I built an React Native based AI Agent + GPS Rangefinder for Golfers (New June (in Alpha)) and a 250k line Tauri/Rust/React desktop application called Subspace (in open Beta).

Spectre made products like New June and Subspace possible.

## Quick Start

### Claude Code

```bash
# Add marketplace and install
/plugin marketplace add Codename-Inc/spectre
/plugin install spectre@codename
```

Then start building:

```plaintext
/spectre:scope 
```

That's it. You just start with 1 command to build features.

## The SPECTRE Workflow

If you start with /scope, your agent will guide you through the rest of the steps automatically.

| Phase | Command | What It Does |
| --- | --- | --- |
| **S**cope | `/spectre:scope` | Define requirements, constraints, success criteria |
| **P**lan | `/spectre:plan` | Research codebase, create implementation plan |
| **E**xecute | `/spectre:execute` | Parallel implementation with wave-based delivery |
| **C**lean | `/spectre:clean` | Remove dead code, lint, format |
| **T**est | `/spectre:test` | Risk-aware test coverage |
| **R**ebase | `/spectre:rebase` | Safe merge preparation with conflict handling |
| **E**valuate | `/spectre:evaluate` | Document changes + architecture review |

Each command ends with "Next Steps" suggestions, so you always know what prompt to run next — you don’t have to remember what the prompts are, which is one thing that kills me about many other Spec Driven Development workflows.

You can use *any* of the commands in any sequence you want - they are good standalone too. More on my typical daily usage below.

## Spectre Session Memory

SPECTRE can maintain and accumulates context across sessions when you use the /spectre:handoff command. To get the most from Spectre's Session Memory, we recommend that you:

1. turn off auto-compact in Claude Code /config settings, and

2. run /spectre:handoff liberally when you are switching gears or the context window is getting north of 160k tokens.

### How It Works

When you run /spectre:handoff, a status report will get generated for that session, and automatically loaded into your context window for the next session. You’ll see a nice summary of the status when you run /clear.

If you already had previous sessions, a subagent (spectre:sync) will review the last 3 status updates and merge into a single continuous session memory.

Voila -- trailing 3 session memory snapshots.

If you want to start fresh — /spectre:forget archives the session_logs.

```plaintext
/spectre:handoff   # Save progress before session ends
/spectre:forget    # Clear memory for fresh start
```

## Subagents

SPECTRE dispatches specialized subagents for different tasks:

NOTE: You don’t even need to know that these subagents exist. The prompts instruct Claude Code to call them automatically.

Although I do sometimes use @spectre:researcher for web research. Its like mini deep-research.

| Agent | Purpose |
| --- | --- |
| `@spectre:dev` | Implementation with MVP focus |
| `@spectre:analyst` | Understand how code works |
| `@spectre:finder` | Find where code lives |
| `@spectre:patterns` | Find reusable patterns |
| `@spectre:web-research` | Web research |
| `@spectre:tester` | Test automation |
| `@spectre:reviewer` | Independent code review |

## How I Typically use Spectre

99.9% of my day is spent using Spectre exactly like this.

- start /spectre:scope to get crisp on what’s in/out. this is non-negotiable unless the feature is a one line ask.

- /spectre:plan to build out a well researched technical design or set of tasks

  - once i have scope/plan/tasks, I typically run /spectre:handoff to get a fresh context window with awareness of what we’re working on.

- then run /spectre:execute to use parallel subagents to work through the tasks. Execute is a meta prompt that also calls /spectre:code_review and /spectre:validate.

  - side note /spectre:validate is a killer prompt. It breaks down the original tasks and dispatches subagents to verify. find stuff missing all the time with this.
  - when initial execution is complete, i run another /spectre:handoff to get the context window clean for fixes/touch ups

- From here — I do a bunch off manual testing and fixing.

  - I largely use Claude Code's built in /plan mode for fixes in this phase.

  - If there is a bug that can't easily be solved, i use the /spectre:fix prompt for a more strutured debugging approach.

  - If something new comes up, or if the scope is not what I’d hoped, I run a new /scope cycle from within the project.

- During the process of manual testing/fixing, I typically accumulate uncommitted changes. /spectre:sweep will get your changes committed, while 

  - running and addressing lint
  - running tests and related tests on touched files
  - finding obvious dead code/AI slop, and
  - grouping changes logically with descriptive conventional commits 

- Once wrapping up, /spectre:clean is a much deeper cleanup that disptaches subagents to find dead code, duplicates, verifies, lint, commits any stragglers, etc.

- Then /spectre:test does deep analysis and dispatches subagents to write tests based on a risk-adjusted framework focusing on behavior not implementation details.

- Once cleaned/tested — /spectre:rebase works great to rebase onto your parent branch, but obviously you do you with your release flow. 

- Finally before I get fully checked in, I run /spectre:evaluate. Its a good way to document the work that you can later easily reference with an @, and the architecture review is helpful to think through if what you built ultimately needs some future work. Nothing ever goes as planned after all.

Note: I'm hard at work on a major upgrade to the /evaluate prompt, so watch for that. Hint: recursive learning.

## Slash Command Reference

### Core Workflow

| Command | Description |
| --- | --- |
| `/spectre:scope` | Interactive feature scoping |
| `/spectre:plan` | Research codebase, create implementation plan |
| `/spectre:execute` | Wave-based parallel execution with code review |
| `/spectre:clean` | Code cleanup and quality gates |
| `/spectre:test` | Risk-aware test coverage |
| `/spectre:rebase` | Safe rebase with conflict handling |
| `/spectre:evaluate` | Documentation and architecture review |

### Quick Start

| Command | Description |
| --- | --- |
| `/spectre:quick_dev` | Scope + plan for small/medium tasks |

### Discovery & Research

| Command | Description |
| --- | --- |
| `/spectre:kickoff` | Deep research for high-ambiguity features |
| `/spectre:research` | Parallel codebase research |

### Session Memory

| Command | Description |
| --- | --- |
| `/spectre:handoff` | Save session state snapshot |
| `/spectre:forget` | Clear memory, archive logs |

### Utilities

These are situational commands.

I use /spectre:fix for pretty much all bugs I run into.

| Command | Description |
| --- | --- |
| `/spectre:sweep` | Light cleanup pass — lint, test, descriptive commits |
| `/spectre:ux_spec` | UX specification for UI-heavy features |
| `/spectre:fix` | Investigate bugs & implement fixes |

## Repository Structure

```plaintext
spectre/
├── .claude-plugin/
│   └── marketplace.json  # Marketplace registration
├── plugins/
│   └── spectre/
│       ├── .claude-plugin/
│       │   └── plugin.json   # Plugin manifest
│       ├── commands/         # Slash commands
│       ├── agents/           # Subagent definitions
│       ├── hooks/            # Session memory hooks
│       └── skills/           # Skills
├── scripts/              # Release & utility scripts
└── CLAUDE.md
```

## License

MIT
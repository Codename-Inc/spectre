# SPECTRE

Contract-driven agentic coding workflows for Claude Code and Codex.

Scope → Plan → Execute → Clean → Rebase

SPECTRE helps product builders and engineering teams turn ambiguous feature requests into explicit artifacts, executable implementation plans, focused agent assignments, code review, validation, tests, and reusable project knowledge.

It works as a Claude Code plugin and as a Codex installable workflow bundle.

**Ship product features with less ambiguity and more repeatable agent behavior.**

SPECTRE covers the core software development lifecycle: scoping a feature, defining user flows, writing a technical plan, generating executable tasks, implementing in waves, reviewing code, validating requirements, cleaning up, testing, rebasing, and capturing reusable knowledge as skills your agent can find later.

![SPECTRE hero](./assets/images/spectre-hero.png)

## ⚡ Quick Start

### Within Claude Code

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

### Within Codex

```bash
npx @codename_inc/spectre install codex
```

When prompted, choose `project` to install into the current repo's `.codex`, or `user` to install into `~/.codex`.

If you choose `project`, run `codex` from that repo.

If you choose `user`, restart or open your normal Codex session.

Then run a Spectre command such as:

```plaintext
scope
```

Current Codex behavior:

- `user` scope installs Spectre workflow skills, runtime helpers, agents, and shared skills under `~/.codex`
- `project` scope installs the same Codex home structure inside `./.codex`
- project installs create `.spectre/manifest.json` and project-local Codex config
- learned project skills live under `.agents/skills/` and are synced into Codex config; agents discover them from skill descriptions

Capability matrix: [`docs/codex-capability-matrix.md`](./docs/codex-capability-matrix.md)

![SPECTRE scope command](./assets/images/spectre-scope.png)

## Why SPECTRE

SPECTRE is built around explicit artifacts and narrow agent contracts. The goal is not more process for its own sake; it is to give coding agents the right context, constraints, and review surfaces so they can work longer without drifting.

- **Adversarial plan review:** STANDARD and COMPREHENSIVE planning require an independent plan review before task generation. When possible, SPECTRE uses the opposite runtime (`codex` reviewing Claude Code work, or `claude` reviewing Codex work) before the planner applies only scope-safe changes.
- **Compact execution artifacts:** `spectre:create_tasks` emits `specs/execute.md` as the execution index and `specs/tasks.json` as canonical task detail. Execute and validation workflows slice `tasks.json` into narrow task assignments instead of loading a large monolithic task file.
- **Comprehensive task review:** COMPREHENSIVE flows add a dedicated task-artifact review after task generation, checking that `execute.md` and `tasks.json` faithfully translate the reviewed plan.
- **Parallel specialist agents:** finder, analyst, patterns, reviewer, tester, web-research, and dev agents handle focused parts of the workflow.
- **Durable project knowledge:** `/spectre:learn` captures patterns, gotchas, procedures, and decisions into project skills that future agents can discover.

## 🔁 How It Works

- run one of the kickoff prompts in Claude Code - `/spectre:scope` is the main command for building new features, but also `/spectre:kickoff` for high ambiguity new features (includes web research), `/spectre:research` for codebase research "how might we build …” style Qs, or `/spectre:ux` to define user flows, components, and layout for a new feature.

- follow the prompts/instructions to create the related canonical document and Claude Code will suggest the next step in the SPECTRE workflow automatically (e.g., going from `scope` to `plan` to `tasks` and so on)

- SPECTRE saves canonical docs to a `docs/tasks/{topic}/specs` directory. We recommend keeping this directory checked into git so agents and teammates can reference docs in the future.

- thats it. scope features, plan features, build features, clean up/test features, document features, learn from features, repeat.

## 🎯 Core SPECTRE Principles

- Great Inputs → Great Outputs
- Ambiguity is Death
- One Workflow, Every Feature, Any Size, Any Codebase
- Obvious &gt; Clever

## SPECTRE Purpose

AI coding is changing product development, but why is it that Claude Code can still go off the rails? Why is it that some developers claim AI has 100x'd their output, while others still complain about the quality of the code it generates?

Let me introduce you to a very simple concept that you need to drill into your head. With coding agents:

> ### **💀 AMBIGUITY IS DEATH.**

When the scope, ux, and plan are ambiguous, you must rely on the LLM to fill in the blanks. And while sometimes you can get lucky - especially for smaller features - for any *real* technology or product work, ambiguity is how you end up with spaghetti code, conflicts, and AI slop.

LLMs need specificity. And typically, providing the right level of specificity is a lot of work. Just think about the most detailed spec or technical design you’ve ever written. Takes days and sometimes weeks.

BUT --- you can use LLMs to make it EASY to provide that specificity. And that is exactly what SPECTRE does.

### ✅ Workflows = Easy Button

Prompt based workflows that generate canonical docs that you and your Agents are aligned on are how you get the best, highest quality, and most consistent results from AI Coding Agents.

They provide the necessary context, detail, and structure for the agent to ask the right questions, investigate the right details, and generate the right requirements, plans, tasks, code, tests, and more.

The better your prompt based workflows, the lower the ambiguity, the more AI can take on, the longer AI can work autonomously, the more easily you can multi-task, and suddenly you are 100x'ing your output.

## 📄 Canonical Docs

As a former PM I've lived the value of [Canonical Docs](https://naomi.com/canonical-everything-c85441a84e70) (shout out Naomi Gleit). The reasons they work for Humans are the same reasons they work with AI Agents (see 💀 Ambiguity is Death)

In SPECTRE, the **structured workflows** generate some combination of the following canonical docs stored in `docs/tasks/{topic/feature}/specs`

- `scope.md` - what are we building and importantly what are we NOT building
- `ux.md` - the core user flows and components/layouts/interactions
- `plan.md` - high level technical design and phasing
- `execute.md` - compact execution index for wave-based delivery
- `tasks.json` - canonical task detail used for slicing focused agent assignments
- `reviews/plan_review.md` - independent adversarial plan review for STANDARD/COMPREHENSIVE planning
- `reviews/task_review.md` - generated task-artifact review for COMPREHENSIVE planning
- `reviews/comprehensive_code_review.md` - opposing-runtime adversarial code review findings
- `gaps.md` - task list of gaps identified from validation
- `.claude/skills/{feature_name}/skill.md` - a skill for agents to auto-reference the work

Not all are required. Sometimes I have scope.md and then use Claude Code's plan mode. Sometimes I have a ux.md and a generated `execute.md`/`tasks.json` pair. The key thing to remember is that docs are the context in context engineering.

### 💧 So.... Waterfall?

Yeah basically Rapid Waterfall.

Specificity up front forces clarity, reduces ambiguity, and leads to better 1st pass results.

THEN -- you can iterate on the feature set, ux, architecture, etc. at lightning speed. AI coding agents are 10x better at working around *working* existing code. It's why they are so good at refactors. Because they are working with a working established baseline.

**Workflows make it easier and faster to get to working code.**

From there, you can iterate and adapt before you ship.

## 📖 Background & Philosophy

## About

SPECTRE is the result of daily production use of agentic coding tools across new codebases, large existing applications, native apps, web apps, desktop apps, and developer tooling.

These are practical workflow prompts refined through repeated product development work, with an emphasis on clear inputs, bounded execution, independent review, and durable knowledge capture.

## 💡 Why

I created SPECTRE because I wanted:

- a repeatable daily driver workflow that works on brand new projects, and large existing codebases.

- a single workflow that works on both small & big features without being overwhelmed with process

- a workflow that delivers robust engineering plans when needed, or a concise set of tasks if not

- hands on planning but hands off execution

- higher quality INPUT with LESS WORK so i can ensure the outputs are more aligned with my vision

- a workflow that lets Agents capture codebase features, patterns, bugs, and decisions as reusable skills

### My Workflow Iteration Process

I improve these prompts daily, and I didn't just prompt Claude Code to generate these prompts. I iterated over many months, adjusting the prompts based on both the user experience of using them, and the quality of results that I got.

For example:

- I iterated on /spectre:scope until I felt like the types of questions actually help me get clear on what I'm building, without asking questions that it could easily get from codebase research
- I iterated on the /spectre:execute workflow until it successfully delivered large tasks in a single context window using subagents that deliver completion reports to brief the next subagents, use TDD effectively, and autonomously adapt the tasks based on what was discovered DURING development instead of blindly
- I iterated on the /spectre:clean, /spectre:prune, /spectre:test, and /spectre:sweep workflows until it felt automatic that we were sticking to our linting rules, every new feature was well tested/covered, and the commits were grouped logically with the appropriate amount of detail.
- I iterated on the /spectre:learn and /spectre:recall workflows until captured project knowledge was easy to reuse without a startup injection layer.

SPECTRE is designed for builders who want hands-on control over scope and planning, then hands-off execution with stronger review and validation loops.

## 🔄 The SPECTRE Workflow

If you start with /scope, your agent will guide you through the rest of the steps automatically.

| Phase | Command | What It Does |
| --- | --- | --- |
| **S**cope | `/spectre:scope` | Define requirements, constraints, success criteria |
| **P**lan | `/spectre:plan` | Research codebase, create implementation plan |
| **E**xecute | `/spectre:execute` | Parallel implementation with wave-based delivery |
| **C**lean | `/spectre:clean` | Meta closeout: prune, risk-based tests, sweep/commit |
| **T**est | `/spectre:test` | Standalone risk-aware test coverage |
| **R**ebase | `/spectre:rebase` | Safe merge preparation with conflict handling |

Each command ends with "Next Steps" suggestions, so you always know what prompt to run next — you don't have to remember what the prompts are, which is one thing that kills me about many other Spec Driven Development workflows.

You can use *any* of the commands in any sequence you want - they are good standalone too. More on my typical daily usage below.

## 🧬 SPECTRE Learn And Recall

The more I used SPECTRE and the faster I could build, the more frequently I found myself wanting to reference past work. Debugging sessions, a new architectural pattern, or how a feature works/was built.

SPECTRE keeps this explicit: use `/spectre:learn` to capture durable project knowledge, and `/spectre:recall` to find it later.

### How It Works

`/spectre:learn` captures durable project knowledge (patterns, gotchas, decisions) into reusable skills under `.agents/skills/`. Codex project installs sync those skills into `config.toml`; Claude Code and Codex can then find and load them from their skill descriptions. `/spectre:recall auth` is available when you want to search explicitly.

The result: knowledge compounds across sessions instead of resetting to zero. The more you learn, the faster and more accurate every future session becomes.

### What Gets Captured

| Category | Example |
| --- | --- |
| **Gotchas** | "The websocket reconnect silently fails if..." |
| **Decisions** | "We chose SQLite over Postgres because..." |
| **Features** | Architecture dossiers — key files, flows, common tasks |
| **Patterns** | Reusable solutions established across the codebase |
| **Procedures** | Multi-step processes like deploy, release, migrate |

You can also run these independently:

```plaintext
/spectre:learn                 # Just capture knowledge from this session
/spectre:recall auth           # Find and load existing knowledge about auth
```

## 🤖 Subagents

SPECTRE dispatches specialized subagents for different tasks:

NOTE: You don't even need to know that these subagents exist. The prompts instruct Claude Code to call them automatically.

Although I do sometimes use @spectre:web-research for web research. It's like mini deep-research.

| Agent | Purpose |
| --- | --- |
| `@spectre:dev` | Implementation with MVP focus |
| `@spectre:analyst` | Understand how code works |
| `@spectre:finder` | Find where code lives |
| `@spectre:patterns` | Find reusable patterns |
| `@spectre:web-research` | Web research |
| `@spectre:tester` | Test automation |
| `@spectre:reviewer` | Independent code review |

## 🛠️ How I Typically use SPECTRE

99.9% of my day is spent using SPECTRE exactly like this.

- start /spectre:scope to get crisp on what's in/out. this is non-negotiable unless the feature is a one line ask.

  - if the feature's ux/user flow is unclear to me, or I want to make sure to really nail it, i run /spectre:ux. Its similar to /spectre:scope but focuses on getting clear on the core user flows.

- /spectre:plan to build out a well researched technical design or set of tasks

  - for STANDARD and COMPREHENSIVE plans, Spectre runs an independent adversarial plan review before generating tasks. The primary agent reads the saved review report and applies only scope-safe plan fixes.

  - for COMPREHENSIVE plans, Spectre then reviews the generated `execute.md` and `tasks.json` before execution to catch task translation gaps.

- then run /spectre:execute to use parallel subagents to work through the tasks. Execute is a meta prompt that also calls /spectre:code_review with a pinned high-effort opposing model (or the same adversarial contract through a native fallback) and /spectre:validate.

  - execute reads the compact `execute.md` index, slices `tasks.json` into focused `<task_assignment>` payloads, and updates task status in JSON as work lands.

  - side note /spectre:validate is a killer prompt. It breaks down the original tasks and dispatches subagents to verify. find stuff missing all the time with this.

- for low-complexity tasks where I trust the agent end-to-end, I use /spectre:ship. Brain dump what I want, walk away, and review the PR. It autonomously scopes, implements with TDD, sweeps, rebases, and opens a PR — zero confirmation gates.

- From here — I do a bunch of manual testing and fixing.

  - I largely use Claude Code's built in /plan mode for fixes in this phase.

  - If there is a bug that can't easily be solved, i use the /spectre:fix prompt for a more structured debugging approach.

  - If something new comes up, or if the scope is not what I'd hoped, I run a new /scope cycle from within the project.

- During the process of manual testing/fixing, I typically accumulate uncommitted changes. /spectre:sweep will get your changes committed, while

  - running and addressing lint
  - running tests and related tests on touched files
  - finding obvious dead code/AI slop, and
  - grouping changes logically with descriptive conventional commits

- Once wrapping up, /spectre:clean is the end-to-end closeout: it dispatches subagents for prune, test, and sweep so dead code is removed, risk-based tests are handled, and the final diff is committed.

- If I only need one phase, /spectre:prune handles dead-code/artifact cleanup, /spectre:test handles risk-adjusted behavioral tests, and /spectre:sweep handles final hygiene plus commits.

- Once cleaned/tested — /spectre:rebase works great to rebase onto your parent branch, but obviously you do you with your release flow. From here I create PR/merge or directly merge depending on the task.

- Finally, I run /spectre:learn to capture any knowledge worth preserving — patterns, gotchas, decisions. This builds institutional memory that agents can find in future sessions.

- From here, merge/PR, address any PR comments, etc. and get the feature checked back in.

## 📋 Slash Command Reference

### Core Workflow

| Command | Description |
| --- | --- |
| `/spectre:scope` | Interactive feature scoping |
| `/spectre:plan` | Research codebase, create implementation plan |
| `/spectre:execute` | Wave-based parallel execution with code review |
| `/spectre:clean` | Meta closeout: prune, risk-based tests, sweep/commit |
| `/spectre:prune` | Dead-code and artifact cleanup only |
| `/spectre:test` | Standalone risk-aware test coverage |
| `/spectre:rebase` | Safe rebase with conflict handling |

### Quick Start

| Command | Description |
| --- | --- |
| `/spectre:quick_dev` | Scope + plan for small/medium tasks |
| `/spectre:ship` | Autonomous end-to-end: brain dump → scope → TDD → rebase → PR |

### Discovery & Research

| Command | Description |
| --- | --- |
| `/spectre:kickoff` | Deep research for high-ambiguity features |
| `/spectre:research` | Parallel codebase research |

### Utilities

These are situational commands.

I use /spectre:fix for pretty much all bugs I run into.

| Command | Description |
| --- | --- |
| `/spectre:sweep` | Light cleanup pass — lint, test, descriptive commits |
| `/spectre:learn` | Capture knowledge for future sessions |
| `/spectre:recall` | Search and load project knowledge |
| `/spectre:ux` | UX specification for UI-heavy features |
| `/spectre:fix` | Investigate bugs & implement fixes |

## 📁 Repository Structure

```plaintext
spectre/
├── .claude-plugin/
│   └── marketplace.json  # Marketplace registration
├── plugins/
│   └── spectre/
│       ├── .claude-plugin/
│       │   └── plugin.json   # Plugin manifest
│       ├── agents/           # Subagent definitions
│       ├── hooks/            # Learning registration helper scripts
│       └── skills/           # Slash workflows + knowledge skills
├── scripts/              # Release & utility scripts
└── CLAUDE.md
```

## Updating

Skills update automatically when you update the plugin:

`/plugin update spectre`

## License

MIT License - see LICENSE file for details

## Support and/or Feedback

Issues: https://github.com/codename-inc/spectre/issues

Email: [joe@bycodename.com](mailto:joe@bycodename.com?subject=Spectre%20Feedback)

Socials:

- Threads: [@joenandez](https://www.threads.com/joenandez)
- X: [@joenandez](https://www.x.com/joenandez)
- LinkedIn: [@joefernandez](https://www.linkedin.com/in/joefernandez/)

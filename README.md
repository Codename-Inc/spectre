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
/plugin marketplace add joenandez/spectre
/plugin install spectre@spectre
```

Then start building:

```plaintext
/spectre:scope
```

That's it. You just start with 1 command to build features.

### Within Codex

```bash
codex plugin marketplace add joenandez/spectre
codex plugin add spectre@spectre
```

Restart or open a new Codex session after install so managed custom agents can be discovered. Plugin hooks still require Codex trust review.

Then run a Spectre command such as:

```plaintext
scope
```

Current Codex behavior:

- The native `spectre@spectre` plugin supplies workflow skills, hooks, knowledge runtime modules, and managed-agent setup.
- Managed Codex custom agents are installed as namespaced `spectre_*` TOMLs, for example `@spectre_dev`, `@spectre_analyst`, and `@spectre_web_research`.
- The old `npx @codename_inc/spectre install/update/uninstall codex` file installer is retired in 6.0.0 and now prints native plugin commands without mutating Codex files.
- Project knowledge is stored in the canonical user-level Spectre store. SessionStart supplies a size-bounded metadata registry; agents search omitted or unknown records and load a chosen exact ID before applying it.

Capability matrix: [`docs/codex-capability-matrix.md`](./docs/codex-capability-matrix.md)

![SPECTRE scope command](./assets/images/spectre-scope.png)

## Why SPECTRE

SPECTRE is built around explicit artifacts and narrow agent contracts. The goal is not more process for its own sake; it is to give coding agents the right context, constraints, and review surfaces so they can work longer without drifting.

- **Adversarial plan review:** STANDARD and COMPREHENSIVE planning require an independent plan review before task generation. When possible, SPECTRE uses the opposite runtime (`codex` reviewing Claude Code work, or `claude` reviewing Codex work) before the planner applies only scope-safe changes.
- **Compact execution artifacts:** `spectre:create_tasks` emits `specs/execute.md` as the execution index and `specs/tasks.json` as canonical task detail. Execute and validation workflows slice `tasks.json` into narrow task assignments instead of loading a large monolithic task file.
- **Comprehensive task review:** COMPREHENSIVE flows add a dedicated task-artifact review after task generation, checking that `execute.md` and `tasks.json` faithfully translate the reviewed plan.
- **Portable autonomous handoff:** non-MICRO planning emits `goal-prompts.md` with structured and compact `/goal` prompts that run `spectre-execute` followed by user-facing `spectre-proof`, stopping successfully only on reviewed proof `PASS`.
- **Parallel specialist agents:** finder, analyst, patterns, reviewer, tester, web-research, and dev agents handle focused parts of the workflow.
- **Durable project knowledge:** `/spectre:learn` captures patterns, gotchas, procedures, and decisions into project skills that future agents can discover.

## 🔁 How It Works

- run one of the kickoff prompts in Claude Code - `/spectre:scope` is the main command for building new features, but also `/spectre:kickoff` for high ambiguity new features (includes web research), `/spectre:research` for codebase research "how might we build …” style Qs, or `/spectre:ux` to define user flows, components, and layout for a new feature.

- follow the prompts/instructions to create the related canonical document and Claude Code will suggest the next step in the SPECTRE workflow automatically (e.g., going from `scope` to `plan` to `tasks` and so on)

- SPECTRE saves canonical feature docs under `.spectre/features/<feature-name>/`. Keep this directory checked into git so agents and teammates can reference durable feature records in the future. Branch-scoped session continuity is stored separately under `.spectre/handoffs/<branch-name>/`.

- If you already have a readable implementation plan, execute it directly:

  ```plaintext
  /spectre:execute .spectre/features/example-feature/specs/plan.md
  ```

  The source `plan.md` remains authoritative, and no complete task generation is required. SPECTRE records orchestration progress and quality evidence in a derivative `execution_state.md` without replacing or rewriting the plan.

- Existing `docs/tasks/**` feature records remain readable as legacy compatibility inputs, but new canonical artifacts are written to `.spectre/features/<feature-name>/`.

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

In SPECTRE, the **structured workflows** generate some combination of the following canonical docs under `.spectre/features/<feature-name>/`:

- `concepts/scope.md` - what are we building and importantly what are we NOT building
- `ux.md` - the core user flows and components/layouts/interactions
- `specs/plan.md` - high level technical design and phasing
- `specs/execute.md` - compact execution index for wave-based delivery
- `specs/tasks.json` - canonical task detail used for slicing focused agent assignments
- `execution_state.md` - derivative runtime state for plan-direct execution; it is not a requirements document, and the source `plan.md` remains authoritative
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
- I iterated on `/spectre:learn` and the registry/search/load flow until captured project knowledge was easy to reuse through agent-judged retrieval.

SPECTRE is designed for builders who want hands-on control over scope and planning, then hands-off execution with stronger review and validation loops.

## 🔄 The SPECTRE Workflow

If you start with /scope, your agent will guide you through the rest of the steps automatically.

| Phase | Command | What It Does |
| --- | --- | --- |
| **S**cope | `/spectre:scope` | Define requirements, constraints, success criteria |
| **P**lan | `/spectre:plan` | Research codebase, create implementation plan |
| **E**xecute | `/spectre:execute` | Parallel implementation with wave-based delivery |
| **P**roof | `/spectre:proof` | Exercise the feature as a user, review evidence, repair gaps, and reprove |
| **Ship It** | `/spectre:ship-it` | Clean, rebase, and open the PR |

Each outermost command ends with one task-aware "Next (recommended)" route tied to what it actually found, plus a conditional alternative only when useful. Composed utility skills return to their parent workflow instead of leaking contradictory suggestions.

You can use *any* of the commands in any sequence you want - they are good standalone too. `/spectre:clean`, `/spectre:test`, and `/spectre:rebase` remain focused standalone phases and are composed by `/spectre:ship-it` for the normal closeout path. Proof improves the evidence available at shipping time, but it is not required to use `/spectre:ship-it`. More on my typical daily usage below.

## 🧬 SPECTRE Learn And Retrieve

The more I used SPECTRE and the faster I could build, the more frequently I found myself wanting to reference past work. Debugging sessions, a new architectural pattern, or how a feature works/was built.

SPECTRE keeps this explicit: use `/spectre:learn` to capture durable project knowledge. Claude Code and Codex receive a compact metadata registry at SessionStart, then use the neutral knowledge CLI to search and load records on demand.

### How It Works

`/spectre:learn` captures patterns, gotchas, decisions, and procedures in Spectre's canonical user-level project store. The SessionStart registry contains routing metadata only: record ID, version, use condition, activation cues, and an exact load command. An activation cue alone is insufficient; the task's subject and the record's use condition must both align before an agent loads it.

If a likely record is omitted from the bounded registry or its exact ID is unknown, the agent uses the bundled lexical search command, chooses a relevant ID, and performs a verified exact load before applying the knowledge. A successful load returns the core record plus its `recordDirectory` and safe `resources` paths. Only successful verified loads affect registry rank; registry exposure and search matches/misses are delivery and discovery diagnostics, not evidence that content was accessed.

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
spectre knowledge search auth  # Search metadata when an ID is unknown or omitted
spectre knowledge load feature-auth-flows  # Verify and load one exact ID
spectre knowledge registry --host claude --project-dir "$PWD"  # Preview the exact SessionStart payload
spectre knowledge registry --host codex --project-dir "$PWD" --json  # Include budget and omitted-record diagnostics
```

Without `--json`, `knowledge registry` prints the complete `additionalContext` text that SessionStart would inject. With `--json`, it returns the exact hook payload plus the measured host budget, included and omitted record IDs, and warnings. The preview is read-only: it does not migrate records, increment usage, or change ranking.

## 🤖 Subagents

SPECTRE dispatches specialized subagents for different tasks:

NOTE: You don't even need to know that these subagents exist. The prompts instruct Claude Code to call them automatically.

Although I do sometimes use `@spectre:web-research` in Claude Code or `@spectre_web_research` in Codex for web research. It's like mini deep-research.

| Claude Code | Codex | Purpose |
| --- | --- | --- |
| `@spectre:dev` | `@spectre_dev` | Implementation with MVP focus |
| `@spectre:analyst` | `@spectre_analyst` | Understand how code works |
| `@spectre:finder` | `@spectre_finder` | Find where code lives |
| `@spectre:patterns` | `@spectre_patterns` | Find reusable patterns |
| `@spectre:web-research` | `@spectre_web_research` | Web research |
| `@spectre:tester` | `@spectre_tester` | Test automation |
| `@spectre:reviewer` | `@spectre_reviewer` | Independent code review |

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

- for low-ambiguity features and fixes where I trust the agent end-to-end, I use `/spectre:deliver`. I describe the outcome, walk away, and return to final proof plus a draft PR — zero routine confirmation gates.

- when I want one alignment point first, I use `/spectre:align-and-deliver`. It runs a grounded, one-confirmation scope pass and then follows the same autonomous implementation, proof, and draft-PR path.

- once execute is done, I run /spectre:proof in a fresh session and ask the agent to prove the feature works from the user's point of view.

  - proof exercises the real workflow, captures and actually reviews screenshots/video/logs against the approved scope and UX, writes an HTML evidence artifact, and dispatches bounded dev loops for anything it finds.

  - after each repair, it reruns the affected journey and any primary journey the change could impact. Green tests or internal state alone do not count as a user-facing pass.

  - If something new comes up, or if the scope is not what I'd hoped, I run a new /scope cycle from within the project.

- During proof and repair, I typically accumulate uncommitted changes. /spectre:sweep will get your changes committed, while

  - running and addressing lint
  - running tests and related tests on touched files
  - finding obvious dead code/AI slop, and
  - grouping changes logically with descriptive conventional commits

- When the task is ready to ship, /spectre:ship-it runs the terminal closeout: clean, safe rebase, and PR creation. I can use it whether or not I ran /spectre:proof.

- If I only need one phase, /spectre:prune handles dead-code/artifact cleanup, /spectre:test handles risk-adjusted behavioral tests, and /spectre:sweep handles final hygiene plus commits.

- `/spectre:clean`, `/spectre:rebase`, and `/spectre:create_pr` remain useful standalone. `/spectre:ship-it` composes them, while proof remains an independent optional workflow.

- Finally, I run /spectre:learn to capture any knowledge worth preserving — patterns, gotchas, decisions. This builds institutional memory that agents can find in future sessions.

- From here, merge/PR, address any PR comments, etc. and get the feature checked back in.

## 📋 Slash Command Reference

### Core Workflow

| Command | Description |
| --- | --- |
| `/spectre:scope` | Interactive feature scoping |
| `/spectre:plan` | Research codebase, create implementation plan |
| `/spectre:execute` | Wave-based parallel execution with code review |
| `/spectre:proof` | User-level acceptance proof with reviewed visual evidence and repair loops |
| `/spectre:ship-it` | Completed-branch closeout: clean, rebase, PR |
| `/spectre:clean` | Meta closeout: prune, risk-based tests, sweep/commit |
| `/spectre:prune` | Dead-code and artifact cleanup only |
| `/spectre:test` | Standalone risk-aware test coverage |
| `/spectre:rebase` | Safe rebase with conflict handling |

### Quick Start

| Command | Description |
| --- | --- |
| `/spectre:align-and-deliver` | One grounded scope confirmation, then autonomous feature/fix delivery → proof → draft PR |
| `/spectre:deliver` | No-gate autonomous feature/fix delivery → proof → draft PR |

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

`/plugin update spectre@spectre`

## License

MIT License - see LICENSE file for details

## Support and/or Feedback

Issues: https://github.com/joenandez/spectre/issues

Email: [joe@bycodename.com](mailto:joe@bycodename.com?subject=Spectre%20Feedback)

Socials:

- Threads: [@joenandez](https://www.threads.com/joenandez)
- X: [@joenandez](https://www.x.com/joenandez)
- LinkedIn: [@joefernandez](https://www.linkedin.com/in/joefernandez/)

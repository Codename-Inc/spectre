
# SPECTRE: A Workflow for Product Builders

SPECTRE is an Agentic Engineering workflow for Claude Code and Codex designed to help you do ONE THING more, faster, and with higher quality.

**🚀 Ship Product Features**

SPECTRE's workflow covers the complete software development lifecycle - from scoping a feature, finalizing user flows, writing the technical design, generating tasks, executing the tasks, code review, validating and proving the work works, cleaning up, testing, shipping, and generating durable & retrievable knowledge your Agent can find and load when relevant.

It has been tested on brand new codebases and codebases with hundreds of thousands of lines of code. Its been tested building websites, react native apps, native desktop apps, and personal software.

**SPECTRE helps you get higher quality and more consistent results from your coding agent, while they work autonomously for much longer, so 10-100x'ing your typical output feels *easy* and more importantly, *repeatable.***

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
$spectre-scope
```

![SPECTRE scope command](./assets/images/spectre-scope.png)

## 🔁 How It Works

SPECTRE shines for building complete features. You really only need to remember one command. `/spectre:scope`. its the starting point and every final agent response after that point guides you to what is next.

Read the "When not to use SPECTRE" below to learn when it isn't the right tool.

### How to use SPECTRE

- run one of the kickoff prompts with your Agent

  - `/spectre:scope` is the primary starting point. It helps you explore the edges of the proposed feature while clarifying what is specifically in, out, future, anti-scope, and maybe. The workflow asks questions to clarify until scope is clear and final.
  - `/spectre:kickoff` is for high ambiguity new features and includes web research to explore what already exists and best practices. use if you have an idea but the exact scope is not clear yet.
  - `/spectre:research` is for highly technical explorations, focused on codebase research "how might we build …” style Qs
  - `/spectre:ux` I usually use after scope, but if the scope is clear from discussion its a good starting point to define user flows, components, and layout for a new feature.

- Your Agent will suggest the most relevant next step in the SPECTRE workflow automatically. For example, `/spectre:ux` if user flows are important, or directly to the full `/spectre:plan` flow to create the implementation plan.

- When context window is full or you reach a natural stopping point, run`/spectre:handoff` to generate a clear summary of the current work, next steps, open Qs, etc.  Then start a new session (`/clear`) and your handoff is automatically injected into the next session. You'll see a summary when you start.

  - subsequent `/spectre:handoff` requests will use a subagent to combine to maintain continuity.
  - `/spectre:forget` when you are switching gears and want to clear the handoff context.

- SPECTRE saves canonical feature docs under `.spectre/features/<feature-name>/`, and `/spectre:handoff` saves branch-keyed session state under `.spectre/handoffs/<branch-name>/`. Keep `.spectre/features/` checked into git so your Agent and teammates can reference durable feature records in the future; handoffs remain local session state.

- `/spectre:plan`, `/spectre:execute`, and `/spectre:ship` workflows are **meta workflows**. They combine a number of skills into a single workflow that your primary agent runs and subagents execute.

  - `/spectre:plan` will
    - research your codebase
    - generate a high level design proposal for your approval
    - create an implementation plan
    - run an independent adversarial review to find simplifications and evaluate through a YAGNI/DRY lens
    - for COMPREHENSIVE plans, give the generated tasks a final adversarial review for correctness
    - generate a canonical `execute.md` index which gives your agent instructions on how to parallelize the work (so it doesn't have to read the full `tasks.json` to save on tokens)
    - generate a `goal-prompts.md` to create `/goal` prompts you can use based on goal prompt best practices to start the execution phase.
  - `/spectre:execute` guides the primary agent through orchestrating the full implementation. if you use one of the provided `/goal` prompts, the agent is instructed to use `/spectre:execute` directly, you don't have to invoke it. `/spectre:execute`'s meta workflow will:
    - read the `execute.md` to identify what subagents to dispatch with what context
    - dispatch `@spectre:dev` subagents in Claude Code or `@spectre_dev` in Codex with *only* the context they require to deliver their task
    - run affected verification after each wave and use intermediate reviewers only when compounding risk is recorded
    - run one opposite-runtime (Codex or Claude Code) adversarial Code Review and one consolidated repair pass to address the feedback
    - finally, run `/spectre:prove` to break the scope/ux into explicit acceptance criteria and *prove* through your existing test harness or another suitable proof tool that the product works as expected. It will take screenshots and video when the work is visual, evaluate them and the logs, and create a final reviewable `proof.html` artifact for your review.
  - `/spectre:ship` is what you run when you are ready to check a feature in and create a PR. It will:
    - run `/spectre:clean` which is itself a meta workflow. `/spectre:prune` finds dead and unreachable code, flags duplicates, temp logs, and slop. `/spectre:test` runs a risk-weighted assessment to identify test coverage gaps, classify gaps as P0, P1, P2, and P3 behavior and write tests for the most important gaps. Then, it will run `/spectre:rebase` to rebase onto the parent branch (if there is one) and `/spectre:create_pr` to open the PR.

## 🛑 When NOT to use SPECTRE

SPECTRE excels for building complete medium to large features. Don't use SPECTRE's main workflow in the following scenarios:

- Tiny or Small improvements, papercuts, or fixes where the scope is unambiguous. I greatly prefer Claude Code and Codex's plan mode for these.
- Prototypes. With Prototypes speed is critical. SPECTRE's full workflow can be lengthy - intentionally so to ensure high quality inputs and outputs. For prototypes, I might run one `/spectre:scope` then either use the Agent's native plan mode or just go directly into "build this".
- Fixing bugs. SPECTRE includes `/spectre:fix` for bugs of all sizes/complexity, but the main SPECTRE workflow is not the right fit
- Post build iteration. After you build a feature, there are invariably things to iterate on. For these, I almost exclusively use Agent plan mode unless its a truly missing feature or the need is somewhat ambiguous.
- Massive multi-phase features. SPECTRE is designed for a relatively 'standard' sized feature. If you are building a huge product, and the work needs to be broken up into multiple-phases, typically what I'll do is run one `/spectre:scope` for the complete scope, then work with the agent to break it up into logical phases - saving that doc as `phases.md`. Then I'll run another `/spectre:scope` for the phase I'm building.

## Scenarios where SPECTRE is particularly useful

- Building brand new products. Starting with `/spectre:kickoff` is a great starting point, including web research, identifying existing related products, and creating a high quality kick off document you can then take into `/spectre:scope`.
- Highly ambiguous, highly technical features or questions. `/spectre:research` is excellent for this because it includes usage of the `@spectre:web-research` subagent in Claude Code or `@spectre_web_research` in Codex, which searches the web exhaustively on the topic. The final report is sometimes good enough to jump straight into execution, and is almost always extremely clarifying.
- Building internal developer tools, skills, workflows, personal software. Basically, if you have an idea, and you want to get clear on the scope, the process is generic enough to work for *anything* you want the agent to build.

## 🎯 Core SPECTRE Principles

- Great Inputs → Great Outputs
- Ambiguity is Death
- One Workflow, Every Feature, Any Size, Any Codebase
- Obvious > Clever

## 👻 SPECTRE Purpose

SPECTRE exists because I wanted a consistent, repeatable workflow to get high quality results from Agents.

The more time I spent automating and improving SPECTRE, the faster I could go, the higher quality the results, the less time I spent validating that a feature works at all. My time is now spent 90% on scope/ux planning, big thorny complex problems, dogfooding, and building the machine that builds the machine.

SPECTRE's core premise is actually very simple.

> ### **💀 AMBIGUITY IS DEATH.**

When the scope, ux, and plan are ambiguous, you must rely on the LLM to fill in the blanks. And while sometimes you can get lucky - especially for smaller features - for any *real* technology or product work, ambiguity is how you end up with spaghetti code, conflicts, and AI slop.

Ambiguity is not just about scope. Its also about plans that don't get adversarially reviewed. Code that agents write that doesn't get checked. Agents finishing work without validating that it actually works.

You can get lucky, but in my experience Ambiguity leads to bad products.

Providing the **right** amount of context and specificity can be a lot of work. Just think about the most detailed spec or technical design you’ve ever written. Takes days and sometimes weeks.

BUT --- you can use LLMs to make it EASY to provide that specificity. And that is exactly what SPECTRE does.

### ✅ Workflows = Easy Button

Prompt based workflows that generate canonical docs that you and your Agents are aligned on are how you get the best, highest quality, and most consistent results from AI Coding Agents.

They provide the necessary context, detail, and structure for the agent to ask the right questions, investigate the right details, and generate the right requirements, plans, tasks, code, tests, and more.

They force adversarial reviews, check code quality, teach the agent how to verify that the code *works*, find and clean up mistakes and dead code from dead ends, and more importantly --- they create time & space for you to focus on the most important things.

That the product does exactly what you expected it to do, performantly, securely, and tastefully.

The better your prompt based workflows, the lower the ambiguity, the more AI can take on, the longer AI can work autonomously, the more easily you can multi-task, and suddenly you are 100x'ing your output.

## 📄 Canonical Docs

As a former PM I've lived the value of [Canonical Docs](https://naomi.com/canonical-everything-c85441a84e70) (shout out Naomi Gleit). The reasons they work for Humans are the same reasons they work with AI Agents (see 💀 Ambiguity is Death)

In SPECTRE, the **structured workflows** generate some combination of the following canonical docs under `.spectre/features/<feature-name>/`

- `concepts/scope.md` - what are we building and importantly what are we NOT building
- `ux.md` - the core user flows and components/layouts/interactions
- `specs/plan.md` - high level technical design and phasing
- `specs/execute.md` - compact execution index
- `goal-prompts.md` - goal prompts to use to guide agent execution
- `specs/tasks.json` - specific parent & sub-tasks to execute
- `execution_state.md` - execution progress tracker when using `/spectre:execute` with a plan SPECTRE did not generate
- `reviews/plan_review.md`, `reviews/task_review.md`, and `reviews/comprehensive_code_review.md` - prioritized review feedback
- `validation/validation_gaps.md` - task list of gaps identified from validation
- `proof/proof.json` and `proof/proof.html` - acceptance status and reviewed evidence

Durable project knowledge is stored separately under `~/.spectre/projects/.../knowledge/<record-id>/SKILL.md` so your Agent can retrieve it when relevant.

### My Workflow Iteration Process

I improve these Skills daily, and I didn't just prompt your Agent to generate these Skills. I iterated over many months, adjusting the prompts based on both the user experience of using them, and the quality of results that I got.

For example:

- I iterated on /spectre:scope until I felt like the types of questions actually help me get clear on what I'm building, without asking questions that it could easily get from codebase research
- I iterated on the /spectre:execute workflow until it successfully delivered large tasks in a single context window using subagents that deliver completion reports to handoff to the next subagents, use TDD effectively, and autonomously adapt the tasks based on what was discovered DURING development instead of blindly
- I iterated on the /spectre:clean and /spectre:test workflows until it felt automatic that we were sticking to our linting rules, every new feature was well tested/covered, the commits were grouped logically with the appropriate amount of detail.
- I iterated on the /spectre:learn workflow and the registry/search/load flow until 1) your Agent reached for relevant knowledge before starting work, 2) captured the *right* details and insights, and 3) kept relevant knowledge current as we make changes and learn more.
- I iterated on the /spectre:handoff workflow until the status update had the appropriate detail/context, and worked perfectly if I'm working across MANY sessions or just one.
- I added the new `/spectre:prove` workflow when it became clear I was spending far too much time validating the features were built right, and gave the agent a feedback loop to check its own work.

SPECTRE made products like New June and Subspace possible, and it is making it possible for me, an ex-Meta, ex-Amazon Technical Product Manager to build, ship, and iterate on products 100x the complexity of anything I've ever built in the past.

## 🧠 SPECTRE Session Memory

SPECTRE maintains and accumulates context across sessions when you use the /spectre:handoff command. To get the most from SPECTRE's Session Memory, we recommend that you:

1. run /spectre:handoff when you are switching gears or the context window is getting full, and

2. start a new session (`/clear` in Claude Code) so your Agent resumes from the saved context.

### How It Works

When you run /spectre:handoff, a status report will get generated for that session, and automatically loaded into your context window for the next session. You'll see a nice summary when you start the next session (`/clear` in Claude Code).

If you already had previous sessions, a sync subagent (`@spectre:sync` in Claude Code or `@spectre_sync` in Codex) will review the last 3 status updates and merge them into a single continuous session memory.

Voila -- trailing 3 session memory snapshots.

If you want to start fresh — /spectre:forget archives the current branch's active files under `.spectre/handoffs/{branch}/archive/`.

## 🧬 SPECTRE Learn

The more I used SPECTRE and the faster I could build, the more frequently I found myself wanting to reference past work. Debugging sessions, a new architectural pattern, or how a feature works/was built.

SPECTRE keeps knowledge explicit: use `/spectre:learn` to capture durable project knowledge. Claude Code and Codex receive a compact metadata registry at SessionStart, then your Agent uses the neutral knowledge CLI to search and load records on demand.

### How It Works

`/spectre:learn` captures patterns, gotchas, decisions, and procedures in SPECTRE's canonical user-level project store under `~/.spectre/projects/`.

1. **Registry** — SessionStart supplies metadata for available records: ID, version, use condition, activation cues, and an exact load command.
2. **Verified retrieval** — when the task subject and a record's use condition match, your Agent loads that exact record before applying it.

### The Hook + Skill Loop

What is great about SPECTRE's learning system is that your Agent knows what knowledge is available without loading every record into context.

1. **SessionStart hook** — every time you start a conversation, SPECTRE injects a size-bounded metadata registry into context. Your Agent now *knows what it can know* before you type a single word.

2. **Exact loading** — when your task matches both the subject and use condition of a record (e.g., authentication refresh work and `feature-auth-flows`), your Agent verifies and loads the full record *before* relying on it. No wasted tool calls rediscovering what's already documented.

The result: knowledge compounds across sessions instead of resetting to zero. The more you learn, the faster and more accurate every future session becomes.

### What Gets Captured

| Category | Example |
| --- | --- |
| **Gotchas** | "The websocket reconnect silently fails if..." |
| **Decisions** | "We chose SQLite over Postgres because..." |
| **Features** | Architecture dossiers — key files, flows, common tasks |
| **Patterns** | Reusable solutions established across the codebase |
| **Procedures** | Multi-step processes like deploy, release, migrate |

## 🤖 Subagents

SPECTRE dispatches specialized subagents for different tasks:

NOTE: You don't even need to know that these subagents exist. The prompts instruct your Agent to call them automatically.

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

  - once i have scope/plan/tasks, I typically run /spectre:handoff to get a fresh context window with awareness of what we're working on.

- then run /spectre:execute to use parallel subagents to work through the tasks. Execute also runs one final /spectre:code_review and an end-only /spectre:prove pass.

  - side note /spectre:validate is a killer prompt. It breaks down the original tasks and dispatches subagents to verify. find stuff missing all the time with this.

  - when initial execution is complete, i run another /spectre:handoff to get the context window clean for fixes/touch ups.

- for small, unambiguous features and reproducible fixes where I want Spectre to work autonomously, I use /spectre:delegate. Brain dump what I want, walk away, and review the proof plus draft PR — zero routine confirmation gates.

- From here — I review the proof and do any additional manual testing and fixing.

  - I largely use Claude Code/Codex built in /plan mode for fixes in this phase.

  - If there is a bug that can't easily be solved, i use the /spectre:fix prompt for a more structured debugging approach.

  - If something new comes up, or if the scope is not what I'd hoped, I run a new /spectre:scope cycle from within the project.

  - I liberally use /spectre:handoff here to keep context windows clean as I work through issues, and keep the sessions on track with the progress we're making.

- During the process of manual testing/fixing, I typically accumulate uncommitted changes. /spectre:sweep will get your changes committed, while

  - running and addressing lint
  - running tests and related tests on touched files
  - finding obvious dead code/AI slop, and
  - grouping changes logically with descriptive conventional commits

- Once wrapping up, /spectre:ship is a much deeper cleanup that

  - dispatches subagents to find dead code, duplicates, verifies, lint, commits any stragglers, etc.
  - runs /spectre:test does deep analysis and dispatches subagents to write tests based on a risk-adjusted framework focusing on behavior not implementation details,
  - runs /spectre:rebase to get sync'd up with and address any merge conflicts with the target branch
  - runs /spectre:create_pr to create the final PR.

- Finally, if the feature is significant and one I'll surely return to for future enhancements or bug fixes, I run /spectre:learn to capture any knowledge worth preserving — patterns, gotchas, decisions. This builds institutional memory that your Agent can find in future sessions.

## 📋 Slash Command Reference

### Core Workflow

| Command | Description |
| --- | --- |
| `/spectre:scope` | Interactive feature scoping |
| `/spectre:plan` | Research codebase, create implementation plan |
| `/spectre:execute` | Wave-based parallel execution with code review |
| `/spectre:delegate` | Autonomous compact flow for clear features and reproducible fixes |
| `/spectre:prove` | User-level acceptance proof with reviewed evidence |
| `/spectre:ship` | Completed-branch closeout: clean, rebase, PR |

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

| Command | Description |
| --- | --- |
| `/spectre:fix` | Investigate bugs & implement fixes |
| `/spectre:create_plan` | The meta plan flow uses this, but sometimes if I don't want the full meta plan but I want more research than the built in Codex/Claude Code plan flows use, I use this |
| `/spectre:sweep` | Light cleanup pass — lint, test, descriptive commits. Great if i've accumulated a lot of changes and want to check them in while addressing lint/test failures in the process. |
| `/spectre:prototype` | If the UX for a given feature is ambiguous, i live by this Skill. It creates HTML prototypes with your existing design system to get clear on the desired ux and interaction. |


## 📁 Repository Structure

```plaintext
spectre/
├── .claude-plugin/
│   └── marketplace.json          # Public marketplace catalog
├── plugins/
│   ├── spectre/                   # Canonical plugin source — edit here
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json       # Claude Code plugin manifest
│   │   ├── agents/               # Canonical subagent prompts
│   │   ├── bin/                  # Plugin helper entrypoints
│   │   ├── hooks/                # SessionStart and runtime hooks
│   │   └── skills/               # Canonical workflow skills
│   └── spectre-codex/             # Generated Codex mirror — do not hand-edit
│       ├── .codex-plugin/
│       │   └── plugin.json       # Codex plugin manifest
│       ├── agents/               # Generated Codex agent configs
│       ├── hooks/                # Generated Codex hooks
│       └── skills/               # Generated Codex workflow skills
├── bin/
│   └── spectre.js                # npm CLI entrypoint
├── scripts/
│   ├── sync-codex.cjs            # Canonical → Codex generator/checker
│   └── translators/              # Codex asset translators
├── src/                           # CLI, compatibility, knowledge, and doctor code
├── test/                          # Cross-cutting contract and integration tests
├── package.json
├── AGENTS.md
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

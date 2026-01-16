# SPECTRE

An agentic coding workflow for Claude Code.

SPECTRE helps you get **consistent, high-quality results** from AI coding agents with **significantly less manual effort**. It encourages agents to work autonomously for longer while still delivering quality output.

## How It Works

SPECTRE guides AI agents through a structured workflow:

**S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate

Every prompt includes "next steps" suggestions, so you don't need to memorize commands—just follow the flow.

> **Note**: SPECTRE creates `.spectre/` in your project to store session logs and handoff files. This directory is automatically added to `.gitignore` on first use.

---

## Installation

### Option 1: Plugin Install (Claude Code)

```bash
claude plugin marketplace add Codename-Inc/spectre
claude plugin install spectre@codename
```

### Option 2: CLI Install (pipx)

For full CLI capabilities including build loops and programmatic agent execution:

```bash
pipx install git+https://github.com/Codename-Inc/spectre.git
spectre setup
```

Or install from source for development:

```bash
git clone https://github.com/Codename-Inc/spectre.git
cd spectre
pipx install -e .
spectre setup
```

The `spectre setup` command:
- Symlinks plugins to `~/.claude/plugins/` (spectre, learn)
- Symlinks agents to `~/.claude/agents/` (spectre:dev, spectre:analyzer, etc.)
- Installs the Spectre skill to `~/.codex/skills/` (Codex only—Claude Code has native support)

### Team Setup (Recommended)

Add to your project's `.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "codename": {
      "source": { "source": "github", "repo": "Codename-Inc/spectre" }
    }
  },
  "enabledPlugins": {
    "spectre@codename": true,
    "learn@codename": true
  }
}
```
This auto-installs SPECTRE for everyone on the project.

---

## Plugins

This repo contains two plugins:

| Plugin | Description |
|--------|-------------|
| **spectre** | Core workflow—scope, plan, execute, clean, test, rebase, evaluate |
| **learn** | Capture project knowledge into skills via `/learn` |

---

## Quick Start: Pick Your Path

### 1. Standard Workflow (80% of tasks)

For most tasks, start with `/spectre:scope` and follow the prompts:

```
/scope → /plan → /execute → /clean → /test → /rebase → /evaluate
```

This is the recommended path for small, medium, and large tasks with manageable ambiguity.

### 2. Full Autonomous Mode

For tasks where you want to define scope interactively then let the agent run independently:

```
/spectre:spectre "Add user authentication"
```

This takes you through interactive scope definition, then completes the entire plan → execute → clean → test → rebase → evaluate flow autonomously.

### 3. Quick Dev (Small/Medium + More Control)

When you want tighter control over scope and plan before execution:

```
/spectre:quick_dev
```

Walks you through scope + plan interactively, then stops. Run `/execute` when ready.

---

## Handling High Ambiguity

If you're not ready for `/scope` yet, start earlier:

| Ambiguity Type | Start With | Then |
|----------------|------------|------|
| **Max ambiguity** (large feature, unclear requirements) | `/spectre:kickoff` | → `/scope` → ... |
| **Technical ambiguity** (how should this work?) | `/spectre:research` | → `/scope` → ... |
| **UX ambiguity** (what should we build?) | `/spectre:scope` | → `/plan` → ... |

These commands help you reduce ambiguity before committing to a plan.

---

## Session Memory

Keep your progress and context across Claude Code sessions.

### Setup
Turn off auto-compaction in Claude Code (`/config`) so you can control when to start fresh.

### Workflow
1. **End a session**: `/spectre:handoff` — saves progress, decisions, and todos
2. **Start a new session**: Context is automatically restored
3. **Clean slate**: `/spectre:forget` — archives memory for a fresh start

Your todos and progress summary appear at the start of each new session.

---

## Spectre CLI

The `spectre` CLI provides programmatic access to build loops, subagents, and slash commands.

```bash
spectre --help
spectre --version
```

### Build Loop

Run Claude Code in an automated task loop, completing one task per iteration:

```bash
# Interactive mode (prompts for inputs)
spectre build

# With flags
spectre build --tasks docs/tasks.md --max-iterations 10

# With additional context files
spectre build --tasks docs/tasks.md --context docs/scope.md --context docs/spec.md

# Resume after stopping to edit files (Ctrl+C, make changes, resume)
spectre build resume

# Resume without confirmation prompt
spectre build resume -y
```

Build **auto-saves your session** to `.spectre/build-session.json`. After stopping with Ctrl+C to edit your task/plan/scope files, just run `spectre build resume` to restart with the same configuration.

Build sends a **macOS notification** when complete (enabled by default). To use a custom sound, drop an audio file at `~/Library/Sounds/spectre.aiff`.

### Subagents

Run specialized agents in isolated Claude sessions:

```bash
# Run vanilla Claude (no agent)
spectre subagent run "explain this codebase"

# Run with specific agent
spectre subagent run spectre:dev "implement the login form"

# List available agents
spectre subagent list
spectre subagent list --output json

# Show agent details
spectre subagent show spectre:dev

# Run multiple agents in parallel
spectre subagent parallel -j spectre:dev "implement feature" -j spectre:tester "write tests"
```

### Slash Commands

Retrieve and execute slash command prompts programmatically:

```bash
# Get command prompt text
spectre command get /spectre:scope

# With arguments (interpolates $ARGUMENTS)
spectre command get /spectre:scope "user authentication feature"

# List available commands
spectre command list
spectre command list --output json

# Show command details
spectre command show /spectre:scope
```

### Setup

Install plugins, agents, and skills to Claude Code:

```bash
# Install everything
spectre setup

# Overwrite existing symlinks
spectre setup --force

# Skip specific installations
spectre setup --skip-agents
spectre setup --skip-skill
```

---

## Slash Command Reference

### Core Workflow
| Command | Description |
|---------|-------------|
| `/spectre:scope` | Interactive feature scoping |
| `/spectre:plan` | Research codebase, create implementation plan |
| `/spectre:execute` | Wave-based parallel execution with code review |
| `/spectre:clean` | Code cleanup and quality gates |
| `/spectre:test` | Risk-aware test coverage |
| `/spectre:rebase` | Safe rebase with conflict handling |
| `/spectre:evaluate` | Documentation and architecture review |

### Orchestrators
| Command | Description |
|---------|-------------|
| `/spectre:spectre` | Full autonomous workflow after interactive scope |
| `/spectre:quick_dev` | Scope + plan with manual execution |

### Discovery & Research
| Command | Description |
|---------|-------------|
| `/spectre:kickoff` | Deep research for high-ambiguity features |
| `/spectre:research` | Parallel codebase research |

### Session
| Command | Description |
|---------|-------------|
| `/spectre:handoff` | Save session state snapshot |
| `/spectre:forget` | Clear memory, archive logs |

### Utilities
| Command | Description |
|---------|-------------|
| `/spectre:create_plan` | Generate technical design doc |
| `/spectre:create_tasks` | Detailed task breakdown |
| `/spectre:code_review` | Independent code review |
| `/spectre:validate` | Requirements verification |
| `/spectre:tdd` | Test-driven development execution |
| `/spectre:architecture_review` | Principal architect assessment |
| `/spectre:create_test_guide` | Generate manual test checklist |
| `/spectre:document` | Generate feature documentation |
| `/spectre:plan_review` | Review plan for over-engineering |
| `/spectre:continue` | Resume interrupted execution |

### Learn Plugin
| Command | Description |
|---------|-------------|
| `/learn` | Capture knowledge from conversation into skills |

---

## Subagents

SPECTRE includes specialized agents you can invoke directly:

| Agent | Purpose |
|-------|---------|
| `@spectre:dev` | Implementation with MVP focus |
| `@spectre:analyst` | Understand how code works |
| `@spectre:finder` | Find where code lives |
| `@spectre:patterns` | Find reusable patterns |
| `@spectre:researcher` | Web research for best practices |
| `@spectre:tester` | Test automation and quality engineering |
| `@spectre:reviewer` | Independent code/plan review |

---

## Repository Structure

```
spectre/
├── cli/                    # Spectre CLI (Python/Click)
│   ├── main.py             # Entry point
│   ├── build/              # Build loop commands
│   ├── subagent/           # Subagent orchestration
│   ├── command/            # Slash command retrieval
│   └── setup.py            # Plugin/agent installation
├── plugins/
│   ├── spectre/            # Core workflow plugin
│   │   ├── plugin.json
│   │   ├── commands/       # Slash commands (scope.md, plan.md, etc.)
│   │   ├── agents/         # Subagent definitions
│   │   ├── skills/         # Plugin skills
│   │   │   └── spectre/    # Workflow reference (next steps, commands)
│   │   └── hooks/          # Session memory hooks
│   └── learn/              # Knowledge capture plugin
│       ├── plugin.json
│       └── skills/learn/   # Learn skill
├── skills/
│   └── spectre_agent_tools/  # Codex-only skill
└── .claude-plugin/
    └── marketplace.json    # Marketplace registration
```

---

## License

MIT

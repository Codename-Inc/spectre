# SPECTRE

An agentic coding development workflow for Claude Code.

SPECTRE helps you get **consistent, high-quality results** from AI coding agents with **significantly less manual effort**. It encourages agents to work autonomously for longer while still delivering quality output.

## How It Works

SPECTRE guides AI agents through a structured workflow:

**S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate

Every prompt includes "next steps" suggestions, so you don't need to memorize commands—just follow the flow.

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

## Installation

### From Marketplace (Recommended)
```bash
/plugin marketplace add Codename-Inc/spectre
/plugin install spectre@spectre-marketplace
```

### Direct Install
```bash
/plugin install github:Codename-Inc/spectre
```

### Team Setup
Add to `.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "spectre-marketplace": {
      "source": { "source": "github", "repo": "Codename-Inc/spectre" }
    }
  },
  "enabledPlugins": {
    "spectre@spectre-marketplace": true
  }
}
```

---

## Command Reference

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

---

## Subagents

SPECTRE includes specialized agents you can invoke directly:

| Agent | Purpose |
|-------|---------|
| `@spectre:coder` | Implementation with MVP focus |
| `@spectre:analyzer` | Understand how code works |
| `@spectre:locator` | Find where code lives |
| `@spectre:pattern-finder` | Find reusable patterns |
| `@spectre:researcher` | Web research for best practices |

---

## License

MIT

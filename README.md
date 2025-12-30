# SPECTRE

A complete development workflow plugin for Claude Code.

**SPECTRE** = **S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**elease → **E**valuate

## Installation

### From Marketplace (Recommended)

```bash
# Add the marketplace
/plugin marketplace add Codename-Inc/spectre

# Install the plugin
/plugin install spectre@spectre-marketplace
```

### Direct Install

```bash
# From GitHub
/plugin install github:Codename-Inc/spectre

# Local development
claude --plugin-dir /path/to/spectre
```

### Team Setup

Add to your project's `.claude/settings.json` for automatic team discovery:

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

## Core Workflow

| Phase | Command | Description |
|-------|---------|-------------|
| **S**cope | `/spectre:scope` | Interactive feature scoping with contextual suggestions |
| **P**lan | `/spectre:plan` | Research codebase, assess complexity, create implementation plan |
| **E**xecute | `/spectre:execute` | Wave-based parallel TDD execution with code review |
| **C**lean | `/spectre:clean` | Code cleanup, dead code removal, quality gates |
| **T**est | `/spectre:test` | Risk-aware test coverage |
| **R**elease | `/spectre:rebase` | Safe rebase workflow with conflict handling |
| **E**valuate | `/spectre:evaluate` | Documentation and architecture review |

### Full Orchestrator

Run the complete workflow autonomously:

```
/spectre:spectre "Add user authentication feature"
```

This runs all phases in sequence with minimal intervention.

## Supporting Commands

| Command | Description |
|---------|-------------|
| `/spectre:kickoff` | Deep research and implementation path discovery |
| `/spectre:research` | Parallel codebase research with specialized agents |
| `/spectre:quick_dev` | Lightweight workflow for small fixes |
| `/spectre:create_plan` | Full technical design document |
| `/spectre:create_tasks` | Detailed task breakdown with dependencies |
| `/spectre:code_review` | Independent code review with severity scoring |
| `/spectre:validate` | Requirements verification and gap analysis |
| `/spectre:handoff` | Session state snapshot for continuity |
| `/spectre:tdd` | Test-driven development execution |

## Subagents

SPECTRE includes specialized AI agents:

| Agent | Purpose |
|-------|---------|
| `@spectre:coder` | Implementation with MVP constraints |
| `@spectre:analyzer` | Understand HOW code works |
| `@spectre:locator` | Find WHERE code lives |
| `@spectre:pattern-finder` | Find reusable patterns and examples |
| `@spectre:researcher` | Web research for best practices |
| `@spectre:tdd-agent` | TDD methodology execution |
| `@spectre:test-automator` | Test automation specialist |
| `@spectre:independent-reviewer` | Plan and code review |

## Spectre Memory

Automatic session continuity that captures your work context and restores it when you return.

### How It Works

1. **Save your work**: Run `/spectre:handoff` before ending a session
2. **Resume automatically**: Start a new session—context is injected automatically
3. **Clear memory**: Run `/spectre:forget` to start fresh

### What Gets Captured

| Data | Description |
|------|-------------|
| **Progress** | What you accomplished, decisions made, blockers, next steps |
| **Todos** | Claude's internal task list with completion status |
| **History** | Aggregate stats across last 5 sessions |
| **Context** | Branch, commit, key files, WIP state |

### Session Resume

When you start a new session, you'll see:

```
Resuming: Add user authentication | Branch: feature/auth | Ready to continue
```

Claude receives the full context including previous todos:

```markdown
## Previous Session Todos
**Summary**: 4 completed, 1 in progress, 1 pending

### Main Tasks
- [x] Implement login endpoint
- [x] Add JWT token generation
- [>] Add password reset flow
- [ ] Write integration tests
```

### Commands

| Command | Description |
|---------|-------------|
| `/spectre:handoff` | Save session state snapshot |
| `/spectre:forget` | Clear memory, archive logs |

See [Spectre Memory Documentation](references/spectre-memory.md) for details.

## Scripts

### Complexity Scorer

The planning workflow uses a 30-criteria complexity assessment to route to the appropriate planning depth:

- **0-2 points** → Quick dev (single-doc flow)
- **3-5 points** → Create tasks (research + task breakdown)
- **6+ points** → Full design (technical design doc first)

## Directory Structure

```
spectre/
├── .claude-plugin/
│   ├── plugin.json        # Plugin manifest
│   └── marketplace.json   # Marketplace catalog
├── commands/              # Slash commands
├── agents/                # Subagent definitions
├── hooks/
│   ├── hooks.json         # Hook registration
│   └── scripts/
│       ├── capture-todos.py    # Todo capture (UserPromptSubmit)
│       └── handoff-resume.py   # Session resume (SessionStart)
├── scripts/               # Utility scripts
├── references/            # Documentation
│   ├── spectre-memory.md           # Memory feature guide
│   └── spectre-memory-technical.md # Technical design
└── docs/active_tasks/     # Session data (per branch)
    └── {branch}/session_logs/
        ├── *_handoff.json
        ├── *_todos.json
        └── todos_history.json
```

## License

MIT

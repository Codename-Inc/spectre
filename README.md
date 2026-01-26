# SPECTRE

**S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate

A structured workflow framework for AI coding agents. Works with Claude Code today, with support for other agents via CLI.

## Why SPECTRE?

AI coding agents are powerful but inconsistent. SPECTRE provides:

- **Structured workflow** — Each phase has clear inputs, outputs, and next steps
- **Parallel execution** — Subagents work concurrently for faster delivery
- **Session continuity** — Pick up where you left off across context limits
- **Built-in review** — Code review and validation at every stage

## Quick Start

### Claude Code (Recommended)

```bash
# Add marketplace and install
/plugin marketplace add Codename-Inc/spectre
/plugin install spectre@codename
```

Or add to your project's `.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "codename": {
      "source": { "source": "github", "repo": "Codename-Inc/spectre" }
    }
  },
  "enabledPlugins": {
    "spectre@codename": true
  }
}
```

Then start building:
```
/spectre:scope "Add user authentication"
```

### Other Agents (Codex, Cursor, etc.)

Install the CLI:
```bash
pipx install git+https://github.com/Codename-Inc/spectre.git
```

Use CLI commands to access SPECTRE capabilities:
```bash
# List available subagents
spectre subagent list

# Run a subagent
spectre subagent run dev "implement the login form"

# Get a command prompt
spectre command get /spectre:scope
```

## The SPECTRE Workflow

| Phase | Command | What It Does |
|-------|---------|--------------|
| **S**cope | `/spectre:scope` | Define requirements, constraints, success criteria |
| **P**lan | `/spectre:plan` | Research codebase, create implementation plan |
| **E**xecute | `/spectre:execute` | Parallel implementation with wave-based delivery |
| **C**lean | `/spectre:clean` | Remove dead code, lint, format |
| **T**est | `/spectre:test` | Risk-aware test coverage |
| **R**ebase | `/spectre:rebase` | Safe merge preparation with conflict handling |
| **E**valuate | `/spectre:evaluate` | Document changes + architecture review |

Each command ends with "Next Steps" suggestions, so you always know what to do next.

## Session Memory

SPECTRE maintains context across sessions:

```
/spectre:handoff   # Save progress before session ends
/spectre:forget    # Clear memory for fresh start
```

Context automatically restores when you start a new session.

## Subagents

SPECTRE dispatches specialized subagents for different tasks:

| Agent | Purpose |
|-------|---------|
| `@spectre:dev` | Implementation with MVP focus |
| `@spectre:analyst` | Understand how code works |
| `@spectre:finder` | Find where code lives |
| `@spectre:patterns` | Find reusable patterns |
| `@spectre:researcher` | Web research |
| `@spectre:tester` | Test automation |
| `@spectre:reviewer` | Independent code review |

## Full Autonomous Mode

For well-scoped work, run the entire workflow:
```
/spectre:spectre "Add dark mode toggle"
```

Interactive scope, then hands-off execution through all phases.

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

### Session Memory
| Command | Description |
|---------|-------------|
| `/spectre:handoff` | Save session state snapshot |
| `/spectre:forget` | Clear memory, archive logs |

### Utilities
| Command | Description |
|---------|-------------|
| `/spectre:ux_spec` | UX specification for UI-heavy features |
| `/spectre:create_plan` | Generate technical design doc |
| `/spectre:create_tasks` | Detailed task breakdown |
| `/spectre:code_review` | Independent code review |
| `/spectre:validate` | Requirements verification |
| `/spectre:tdd` | Test-driven development execution |
| `/spectre:architecture_review` | Principal architect assessment |

## Architecture

```
spectre/
├── core/                    # Agent-agnostic prompts
│   ├── workflows/           # 7 SPECTRE phase commands
│   ├── commands/            # Supporting commands
│   ├── agents/              # Subagent definitions
│   └── session/             # Session memory
├── integrations/
│   └── claude-code/         # Claude Code plugin
└── cli/                     # Python CLI for other agents
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Workflow Guide](docs/workflow-guide.md)
- [Command Reference](docs/command-reference.md)
- [Extending SPECTRE](docs/extending-spectre.md)

## Related

- [spectre-labs](https://github.com/Codename-Inc/spectre-labs) — Experimental features (build loop, sparks knowledge capture)

## License

MIT

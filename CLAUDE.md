# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

SPECTRE is a universal agentic workflow framework: **S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate. It's a meta-prompt orchestration system where prompts invoke subagents.

Works with Claude Code natively, and other agents via CLI.

## Repository Structure

```
spectre/
├── core/                         # Agent-agnostic prompts
│   ├── workflows/                # 7 SPECTRE phase commands
│   │   └── scope.md, plan.md, execute.md, clean.md, test.md, rebase.md, evaluate.md
│   ├── commands/                 # Supporting commands
│   │   └── kickoff.md, research.md, create_plan.md, etc.
│   ├── agents/                   # Subagent definitions
│   │   └── dev.md, analyst.md, finder.md, etc.
│   ├── session/                  # Session memory commands
│   │   └── handoff.md, forget.md
│   └── skills/                   # Skills
│       └── spectre/SKILL.md
│
├── integrations/
│   └── claude-code/              # Claude Code plugin
│       ├── plugin.json
│       ├── commands/             # (copies of core for CC discovery)
│       ├── agents/               # Core agents + sync.md
│       ├── hooks/                # SessionStart, PreCompact, UserPromptSubmit
│       └── skills/
│
├── cli/                          # Python CLI
│   ├── main.py                   # Entry point (subagent, command, setup)
│   ├── subagent/                 # Subagent runner
│   ├── command/                  # Slash command retrieval
│   └── setup.py                  # Plugin installation
│
├── docs/                         # User documentation
│   └── getting-started.md, workflow-guide.md, etc.
│
└── .claude-plugin/
    └── marketplace.json          # Marketplace registration
```

## Commands

```bash
# CLI commands
spectre --help
spectre subagent list            # List available agents
spectre subagent run dev "task"  # Run a subagent
spectre command list             # List slash commands
spectre command get /spectre:scope  # Get command prompt
spectre setup                    # Install to Claude Code

# Run hook tests
pytest integrations/claude-code/hooks/scripts/ -v
```

## Architecture

### Core Prompts (`core/`)

Agent-agnostic prompts that describe the workflow. These are the source of truth.

### Claude Code Integration (`integrations/claude-code/`)

CC-specific wiring:
- **plugin.json** — Plugin manifest
- **hooks/** — Session memory (SessionStart, PreCompact, UserPromptSubmit)
- **agents/sync.md** — CC-specific session sync agent

### CLI (`cli/`)

Universal access for any agent:
- `spectre subagent run` — Run subagents
- `spectre command get` — Retrieve command prompts
- `spectre setup` — Install CC plugin

### Meta-Prompt Orchestration

Commands are markdown prompts that:
1. Parse user arguments
2. Spawn parallel subagents (`@spectre:dev`, `@spectre:analyst`, etc.)
3. Subagents execute specialized prompts
4. Main prompt synthesizes findings and produces artifacts

### Subagents

| Agent | Purpose |
|-------|---------|
| `@spectre:dev` | Implementation with MVP focus |
| `@spectre:analyst` | Understand how code works |
| `@spectre:finder` | Find where code lives |
| `@spectre:patterns` | Find reusable patterns |
| `@spectre:researcher` | Web research |
| `@spectre:tester` | Test automation |
| `@spectre:reviewer` | Independent review |

### Session Memory

Hooks in `integrations/claude-code/hooks/` maintain context across sessions:
- **SessionStart**: Restores previous session context
- **UserPromptSubmit**: Captures todos on `/spectre:handoff`
- **PreCompact**: Warns before compacting

Session state is stored in `.spectre/` (gitignored).

## Working in This Repo

### Adding Commands

1. Create markdown in `core/workflows/` or `core/commands/`
2. Copy to `integrations/claude-code/commands/` for CC discovery
3. Follow existing patterns:
   - ARGUMENTS section for input parsing
   - EXECUTION FLOW for step-by-step logic
   - "Next Steps" output for workflow continuity

### Adding Agents

1. Create markdown in `core/agents/`
2. Copy to `integrations/claude-code/agents/`
3. Include:
   - Role and mission sections
   - Methodology for how the agent works
   - Tool preferences

### Modifying Hooks

Update Python scripts in `integrations/claude-code/hooks/scripts/`. Hooks must:
- Use `os.fork()` for non-blocking execution
- Use only Python 3 standard library
- Return valid JSON to stdout

### CLI Development

Python CLI uses Click. Entry point is `cli/main.py`.

## Key Patterns

### Command Flow

Every command ends with contextual "Next Steps" suggestions grounded in actual codebase state.

### Hook Non-Blocking Pattern

```python
pid = os.fork()
if pid == 0:
    do_work()
    os._exit(0)
else:
    sys.exit(0)
```

## Plugin Development & Release

Claude Code caches plugins by version. There's no hot-reload — **always restart Claude after changes**.

### Local Development

```bash
claude --plugin-dir /path/to/spectre/integrations/claude-code
```

Workflow:
1. Edit files in `core/` and/or `integrations/claude-code/`
2. Restart Claude with the same command
3. Changes are active

### Testing Marketplace Distribution

```bash
# Add local marketplace
/plugin marketplace add /path/to/spectre

# Install from it
/plugin install spectre@codename
```

### Releasing to Users

1. **Bump version in TWO files**:
   - `integrations/claude-code/plugin.json`
   - `.claude-plugin/marketplace.json`
2. **Commit and push** to GitHub
3. **Tag the release** (optional but recommended)

```bash
git add -A && git commit -m "release: v2.0.0" && git tag v2.0.0 && git push && git push --tags
```

Users update via:
```bash
/plugin marketplace update codename
/plugin update spectre@codename
```

## Important Notes

- Commands use `/spectre:` prefix (e.g., `/spectre:scope`)
- Session memory commands: `/spectre:handoff`, `/spectre:forget`
- Session state lives in `.spectre/` (gitignored)
- `os.fork()` is Unix-only
- CLI installed via `pipx install -e .` or `pipx install git+https://github.com/Codename-Inc/spectre.git`

## Related Repos

- [spectre-labs](https://github.com/Codename-Inc/spectre-labs) — Experimental features (build loop, sparks)

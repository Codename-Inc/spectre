# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

SPECTRE is a Claude Code plugin system with a Python CLI that implements an agentic workflow: **S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate. It's a meta-prompt orchestration system where prompts invoke subagents.

This repo contains **two plugins** (spectre, learn) and a **CLI** for programmatic access.

## Repository Structure

```
cli/                      # Python CLI (Click-based)
├── main.py               # Entry point
├── build/                # Build loop commands
├── subagent/             # Subagent orchestration
├── command/              # Slash command retrieval
└── setup.py              # Plugin/agent installation

plugins/
├── spectre/              # Core workflow plugin
│   ├── plugin.json
│   ├── commands/         # Slash commands (scope.md, plan.md, etc.)
│   ├── agents/           # Subagent definitions
│   ├── skills/           # Plugin skills
│   └── hooks/            # Session memory hooks
└── learn/                # Knowledge capture plugin
    ├── plugin.json
    └── skills/learn/

skills/
└── spectre_agent_tools/  # Codex-only skill

.claude-plugin/
└── marketplace.json      # Marketplace registration
```

## Commands

```bash
# Run hook tests
pytest plugins/spectre/hooks/scripts/ -v

# CLI commands
spectre --help
spectre build                    # Automated task loop
spectre subagent list            # List available agents
spectre command list             # List slash commands
```

## Architecture

### Two Plugins
- **spectre**: Core workflow (scope → plan → execute → clean → test → rebase → evaluate)
- **learn**: Capture knowledge from conversations into reusable skills

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
Hooks in `plugins/spectre/hooks/` maintain context across sessions:
- **SessionStart**: Restores previous session context
- **UserPromptSubmit**: Captures todos on `/spectre:handoff`

Session state is stored in `.spectre/` (gitignored).

### CLI Build Loop
The `spectre build` command runs Claude Code in an automated task loop, completing one task per iteration from a task file.

## Working in This Repo

### Adding Commands
Create markdown in `plugins/spectre/commands/` following existing patterns:
- ARGUMENTS section for input parsing
- EXECUTION FLOW for step-by-step logic
- "Next Steps" output for workflow continuity

### Adding Agents
Create markdown in `plugins/spectre/agents/` with:
- Role and mission sections
- Methodology for how the agent works
- Tool preferences

### Adding Skills
Create directory in `plugins/spectre/skills/{skill-name}/` with `SKILL.md`.

### Modifying Hooks
Update Python scripts in `plugins/spectre/hooks/scripts/`. Hooks must:
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

### Local Development (`--plugin-dir`)

The official approach for plugin development:

```bash
claude --plugin-dir /Users/joe/Dev/spectre/plugins/spectre --plugin-dir /Users/joe/Dev/spectre/plugins/learn
```

Workflow:
1. Edit plugin files
2. Restart Claude with the same command
3. Changes are active

No version bumps, no cache, no reinstalls. Create an alias for convenience:
```bash
alias claude-dev='claude --plugin-dir /Users/joe/Dev/spectre/plugins/spectre --plugin-dir /Users/joe/Dev/spectre/plugins/learn'
```

### Testing Marketplace Distribution

To test what users will experience:

```bash
# Add local marketplace
/plugin marketplace add /Users/joe/Dev/spectre

# Install from it
/plugin install spectre@codename
```

Since plugins are cached, iterate by either:
- **Uninstall/reinstall**: `/plugin uninstall spectre@codename` then `/plugin install spectre@codename`
- **Bump version**: Update version in all 3 files, then `/plugin update spectre@codename`

### Releasing to Users

1. **Bump version in THREE files**:
   - `plugins/spectre/plugin.json`
   - `plugins/learn/plugin.json`
   - `.claude-plugin/marketplace.json` (has version for each plugin)
2. **Commit and push** to GitHub
3. **Tag the release** (optional but recommended)

```bash
git add -A && git commit -m "release: v1.2.0" && git tag v1.2.0 && git push && git push --tags
```

Users update via:
```bash
/plugin marketplace update codename
/plugin update spectre@codename
```

## Important Notes

- Commands use `/spectre:` prefix (e.g., `/spectre:scope`)
- Session state lives in `.spectre/` (gitignored)
- `os.fork()` is Unix-only
- CLI installed via `pipx install -e .` or `pipx install git+https://github.com/Codename-Inc/spectre.git`

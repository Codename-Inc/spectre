# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

spectre is a Claude Code plugin providing a structured agentic workflow: **S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**xtract. It's a meta-prompt orchestration system where prompts invoke subagents.

## Repository Structure

```
spectre/
├── .claude-plugin/
│   └── marketplace.json  # Marketplace registration
├── plugins/
│   └── spectre/
│       ├── .claude-plugin/
│       │   └── plugin.json   # Plugin manifest
│       ├── commands/         # Slash commands (markdown prompts)
│       ├── agents/           # Subagent definitions
│       ├── hooks/            # SessionStart, PreCompact, UserPromptSubmit
│       └── skills/           # Skills (spectre footer rendering, tdd methodology)
├── scripts/              # Release & utility scripts
└── CLAUDE.md
```

## Commands

```bash
# Run hook tests
pytest plugins/spectre/hooks/scripts/ -v
```

> **CLI for Other Agents**: See [spectre-labs/cli](https://github.com/Codename-Inc/spectre-labs/tree/main/cli)

## Architecture

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
| `@spectre:web-research` | Web research |
| `@spectre:tester` | Test automation |
| `@spectre:reviewer` | Independent review |

### Session Memory

Hooks in `plugins/spectre/hooks/` maintain context across sessions:
- **SessionStart**: Restores previous session context
- **UserPromptSubmit**: Captures todos on `/spectre:handoff`
- **PreCompact**: Warns before compacting

Session state is stored in `.spectre/` (gitignored).

## Working in This Repo

### Adding Commands

1. Create markdown in `plugins/spectre/commands/`
2. Follow existing patterns:
   - ARGUMENTS section for input parsing
   - EXECUTION FLOW for step-by-step logic
   - "Next Steps" output for workflow continuity

### Adding Agents

1. Create markdown in `plugins/spectre/agents/`
2. Include:
   - Role and mission sections
   - Methodology for how the agent works
   - Tool preferences

### Modifying Hooks

Update Python scripts in `plugins/spectre/hooks/scripts/`. Hooks must:
- Use `os.fork()` for non-blocking execution
- Use only Python 3 standard library
- Return valid JSON to stdout

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
claude --plugin-dir /path/to/spectre/plugins/spectre
```

Workflow:
1. Edit files
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

1. **Bump version in TWO files** (or use `npm run release`):
   - `plugins/spectre/.claude-plugin/plugin.json`
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

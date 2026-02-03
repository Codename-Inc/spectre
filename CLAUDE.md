# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

spectrl is a Claude Code plugin providing a structured agentic workflow: **S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate. It's a meta-prompt orchestration system where prompts invoke subagents.

## Repository Structure

```
spectrl/
├── .claude-plugin/
│   └── marketplace.json  # Marketplace registration
├── plugins/
│   └── spectrl/
│       ├── .claude-plugin/
│       │   └── plugin.json   # Plugin manifest
│       ├── commands/         # Slash commands (markdown prompts)
│       ├── agents/           # Subagent definitions
│       ├── hooks/            # SessionStart, PreCompact, UserPromptSubmit
│       └── skills/           # Skills (spectrl footer rendering, tdd methodology)
├── scripts/              # Release & utility scripts
└── CLAUDE.md
```

## Commands

```bash
# Run hook tests
pytest plugins/spectrl/hooks/scripts/ -v
```

> **CLI for Other Agents**: See [spectrl-labs/cli](https://github.com/Codename-Inc/spectrl-labs/tree/main/cli)

## Architecture

### Meta-Prompt Orchestration

Commands are markdown prompts that:
1. Parse user arguments
2. Spawn parallel subagents (`@spectrl:dev`, `@spectrl:analyst`, etc.)
3. Subagents execute specialized prompts
4. Main prompt synthesizes findings and produces artifacts

### Subagents

| Agent | Purpose |
|-------|---------|
| `@spectrl:dev` | Implementation with MVP focus |
| `@spectrl:analyst` | Understand how code works |
| `@spectrl:finder` | Find where code lives |
| `@spectrl:patterns` | Find reusable patterns |
| `@spectrl:web-research` | Web research |
| `@spectrl:tester` | Test automation |
| `@spectrl:reviewer` | Independent review |

### Session Memory

Hooks in `plugins/spectrl/hooks/` maintain context across sessions:
- **SessionStart**: Restores previous session context
- **UserPromptSubmit**: Captures todos on `/spectrl:handoff`
- **PreCompact**: Warns before compacting

Session state is stored in `.spectrl/` (gitignored).

## Working in This Repo

### Adding Commands

1. Create markdown in `plugins/spectrl/commands/`
2. Follow existing patterns:
   - ARGUMENTS section for input parsing
   - EXECUTION FLOW for step-by-step logic
   - "Next Steps" output for workflow continuity

### Adding Agents

1. Create markdown in `plugins/spectrl/agents/`
2. Include:
   - Role and mission sections
   - Methodology for how the agent works
   - Tool preferences

### Modifying Hooks

Update Python scripts in `plugins/spectrl/hooks/scripts/`. Hooks must:
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
claude --plugin-dir /path/to/spectrl/plugins/spectrl
```

Workflow:
1. Edit files
2. Restart Claude with the same command
3. Changes are active

### Testing Marketplace Distribution

```bash
# Add local marketplace
/plugin marketplace add /path/to/spectrl

# Install from it
/plugin install spectrl@codename
```

### Releasing to Users

1. **Bump version in TWO files** (or use `npm run release`):
   - `plugins/spectrl/.claude-plugin/plugin.json`
   - `.claude-plugin/marketplace.json`
2. **Commit and push** to GitHub
3. **Tag the release** (optional but recommended)

```bash
git add -A && git commit -m "release: v2.0.0" && git tag v2.0.0 && git push && git push --tags
```

Users update via:
```bash
/plugin marketplace update codename
/plugin update spectrl@codename
```

## Important Notes

- Commands use `/spectrl:` prefix (e.g., `/spectrl:scope`)
- Session memory commands: `/spectrl:handoff`, `/spectrl:forget`
- Session state lives in `.spectrl/` (gitignored)
- `os.fork()` is Unix-only

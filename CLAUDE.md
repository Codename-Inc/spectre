# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

spectre is a Claude Code plugin providing a structured agentic workflow: **S**cope → **P**lan → **E**xecute → **C**lean → **T**est → **R**ebase → **E**valuate. It's a meta-prompt orchestration system where prompts invoke subagents.

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
│       ├── hooks/            # SessionStart, UserPromptSubmit
│       └── skills/           # Skills (spectre footer rendering, tdd methodology)
├── scripts/              # Release & utility scripts
└── CLAUDE.md
```

## Commands

```bash
# Run hook tests
node --test plugins/spectre/hooks/scripts/test_*.cjs
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

Update Node.js scripts (`.cjs`) in `plugins/spectre/hooks/scripts/`. Hooks must:
- Use `child_process.fork()` with `{detached: true, stdio: 'ignore'}` + `.unref()` for non-blocking execution
- Use only Node.js built-in modules (no external dependencies)
- Return valid JSON to stdout

## Key Patterns

### Command Flow

Every command ends with contextual "Next Steps" suggestions grounded in actual codebase state.

### Hook Non-Blocking Pattern

```javascript
const { fork } = require('child_process');
const child = fork(__filename, ['--bg-taskname', ...args], {
  detached: true,
  stdio: 'ignore'
});
child.unref();
process.exit(0);
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

Run the LLM-led release command:

```bash
/release          # interactive — asks for patch/minor/major
/release patch    # skip the prompt
```

This handles the full flow:
1. Commits any dirty working tree changes with a descriptive message
2. Bumps version in both `plugins/spectre/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
3. Commits the version bump as `release: vX.Y.Z`
4. Generates a changelog from commits since the last tag
5. Tags, pushes, and creates a GitHub release with the changelog

The release command is defined in `.claude/commands/release.md`.

Users update via:
```bash
/plugin marketplace update codename
/plugin update spectre@codename
```

## Important Notes

- Commands use `/spectre:` prefix (e.g., `/spectre:scope`)
- Session memory commands: `/spectre:handoff`, `/spectre:forget`
- Session state lives in `.spectre/` (gitignored)
- Hook scripts use `.cjs` extension (CommonJS) since root `package.json` has `"type": "module"`

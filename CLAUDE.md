# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

caspar is a Claude Code and Codex plugin providing a structured agentic workflow: Scope → Plan → Execute → Clean → Test → Rebase. It's a meta-prompt orchestration system where prompts invoke subagents.

## Repository Structure

```
caspar/
├── .claude-plugin/
│   └── marketplace.json  # Marketplace registration
├── plugins/
│   └── caspar/
│       ├── .claude-plugin/
│       │   └── plugin.json   # Plugin manifest
│       ├── agents/           # Subagent definitions
│       ├── hooks/            # Learning registration helpers
│       └── skills/           # Workflow and knowledge skills
├── scripts/              # Release & utility scripts
└── CLAUDE.md
```

## Commands

```bash
npm test
npm run sync-codex -- --check --quiet
python3 /Users/joe/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/caspar
```

> **CLI for Other Agents**: See [caspar-labs/cli](https://github.com/Codename-Inc/caspar-labs/tree/main/cli)

## Architecture

### Meta-Prompt Orchestration

Skills are contract-form workflow prompts that:
1. Parse user arguments
2. Spawn parallel subagents (`@caspar:dev`, `@caspar:analyst`, etc.)
3. Subagents execute specialized prompts
4. Main prompt synthesizes findings and produces artifacts

### Subagents

| Agent | Purpose |
|-------|---------|
| `@caspar:dev` | Implementation with MVP focus |
| `@caspar:analyst` | Understand how code works |
| `@caspar:finder` | Find where code lives |
| `@caspar:patterns` | Find reusable patterns |
| `@caspar:web-research` | Web research |
| `@caspar:tester` | Test automation |
| `@caspar:reviewer` | Independent review |

### Knowledge Skills

`/caspar:learn` writes reusable project skills under `.agents/skills/`. Codex project installs sync those skill paths into config, and agents discover them from their descriptions. Caspar does not inject startup memory.

## Working in This Repo

### Adding Workflow Skills

1. Create or update a skill in `plugins/caspar/skills/`
2. Follow existing patterns:
   - ARGUMENTS section for input parsing
   - EXECUTION FLOW for step-by-step logic
   - "Next Steps" output for workflow continuity
3. Run `npm run sync-codex -- --quiet` to regenerate `plugins/caspar-codex/`

### Adding Agents

1. Create markdown in `plugins/caspar/agents/`
2. Include:
   - Role and mission sections
   - Methodology for how the agent works
   - Tool preferences

### Modifying Learning Helpers

Update Node.js scripts in `plugins/caspar/hooks/scripts/`. They are helper scripts invoked by Caspar commands, not Codex/Claude startup hooks.

## Key Patterns

### Command Flow

Every command ends with contextual "Next Steps" suggestions grounded in actual codebase state.

## Plugin Development & Release

Claude Code caches plugins by version. There's no hot-reload — **always restart Claude after changes**.

### Local Development

```bash
claude --plugin-dir /path/to/caspar/plugins/caspar
```

Workflow:
1. Edit files
2. Restart Claude with the same command
3. Changes are active

### Testing Marketplace Distribution

```bash
# Add local marketplace
/plugin marketplace add /path/to/caspar

# Install from it
/plugin install caspar@codename
```

### Releasing to Users

Run the LLM-led release command:

```bash
/release          # interactive — asks for patch/minor/major
/release patch    # skip the prompt
```

This handles the full flow:
1. Commits any dirty working tree changes with a descriptive message
2. Bumps version in both `plugins/caspar/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
3. Commits the version bump as `release: vX.Y.Z`
4. Generates a changelog from commits since the last tag
5. Tags, pushes, and creates a GitHub release with the changelog

The release command is defined in `.claude/commands/release.md`.

Users update via:
```bash
/plugin marketplace update codename
/plugin update caspar@codename
```

## Important Notes

- Commands use `/caspar:` prefix (e.g., `/caspar:scope`)
- Project install metadata lives in `.caspar/`
- Caspar no longer installs startup hooks or managed memory injection

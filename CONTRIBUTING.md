# Contributing to spectre

Thank you for your interest in contributing to spectre.

## How to Contribute

### Bug Reports

Open an issue with:
- Description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Claude Code or Codex version

### Feature Requests

Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives considered

### Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test with Claude Code and/or Codex
5. Commit with clear messages
6. Push and open a PR

## Development Setup

### Local Development

```bash
git clone https://github.com/Codename-Inc/spectre.git
cd spectre
```

Test the plugin locally:
```bash
claude --plugin-dir /path/to/spectre
npm run sync-codex -- --check --quiet
npm test
```

### Structure

```
spectre/
├── .claude-plugin/   # Marketplace registration
├── plugins/spectre/   # Canonical plugin source
├── plugins/spectre-codex/ # Generated Codex bundle
├── scripts/          # Translation and validation scripts
└── src/              # npm CLI installer
```

### Adding Workflow Skills

1. Create or update a skill in `plugins/spectre/skills/`
2. Follow existing skill patterns
3. Run `npm run sync-codex -- --quiet`
4. Update docs if needed

### Adding Agents

1. Create a markdown file in `agents/`
2. Define name, description, and methodology
3. Run `npm run sync-codex -- --quiet`
4. Test subagent dispatch

## Code Style

- Skills/agents are markdown with YAML frontmatter
- The installer CLI is Node.js
- Keep prompts clear and actionable

## Questions?

Open an issue or discussion.

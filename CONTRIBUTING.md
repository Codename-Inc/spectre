# Contributing to spectre

Thank you for your interest in contributing to spectre.

## How to Contribute

### Bug Reports

Open an issue with:
- Description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Claude Code version

### Feature Requests

Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives considered

### Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test with Claude Code (`claude --plugin-dir /path/to/spectre`)
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
```

### Structure

```
spectre/
├── plugin.json       # Plugin manifest
├── commands/         # Slash commands
├── agents/           # Subagent definitions
├── hooks/            # Session memory hooks
├── skills/           # Skills
├── cli/              # Python CLI for other agents
└── .claude-plugin/   # Marketplace registration
```

### Adding Commands

1. Create a markdown file in `commands/`
2. Follow existing command patterns
3. Test with Claude Code
4. Update docs if needed

### Adding Agents

1. Create a markdown file in `agents/`
2. Define name, description, and methodology
3. Test subagent dispatch

## Code Style

- Commands/agents are markdown with YAML frontmatter
- CLI is Python with Click
- Keep prompts clear and actionable

## Questions?

Open an issue or discussion.

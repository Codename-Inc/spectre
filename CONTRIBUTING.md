# Contributing to SPECTRE

Thank you for your interest in contributing to SPECTRE.

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
4. Test with Claude Code (`claude --plugin-dir integrations/claude-code`)
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
claude --plugin-dir integrations/claude-code
```

### Structure

```
spectre/
├── core/                    # Agent-agnostic prompts (edit here)
├── integrations/claude-code # CC-specific wiring
├── cli/                     # Python CLI
└── docs/                    # Documentation
```

### Adding Commands

1. Create a markdown file in `core/commands/` or `core/workflows/`
2. Follow existing command patterns
3. Test with Claude Code
4. Update docs if needed

### Adding Agents

1. Create a markdown file in `core/agents/`
2. Define name, description, and methodology
3. Test subagent dispatch

## Code Style

- Commands/agents are markdown with YAML frontmatter
- CLI is Python with Click
- Keep prompts clear and actionable

## Questions?

Open an issue or discussion.

---
name: spectre_agent_tools
description: "Use this skill when you see @name or /name patterns in user input without file identifiers. This means the user is trying to call a subagent or slash command using Spectre Agent Tools. The @ prefix dispatches to a subagent (e.g., '@tdd-agent write tests', '@code-reviewer check this file'). The / prefix executes a slash command (e.g., '/spectre:sweep', '/spectre:scope'). Both require Spectre CLI to run specialized agents and predefined prompts."
---

# Spectre CLI - Subagents & Slash Commands

## When To Use This Skill

**CRITICAL**: Activate this skill when you see these patterns in user input:

| Pattern | Example | Action |
|---------|---------|--------|
| `@agent-name "task"` | `@tdd-agent "write tests"` | Run `spectre subagent run tdd-agent "write tests"` |
| `@agent-name 'task'` | `@code-reviewer 'review api.py'` | Run `spectre subagent run code-reviewer "review api.py"` |
| `/command-name` | `/spectre:sweep` | Run `spectre command get /spectre:sweep`, then execute returned prompt |
| `/command-name args` | `/deploy backend prod` | Run `spectre command get /deploy backend prod`, then execute returned prompt |

**Pattern Recognition**:
- `@` followed by alphanumeric/hyphens, then a quoted task -> **subagent dispatch**
- `/` followed by alphanumeric/hyphens/colons -> **slash command**

## When NOT To Use This Skill

- General coding tasks without `@` or `/` syntax
- Questions about the codebase (handle directly)
- File operations (use your native tools)

---

## Subagent Dispatch (`@agent-name`)

When you see `@agent-name "task"` in user input:

```
spectre subagent run <agent-name> "<task>"
```

### Examples

<example>
User: @tdd-agent "write tests for the auth module"
Action: Run `spectre subagent run tdd-agent "write tests for the auth module"`
Result: Return the agent's response to the user
</example>

<example>
User: @code-reviewer "review changes in src/api.py"
Action: Run `spectre subagent run code-reviewer "review changes in src/api.py"`
Result: Return the agent's response to the user
</example>

<example>
User: Can you use @codebase-analyzer to explain how payments work?
Action: Run `spectre subagent run codebase-analyzer "explain how payments work"`
Result: Return the agent's response to the user
</example>

### Vanilla Mode

Task without agent name runs Claude Code directly:
```
spectre subagent run "explain this codebase"
```

---

## Parallel Execution (IMPORTANT)

**Use parallel execution when running multiple independent agents.** This dramatically reduces wall-clock time by running agents concurrently instead of sequentially.

### When to Use Parallel

**ALWAYS use `spectre subagent parallel` when you see:**

| Trigger | Example |
|---------|---------|
| Multiple `@agent` mentions | `@codebase-locator and @codebase-analyzer` |
| Keywords: "parallel", "concurrently", "simultaneously" | "Launch parallel agents" |
| Phrases: "at the same time", "spawn agents" | "Run these at the same time" |
| Research/analysis phases with multiple agents | "Deep parallel research phase" |
| Lists of independent agent tasks | "Run locator, analyzer, and pattern-finder" |

**Use sequential (one at a time) ONLY when:**
- One agent's output is explicitly needed as input for the next
- Tasks have explicit ordering requirements stated by user

### Parallel Command Syntax

```bash
spectre subagent parallel \
  'agent1:task for agent one' \
  'agent2:task for agent two' \
  'agent3:task for agent three'
```

### Scenario: Parallel Research Phase

When a prompt requests multiple research agents like:

> "Launch parallel agents for context gathering:
> - @codebase-locator: Find relevant files
> - @codebase-analyzer: Understand how it works
> - @web-search-researcher: Find best practices"

**Translate to:**
```bash
spectre subagent parallel \
  'codebase-locator:Find all files related to [topic], return file:line references' \
  'codebase-analyzer:Analyze how [topic] works, trace data flow, document behavior' \
  'web-search-researcher:Search for [topic] best practices, return links'
```

### Scenario: Multi-Agent Code Review

When asked to analyze code from multiple perspectives:

> "Have @code-reviewer, @security-analyzer, and @performance-analyzer review this PR"

**Translate to:**
```bash
spectre subagent parallel \
  'code-reviewer:Review PR for bugs, logic errors, code quality' \
  'security-analyzer:Check for security vulnerabilities' \
  'performance-analyzer:Identify performance bottlenecks'
```

### Decision Flowchart

1. **Count** how many `@agent` references appear in the request
2. **Check** if tasks depend on each other (does agent B need agent A's output?)
3. **If independent** -> Use `spectre subagent parallel`
4. **If dependent** -> Run sequentially with `spectre subagent run`
5. **When in doubt** -> Parallel is faster, prefer it for research/analysis tasks

---

## Slash Command Execution (`/command-name`)

When you see `/command-name` in user input:

1. Retrieve the prompt: `spectre command get /command-name [args]`
2. Execute the returned prompt as your next task

### Examples

<example>
User: /spectre:sweep
Action:
  1. Run `spectre command get /spectre:sweep`
  2. Read the returned prompt
  3. Execute that prompt (it's a cleanup workflow)
</example>

<example>
User: run /quick_tasks for me
Action:
  1. Run `spectre command get /quick_tasks`
  2. Read the returned prompt
  3. Execute that prompt (it breaks down tasks)
</example>

<example>
User: /deploy backend staging
Action:
  1. Run `spectre command get /deploy backend staging`
  2. Arguments replace $1=backend, $2=staging in the template
  3. Execute the returned prompt
</example>

---

## Discovery Commands

### List available agents
```bash
spectre subagent list
```

### List available commands
```bash
spectre command list
```

### Show agent details
```bash
spectre subagent show <agent-name>
```

### Show command details
```bash
spectre command show /command-name
```

---

## Prerequisites

- Python 3.10+
- Spectre CLI: `pip install -e /path/to/spectre` (or from PyPI when published)
- Verify: `spectre --version`

Agent files discovered from:
- `~/.claude/agents/`, `~/.codex/agents/`
- `./.claude/agents/`, `./.codex/agents/`
- Installed plugins

Command files discovered from:
- `~/.claude/commands/`, `~/.codex/prompts/`
- `./.claude/commands/`, `./.codex/prompts/`
- Installed plugins

---

## Error Handling

**Agent not found**: Run `spectre subagent list`, suggest similar names

**Command not found**: Run `spectre command list`, suggest similar names

**Spectre not installed**: Tell user to run `pip install spectre-cli`

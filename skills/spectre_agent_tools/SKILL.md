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

## Timeout Configuration (IMPORTANT)

**Subagent commands can take significant time.** Set appropriate timeouts to avoid premature termination and retry loops.

### Recommended Timeouts by Task Type

| Task Type | Timeout | Examples |
|-----------|---------|----------|
| **Quick lookup** | 60,000ms (1 min) | `spectre subagent list`, `spectre command get` |
| **Single agent task** | 300,000ms (5 min) | `spectre subagent run finder "find auth files"` |
| **Complex analysis** | 600,000ms (10 min) | `spectre subagent run analyst "trace full data flow"` |
| **Parallel agents** | 600,000ms (10 min) | `spectre subagent parallel ...` (multiple agents) |

### Why This Matters

- **Default timeouts are too short** for most subagent work (often 30s default)
- Subagents spawn Claude Code instances that need time to research, read files, and reason
- Parallel execution multiplies wall-clock time since agents run concurrently
- **Maximum allowed timeout is 600,000ms (10 minutes)** - this is Claude Code's hard limit

### Best Practice

**Always set timeout to 300,000ms minimum for any `spectre subagent run` command.** Use 600,000ms for parallel execution or complex analysis tasks.

```bash
# Example with explicit timeout (if your tool supports it)
# For Bash tool: use timeout parameter
# For Task tool: use timeout parameter set to 300000-600000
```

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
User: Can you use @analyst to explain how payments work?
Action: Run `spectre subagent run analyst "explain how payments work"`
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
| Multiple `@agent` mentions | `@finder and @analyst` |
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
  -j agent1 "task for agent one" \
  -j agent2 "task for agent two" \
  -j agent3 "task for agent three"
```

**Or with long form:**
```bash
spectre subagent parallel \
  --job dev "implement the feature" \
  --job tdd-agent "write tests for auth"
```

**Key points:**
- `-j` / `--job` takes two arguments: AGENT and TASK
- Tasks can contain any characters (colons, slashes, file paths, etc.)
- Each `-j` flag adds another agent to run in parallel

### Scenario: Parallel Research Phase

When a prompt requests multiple research agents like:

> "Launch parallel agents for context gathering:
> - @finder: Find relevant files
> - @analyst: Understand how it works
> - @researcher: Find best practices"

**Translate to:**
```bash
spectre subagent parallel \
  -j finder "Find all files related to [topic], return file:line references" \
  -j analyst "Analyze how [topic] works, trace data flow, document behavior" \
  -j researcher "Search for [topic] best practices, return links"
```

### Scenario: Multi-Agent Code Review

When asked to analyze code from multiple perspectives:

> "Have @code-reviewer, @security-analyzer, and @performance-analyzer review this PR"

**Translate to:**
```bash
spectre subagent parallel \
  -j code-reviewer "Review PR for bugs, logic errors, code quality" \
  -j security-analyzer "Check for security vulnerabilities" \
  -j performance-analyzer "Identify performance bottlenecks"
```

### Scenario: Tasks with Special Characters

Tasks can safely include colons, slashes, file paths, and command references:

```bash
spectre subagent parallel \
  -j dev "Run /spectre:tdd on src/auth/login.py" \
  -j reviewer "Check file:line references in docs/api.md"
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

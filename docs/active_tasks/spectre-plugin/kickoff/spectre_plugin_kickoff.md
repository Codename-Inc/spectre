# Kickoff: SPECTRE Plugin for Claude Code

**Date**: 2025-12-23T07:36:36Z
**Repository**: spectre (new)
**Topic**: Claude Code Plugin Development

---

## Project Context

Create a Claude Code plugin called **SPECTRE** that packages Joe's existing Subspace workflow system into a distributable plugin. SPECTRE represents a complete development workflow:

- **S**cope — Define what we're building
- **P**lan — Research and plan implementation
- **E**xecute — Build with parallel TDD agents
- **C**lean — Code cleanup and quality gates
- **T**est — Verification and validation
- **R**elease — Rebase and prepare for merge
- **E**valuate — Documentation and retrospective

---

## Research Summary

### What We're Packaging

**Source Assets (from `/Users/joe/.claude/`)**:

| Category | Location | Count | Key Items |
|----------|----------|-------|-----------|
| **Prompts** | `commands/subspace/` | 36 files | spectre.md, scope.md, plan.md, execute_parallel.md, clean.md, validate.md, handoff.md, kickoff.md |
| **Subagents** | `agents/` | 10 files | codebase-analyzer.md, codebase-locator.md, codebase-pattern-finder.md, coding-agent.md, web-search-researcher.md |
| **Scripts** | `scripts/` | 5+ files | complexity-scorer.js, session-resume-hook.sh, format-resume-context.py |
| **Documentation** | `scripts/`, `.codename/docs/` | 3 files | next_steps_guide.md, COMPLEXITY_ASSESSMENT_README.md, CRITERIA_CHECKLIST.md |
| **Hooks** | `settings.json` | 2 hooks | SessionStart (session-resume-hook.sh), PreToolUse (validate-bash-command.py) |

### Claude Code Plugin Architecture (from web research)

**Official Plugin Structure**:
```
plugin-name/
├── .claude-plugin/
│   └── plugin.json        # Required: Plugin metadata ONLY
├── commands/              # Slash commands (.md files)
├── agents/                # Subagent definitions (.md files)
├── skills/                # Agent skills (proactive behaviors)
│   └── skill-name/
│       └── SKILL.md
├── hooks/
│   └── hooks.json         # Event handler configuration
├── .mcp.json              # MCP server definitions (optional)
└── README.md
```

**CRITICAL**: All component directories MUST be at plugin root, NOT inside `.claude-plugin/`

**plugin.json Schema**:
```json
{
  "name": "spectre",
  "version": "1.0.0",
  "description": "SPECTRE workflow: Scope → Plan → Execute → Clean → Test → Release → Evaluate",
  "author": {
    "name": "Joe Fernandez",
    "email": "joe@example.com"
  }
}
```

---

## Detailed Codebase Findings

### 1. Prompts (Slash Commands)

**Primary SPECTRE Workflow Commands**:

| Command | File | Lines | Purpose |
|---------|------|-------|---------|
| `/spectre:spectre` | `spectre.md` | 290 | Full feature delivery orchestrator — S→P→E→C→T→R→E |
| `/spectre:scope` | `scope.md` | 531 | Interactive feature scoping with contextual suggestions |
| `/spectre:plan` | `plan.md` | 241 | Unified planning router with complexity assessment |
| `/spectre:execute_parallel` | `execute_parallel.md` | 231 | Wave-based parallel TDD execution |
| `/spectre:clean` | `clean.md` | 713 | Comprehensive cleanup with dead code removal |
| `/spectre:validate` | `validate.md` | 264 | Requirements verification and gap analysis |
| `/spectre:handoff` | `handoff.md` | 182 | Session state snapshot for continuity |
| `/spectre:kickoff` | `kickoff.md` | ~600 | Deep research and implementation pathfinding |

**Supporting Commands** (candidates for inclusion):

| Command | Purpose | Include? |
|---------|---------|----------|
| `quick_dev.md` | Lightweight workflow for small fixes | Yes - complements main flow |
| `quick_tasks.md` | Fast task breakdown | Yes - entry point |
| `create_tasks.md` | Detailed task generation | Yes - plan output |
| `code_review.md` | Independent code review | Yes - quality gate |
| `research.md` | Parallel codebase research | Yes - planning support |
| `fix.md` | Bug investigation workflow | Yes - debugging |
| `tdd.md` | TDD execution methodology | Yes - execute support |
| `rebase_workflow.md` | Safe rebase with conflict handling | Yes - release |
| `changelog.md` | Autonomous changelog generation | Optional |
| `architecture_review.md` | Architecture quality review | Yes - evaluate |
| `document.md` | Feature documentation generation | Yes - evaluate |

**Commands to Exclude** (internal/deprecated):
- `spectre_plan.md` - Internal to spectre.md
- `slog_*.md` - Legacy batch commit workflows
- `spotless_*.md` - Could include as optional
- `create_plan_v2.md` - Redundant with plan.md
- `sweep.md` - Lightweight version of clean.md

### 2. Subagents

**Core Research Agents** (all should be included):

| Agent | File | Model | Tools | Purpose |
|-------|------|-------|-------|---------|
| `codebase-locator` | `codebase-locator.md` | haiku | Grep, Glob, LS | Find WHERE code lives |
| `codebase-analyzer` | `codebase-analyzer.md` | haiku | Read, Grep, Glob, LS | Understand HOW code works |
| `codebase-pattern-finder` | `codebase-pattern-finder.md` | haiku | Grep, Glob, Read, LS | Find reusable patterns |
| `web-search-researcher` | `web-search-researcher.md` | default | WebSearch, WebFetch, TodoWrite, Read, Grep, Glob, LS | External research |

**Execution Agents**:

| Agent | File | Purpose | Include? |
|-------|------|---------|----------|
| `coding-agent.md` | Implementation with MVP constraints | Yes - core |
| `tdd-agent.md` | TDD methodology execution | Yes - execute |
| `test-automater.md` | Test automation specialist | Yes - test |
| `independent_review_agent.md` | Plan/code review | Yes - quality |
| `ux-ui-designer.md` | UI/UX design | Optional |

### 3. Scripts

**Complexity Assessment System** (`/Users/joe/.claude/scripts/`):

| File | Type | Purpose | Plugin Mapping |
|------|------|---------|----------------|
| `complexity-scorer.js` | Node.js | Calculate risk score from 30 criteria | `scripts/complexity-scorer.js` |
| `COMPLEXITY_ASSESSMENT_README.md` | Doc | System documentation | `references/` |
| `CRITERIA_CHECKLIST.md` | Doc | Quick reference checklist | `references/` |

**Session Resume System**:

| File | Type | Purpose | Plugin Mapping |
|------|------|---------|----------------|
| `session-resume-hook.sh` | Bash | SessionStart hook - inject context | `hooks/scripts/` |
| `format-resume-context.py` | Python | Convert handoff JSON to context | `hooks/scripts/` |

### 4. Hooks Configuration

**Current hooks in `/Users/joe/.claude/settings.json`**:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [{
          "type": "command",
          "command": "/path/to/session-resume-hook.sh"
        }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "/path/to/validate-bash-command.py"
        }]
      }
    ]
  }
}
```

**Plugin hooks.json mapping**:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session-resume-hook.sh"
        }]
      }
    ]
  }
}
```

### 5. Next Steps Guide

**Location**: `/Users/joe/.claude/.codename/docs/next_steps_guide.md`

**Purpose**: Provides workflow-aware next step suggestions after each prompt completes. Maps current phase to available slash commands with usage rules.

**Key UX Pattern**:
```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ 🧭 Phase: {phase} | 🟢 {status} | 🚧 {blockers}           ║
║ 🎯 Next — {recommendation}                               ║
║ ➡️ Options:                                              ║
║ - /spectre:scope — Define boundaries                     ║
║ - /spectre:plan — Create implementation plan             ║
╚══════════════════════════════════════════════════════════╝
```

---

## Architecture Insights

### Patterns to Follow

1. **YAML Frontmatter**: All prompts use frontmatter for metadata
   ```yaml
   ---
   description: Brief description - primary agent
   argument-hint: Optional argument hint
   ---
   ```

2. **Step-Based Structure**: Prompts use numbered steps with actions
   ```markdown
   ## Step (1/N) - Step Name
   - **Action** — ActionName: Description
   - **Wait** — User confirmation points
   ```

3. **Success Criteria**: Every prompt ends with checkbox validation
   ```markdown
   ## Success Criteria
   - [ ] Requirement 1 completed
   - [ ] Requirement 2 verified
   ```

4. **Next Steps Footer**: Standardized footer with phase-aware suggestions

5. **Subagent Dispatch Pattern**: Parent agents dispatch specialized subagents
   ```markdown
   - **Action** — SpawnAgents: Launch parallel @coder subagents
   ```

### Naming Conventions (Current → Plugin)

| Current | Plugin Equivalent |
|---------|-------------------|
| `/subspace:scope` | `/spectre:scope` |
| `/subspace:plan` | `/spectre:plan` |
| `/subspace:execute_parallel` | `/spectre:execute` |
| `/subspace:clean` | `/spectre:clean` |
| `/subspace:validate` | `/spectre:validate` |
| `/subspace:handoff` | `/spectre:handoff` |
| `/flow:*` | Remove - consolidate into main commands |
| `@coder` | `@spectre:coder` |
| `@codebase-analyzer` | `@spectre:analyzer` |

### Beads Integration

The prompts heavily integrate with Beads issue tracking (`bd` CLI). This is a **user-specific dependency** that should be:
- Documented as optional
- Gracefully handled when not present
- Not required for core workflow

---

## Gap Analysis

### What We Have → What We Need

| Have | Need | Gap |
|------|------|-----|
| 36 prompts in `commands/subspace/` | Curated set of ~20 commands | Selection and renaming |
| 10 subagents in `agents/` | 8-10 core agents | Minor curation |
| Scripts scattered in `scripts/` | Organized in plugin structure | Restructure |
| Hardcoded paths in scripts | Plugin-relative paths (`${CLAUDE_PLUGIN_ROOT}`) | Update references |
| `subspace:` prefix | `spectre:` prefix | Global rename |
| External dependencies (Beads) | Graceful degradation | Add fallbacks |
| No plugin.json | Valid plugin manifest | Create |
| No hooks.json | Proper hook configuration | Create |
| Docs in `.codename/` | Plugin `references/` dir | Relocate |
| No README | User documentation | Create |

### Missing Components

1. **plugin.json** - Plugin manifest (required)
2. **hooks/hooks.json** - Hook configuration
3. **README.md** - User documentation and installation guide
4. **CHANGELOG.md** - Version history
5. **Test scenarios** - Validation that plugin works

---

## MVP Suggestion

### Core Value Proposition

A complete, opinionated development workflow in one plugin that takes you from idea to merged PR with quality gates at every step.

### Minimum Valuable Plugin (MVP)

**Phase 1 - Core Workflow** (7 commands):
1. `/spectre:scope` - Define what we're building
2. `/spectre:plan` - Research and plan (includes complexity assessment)
3. `/spectre:execute` - Wave-based parallel execution
4. `/spectre:clean` - Code cleanup and quality
5. `/spectre:validate` - Requirements verification
6. `/spectre:release` - Rebase workflow (extracted from spectre.md)
7. `/spectre:handoff` - Session continuity

**Phase 1 - Core Agents** (5 agents):
1. `@spectre:coder` - Implementation agent
2. `@spectre:analyzer` - Code analysis
3. `@spectre:locator` - File finding
4. `@spectre:patterns` - Pattern finding
5. `@spectre:researcher` - Web research

**Phase 1 - Scripts**:
1. `complexity-scorer.js` - Planning router
2. `session-resume-hook.sh` + `format-resume-context.py` - Session continuity

### Deferred to Later

- Full SPECTRE orchestrator (use individual commands first)
- UX/UI designer agent
- Spotless (dead code) workflows
- Changelog generation
- Architecture review (standalone)

---

## Implementation Options

### Option A: Direct Port (Simplest)

**Approach**: Copy files with minimal changes, rename prefix only

**Structure**:
```
spectre/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── scope.md
│   ├── plan.md
│   ├── execute.md
│   ├── clean.md
│   ├── validate.md
│   ├── release.md
│   └── handoff.md
├── agents/
│   ├── coder.md
│   ├── analyzer.md
│   ├── locator.md
│   ├── patterns.md
│   └── researcher.md
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       ├── session-resume-hook.sh
│       └── format-resume-context.py
├── scripts/
│   └── complexity-scorer.js
├── references/
│   ├── next_steps_guide.md
│   ├── complexity_readme.md
│   └── criteria_checklist.md
└── README.md
```

**Pros**: Fast, minimal risk, easy to validate
**Cons**: May carry over cruft, Beads dependency baked in
**Effort**: Low

### Option B: Curated Refactor

**Approach**: Selective inclusion with cleanup and optional dependencies

**Changes from Option A**:
- Remove Beads-specific logic (make optional)
- Consolidate redundant commands
- Update all internal references
- Add installation/usage documentation
- Include validation tests

**Pros**: Cleaner plugin, better user experience
**Cons**: More work, risk of breaking existing behavior
**Effort**: Medium

### Option C: Skills-First Architecture

**Approach**: Convert key workflows to Agent Skills (proactive) + Commands (invoked)

**Structure**:
```
spectre/
├── .claude-plugin/plugin.json
├── skills/
│   └── spectre-workflow/
│       ├── SKILL.md          # Proactive workflow suggestions
│       ├── references/       # next_steps_guide, etc.
│       └── scripts/          # complexity-scorer, etc.
├── commands/                  # User-invoked commands
├── agents/                    # Subagents
└── hooks/                     # Session resume
```

**Pros**: Modern plugin architecture, proactive assistance
**Cons**: Requires rethinking prompt structure, more complex
**Effort**: High

---

## Decision Points

Before we proceed to planning, I need your input on:

### 1. Scope: Which commands to include?

**Option A**: MVP Core (7 commands) - scope, plan, execute, clean, validate, release, handoff
**Option B**: Extended (15 commands) - Add quick_dev, quick_tasks, code_review, research, fix, tdd, kickoff, document
**Option C**: Full Suite (20+ commands) - Everything except clearly deprecated

### 2. Beads Integration

**Option A**: Keep Beads integration, document as dependency
**Option B**: Make Beads optional with graceful fallback
**Option C**: Remove Beads entirely for v1

### 3. Architecture Style

**Option A**: Direct port (commands + agents + hooks)
**Option B**: Curated refactor with cleanup
**Option C**: Skills-first with proactive behaviors

### 4. Distribution Target

**Option A**: Personal use only (local plugin)
**Option B**: Team distribution (private marketplace)
**Option C**: Public distribution (claude-plugins-official or npm)

### 5. Naming Details

- Plugin name: `spectre` (confirmed?)
- Command prefix: `/spectre:` (confirmed?)
- Agent prefix: `@spectre:` or just descriptive names?

---

## Open Questions

1. **Complexity Scorer**: Should it remain a Node.js script, or be converted to inline prompt logic?

2. **Session Resume**: The current hook requires specific directory structure (`docs/active_tasks/{branch}/session_logs/`). Should this be configurable?

3. **Next Steps Guide**: Should this be a skill that proactively suggests next steps, or remain embedded in each command?

4. **Test Coverage**: What validation should we include to ensure the plugin works after installation?

5. **Version Strategy**: Start at 1.0.0 or 0.1.0 for initial release?

---

## Related Resources

- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
- [Official Plugins Repository](https://github.com/anthropics/claude-plugins-official)
- [Slash Commands Documentation](https://code.claude.com/docs/en/slash-commands)
- [Agent Skills Documentation](https://code.claude.com/docs/en/skills)
- [Hooks Guide](https://code.claude.com/docs/en/hooks-guide)

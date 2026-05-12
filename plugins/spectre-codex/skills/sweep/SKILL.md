---
name: "sweep"
description: "👻 | Light pass cleanup - clean, lint, test, commit"
user-invocable: true
---

# sweep

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.


## Pre-Commit Sweep

You are preparing uncommitted or recently committed changes for check-in. Perform a systematic cleanup, then commit with descriptive conventional commits.

**Execution Style**: Fast, formulaic checklist. No subagents, no user approval gates. Execute each step and move on.

### 1. Diff Sanity Check

- Review full diff for unintentional changes (whitespace-only edits, merge artifacts)
- Verify no accidentally staged files outside the intended scope
- Confirm no secrets, API keys, credentials, or sensitive data in diff

### 2. Logging Audit

- Remove temporary/debug logging (console.log, print, debug flags, etc.)
- Preserve intentional logs: errors, critical warnings, key state transitions
- Verify log levels are appropriate for production context

### 3. Code Hygiene

- Remove commented-out code (it's in git history if needed)
- Resolve or document any TODO/FIXME/HACK introduced in this session
- Remove hardcoded test values that should be config/env

### 4. Opportunistic Dead Code Cleanup

Quick scan of changed files only — remove anything obviously dead, no deep investigation:

- Orphaned imports with no usage in the file
- Unused variables or functions declared but never referenced
- Commented-out code blocks
- Debug artifacts (debugger statements, leftover TODO/FIXME from this work)

Do not hunt for dead code beyond the changed files. This is opportunistic, not forensic.

### 5. Lint (Strict)

- Run the project linter and **fix all violations** — no skipping, no eslint-disable
- Address structural lint issues (file size, complexity thresholds) by refactoring, not suppressing
- Verify .gitignore coverage (no temp files, build artifacts, IDE configs)

### 6. Test

- Identify test files related to the changed files (co-located tests, imports, shared modules)
- Run those tests and the broader test suite
- Fix any failures caused by the changes
- Do NOT write new tests in this step — this is a sweep, not a test authoring pass

### 7. Commit

Group changes into logical conventional commits. Commits are project history and critical context for LLMs and future developers — invest in making them descriptive.

**Format**: `type(scope): description`

**Types**: feat, fix, refactor, test, chore, docs, style, perf

**Grouping** — separate commits by concern:
- Feature/behavior additions → `feat`
- Refactors/cleanup with no behavior change → `refactor`
- Bug fixes → `fix`
- Test additions/updates → `test`
- Config/dependency changes → `chore`
- Documentation → `docs`

**Commit message quality**:
- Subject line answers: what changed and why (not "fix stuff" or "update files")
- Include scope to locate the change: `feat(auth): add token refresh on 401 response`
- If the commit touches multiple concerns, it's too big — split it
- Body (optional) adds context: motivation, trade-offs, what was considered and rejected

**Anti-patterns**:
- `fix: updates` — says nothing
- `refactor: clean up` — clean up what? why?
- One giant commit for unrelated changes

### 8. Render Footer

Use `Skill(spectre-guide)` skill for Next Steps footer.

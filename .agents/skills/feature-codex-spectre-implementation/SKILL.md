---
name: feature-codex-spectre-implementation
description: Use when modifying the Codex SPECTRE install flow, SessionStart continuity, project skill syncing, registry injection, or Codex-specific runtime files.
user-invocable: false
---

# Codex SPECTRE Implementation

**Trigger**: codex, spectre, codex install, sessionstart, agents.override, registry, spectre-learn, spectre-recall, hooks.json, config.toml, doctor
**Confidence**: high
**Created**: 2026-03-30
**Updated**: 2026-05-01
**Version**: 1

## What is Codex SPECTRE?

The Codex SPECTRE implementation is the Codex-native port of the original Claude Code SPECTRE plugin. It replaces Claude slash-command/plugin behavior with a Codex install that writes workflow skills, subagent TOML configs, runtime hook/tool scripts, and project-local knowledge files so Codex can run the same SPECTRE workflow natively.

The important architectural point is that this is a hybrid system: shared Codex assets live under `.codex/`, while project-specific memory and learned knowledge live under `.spectre/`, `docs/tasks/.../session_logs/`, `AGENTS.override.md`, and `.agents/skills/`. That split is what makes SessionStart continuity and registry-driven knowledge loading work without stuffing the full payload into the visible Codex hook output.

## Why Use It? / Use Cases

### 1. Install SPECTRE into Codex for a repo or a user

Use this when you want `spectre-scope`, `spectre-plan`, `spectre-execute`, and the rest of the workflow available inside Codex. The CLI supports `project` scope for repo-local installs and `user` scope for global installs.

Example:

```bash
npx spectre install codex --scope project
```

### 2. Preserve session continuity across Codex sessions

Use this when you want the latest SPECTRE handoff from `docs/tasks/{branch}/session_logs/*_handoff.json` to be restored automatically at the start of a new Codex session.

The design intentionally uses a `SessionStart` hook for a one-line visible status and a managed `AGENTS.override.md` block for the full hidden continuity payload.

### 3. Make learned project knowledge auto-discoverable

Use this when you want skills created by `spectre-learn` to be available to Codex, and when you want trigger keywords from the registry to be injected into startup context so the agent can match on triggers before searching the codebase.

This is the key difference between "a skill exists on disk" and "Codex knows what project knowledge exists right now."

## User Flows

### Flow 1: Install SPECTRE into Codex

1. Run `spectre install codex`.
2. `src/main.js` parses `install codex`, resolves scope, and sets `CODEX_HOME` for project installs.
3. `installCodex()` in `src/lib/install.js` writes:
   - shared skills into `CODEX_HOME/skills/`
   - workflow skills into `CODEX_HOME/skills/`
   - agent TOML configs into `CODEX_HOME/spectre/agents/`
   - runtime scripts into `CODEX_HOME/spectre/hooks/` and `CODEX_HOME/spectre/tools/`
4. `ensureSpectreHooksConfigured()` in `src/lib/config.js` enables `features.hooks = true`, `features.skills = true`, and `features.multi_agent = true`, and registers the `SessionStart` hook in `hooks.json`.
5. For project installs, `installProjectFiles()` creates `.spectre/manifest.json`, ensures `.agents/skills/spectre-recall/` exists, and prepares the project for persisted knowledge/session syncing.
6. `syncProjectSkillsConfigured()` adds `[[skills.config]]` entries pointing at project skills under `.agents/skills/`.
7. For user installs, the generated `SessionStart` hooks are registered globally and must run in any current workspace even when that workspace does not have `.spectre/manifest.json`.

### Flow 2: Start a new Codex session with SPECTRE installed

1. Codex fires the `SessionStart` hook from `hooks.json`.
2. Generated hooks under `.codex/spectre/hooks/scripts/` run in order, including `bootstrap.mjs`, `handoff-resume.mjs`, and `load-knowledge.mjs`.
3. Those hooks compute the plugin root from their installed script path when `CLAUDE_PLUGIN_ROOT` is unset, so npm-packed installs do not depend on a local checkout path.
4. Generated hooks keep hook output short. The knowledge hook writes the apply scaffold into the managed `AGENTS.override.md` knowledge block when the workspace has a Spectre surface (`.spectre/manifest.json`, a registry, or existing SPECTRE-managed override markers), and it returns only a visible status line plus `hookEventName`.

### Flow 3: Learn and reuse project knowledge

1. `spectre-learn` writes or updates a project skill under `.agents/skills/{category}-{slug}/SKILL.md`.
2. The learning is registered in `.agents/skills/spectre-recall/references/registry.toon`.
3. The recall skill is regenerated at `.agents/skills/spectre-recall/SKILL.md`.
4. `syncProjectSkillsConfigured()` ensures those project skills are configured in Codex `config.toml`.
5. On the next session start, the knowledge adapter refreshes `AGENTS.override.md`, so Codex sees the apply coercion/skill instructions through the same managed override channel used for continuity instead of through `additionalContext`.

## Technical Design

The implementation is split into four layers:

### 1. CLI and scope management

`src/main.js` is the entrypoint. It parses `install`, `uninstall`, `update`, and `doctor`, resolves the project directory, and switches `CODEX_HOME` to `./.codex` for project installs. That means the rest of the code can write to "Codex home" generically without special-casing every path.

### 2. Runtime asset installation

`src/lib/install.js` installs pre-generated Codex assets from `plugins/spectre-codex/`. It:
- copies workflow skills from `plugins/spectre-codex/skills/`
- copies Codex agent TOML configs from `plugins/spectre-codex/agents/`
- copies generated hook scripts and `hooks.json` from `plugins/spectre-codex/hooks/` into `CODEX_HOME/spectre/hooks/`
- installs only small compatibility tool entrypoints under `CODEX_HOME/spectre/tools/`

The key invariant is that command markdowns are shims; workflow bodies live in skills, and Codex install must copy the generated Codex tree instead of regenerating workflow skills from command files.

When adding auxiliary files inside a skill directory, such as examples, fixtures, or templates, place
documentation examples under `references/` unless they are executable scripts or runtime assets, and
make their references skill-local. `sync-codex` copies the whole canonical skill directory into
`plugins/spectre-codex/skills/{skill}/`, and Codex install then copies that generated directory into
`.codex/skills/{skill}/`. A path like `plugins/spectre/skills/{skill}/fixture.json` works only in the
repo checkout and breaks after install. Prefer `fixture.json`, `./fixture.json`, or a relative sibling
path like `../spectre-execute/SKILL.md` when the installed skill must be able to follow the reference.

### 3. Codex config and hook wiring

`src/lib/config.js` owns `config.toml` and `hooks.json`. It enables Codex features, writes `[agents.spectre_*]` tables, and registers/removes the `SessionStart` hook without clobbering unrelated existing hook handlers.

It also syncs project skills by scanning `.agents/skills/*/SKILL.md` and rendering them into `[[skills.config]]` entries. This is how project-learned skills become visible to Codex.

### 4. Project continuity and knowledge injection

`src/lib/project.js` and `src/lib/knowledge.js` own the project-local side:
- `.spectre/manifest.json`
- `.agents/skills/spectre-recall/`
- `AGENTS.override.md`
- handoff lookup in `docs/tasks/{branch}/session_logs/`

The most important logic is in `buildKnowledgeOverrideBody()`: it starts from the shared `spectre-apply` skill and replaces the `## Registry Location` section with the actual current registry contents or the "no knowledge yet" message. That means the startup context contains both the behavioral rule and the current trigger catalog.

## Key Files

- `src/main.js`
  CLI entrypoint. Parses commands, resolves scope, and switches `CODEX_HOME` for project installs.

- `src/lib/install.js`
  Main installer/uninstaller. Generates workflow skills, agent TOML configs, runtime scripts, and invokes project install logic.

- `src/lib/config.js`
  Owns `config.toml` and `hooks.json` mutation, including `features.hooks`, `multi_agent`, `SessionStart`, and `[[skills.config]]` project-skill syncing.

- `src/lib/project.js`
  Owns session continuity and managed `AGENTS.override.md` blocks for both session state and knowledge injection.

- `src/lib/knowledge.js`
  Owns registry file creation, recall skill generation, knowledge status messages, and registry embedding into the knowledge override block.

- `src/lib/doctor.js`
  Verifies Codex version, installed runtime/config state, hook registration, and installed workflow/agent/skill coverage.

- `docs/codex-sessionstart-memory.md`
  Design rationale for the hybrid SessionStart + `AGENTS.override.md` approach, including why `additionalContext` was rejected.

- `src/install.test.js`
  End-to-end install/uninstall coverage for project installs, hook registration, generated files, and legacy cleanup.

## Common Tasks

### Add or change SessionStart continuity behavior

Edit:
- `src/lib/project.js`
- `src/lib/install.js`
- `src/lib/config.js`

What to change:
1. Update how the session block is built in `buildSessionOverrideContent()` or how the knowledge block is built in `syncKnowledgeOverride()`.
2. If the runtime hook contract changes, update `sessionStartHook()` in `src/lib/install.js`.
3. If hook registration changes, update `ensureSpectreHooksConfigured()` in `src/lib/config.js`.
4. Verify with:
   ```bash
   node --test src/config.test.js src/install.test.js
   ```

### Add a new learned project skill and make sure Codex sees it

1. Write the skill under:
   ```text
   .agents/skills/{category}-{slug}/SKILL.md
   ```
2. Register it in:
   ```text
   .agents/skills/spectre-recall/references/registry.toon
   ```
3. Regenerate:
   ```text
   .agents/skills/spectre-recall/SKILL.md
   ```
4. Refresh project context so Codex config and the managed knowledge block stay in sync:
   ```bash
   node .codex/spectre/tools/refresh-project-context.mjs --project-root "$PWD"
   ```

### Debug why a project skill is not being used

Check, in order:
1. The skill exists at `.agents/skills/{name}/SKILL.md`.
2. The registry entry exists in `.agents/skills/spectre-recall/references/registry.toon`.
3. `config.toml` contains a `[[skills.config]]` entry for the skill path.
4. `hooks.json` contains `SessionStart` hooks pointing at `spectre/hooks/scripts/*.mjs`, especially `load-knowledge.mjs`.
6. Run:
   ```bash
   npx spectre doctor codex --scope project --verify-hooks
   ```

## Example

### Example install artifacts

After `npx spectre install codex --scope project`, expect files like:

```text
.codex/config.toml
.codex/hooks.json
.codex/skills/spectre-scope/SKILL.md
.codex/skills/spectre-apply/SKILL.md
.codex/spectre/hooks/hooks.json
.codex/spectre/hooks/scripts/bootstrap.mjs
.codex/spectre/hooks/scripts/handoff-resume.mjs
.codex/spectre/hooks/scripts/load-knowledge.mjs
.codex/spectre/tools/sync-session-override.mjs
.codex/spectre/agents/dev.toml
.spectre/manifest.json
.agents/skills/spectre-recall/SKILL.md
.agents/skills/spectre-recall/references/registry.toon
```

### Example design invariant

If you are tempted to put the full handoff into hook output, don't. The current design deliberately keeps the hook output short and writes the full continuity into managed `AGENTS.override.md` blocks instead.

## Pitfalls

- `SessionStart` does not fire just because the Codex UI opens. It runs on the first real turn of a new/resumed session.
- Runtime hooks are copied generated assets. Avoid reintroducing package-cache `file://` imports, local checkout path assumptions, or `.spectre/manifest.json` gates for user-scope startup behavior.
- Skill assets are copied installed assets too. Do not hard-code `plugins/spectre/...` paths inside skill fixtures/templates unless the reference is explicitly repo-only; installed Codex skills should use skill-local paths.
- The standalone `.codex/skills/spectre-apply/SKILL.md` is the source for the managed startup knowledge block, but Codex should receive that block through `AGENTS.override.md`; do not put the apply coercion into SessionStart `additionalContext`.
- Project knowledge without a registry entry is incomplete. The skill may exist on disk, but trigger-based discovery will be missing.
- Project installs are the only mode that create `.spectre/manifest.json` and initial project-local knowledge/session files. User installs write global Codex assets and global hooks that still run in every workspace; those hooks should degrade to a ready banner when no project registry or handoff exists.

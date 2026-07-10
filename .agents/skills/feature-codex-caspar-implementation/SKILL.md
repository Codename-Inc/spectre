---
name: feature-codex-caspar-implementation
description: Use when modifying the Codex CASPAR install flow, project skill syncing, learn/recall registry files, or Codex-specific runtime files. TRIGGER when: codex, caspar, codex install, project skills, registry, caspar-learn, caspar-recall, config.toml, doctor
user-invocable: false
---

# Codex CASPAR Implementation

**Trigger**: codex, caspar, codex install, project skills, registry, caspar-learn, caspar-recall, config.toml, doctor
**Confidence**: high
**Created**: 2026-03-30
**Updated**: 2026-07-10
**Version**: 4

## Current Design

Codex CASPAR installs the Caspar workflow as Codex-native skills plus subagent TOML configs. It does not install startup hooks, automatic handoff restore, `caspar-apply`, or managed `AGENTS.override.md` memory blocks.

Agents should find reusable project knowledge from normal skill discovery:

- `caspar-learn` writes project skills under `.agents/skills/{category}-{slug}/SKILL.md`.
- The recall registry lives at `.agents/skills/caspar-recall/references/registry.toon`.
- `caspar-recall` is generated as an explicit search/load skill.
- Project installs sync `.agents/skills/*/SKILL.md` into Codex `[[skills.config]]`.

Workflow task execution now uses a two-artifact contract:

- `caspar-create_tasks` writes `{OUT_DIR}/specs/execute.md` plus `{OUT_DIR}/specs/tasks.json`.
- `execute.md` is the compact primary-agent index (document manifest, task detail source, execution summary, wave plan, parent-task index, slicing rules).
- `tasks.json` is the full mutable detail/status source (`meta` + `phases[]`); primary execution/review/validation consumers should slice it by parent task id instead of reading the whole file.
- Do not reintroduce the old `specs/tasks.md` task-list flow or a Markdown fallback/converter.

Review gates use one cross-runtime contract:

- `caspar-plan_review`, `caspar-task_review`, and `caspar-code_review` prefer the opposing CLI with an explicit high-effort model: Codex launches Claude Code with `--model fable --effort high`; Claude Code launches Codex with `-m gpt-5.6-sol -c 'model_reasoning_effort="high"'`.
- If the opposing runtime is unavailable or fails validation after one repair attempt, the gate dispatches one native reviewer with the same manifest, adversarial lenses, severity/evidence rules, exclusions, and report schema. This fallback does not block completion and must record its reason plus runtime/model metadata.
- `caspar-code_review` is an adversarial, evidence-gated review for correctness, regressions/integration, security, performance/reliability, overengineering, and test adequacy. It does not use subjective numeric scores.
- `caspar-execute` delegates its final cumulative review to `caspar-code_review --orchestrated`; do not reintroduce a separate final-review prompt inside execute.
- Canonical workflow skills live under `plugins/caspar/skills/`; regenerate `plugins/caspar-codex/` and keep regression assertions in `scripts/test_sync-codex.cjs` aligned with these invariants.

## Install Flow

1. `src/main.js` parses `install codex`, resolves scope, and switches `CODEX_HOME` to `./.codex` for project installs.
2. `installCodex()` in `src/lib/install.js` copies generated Codex assets from `plugins/caspar-codex/`:
   - workflow skills into `CODEX_HOME/skills/`
   - agent TOML configs into `CODEX_HOME/caspar/agents/`
   - runtime helper scripts into `CODEX_HOME/caspar/hooks/` and `CODEX_HOME/caspar/tools/`
3. `installCodex()` removes the legacy sibling `CODEX_HOME/spectre/` runtime and `ensureCasparHooksConfigured()` removes stale `[agents.spectre_*]` tables before writing `[agents.caspar_*]`, preventing duplicate bare agent nicknames like `dev` and `analyst`.
4. `ensureCasparHooksConfigured()` enables `features.skills = true` and `features.multi_agent = true`, writes `[agents.caspar_*]` tables, and removes stale legacy Caspar hook registrations without adding new hooks.
5. For project installs, `installProjectFiles()` creates `.caspar/manifest.json`, ensures `.agents/skills/caspar-recall/` exists, removes legacy managed override blocks, and calls `syncProjectSkillsConfigured()`.

## Key Files

- `plugins/caspar/skills/`
  Canonical Claude/Codex-compatible workflow skill sources.
- `plugins/caspar-codex/`
  Generated Codex bundle. Regenerate with `npm run sync-codex -- --quiet`.
- `src/lib/install.js`
  Main installer/uninstaller.
- `src/lib/config.js`
  Owns `config.toml`, agent table setup, project skill sync, and stale hook cleanup.
- `src/lib/project.js`
  Owns `.caspar/manifest.json`, recall skill initialization, and legacy override cleanup.
- `src/lib/knowledge.js`
  Owns recall registry/template generation.
- `src/lib/doctor.js`
  Verifies installed runtime/config state and reports stale hook remnants.

## Common Tasks

### Add or change a workflow skill

1. Edit `plugins/caspar/skills/caspar-*/SKILL.md`.
2. Run:
   ```bash
   npm run sync-codex -- --quiet
   npm run sync-codex -- --check --quiet
   ```
3. Run focused tests when installer or translator behavior changed:
   ```bash
   node --test src/install.test.js src/config.test.js scripts/test_sync-codex.cjs
   ```
4. If changing `caspar-create_tasks` task artifacts, also validate both task fixtures parse:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('plugins/caspar/skills/caspar-create_tasks/references/tasks.example.json','utf8'))"
   ```

### Add a learned project skill and make sure Codex sees it

1. Write the skill under `.agents/skills/{category}-{slug}/SKILL.md`.
2. Register it in `.agents/skills/caspar-recall/references/registry.toon`.
3. Regenerate `.agents/skills/caspar-recall/SKILL.md`.
4. Refresh project install state:
   ```bash
   npx @codename_inc/caspar update codex --scope project --project-dir "$PWD"
   ```

### Debug why a project skill is not being used

Check, in order:

1. The skill exists at `.agents/skills/{name}/SKILL.md`.
2. Its frontmatter description contains concrete trigger language.
3. `config.toml` contains a `[[skills.config]]` entry for the skill path.
4. If explicit search is needed, the registry entry exists in `.agents/skills/caspar-recall/references/registry.toon`.
5. Run:
   ```bash
   npx @codename_inc/caspar doctor codex --scope project
   ```

## Expected Install Artifacts

After `npx @codename_inc/caspar install codex --scope project`, expect files like:

```text
.codex/config.toml
.codex/skills/caspar-scope/SKILL.md
.codex/caspar/hooks/scripts/register_learning.mjs
.codex/caspar/agents/dev.toml
.caspar/manifest.json
.agents/skills/caspar-recall/SKILL.md
.agents/skills/caspar-recall/references/registry.toon
```

Do not reintroduce:

- `caspar-apply`
- `caspar-evaluate`
- `caspar-architecture_review`
- `caspar-handoff`
- `caspar-forget`
- startup hook handlers
- startup memory blocks or managed `AGENTS.override.md` context blocks
- stale `[agents.spectre_*]` registrations or `CODEX_HOME/spectre/` runtime files during Caspar install/update

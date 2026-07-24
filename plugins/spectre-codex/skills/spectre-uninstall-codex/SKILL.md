---
name: "spectre-uninstall-codex"
description: "Codex-only Spectre uninstall workflow. Use when the user wants to uninstall the native spectre@spectre Codex plugin; removes managed Spectre custom agents before native plugin removal while preserving marketplace registration and project knowledge."
user-invocable: true
---

# uninstall-codex

Remove only Spectre-managed Codex custom agents, then remove the native plugin. Preserve marketplace registration, project knowledge, handoffs, and unrelated Codex config.

## Method
1. Run:
   ```bash
   node "${PLUGIN_ROOT}/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --remove --json
   ```
2. If the helper reports `collisions`, stop and report the paths. Do not delete unowned files.
3. Run:
   ```bash
   codex plugin remove spectre@spectre
   ```

## DONE
Managed `spectre_*.toml` agents were removed or confirmed absent, the native plugin removal command completed, and no project knowledge/session data was deleted.

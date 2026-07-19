---
name: verify-spectre
description: "Use when validating that the Spectre plugin itself still works after ANY change to this repo — skills, prompts, agents, hooks, the CLI, the Codex mirror, or a release. Runs the full gate suite (structure, tests, Codex translation, real-CLI behavior, release readiness) and reports PASS/FAIL per gate. Trigger on: verify, validate, does this still work, check the plugin, pre-commit check, pre-release check, did I break anything, is the Codex mirror stale, ready to publish. Do NOT trigger for validating a user's own project — this validates the spectre codebase."
user-invocable: true
---

# verify-spectre

The gate suite for the Spectre plugin itself. Run it after any change to skills, agents, hooks, `src/lib/`, or the Codex mirror — and always before a release.

The reason this exists as scripts rather than a checklist: Spectre's real failures are silent. A skill whose frontmatter name drifts from its directory never triggers. A stale Codex mirror serves every Codex user the previous version indefinitely. An unsubstituted `{{REGISTRY}}` ships a raw template into someone's context. None of these break a test or throw an error — they just quietly stop working. So every check asserts an observable condition (file contents, exit code, byte-comparison) and exits nonzero. Nothing here is eyeballed.

## Run it

```bash
node .claude/skills/verify-spectre/scripts/verify.mjs            # gates 1-4 (default, pre-commit)
node .claude/skills/verify-spectre/scripts/verify.mjs --fast     # gates 1-2 (seconds, on every change)
node .claude/skills/verify-spectre/scripts/verify.mjs --release  # gates 1-5 (before publishing)
node .claude/skills/verify-spectre/scripts/verify.mjs --gate 4   # one gate, when iterating on a fix
```

The scripts live under `.claude/skills/verify-spectre/scripts/` and are the single canonical copy — this Codex-facing skill runs the same files rather than duplicating them. Two copies of a 600-line suite drift, and drift in a validation suite is worse than no suite: it reports green against rules nobody is enforcing. (This repo already has that problem elsewhere — `feature-codex-spectre-implementation` differs by 332 lines between `.claude/` and `.agents/`.)

Run from the repo root. The scripts locate the repo from their own path, so they work regardless of your working directory.

Report the PASS/FAIL summary. On failure, each check already names what was expected and what was found — quote that rather than re-deriving it.

## The gates

| # | Gate | Asserts |
|---|------|---------|
| 1 | **structure** | Skill/agent frontmatter valid and `name` matches its directory · expected-skills manifest intact · `hooks.json` parses, scripts exist, SessionStart order is `bootstrap → handoff-resume → load-knowledge` · `{{REGISTRY}}` appears only in the apply source template · no stale fork naming · every `Skill(spectre-x)` / `/spectre:x` / `@spectre:agent` reference resolves · three version files agree |
| 2 | **tests** | `npm test` passes; reports the test count so a silent drop (deleted tests, not fixed ones) is visible |
| 3 | **codex** | `sync-codex --check` is clean — the committed mirror matches canonical source · generated hooks reference `.mjs`, never `.cjs`, and every referenced script exists · skills rewritten to `.agents/skills/` and bare skill names |
| 4 | **real-cli** | The CLI and hooks actually run, in throwaway temp dirs with a fresh `CODEX_HOME` (see below) |
| 5 | **release** | Clean tree · mirror in sync · versions in lockstep · tag free · **npm authenticated** |

## Why gate 4 is the one that counts

Tests exercise functions; users exercise the installed CLI and the hooks that fire at session start. Those are different things, and the gap between them is where this project's actual bugs have lived. Gate 4 closes it by driving the real binary — non-spectre guard, populated and empty registry, idempotency, session memory, install/doctor/uninstall across `--scope user|project`, and legacy marker cleanup.

Note that `--scope` is `user|project`, not Claude vs Codex. Only a project-scope install writes `.spectre/manifest.json` into the project, which is what gives the SessionStart hook a knowledge surface to inject against; a user-scope install deliberately injects nothing.

If gate 4 can't run safely (no `codex` binary, sandbox restrictions), say so and stop — don't substitute the test suite for it and call the work validated. A green gate 2 with a skipped gate 4 means the functions work and the product is unverified.

## Maintaining the suite

`references/expected-skills.txt` (alongside the scripts) is the skill manifest. Skills get added and removed on purpose, never by accident, so gate 1 fails on any drift — update the manifest in the same commit as the skill change. That's the check that catches a skill silently lost in a merge or refactor.

When you add a new invariant to the plugin, add its check to the gate it belongs to. A check that lives in a script runs every time; a check that lives in someone's memory runs once.

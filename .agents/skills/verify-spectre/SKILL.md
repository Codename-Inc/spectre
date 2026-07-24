---
name: verify-spectre
description: "Use when validating that the Spectre plugin itself still works after ANY change to this repo — skills, prompts, agents, hooks, the CLI, the Codex mirror, or a release. Runs the full gate suite (structure, tests, Codex translation, real-CLI behavior, release readiness) and reports PASS/FAIL per gate. Trigger on: verify, validate, does this still work, check the plugin, pre-commit check, pre-release check, did I break anything, is the Codex mirror stale, ready to publish. Do NOT trigger for validating a user's own project — this validates the spectre codebase."
user-invocable: true
---

# verify-spectre

The gate suite for the Spectre plugin itself. Run it after any change to skills, agents, hooks, `src/lib/`, or the Codex mirror — and always before a release.

The reason this exists as scripts rather than a checklist: Spectre's real failures are silent. A skill whose frontmatter name drifts from its directory never triggers. A stale Codex mirror serves every Codex user the previous version indefinitely. A missing SessionStart registry or exact-load path leaves project knowledge undiscoverable without blocking the user's work. None of these break a test or throw an error — they just quietly stop working. So every check asserts an observable condition (file contents, exit code, byte-comparison) and exits nonzero. Nothing here is eyeballed.

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
| 1 | **structure** | Skill/agent frontmatter valid and `name` matches its directory · expected-skills manifest intact · `hooks.json` parses, scripts exist, SessionStart order is `bootstrap → handoff-resume → load-knowledge` · no active skill contains `{{REGISTRY}}` · no stale fork naming · every `Skill(spectre-x)` / `/spectre:x` / `@spectre:agent` reference resolves · three version files agree |
| 2 | **tests** | `npm test` passes; reports the test count so a silent drop (deleted tests, not fixed ones) is visible |
| 3 | **codex** | `sync-codex --check` is clean — the committed mirror matches canonical source · generated hooks reference `.mjs`, never `.cjs`, and every referenced script exists · skills rewritten to `.agents/skills/` and bare skill names |
| 4 | **real-cli** | The CLI and hooks actually run, in throwaway temp dirs with a fresh `CODEX_HOME` (see below) |
| 5 | **release** | Clean tree · mirror in sync · versions in lockstep · tag free · **npm authenticated** |

## Why gate 4 is the one that counts

Tests exercise functions; users exercise the installed CLI and the hooks that fire at session start. Those are different things, and the gap between them is where this project's actual bugs have lived. Gate 4 closes it by driving the real binary:

- **Non-spectre guard** — a bare directory gets nothing written to it.
- **Metadata-only registry delivery** — Claude Code and Codex receive one size-bounded SessionStart registry on startup/resume/clear/compact, with complete routing entries and no record body or knowledge `systemMessage`.
- **Relevance policy** — registry text requires both task-subject and use-condition alignment; an activation cue alone is insufficient.
- **Overflow recovery** — an omitted active record remains discoverable through neutral lexical search and is applied only after a verified exact-ID load.
- **Load and resource contract** — exact load returns the verified core plus canonical `recordDirectory` and safe `resources` paths, and one invocation advances successful-load activity exactly once.
- **Evidence separation** — registry exposure is a delivery diagnostic; search match/miss is discovery evidence; a successful verified exact-ID load is authoritative content access and the sole registry-rank signal.
- **Session memory** — a seeded handoff is surfaced by `handoff-resume`.
- **Retired installer hard cut** — `install/update/uninstall codex` return `CODEX_PLUGIN_REQUIRED` and do not mutate files.
- **Native Codex plugin bootstrap** — generated plugin hooks install/update/remove managed `spectre_*` agents, reject unowned collisions, remove legacy direct-install runtime, and `doctor codex` reports native readiness.

Transcript file-read evidence may inform a later curation review, but it is optional secondary evidence and never changes runtime registry rank.

If gate 4 can't run safely (no `codex` binary, sandbox restrictions), say so and stop — don't substitute the test suite for it and call the work validated. A green gate 2 with a skipped gate 4 means the functions work and the product is unverified.

## Maintaining the suite

`references/expected-skills.txt` (alongside the scripts) is the skill manifest. Skills get added and removed on purpose, never by accident, so gate 1 fails on any drift — update the manifest in the same commit as the skill change. That's the check that catches a skill silently lost in a merge or refactor.

When you add a new invariant to the plugin, add its check to the gate it belongs to. A check that lives in a script runs every time; a check that lives in someone's memory runs once.

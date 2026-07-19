---
name: "spectre-release"
description: "Run the lightweight Spectre release flow: commit pending Spectre changes, sync Codex assets, run tests, bump marketplace/plugin/package versions, commit and push, refresh the user-level Codex install, and print the Claude Code marketplace update command. Use when the user asks to release, ship a Spectre version, bump Spectre, or update local installs after Spectre prompt/plugin changes."
user-invocable: true
---

# release

Ship the current Spectre checkout as a pushed version update. This is the lightweight Spectre project release flow, not a tag/GitHub-release/npm-publish workflow.

## Inputs

- `$ARGUMENTS` — optional version bump: `patch`, `minor`, `major`, or an exact semver like `5.4.5`. Default to `patch` when absent.
- Current git working tree.

## Version Files

Bump all version fields in sync:

- `package.json` -> `version`
- `.claude-plugin/marketplace.json` -> top-level `version` and `plugins[0].version`
- `plugins/spectre/.claude-plugin/plugin.json` -> `version`
- `plugins/spectre/.codex-plugin/plugin.json` -> `version`

Skipping any file creates install drift between Claude Code marketplace, the canonical plugin, Codex plugin metadata, and the local CLI/runtime.

## Method / guardrails

1. **Inspect the working tree.** Run `git status --short` and read the relevant diffs. Never stage unrelated files blindly.
2. **Sync and verify generated Codex assets before release.**
   - Run `npm run sync-codex -- --quiet`.
   - Run `npm run sync-codex -- --check --quiet`.
   - Run `npm test`.
3. **Commit pending non-version changes first.**
   - If prompt/source/generated changes exist, stage only the relevant files and commit them with a descriptive message.
   - Do not mix the release version bump into this commit.
4. **Bump the version.**
   - Resolve the new version from `$ARGUMENTS` or default `patch`.
   - Edit all Version Files above.
   - Run `npm run sync-codex -- --check --quiet` and `npm test` again.
   - Commit only the version files with `release: vX.Y.Z`.
5. **Push.** Run `git push` after both commits are created.
6. **Refresh the user-level Codex install from this checkout.**
   - Run `node bin/spectre.js update codex --scope user`.
   - Run `node bin/spectre.js doctor codex --scope user`.
   - If either command fails, fix it before declaring release complete.
7. **Print the Claude Code update command exactly:**

```text
/plugin marketplace update spectre
```

Do not create tags, GitHub releases, or run `npm publish` unless the user explicitly asks for the heavier publishing flow.

## Outputs + DONE

DONE when:

- non-version changes are committed separately, if present;
- all Version Files contain the same new version;
- `npm run sync-codex -- --check --quiet` passes;
- `npm test` passes;
- the release commit `release: vX.Y.Z` exists;
- `git push` succeeds;
- user-level Codex update and doctor checks pass;
- the final response includes the new version, pushed commits, local Codex install status, and `/plugin marketplace update spectre`.

## Handoff

Summarize:

- `Released vX.Y.Z`
- commits pushed
- tests/checks run
- user-level Codex install result
- Claude Code command: `/plugin marketplace update spectre`

## Escalate-If

- Version files disagree before bumping -> stop and reconcile before release.
- Tests, sync check, push, update, or doctor fail -> fix if local and in scope; otherwise report the blocker.
- Git has unrelated dirty files -> leave them unstaged and call them out.

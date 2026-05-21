---
name: release
description: Run the SPECTRE release workflow, including version bumps, Codex sync, local Codex install verification, GitHub release, and npm publish.
user-invocable: true
---

# Release

You are running the SPECTRE release workflow. Follow each step precisely.

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

## Arguments

`$ARGUMENTS` is optional: `patch`, `minor`, or `major`. If not provided, ask the user.

## Version Files

All three files must be bumped in sync:

- `plugins/spectre/.claude-plugin/plugin.json` -> `version` field (Claude Code plugin manifest)
- `.claude-plugin/marketplace.json` -> top-level `version` and `plugins[0].version` (Claude Code marketplace)
- `package.json` -> `version` field (npm package `@codename_inc/spectre`, used by Codex `npx` installs)

Skipping `package.json` strands Codex users on the previous version even though the marketplace is current.

## Execution Flow

### Step 1: Determine Version Bump

Read all version files to get the current version.

If `$ARGUMENTS` contains `patch`, `minor`, or `major`, use that. Otherwise, ask the user:

```text
Which version bump?
- patch (bug fixes, small changes)
- minor (new features, non-breaking)
- major (breaking changes)
```

Calculate the new version number and confirm it with the user before proceeding.

### Step 2: Handle Dirty Working Tree

Run `git status` and `git diff` (staged and unstaged).

If there are uncommitted changes:

1. Analyze what changed: read the diffs and understand the intent.
2. Stage the relevant files with specific filenames, not `git add -A`.
3. Write a descriptive commit message that summarizes the actual changes. Do not use `release: vX.Y.Z` here; that comes later.
4. Create the commit.
5. If there are no changes, skip this step.

### Step 3: Sync Codex Generated Tree

Run the Codex author-time sync before any version files are updated:

1. Run `npm run sync-codex`.
2. Run `npm run sync-codex -- --check`.
3. Run `git diff -- plugins/spectre-codex/` and inspect any generated changes.
4. If `plugins/spectre-codex/` changed, stage only the generated tree and commit it separately:

   ```bash
   git add plugins/spectre-codex
   git commit -m "release: sync codex tree"
   ```

5. If there are no generated changes, skip the sync commit.

Do not bump versions until the sync check passes.

### Step 4: Bump Versions

1. Update `plugins/spectre/.claude-plugin/plugin.json` with the new version.
2. Update `.claude-plugin/marketplace.json`: both `version` (top-level) and `plugins[0].version`.
3. Update `package.json` `version`.
4. Commit these version bumps:

   ```bash
   git add plugins/spectre/.claude-plugin/plugin.json .claude-plugin/marketplace.json package.json
   git commit -m "release: vX.Y.Z"
   ```

### Step 5: Refresh Local Codex Install

Before changelog, tag, push, or npm publish, make sure the local project Codex install is running the exact generated assets and project skills from this checkout.

1. Run the source-local project update:

   ```bash
   node bin/spectre.js update codex --scope project --project-dir "$PWD"
   ```

2. Verify the installed Codex runtime and hook wiring:

   ```bash
   node bin/spectre.js doctor codex --scope project --project-dir "$PWD" --verify-hooks
   ```

3. If the update or doctor command fails, stop and fix it before shipping.
4. Do not stage ignored local runtime state such as `.codex/`, `.spectre/`, or `AGENTS.override.md` unless the user explicitly asks. This step is a local install guard, not a release artifact commit.

### Step 6: Build Changelog

Generate a changelog by analyzing commits since the last tag:

```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
```

Organize the commits into a changelog with these categories, skipping empty categories:

- **New** - new features or capabilities
- **Changed** - modifications to existing behavior
- **Fixed** - bug fixes
- **Removed** - removed features or code

Write the changelog in concise bullet points. Each bullet should describe the user-facing change, not the implementation detail. Present the draft to the user and ask if they want to edit it before proceeding.

### Step 7: Tag and Push

1. Create the git tag: `vX.Y.Z`.
2. Ask the user to confirm before pushing:
   - `git push`
   - `git push --tags`

### Step 8: Create GitHub Release

After pushing, create a GitHub release with the changelog:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<changelog>"
```

Use a heredoc for the notes body to preserve formatting.

### Step 9: Publish to npm

Codex users install via `npx @codename_inc/spectre install codex`, so the npm package must be published for them to pick up the new version. The marketplace alone is not enough.

1. Confirm npm auth: `npm whoami`. If unauthenticated, ask the user to run `! npm login` themselves because the interactive flow requires their credentials.
2. Publish: `npm publish --access public`.
3. If npm requires an OTP (`EOTP` error), ask the user to re-run with `--otp=<code>`. You cannot read their authenticator.
4. Verify the new version is live:

   ```bash
   npm view @codename_inc/spectre versions --json
   ```

### Step 10: Done

Print a summary:

```text
Release complete: vX.Y.Z
- Commit: <short sha>
- Tag: vX.Y.Z
- GitHub release: <url>
- npm: @codename_inc/spectre@X.Y.Z
```

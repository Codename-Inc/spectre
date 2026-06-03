---
name: release
description: Run the Caspar release workflow, including version bumps, Codex sync, global Codex install verification, GitHub release, manual npm publish handoff, npm verification, and final global Codex refresh.
user-invocable: true
---

# Release

You are running the Caspar release workflow. Follow each step precisely.

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

## Arguments

`$ARGUMENTS` is optional: `patch`, `minor`, or `major`. If not provided, ask the user.

## Version Files

All three files must be bumped in sync:

- `plugins/caspar/.claude-plugin/plugin.json` -> `version` field (Claude Code plugin manifest)
- `.claude-plugin/marketplace.json` -> top-level `version` and `plugins[0].version` (Claude Code marketplace)
- `package.json` -> `version` field (npm package `@codename_inc/caspar`, used by Codex `npx` installs)

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
3. Run `git diff -- plugins/caspar-codex/` and inspect any generated changes.
4. If `plugins/caspar-codex/` changed, stage only the generated tree and commit it separately:

   ```bash
   git add plugins/caspar-codex
   git commit -m "release: sync codex tree"
   ```

5. If there are no generated changes, skip the sync commit.

Do not bump versions until the sync check passes.

### Step 4: Bump Versions

1. Update `plugins/caspar/.claude-plugin/plugin.json` with the new version.
2. Update `.claude-plugin/marketplace.json`: both `version` (top-level) and `plugins[0].version`.
3. Update `package.json` `version`.
4. Commit these version bumps:

   ```bash
   git add plugins/caspar/.claude-plugin/plugin.json .claude-plugin/marketplace.json package.json
   git commit -m "release: vX.Y.Z"
   ```

### Step 5: Refresh Global Codex Install Before Shipping

Before changelog, tag, push, or npm publish, make sure the global Codex install is running the exact generated assets from this checkout.

1. Run the source-local user-scope update:

   ```bash
   node bin/caspar.js update codex --scope user --project-dir "$PWD"
   ```

2. Verify the installed Codex runtime and hook wiring:

   ```bash
   node bin/caspar.js doctor codex --scope user --project-dir "$PWD"
   ```

3. If the update or doctor command fails, stop and fix it before shipping.
4. Do not stage ignored local runtime state such as `.codex/`, `.caspar/`, or `~/.codex/` unless the user explicitly asks. This step is a local install guard, not a release artifact commit.

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

### Step 9: Manual npm Publish Handoff

Codex users install via `npx @codename_inc/caspar install codex`, so the npm package must be published for them to pick up the new version. The marketplace alone is not enough.

Do not run `npm login` or `npm publish` for the user. npm auth, OTP, and publish confirmation are user-owned interactive steps. This is the final manual publish step.

Ask the user to run these commands themselves:

```bash
npm login
npm publish --access public
```

If they are already logged in, they can skip `npm login`. If npm requires an OTP, they should rerun publish with:

```bash
npm publish --access public --otp=<code>
```

Wait for the user to confirm the package is published before proceeding.

### Step 10: Verify npm and Refresh Global Codex Install

After the user confirms npm publish completed:

1. Verify the new version is live:

   ```bash
   npm view @codename_inc/caspar versions --json
   ```

2. Refresh the global Codex install one final time from this checkout:

   ```bash
   node bin/caspar.js update codex --scope user --project-dir "$PWD"
   ```

3. Verify the installed Codex runtime and hook wiring:

   ```bash
   node bin/caspar.js doctor codex --scope user --project-dir "$PWD"
   ```

4. Do not stage ignored local runtime state such as `.codex/`, `.caspar/`, or `~/.codex/` unless the user explicitly asks.

### Step 11: Done

Print a summary:

```text
Release complete: vX.Y.Z
- Commit: <short sha>
- Tag: vX.Y.Z
- GitHub release: <url>
- npm: @codename_inc/caspar@X.Y.Z
```

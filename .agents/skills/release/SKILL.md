---
name: release
description: Deploy the current Spectre checkout for persistent local user testing, or run the full public GitHub and npm release workflow. Use when asked to deploy Spectre locally, refresh local Spectre installs, release Spectre, publish a version, or ship Spectre publicly.
user-invocable: true
---

# Release

Internal Spectre deployment workflow. Keep local deployment and public release as explicit, separate modes.

## Arguments

Supported invocations:

```text
local
public patch
public minor
public major
public X.Y.Z
```

Treat `$ARGUMENTS` as one of these forms. If the first argument is missing or is not `local` or `public`, ask which mode to run. Never infer or default to a public release.

## Shared Preflight

1. Run `git status --short` and inspect relevant staged and unstaged diffs.
2. Run:

   ```bash
   npm run sync-codex -- --quiet
   npm run sync-codex -- --check --quiet
   node .claude/skills/verify-spectre/scripts/verify.mjs
   ```

3. Stop and fix any sync, test, structure, Codex, or real-CLI failure before deploying.
4. Never stage unrelated files or use `git add -A`.

## Persistent Local Install Refresh

Both local and public modes refresh persistent user-level installs themselves. These commands are deployment actions, not a handoff for the user to finish.

### Codex

1. Run `codex plugin marketplace list --json`. If the `spectre` marketplace is absent, add this checkout with `codex plugin marketplace add "$PWD"`. If it exists, require it to be a directory marketplace whose real path is `$PWD`; stop rather than refreshing a different marketplace. Do not run `codex plugin marketplace upgrade` for this local source: Codex only upgrades Git marketplaces and reads directory marketplaces directly.
2. A local marketplace source does not replace an installed same-version plugin. If `spectre@spectre` is installed at user scope, remove its cached install, then reinstall it. If it is not installed, install it directly:

   ```bash
   codex plugin remove spectre@spectre
   codex plugin add spectre@spectre
   ```

3. Run `codex plugin list --json` and require exactly one enabled user-scope `spectre@spectre` entry whose version matches `plugins/spectre-codex/.codex-plugin/plugin.json`.
4. Resolve that entry's install/cache path and run:

   ```bash
   diff -qr "$PWD/plugins/spectre-codex" "$codex_install_path"
   ```

5. Run the bundled managed-agent repair and compare generated agents to the active Codex agent files:

   ```bash
   PLUGIN_ROOT="$PWD/plugins/spectre-codex" node "$PWD/plugins/spectre-codex/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
   for agent in "$PWD"/plugins/spectre-codex/agents/*.toml; do
     diff -q "$agent" "${CODEX_HOME:-$HOME/.codex}/agents/$(basename "$agent")"
   done
   node bin/spectre.js doctor codex --scope user --project-dir "$PWD"
   ```

Require doctor to exit successfully and report no legacy direct-install state. Treat any marketplace, install, JSON identity, version, enabled-state, byte-comparison, managed-agent comparison, or doctor failure as a failed deployment.
Existing Codex sessions may need a restart before newly installed or updated custom agents are available; report that as the only remaining interactive action.

### Claude Code

1. Run `claude plugin marketplace list --json`. If the `spectre` marketplace is absent, add this checkout with `claude plugin marketplace add "$PWD"`. If it exists, require it to be a directory marketplace whose real path is `$PWD`; stop rather than refreshing a different marketplace.
2. Refresh the marketplace source:

   ```bash
   claude plugin marketplace update spectre
   ```

3. Marketplace refresh does not replace an installed same-version plugin. If `spectre@spectre` is installed at user scope, remove its cached install while preserving data, then reinstall it. If it is not installed, install it directly:

   ```bash
   claude plugin uninstall spectre@spectre --scope user --keep-data --yes
   claude plugin install spectre@spectre --scope user
   ```

4. Run `claude plugin list --json` and require exactly one enabled user-scope `spectre@spectre` entry whose version matches `plugins/spectre/.claude-plugin/plugin.json`.
5. Resolve that entry's `installPath` and run:

   ```bash
   diff -qr "$PWD/plugins/spectre" "$spectre_install_path"
   ```

   A zero exit proves the installed plugin cache contains the current checkout bytes. Treat any marketplace, install, JSON identity, version, enabled-state, or byte-comparison failure as a failed deployment.
6. Existing Claude Code sessions still require `/reload-plugins`; report that as the only remaining interactive action.

## Local Mode

Local mode deploys the current checkout for this user's persistent local use. It does not publish anything.

1. Complete Shared Preflight.
2. Complete Persistent Local Install Refresh for both Codex and Claude Code.
3. Do not bump versions, commit, push, tag, create a GitHub release, or publish npm.
4. Finish with `Local deploy complete` and print the exact Codex and Claude Code commands executed from the Executed Local Install Commands section below as an audit record. Do not present them as work the user still needs to run.

## Public Mode

Public mode publishes a new version to GitHub and npm. It requires `patch`, `minor`, `major`, or an exact `X.Y.Z`.

### Version Contract

Bump these public version surfaces in sync:

- `package.json` -> `version`
- `.claude-plugin/marketplace.json` -> top-level `version` and `plugins[0].version`
- `plugins/spectre/.claude-plugin/plugin.json` -> `version`

Do not edit `plugins/spectre/.codex-plugin/plugin.json`; that stale Claude-root Codex manifest was removed. The Codex plugin manifest is generated under `plugins/spectre-codex/.codex-plugin/plugin.json`.

### Execution

1. Resolve the requested version and confirm `current -> next` with the user.
2. Inspect and commit relevant non-version changes first:
   - Stage explicit files only.
   - Use a descriptive implementation commit.
   - Leave unrelated dirty files untouched.
3. Complete Shared Preflight. If sync generated new `plugins/spectre-codex/` changes, inspect and commit them before continuing.
4. Update the three Version Contract surfaces and commit only those files with `release: vX.Y.Z`.
5. Require a clean release working tree, then run the complete release gate:

   ```bash
   node .claude/skills/verify-spectre/scripts/verify.mjs --release
   ```

   This must pass before creating or pushing a tag. In particular, npm authentication must be proven before irreversible release actions.

6. Complete Persistent Local Install Refresh for both Codex and Claude Code from the release checkout.

7. Build a concise user-facing changelog from commits since the previous tag. Use only non-empty `New`, `Changed`, `Fixed`, and `Removed` sections. Ask the user to approve the changelog.
8. Create `vX.Y.Z`, then ask before running:

   ```bash
   git push
   git push --tags
   ```

9. Create the GitHub release:

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <changelog-file>
   ```

10. Hand npm publication to the user. Do not run `npm login` or `npm publish` on their behalf:

    ```bash
    npm login
    npm publish --access public
    ```

    If npm requires an OTP:

    ```bash
    npm publish --access public --otp=<code>
    ```

    Wait for confirmation that publication succeeded.

11. Verify the exact public package and refresh global Codex from that package:

    ```bash
    npm view @codename_inc/spectre@X.Y.Z version
    codex plugin marketplace upgrade spectre
    codex plugin remove spectre@spectre
    codex plugin add spectre@spectre
    npx --yes @codename_inc/spectre@X.Y.Z doctor codex --scope user
    ```

12. Finish with `Public release complete: vX.Y.Z`. Include the commit, tag, GitHub release URL, npm package, checks run, and both command sections below.

## Final Command Record

### Executed Local Install Commands

Always print the exact command branch executed at the end of either mode as an audit record of commands the workflow already ran. The user does not need to rerun them. Do not print both the one-time and refresh branches unless both were actually executed.

Codex, one-time persistent user-level native plugin install from this checkout:

```bash
codex plugin marketplace add "$PWD"
codex plugin add spectre@spectre
PLUGIN_ROOT="$PWD/plugins/spectre-codex" node "$PWD/plugins/spectre-codex/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
for agent in "$PWD"/plugins/spectre-codex/agents/*.toml; do
  diff -q "$agent" "${CODEX_HOME:-$HOME/.codex}/agents/$(basename "$agent")"
done
node bin/spectre.js doctor codex --scope user --project-dir "$PWD"
```

Codex, refresh an existing persistent user-level install from the configured local `spectre` directory marketplace:

```bash
codex plugin remove spectre@spectre
codex plugin add spectre@spectre
PLUGIN_ROOT="$PWD/plugins/spectre-codex" node "$PWD/plugins/spectre-codex/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
for agent in "$PWD"/plugins/spectre-codex/agents/*.toml; do
  diff -q "$agent" "${CODEX_HOME:-$HOME/.codex}/agents/$(basename "$agent")"
done
node bin/spectre.js doctor codex --scope user --project-dir "$PWD"
```

Then restart an existing Codex session if newly installed or updated `spectre_*` custom agents are not visible yet. The remove/add is intentional: Codex's version cache can skip same-version local source changes.

Claude Code, one-time persistent user-level install from this checkout:

```bash
claude plugin marketplace add "$PWD"
claude plugin install spectre@spectre --scope user
```

Claude Code, refresh an existing persistent user-level install from the configured local `spectre` directory marketplace:

```bash
claude plugin marketplace update spectre
claude plugin uninstall spectre@spectre --scope user --keep-data --yes
claude plugin install spectre@spectre --scope user
```

Then run `/reload-plugins` in an existing Claude Code session. The uninstall/install is intentional: Claude's version cache can skip same-version local source changes.

### Public Install Commands

Print this section only after Public Mode completes successfully.

Codex, fresh user-level install or update from the exact published native plugin:

```bash
# Fresh install
codex plugin marketplace add Codename-Inc/spectre
codex plugin add spectre@spectre

# Existing install
codex plugin marketplace upgrade spectre
codex plugin remove spectre@spectre
codex plugin add spectre@spectre
```

Claude Code, fresh public install:

```text
/plugin marketplace add Codename-Inc/spectre
/plugin install spectre@spectre
```

Claude Code, update an existing public install:

```text
/plugin marketplace update spectre
/plugin update spectre@spectre
/reload-plugins
```

## Escalate If

- Local mode would require a public side effect: stop rather than broadening scope.
- Public mode has no version argument: ask for one.
- Version surfaces disagree, release gates fail, npm authentication is missing, or the tag already exists: stop before tagging.
- Push, GitHub release, npm publish, exact-package verification, local Codex or Claude refresh, installed-byte comparison, managed-agent comparison, or doctor fails: fix if local and in scope; otherwise report the blocker precisely.

---
name: release
description: Switch persistent Spectre installs between this checkout and the public marketplace, deploy the checkout for local testing, or run the full public GitHub marketplace release workflow. Use when asked to activate local or public Spectre, deploy or refresh local installs, release Spectre, publish a version, or ship Spectre publicly.
user-invocable: true
---

# Release

Internal Spectre deployment workflow. Keep local deployment and public release as explicit, separate modes.

## Arguments

Supported invocations:

```text
activate local
activate public
local
public patch
public minor
public major
public X.Y.Z
```

Treat `$ARGUMENTS` as one of these forms. `local` is the backward-compatible alias for `activate local`. `activate public` switches installed sources but does not publish; `public <version>` publishes a release. If the first argument is missing or invalid, ask which mode to run. Never infer or default to a public release.

## Shared Preflight

1. Run `git status --short` and inspect relevant staged and unstaged diffs.
2. Run:

   ```bash
   npm run sync-codex -- --quiet
   npm run sync-codex -- --check --quiet
   node .agents/skills/verify-spectre/scripts/verify.mjs
   ```

3. Stop and fix any sync, test, structure, Codex, or real-CLI failure before deploying.
4. Never stage unrelated files or use `git add -A`.

## Persistent Local Source Activation

`activate local`, `local`, and Public Mode's pre-release deployment activate persistent user-level installs from this checkout. These commands are deployment actions, not a handoff for the user to finish.

Before changing anything, run all four inventory commands and retain their JSON for the final source report:

```bash
codex plugin marketplace list --json
codex plugin list --json
claude plugin marketplace list --json
claude plugin list --json
```

The local and public catalogs intentionally share marketplace name `spectre` and plugin identity `spectre@spectre`; they are alternatives, not side-by-side installs. Mutate only that exact marketplace and plugin. For Claude Code, mutate only user scope. Never remove a project/local-scope declaration; stop if one shadows the requested user source or leaves another enabled `spectre@spectre` install.

### Codex

1. Inspect the `spectre` marketplace. If absent, add this checkout. If its source is not a local path whose real path is `$PWD`, remove the installed plugin if present, remove only the conflicting marketplace, and add this checkout:

   ```bash
   codex plugin remove spectre@spectre
   codex plugin marketplace remove spectre
   codex plugin marketplace add "$PWD"
   ```

   Run only the applicable commands: do not call `plugin remove` when the plugin is absent or `marketplace remove` when the marketplace is absent. Do not run `codex plugin marketplace upgrade` for the requested local source; Codex only upgrades Git marketplaces and reads local marketplaces directly.
2. A local marketplace source does not replace an installed same-version plugin. If `spectre@spectre` remains installed, remove its cached install, then reinstall it. If it is absent, install it directly:

   ```bash
   codex plugin remove spectre@spectre
   codex plugin add spectre@spectre
   ```

3. Rerun both Codex JSON inventory commands. Require exactly one marketplace named `spectre` with `marketplaceSource.sourceType == "local"` and a source whose real path is `$PWD`. Require exactly one enabled `spectre@spectre` entry whose marketplace source is that same local path and whose version matches `plugins/spectre-codex/.codex-plugin/plugin.json`.
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

1. Inspect the `spectre` marketplace. If absent, add this checkout at user scope. If its source is not a directory whose real path is `$PWD`, uninstall the user plugin if present, remove only the user marketplace declaration, and add this checkout:

   ```bash
   claude plugin uninstall spectre@spectre --scope user --keep-data --yes
   claude plugin marketplace remove spectre --scope user
   claude plugin marketplace add "$PWD" --scope user
   ```

   Run only the applicable commands. If removal exposes a project/local marketplace named `spectre`, stop instead of removing it.
2. Refresh the active local marketplace source:

   ```bash
   claude plugin marketplace update spectre
   ```

3. Marketplace refresh does not replace an installed same-version plugin. If `spectre@spectre` is installed at user scope, remove its cached install while preserving data, then reinstall it. If it is not installed, install it directly:

   ```bash
   claude plugin uninstall spectre@spectre --scope user --keep-data --yes
   claude plugin install spectre@spectre --scope user
   ```

4. Rerun both Claude JSON inventory commands. Require exactly one effective marketplace named `spectre` with `source == "directory"` and a path whose real path is `$PWD`. Require exactly one enabled user-scope `spectre@spectre` entry, no project/local-scope Spectre install, and a version matching `plugins/spectre/.claude-plugin/plugin.json`.
5. Resolve that entry's `installPath` and run:

   ```bash
   diff -qr "$PWD/plugins/spectre" "$spectre_install_path"
   ```

   A zero exit proves the installed plugin cache contains the current checkout bytes. Treat any marketplace, install, JSON identity, version, enabled-state, or byte-comparison failure as a failed deployment.
6. Existing Claude Code sessions still require `/reload-plugins`; report that as the only remaining interactive action.

## Persistent Public Source Activation

`activate public` switches persistent user-level installs to `joenandez/spectre` without creating a version, commit, tag, push, or GitHub release. It does not install from the current checkout.

Run the four inventory commands from Persistent Local Source Activation before changing anything. Apply the same exact-identity and Claude user-scope guards.

### Codex

1. If the current `spectre` marketplace is absent, add `joenandez/spectre`. If it is not a Git marketplace normalized to `https://github.com/joenandez/spectre.git`, remove the installed plugin if present, remove only the conflicting marketplace, and add the public marketplace:

   ```bash
   codex plugin remove spectre@spectre
   codex plugin marketplace remove spectre
   codex plugin marketplace add joenandez/spectre
   ```

   Run only the applicable commands. If the public marketplace is already configured, refresh it with `codex plugin marketplace upgrade spectre` instead of removing it.
2. Remove any remaining cached `spectre@spectre` install and reinstall it from the active marketplace:

   ```bash
   codex plugin remove spectre@spectre
   codex plugin add spectre@spectre
   ```

3. Rerun both Codex JSON inventory commands. Require exactly one marketplace named `spectre`, with `marketplaceSource.sourceType == "git"` and a source normalized to `https://github.com/joenandez/spectre.git`. Require exactly one enabled `spectre@spectre` entry tied to that marketplace.
4. Resolve the marketplace `root`, the plugin source declared by its `.agents/plugins/marketplace.json`, and the installed plugin source/cache path. Require the installed version to match the public marketplace and plugin manifests, then run `diff -qr` between the resolved marketplace plugin root and installed plugin root.
5. Run `ensure-codex-agents.mjs --ensure --json` from the resolved installed public plugin root and compare every bundled agent TOML to `${CODEX_HOME:-$HOME/.codex}/agents/`. Any source, identity, enabled-state, version, byte, or managed-agent mismatch fails activation.

### Claude Code

1. If the current `spectre` marketplace is absent, add `joenandez/spectre` at user scope. If it is not the GitHub marketplace `joenandez/spectre`, uninstall the user plugin if present, remove only the user marketplace declaration, and add the public marketplace:

   ```bash
   claude plugin uninstall spectre@spectre --scope user --keep-data --yes
   claude plugin marketplace remove spectre --scope user
   claude plugin marketplace add joenandez/spectre --scope user
   ```

   Run only the applicable commands. If removal exposes a project/local marketplace named `spectre`, stop instead of removing it. If the public marketplace is already configured, refresh it with `claude plugin marketplace update spectre` instead of removing it.
2. Remove any remaining cached user install while preserving data, then reinstall it from the active marketplace:

   ```bash
   claude plugin uninstall spectre@spectre --scope user --keep-data --yes
   claude plugin install spectre@spectre --scope user
   ```

3. Rerun both Claude JSON inventory commands. Require exactly one effective marketplace named `spectre`, with `source == "github"` and `repo == "joenandez/spectre"`. Require exactly one enabled user-scope `spectre@spectre` entry and no project/local-scope Spectre install.
4. Resolve the marketplace `installLocation`, the plugin source declared by its `.claude-plugin/marketplace.json`, and the installed entry's `installPath`. Require the installed version to match the public marketplace and plugin manifests, then run `diff -qr` between the resolved marketplace plugin root and `installPath`. Any source, identity, scope, enabled-state, version, or byte mismatch fails activation.
5. Existing Claude Code sessions require `/reload-plugins`; report that as the only remaining interactive action.

## Activation Mode

- `activate local`: complete Shared Preflight, then Persistent Local Source Activation.
- `activate public`: complete Persistent Public Source Activation. Do not run checkout preflight as proof of public bytes; verify against the fetched public marketplace snapshot instead.

Neither activation mode bumps versions, commits, pushes, tags, creates a GitHub release, or publishes npm. Finish with `Local source active` or `Public source active`, then report for each runtime the normalized marketplace source, installed identity/version/scope, byte-comparison result, and exact mutation commands actually executed.

## Local Mode

`local` is retained as an alias for `activate local`. Follow Activation Mode exactly and do not present its executed commands as work the user still needs to run.

## Public Mode

Public mode publishes a new version to GitHub for the Claude Code and Codex marketplaces. It requires `patch`, `minor`, `major`, or an exact `X.Y.Z`.

A valid public invocation authorizes the resolved version bump, commits, local tag creation, pushes, and GitHub release publication. Do not ask for separate version, tag, push, or publication confirmation. The release-notes approval in Execution step 7 is the only user approval gate after invocation.

### Version Contract

Bump these public version surfaces in sync:

- `package.json` -> `version`
- `.claude-plugin/marketplace.json` -> top-level `version` and `plugins[0].version`
- `.agents/plugins/marketplace.json` -> top-level `version` and `plugins[0].version`
- `plugins/spectre/.claude-plugin/plugin.json` -> `version`

Do not edit `plugins/spectre/.codex-plugin/plugin.json`; that stale Claude-root Codex manifest was removed. The Codex plugin manifest is generated under `plugins/spectre-codex/.codex-plugin/plugin.json`.

### Execution

1. Resolve and report `current -> next`; continue without a confirmation gate.
2. Inspect and commit relevant non-version changes first:
   - Stage explicit files only.
   - Use a descriptive implementation commit.
   - Leave unrelated dirty files untouched.
3. Complete Shared Preflight. If sync generated new `plugins/spectre-codex/` changes, inspect and commit them before continuing.
4. Update the four Version Contract files and commit only those files with `release: vX.Y.Z`.
5. Require a clean release working tree, then run the complete release gate:

   ```bash
   node .agents/skills/verify-spectre/scripts/verify.mjs --release
   ```

   This must pass before creating or pushing a tag. In particular, GitHub authentication must be proven before irreversible release actions.

6. Complete Persistent Local Source Activation for both Codex and Claude Code from the release checkout.

7. Build a concise user-facing changelog from commits since the previous tag. Use only non-empty `New`, `Changed`, `Fixed`, and `Removed` sections. Ask the user to approve the changelog.
8. After changelog approval, create `vX.Y.Z` and run:

   ```bash
   git push
   git push --tags
   ```

9. Create the GitHub release:

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <changelog-file>
   ```

10. Verify the exact public tag and GitHub release:

    ```bash
    git ls-remote --exit-code origin refs/tags/vX.Y.Z
    gh release view vX.Y.Z --json url,tagName,targetCommitish
    ```

11. Finish with `Public release complete: vX.Y.Z`. Include the commit, tag, GitHub release URL, marketplace versions, checks run, the exact local activation commands executed, and the public consumer commands below.

## Final Command Record

Always print the exact mutation command branch executed at the end of Activation, Local, or Public Mode as an audit record. The user does not need to rerun it. Do not print templates or branches that did not run.

### Local Source Command Branches

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

Codex, switch an existing public source to this checkout:

```bash
codex plugin remove spectre@spectre
codex plugin marketplace remove spectre
codex plugin marketplace add "$PWD"
codex plugin add spectre@spectre
```

Codex, refresh an existing persistent user-level install from the configured local `spectre` marketplace:

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
claude plugin marketplace add "$PWD" --scope user
claude plugin install spectre@spectre --scope user
```

Claude Code, switch an existing public source to this checkout:

```bash
claude plugin uninstall spectre@spectre --scope user --keep-data --yes
claude plugin marketplace remove spectre --scope user
claude plugin marketplace add "$PWD" --scope user
claude plugin marketplace update spectre
claude plugin install spectre@spectre --scope user
```

Claude Code, refresh an existing persistent user-level install from the configured local `spectre` directory marketplace:

```bash
claude plugin marketplace update spectre
claude plugin uninstall spectre@spectre --scope user --keep-data --yes
claude plugin install spectre@spectre --scope user
```

Then run `/reload-plugins` in an existing Claude Code session. The uninstall/install is intentional: Claude's version cache can skip same-version local source changes.

### Public Source Command Branches

Codex, one-time install from the public marketplace:

```bash
codex plugin marketplace add joenandez/spectre
codex plugin add spectre@spectre
```

Codex, switch this checkout or another source to the public marketplace:

```bash
codex plugin remove spectre@spectre
codex plugin marketplace remove spectre
codex plugin marketplace add joenandez/spectre
codex plugin add spectre@spectre
```

Codex, refresh an already configured public marketplace:

```bash
codex plugin marketplace upgrade spectre
codex plugin remove spectre@spectre
codex plugin add spectre@spectre
```

Claude Code, one-time user-level install from the public marketplace:

```bash
claude plugin marketplace add joenandez/spectre --scope user
claude plugin install spectre@spectre --scope user
```

Claude Code, switch this checkout or another user source to the public marketplace:

```bash
claude plugin uninstall spectre@spectre --scope user --keep-data --yes
claude plugin marketplace remove spectre --scope user
claude plugin marketplace add joenandez/spectre --scope user
claude plugin install spectre@spectre --scope user
```

Claude Code, refresh an already configured public marketplace:

```bash
claude plugin marketplace update spectre
claude plugin uninstall spectre@spectre --scope user --keep-data --yes
claude plugin install spectre@spectre --scope user
```

Then run `/reload-plugins` in an existing Claude Code session.

### Public Consumer Commands

Print this section only after Public Mode completes successfully.

Codex, fresh user-level install or update from the exact published native plugin:

```bash
# Fresh install
codex plugin marketplace add joenandez/spectre
codex plugin add spectre@spectre

# Existing install
codex plugin marketplace upgrade spectre
codex plugin remove spectre@spectre
codex plugin add spectre@spectre
```

Claude Code, fresh public install:

```text
/plugin marketplace add joenandez/spectre
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
- Source activation reveals a project/local-scope Claude marketplace or plugin that conflicts with the requested user source: stop without removing that broader-scope state.
- Public mode has no version argument: ask for one.
- Version surfaces disagree, release gates fail, GitHub authentication is missing, or the tag already exists: stop before tagging.
- Push, GitHub release, remote tag/release verification, source activation, installed-byte comparison, managed-agent comparison, or doctor fails: fix if local and in scope; otherwise report the blocker precisely.

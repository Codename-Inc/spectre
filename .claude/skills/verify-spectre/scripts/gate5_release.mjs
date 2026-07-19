#!/usr/bin/env node
/**
 * Gate 5 — Release readiness.
 *
 * Only run when publishing. Each check here corresponds to a way a past release
 * actually went wrong: a stale Codex mirror shipped, versions drifting between
 * the three manifests, and npm auth (E401) discovered only after the tag was
 * already pushed — which is the expensive one, because it leaves the repo
 * tagged for a version that isn't on npm.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Gate, REPO, run } from './lib.mjs';

const g = new Gate('5 release');

// --- clean tree -------------------------------------------------------------
const status = run('git', ['status', '--porcelain']);
const dirty = status.stdout.split('\n').filter(Boolean);
g.check(dirty.length === 0, 'working tree is clean',
  `uncommitted: ${dirty.slice(0, 8).map((l) => l.trim()).join(', ')}`);

// --- mirror in sync ---------------------------------------------------------
const sync = run('npm', ['run', 'sync-codex', '--', '--check']);
g.check(sync.code === 0, 'Codex mirror is in sync', 'run `npm run sync-codex` and commit before releasing');

// --- version coherence ------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const marketplace = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8'));
const plugin = JSON.parse(fs.readFileSync(path.join(REPO, 'plugins', 'spectre', '.claude-plugin', 'plugin.json'), 'utf8'));

const versions = [pkg.version, marketplace.version, marketplace.plugins?.[0]?.version, plugin.version];
g.check(new Set(versions).size === 1, 'all version fields agree', `found: ${versions.join(', ')}`);

const version = pkg.version;

// --- tag is free ------------------------------------------------------------
const tags = run('git', ['tag', '--list', `v${version}`]);
g.check(tags.stdout.trim() === '', `tag v${version} does not already exist`,
  'this version was already tagged — bump before releasing');

// --- npm auth, BEFORE anything irreversible ---------------------------------
// The whole point of checking here: a failed `npm publish` after `git push --tags`
// leaves a tag pointing at a version nobody can install.
const whoami = run('npm', ['whoami']);
g.check(whoami.code === 0, 'npm is authenticated',
  'npm whoami failed (E401) — run `npm login` BEFORE tagging, or the tag will outlive a failed publish');

g.check(Boolean(pkg.name), 'package name is set');
process.stdout.write(`\n  releasing: ${pkg.name}@${version}\n\n`);

g.done();

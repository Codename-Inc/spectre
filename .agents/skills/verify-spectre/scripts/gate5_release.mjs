#!/usr/bin/env node
/**
 * Gate 5 — Release readiness.
 *
 * Only run when publishing. Each check here corresponds to a way a past release
 * actually went wrong: a stale Codex mirror shipped, versions drifting between
 * marketplace manifests, and missing GitHub authentication discovered only
 * after release preparation had completed.
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
const claudeMarketplace = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8'));
const codexMarketplace = JSON.parse(fs.readFileSync(path.join(REPO, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
const claudePlugin = JSON.parse(fs.readFileSync(path.join(REPO, 'plugins', 'spectre', '.claude-plugin', 'plugin.json'), 'utf8'));
const codexPlugin = JSON.parse(fs.readFileSync(path.join(REPO, 'plugins', 'spectre-codex', '.codex-plugin', 'plugin.json'), 'utf8'));

const versions = [
  pkg.version,
  claudeMarketplace.version,
  claudeMarketplace.plugins?.[0]?.version,
  codexMarketplace.version,
  codexMarketplace.plugins?.[0]?.version,
  claudePlugin.version,
  codexPlugin.version,
];
g.check(new Set(versions).size === 1, 'all marketplace and plugin version fields agree',
  `found: ${versions.join(', ')}`);

const version = pkg.version;

// --- tag is free ------------------------------------------------------------
const tags = run('git', ['tag', '--list', `v${version}`]);
g.check(tags.stdout.trim() === '', `tag v${version} does not already exist`,
  'this version was already tagged — bump before releasing');

// --- GitHub auth, BEFORE anything irreversible ------------------------------
const githubAuth = run('gh', ['auth', 'status']);
g.check(githubAuth.code === 0, 'GitHub CLI is authenticated',
  'gh auth status failed — authenticate GitHub before tagging or creating the release');

process.stdout.write(`\n  releasing: v${version} via GitHub marketplaces\n\n`);

g.done();

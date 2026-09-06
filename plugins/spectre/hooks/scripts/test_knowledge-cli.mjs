#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { refreshKnowledgeIndex } from './knowledge/records.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const NPM_CLI = path.join(REPOSITORY_ROOT, 'bin', 'spectre.js');
const BUNDLED_CLI = path.join(SCRIPT_DIR, 'knowledge-cli.mjs');

function typedRecord(id, tags = ['cli-test']) {
  return {
    schemaVersion: 1, id, kind: 'knowledge', title: 'Public CLI record',
    summary: 'Typed fixture for public CLI parity.', tags, applicability: { scope: 'project' },
    provenance: { origin: 'captured', capturedAt: '2026-09-06T00:00:00.000Z' },
    relatedRecordIds: [], category: 'pattern', useWhen: 'Testing public knowledge callers.',
    content: 'SPECTRE_TYPED_CLI_SENTINEL', evidence: 'A typed CLI test fixture.', status: 'active',
  };
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectDir = path.join(root, 'project');
  const spectreHome = path.join(root, 'spectre-home');
  fs.mkdirSync(projectDir, { recursive: true });
  const { storePath } = await resolveProjectStore(projectDir, { spectreHome });
  const id = 'typed-cli-record';
  const recordPath = path.join(storePath, 'knowledge', id, 'record.json');
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(typedRecord(id), null, 2)}\n`);
  fs.writeFileSync(path.join(storePath, 'tags.json'), JSON.stringify({
    schemaVersion: 1,
    tags: { 'cli-test': { description: 'Public CLI test coverage.', aliases: ['cli'] } },
    redirects: {},
  }, null, 2));
  refreshKnowledgeIndex(storePath);
  return { root, projectDir, spectreHome, storePath, id };
}

function run(kind, args, value) {
  const command = kind === 'npm' ? NPM_CLI : BUNDLED_CLI;
  const prefix = kind === 'npm' ? ['knowledge'] : [];
  return spawnSync(process.execPath, [command, ...prefix, ...args, '--project-dir', value.projectDir, '--json'], {
    cwd: value.projectDir, env: { ...process.env, SPECTRE_HOME: value.spectreHome }, encoding: 'utf8',
  });
}

function output(result) {
  assert.notEqual(result.stdout.trim(), '', result.stderr);
  return JSON.parse(result.stdout);
}

describe('typed public knowledge CLI parity', () => {
  it('sends repeated tags and paths to equivalent search callers, then exact-loads the typed package', async (t) => {
    const value = await fixture(t);
    const args = ['search', 'public CLI', '--tag', 'cli', '--tag', 'cli-test', '--path', 'src', '--path', 'plugins'];
    const bundled = run('bundled', args, value);
    const npm = run('npm', args, value);
    assert.equal(bundled.status, 0, bundled.stderr);
    assert.equal(npm.status, 0, npm.stderr);
    assert.deepEqual(output(bundled), output(npm));
    assert.deepEqual(output(npm).results.map(result => result.id), [value.id]);

    for (const kind of ['bundled', 'npm']) {
      const loaded = run(kind, ['load', value.id, '--work-id', 'work-cli', '--run-id', 'run-cli', '--allowance-tokens', '1500'], value);
      assert.equal(loaded.status, 0, loaded.stderr);
      assert.equal(output(loaded).record.content, 'SPECTRE_TYPED_CLI_SENTINEL');
    }
  });

  it('has matching safe JSON failures and forwards guarded registration revision', async (t) => {
    const value = await fixture(t);
    for (const kind of ['bundled', 'npm']) {
      const missing = run(kind, ['inspect', value.id], value);
      assert.equal(missing.status, 1);
      assert.equal(output(missing).code, 'KNOWLEDGE_INVALID');
    }
    const proposal = path.join(value.root, 'proposal', 'typed-cli-record');
    fs.mkdirSync(proposal, { recursive: true });
    fs.writeFileSync(path.join(proposal, 'record.json'), JSON.stringify(typedRecord(value.id, ['replacement'])));
    for (const kind of ['bundled', 'npm']) {
      const rejected = run(kind, ['register', '--record', proposal, '--expected-revision', 'sha256:0000000000000000000000000000000000000000000000000000000000000000'], value);
      assert.equal(rejected.status, 1);
      assert.equal(output(rejected).code, 'KNOWLEDGE_REVISION_CONFLICT');
    }
  });
});

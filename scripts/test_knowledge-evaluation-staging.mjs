import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { stageKnowledgeCell } from './knowledge-evaluation-staging.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-evaluation-staging-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    fixture: {
      task: 'Plan the staged migration.',
      initialFacts: [{ id: 'staged-fact', content: 'Keep both ledgers until reconciliation passes.' }],
    },
    options: { repositoryRoot: REPOSITORY_ROOT, temporaryRoot: root },
  };
}

test('stages valid candidate records through the real CLI and native host surfaces', async (t) => {
  const value = fixture(t);
  for (const host of ['claude', 'codex']) {
    const staged = await stageKnowledgeCell({ condition: 'candidate', host }, value.fixture, value.options);
    assert.equal(staged.freshStore, true);
    assert.equal(staged.probe.search.status, 0, staged.probe.search.stderr);
    assert.equal(staged.probe.load.status, 0, staged.probe.load.stderr);
    assert.equal(staged.probe.search.result.results[0].id, 'staged-fact');
    assert.equal(staged.probe.load.result.record?.id ?? staged.probe.load.result.id, 'staged-fact');
    assert.equal(staged.knownPaths.some((entry) => entry.endsWith('/knowledge/staged-fact/record.json')), true);
    assert.equal(fs.existsSync(path.join(staged.projectDir, '.git')), true);
    assert.equal(fs.existsSync(path.join(staged.pluginDir, 'hooks', 'hooks.json')), true);
    if (host === 'codex') {
      assert.equal(fs.existsSync(path.join(staged.codexHome, 'hooks.json')), true);
      assert.match(fs.readFileSync(path.join(staged.codexHome, 'config.toml'), 'utf8'), /hooks = true/);
    }
  }
});

test('stages the pinned baseline as SKILL.md and verifies its own archived runtime', async (t) => {
  const value = fixture(t);
  const staged = await stageKnowledgeCell({ condition: 'baseline', host: 'claude' }, value.fixture, value.options);
  const skillPath = staged.knownPaths[0];
  assert.equal(staged.provenance.baselineRef, '1cd1f035a253e9d7ef5086693ab9f1d0b11d360b');
  assert.match(staged.provenance.sourceHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(skillPath), true);
  assert.equal(fs.existsSync(path.join(path.dirname(skillPath), 'record.json')), false);
  assert.equal(staged.probe.search.status, 0, staged.probe.search.stderr);
  assert.equal(staged.probe.load.status, 0, staged.probe.load.stderr);
  assert.equal(staged.probe.load.result.record?.id ?? staged.probe.load.result.id, 'staged-fact');
});

test('no-knowledge stages normal repository evidence without a Spectre plugin or store', async (t) => {
  const value = fixture(t);
  const staged = await stageKnowledgeCell({ condition: 'no-knowledge', host: 'codex' }, value.fixture, value.options);
  assert.equal(staged.pluginDir, null);
  assert.equal(staged.storeDir, null);
  assert.equal(staged.knownPaths.length, 0);
  assert.equal(fs.existsSync(path.join(staged.projectDir, '.git')), true);
  assert.equal(fs.existsSync(path.join(staged.projectDir, 'TASK.md')), true);
  assert.equal(fs.existsSync(path.join(staged.root, 'plugin')), false);
  assert.equal(fs.existsSync(path.join(staged.root, 'spectre-home')), false);
});

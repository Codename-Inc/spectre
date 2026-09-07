import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { blockKnowledgeRegistration, snapshotKnowledgeCell, stageKnowledgeCell } from './knowledge-evaluation-staging.mjs';

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

test('restores pristine activity after preflight and snapshots bounded durable evidence', async (t) => {
  const value = fixture(t);
  const staged = await stageKnowledgeCell({ condition: 'candidate', host: 'claude' }, value.fixture, value.options);
  const snapshot = snapshotKnowledgeCell(staged);

  assert.deepEqual(snapshot.activity.records, {});
  assert.deepEqual(snapshot.activity.search, { matches: 0, misses: 0, recordMatches: {} });
  assert.deepEqual(snapshot.records, [{
    id: 'staged-fact', kind: 'knowledge', revisionToken: snapshot.records[0].revisionToken,
    status: 'active', applicability: { scope: 'project' },
  }]);
  assert.deepEqual(snapshot.workRecords, []);
  assert.match(snapshot.records[0].revisionToken, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(snapshot.history, []);
  assert.equal(JSON.stringify(snapshot).includes(staged.storePath), false);
  assert.equal(JSON.stringify(snapshot).includes('Keep both ledgers'), false);
});

test('stages imported work, scoped disputed knowledge, retired status, and tag aliases as real records', async (t) => {
  const value = fixture(t);
  value.fixture.initialFacts = [
    { id: 'legacy-work', kind: 'work', content: 'Historic work source.', tags: ['migration'], aliases: ['migrate'], applicability: { scope: 'work', workId: 'migration-42' } },
    { id: 'unverified-mobile', content: 'Confirm device evidence.', status: 'disputed', tags: ['mobile'], applicability: { scope: 'work', workId: 'mobile-7' } },
    { id: 'retired-pattern', content: 'Prior pattern was replaced.', status: 'superseded', tags: ['retired'] },
  ];
  const staged = await stageKnowledgeCell({ condition: 'candidate', host: 'codex' }, value.fixture, value.options);
  const snapshot = snapshotKnowledgeCell(staged);
  const byId = Object.fromEntries(snapshot.records.map(record => [record.id, record]));
  const catalog = JSON.parse(fs.readFileSync(path.join(staged.storePath, 'tags.json'), 'utf8'));

  assert.deepEqual(byId['legacy-work'].applicability, { scope: 'work', workId: 'migration-42' });
  assert.deepEqual(byId['legacy-work'].lifecycle, {
    execution: 'unknown', verification: 'unknown', pullRequest: 'unknown',
    associations: { sourceRunIds: [], pullRequestIds: [], candidates: [] },
  });
  assert.deepEqual(snapshot.workRecords, [{
    id: 'legacy-work', revisionToken: byId['legacy-work'].revisionToken,
    execution: 'unknown', verification: 'unknown', pullRequest: 'unknown',
  }]);
  assert.equal(byId['unverified-mobile'].status, 'disputed');
  assert.deepEqual(byId['unverified-mobile'].applicability, { scope: 'work', workId: 'mobile-7' });
  assert.equal(byId['retired-pattern'].status, 'superseded');
  assert.deepEqual(catalog.tags.migration.aliases, ['migrate']);
});


test('stages the same feature branch, base ref, and Execute fixture for every condition', async (t) => {
  const value = fixture(t);
  for (const condition of ['candidate', 'baseline', 'no-knowledge']) {
    const staged = await stageKnowledgeCell({ condition, host: 'claude' }, value.fixture, value.options);
    const branch = spawnSync('git', ['branch', '--show-current'], { cwd: staged.projectDir, encoding: 'utf8' });
    const base = spawnSync('git', ['merge-base', 'origin/main', 'HEAD'], { cwd: staged.projectDir, encoding: 'utf8' });
    const featureCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: staged.projectDir, encoding: 'utf8' });

    assert.equal(branch.stdout.trim(), 'evaluation/knowledge-cell');
    assert.equal(base.status, 0, base.stderr);
    assert.notEqual(base.stdout.trim(), featureCommit.stdout.trim());
    assert.equal(fs.existsSync(path.join(staged.repository.originDir, 'HEAD')), true);
    assert.equal(fs.existsSync(path.join(staged.repository.featureRoot, 'specs', 'execute.md')), true);
    assert.equal(fs.existsSync(path.join(staged.repository.featureRoot, 'specs', 'tasks.json')), true);
  }
});

test('can force an actual registration failure without blocking existing reads', async (t) => {
  const value = fixture(t);
  const staged = await stageKnowledgeCell({ condition: 'candidate', host: 'claude' }, value.fixture, value.options);
  const proposal = path.join(staged.root, 'write-failure-probe');
  fs.mkdirSync(proposal);
  const record = JSON.parse(fs.readFileSync(staged.knownPaths[0], 'utf8'));
  record.id = 'write-failure-probe';
  record.title = 'write-failure-probe';
  fs.writeFileSync(path.join(proposal, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
  const fault = blockKnowledgeRegistration(staged);
  try {
    const environment = { ...process.env, SPECTRE_HOME: staged.storeDir };
    const failedSave = spawnSync(process.execPath, [staged.cliPath, 'register', '--record', proposal, '--project-dir', staged.projectDir, '--json'], { cwd: staged.projectDir, env: environment, encoding: 'utf8' });
    const readExisting = spawnSync(process.execPath, [staged.cliPath, 'load', 'staged-fact', '--project-dir', staged.projectDir, '--json'], { cwd: staged.projectDir, env: environment, encoding: 'utf8' });

    assert.notEqual(failedSave.status, 0);
    assert.match(JSON.parse(failedSave.stdout).code, /^(?:EACCES|EPERM|KNOWLEDGE_REGISTRATION_FAILED)$/);
    assert.equal(readExisting.status, 0, readExisting.stderr);
    assert.equal(JSON.parse(readExisting.stdout).record.id, 'staged-fact');
  } finally {
    fault.restore();
  }
});

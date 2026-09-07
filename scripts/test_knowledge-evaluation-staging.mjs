import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { blockKnowledgeRegistration, readSessionStartMeasurement, snapshotKnowledgeCell, stageKnowledgeCell } from './knowledge-evaluation-staging.mjs';

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

function runObservedSessionStart(staged) {
  const hooks = JSON.parse(fs.readFileSync(path.join(staged.pluginDir, 'hooks', 'hooks.json'), 'utf8'));
  const command = hooks.hooks.SessionStart.flatMap(group => group.hooks).map(hook => hook.command).find(value => value.includes('knowledge-host-probe-hook.mjs'));
  assert.ok(command, 'staged hook must use the observation wrapper');
  return spawnSync('/bin/sh', ['-lc', command], {
    cwd: staged.projectDir,
    env: { ...process.env, SPECTRE_HOME: staged.storeDir, CLAUDE_PROJECT_DIR: staged.projectDir, CLAUDE_PLUGIN_ROOT: staged.pluginDir, PLUGIN_ROOT: staged.pluginDir, CODEX_HOME: staged.codexHome || '' },
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: staged.projectDir, session_id: 'staging-test' }),
    encoding: 'utf8',
  });
}

test('stages valid candidate records through the real CLI and native host surfaces', async (t) => {
  const value = fixture(t);
  for (const host of ['claude', 'codex']) {
    const staged = await stageKnowledgeCell({ condition: 'candidate', host }, value.fixture, value.options);
    assert.equal(staged.freshStore, true);
    assert.equal(fs.statSync(staged.claudeHome).isDirectory(), true);
    assert.equal(fs.statSync(staged.codexHome).isDirectory(), true);
    assert.equal(fs.existsSync(path.join(staged.claudePluginDir, 'skills', 'spectre-capture', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(staged.codexPlugin.installedPath, 'skills', 'spectre-capture', 'SKILL.md')), true);
    assert.deepEqual(readSessionStartMeasurement(staged), { availability: 'unavailable', injectedTokens: null, injectedBytes: null });
    assert.equal(staged.probe.search.status, 0, staged.probe.search.stderr);
    assert.equal(staged.probe.load.status, 0, staged.probe.load.stderr);
    assert.equal(staged.probe.search.result.results[0].id, 'staged-fact');
    assert.equal(staged.probe.load.result.record?.id ?? staged.probe.load.result.id, 'staged-fact');
    assert.equal(staged.knownPaths.some((entry) => entry.endsWith('/knowledge/staged-fact/record.json')), true);
    assert.equal(fs.existsSync(path.join(staged.projectDir, '.git')), true);
    assert.equal(fs.existsSync(path.join(staged.pluginDir, 'hooks', 'hooks.json')), true);
    const sessionStart = runObservedSessionStart(staged);
    assert.equal(sessionStart.status, 0, sessionStart.stderr);
    assert.ok(JSON.parse(sessionStart.stdout).hookSpecificOutput.additionalContext);
    assert.equal(readSessionStartMeasurement(staged).availability, 'available');
    assert.equal(readSessionStartMeasurement(staged).availability, 'unavailable');
    if (host === 'codex') {
      assert.equal(staged.pluginDir, staged.codexPlugin.installedPath);
      assert.notEqual(staged.pluginDir, staged.sourcePluginDir);
      assert.equal(staged.codexPlugin.listing.installed[0].pluginId, 'spectre@evaluation');
      assert.match(fs.readFileSync(staged.codexPlugin.configPath, 'utf8'), /\[plugins\."spectre@evaluation"\]/);
      assert.equal(fs.existsSync(path.join(staged.codexHome, 'hooks.json')), false);
      assert.equal(fs.existsSync(path.join(staged.pluginDir, 'skills', 'spectre-capture', 'SKILL.md')), true);
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
  assert.deepEqual(readSessionStartMeasurement(staged), { availability: 'none', injectedTokens: 0, injectedBytes: 0 });
  assert.equal(staged.storeDir, null);
  assert.equal(staged.knownPaths.length, 0);
  assert.equal(fs.existsSync(path.join(staged.projectDir, '.git')), true);
  assert.equal(fs.existsSync(path.join(staged.projectDir, 'TASK.md')), true);
  assert.equal(fs.existsSync(path.join(staged.root, 'plugin')), false);
  assert.equal(fs.existsSync(path.join(staged.root, 'spectre-home')), false);
  assert.equal(fs.statSync(staged.claudeHome).isDirectory(), true);
  assert.equal(fs.statSync(staged.codexHome).isDirectory(), true);
  assert.equal(staged.claudePluginDir, null);
  assert.equal(staged.codexPlugin, null);
  assert.equal(fs.existsSync(path.join(staged.codexHome, 'plugins')), false);
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
    const neutralEvidence = fs.readFileSync(path.join(staged.projectDir, 'docs', 'task-context.md'), 'utf8');
    assert.match(neutralEvidence, /Keep both ledgers until reconciliation passes/);
    assert.equal(neutralEvidence.includes('knowledge/'), false);
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


test('adds neutral deterministic operational notes without publishing a repository catalog', async (t) => {
  const value = fixture(t);
  value.fixture.scaleDistractors = [10, 100];
  const staged = await stageKnowledgeCell({ condition: 'candidate', host: 'claude' }, value.fixture, value.options);
  const snapshot = snapshotKnowledgeCell(staged);
  const neutralEvidence = fs.readFileSync(path.join(staged.projectDir, 'docs', 'task-context.md'), 'utf8');

  assert.equal(snapshot.records.length, 101);
  assert.equal(snapshot.records.some(record => record.id === 'staged-fact'), true);
  assert.equal(snapshot.records.some(record => record.id === 'telemetry-checkpoint-00100'), true);
  assert.equal(neutralEvidence.includes('telemetry-checkpoint'), false);
  const recordBytes = fs.readFileSync(path.join(staged.storePath, 'knowledge', 'telemetry-checkpoint-00100', 'record.json'), 'utf8').toLocaleLowerCase();
  assert.equal(/distractor|irrelevant|unrelated/.test(recordBytes), false);
});


test('installs the frozen Codex baseline through its isolated marketplace', async (t) => {
  const value = fixture(t);
  const staged = await stageKnowledgeCell({ condition: 'baseline', host: 'codex' }, value.fixture, value.options);

  assert.equal(staged.codexPlugin.listing.installed[0].pluginId, 'spectre@evaluation');
  assert.equal(staged.pluginDir, staged.codexPlugin.installedPath);
  assert.equal(staged.probe.search.status, 0, staged.probe.search.stderr);
  assert.equal(staged.probe.load.status, 0, staged.probe.load.stderr);
  assert.deepEqual(readSessionStartMeasurement(staged), { availability: 'unavailable', injectedTokens: null, injectedBytes: null });
  assert.equal(fs.existsSync(path.join(staged.pluginDir, 'skills', 'spectre-execute', 'SKILL.md')), true);
});


test('stages a frozen historical baseline even when its retired discovery cannot inspect it', async (t) => {
  const value = fixture(t);
  value.fixture.initialFacts[0].status = 'archived';
  const staged = await stageKnowledgeCell({ condition: 'baseline', host: 'claude' }, value.fixture, value.options);

  assert.equal(staged.probe.historical, true);
  assert.equal(staged.probe.search.status, 0);
  assert.notEqual(staged.probe.load.status, 0);
});


test('keeps neutral facts outside the knowledge store when seedKnowledge is false', async (t) => {
  const value = fixture(t);
  value.fixture.initialFacts[0].seedKnowledge = false;
  const staged = await stageKnowledgeCell({ condition: 'candidate', host: 'claude' }, value.fixture, value.options);

  assert.equal(staged.probe, null);
  assert.deepEqual(snapshotKnowledgeCell(staged).records, []);
  assert.match(fs.readFileSync(path.join(staged.projectDir, 'docs', 'task-context.md'), 'utf8'), /Keep both ledgers/);
});


test('stages the opposing provider plugin mirror without sharing a live home', async (t) => {
  const value = fixture(t);
  const staged = await stageKnowledgeCell({ condition: 'baseline', host: 'codex' }, value.fixture, value.options);

  assert.notEqual(staged.claudePluginDir, staged.pluginDir);
  assert.equal(fs.existsSync(path.join(staged.claudePluginDir, 'skills', 'spectre-execute', 'SKILL.md')), true);
  assert.equal(staged.codexPlugin.installedPath, staged.pluginDir);
  assert.equal(fs.existsSync(path.join(staged.codexHome, 'plugins', 'cache')), true);
});


test('keeps the relevant payment record reachable among ten thousand neutral operational notes', async (t) => {
  const value = fixture(t);
  value.fixture.initialFacts = [{ id: 'payments-dual-settlement', content: 'Keep the legacy and new settlement ledgers in parallel until reconciliation passes.' }];
  value.fixture.scaleDistractors = 10_000;
  const staged = await stageKnowledgeCell({ condition: 'candidate', host: 'claude' }, value.fixture, value.options);

  assert.equal(staged.knownPaths.length, 10_001);
  assert.equal(staged.probe.search.status, 0, staged.probe.search.stderr);
  assert.equal(staged.probe.search.result.results[0].id, 'payments-dual-settlement');
  const bytes = fs.readFileSync(path.join(staged.storePath, 'knowledge', 'telemetry-checkpoint-10000', 'record.json'), 'utf8').toLocaleLowerCase();
  assert.equal(/distractor|irrelevant|unrelated/.test(bytes), false);
});

test('stages a stateful local GitHub fixture for draft lifecycle operations', async (t) => {
  const value = fixture(t);
  const staged = await stageKnowledgeCell({ condition: 'no-knowledge', host: 'claude' }, value.fixture, value.options);
  const execute = (args) => spawnSync('gh', args, {
    cwd: staged.projectDir, env: { ...process.env, ...staged.environment }, encoding: 'utf8',
  });

  const auth = execute(['auth', 'status']);
  assert.equal(auth.status, 0, auth.stderr);
  assert.match(auth.stdout, /evaluation-fixture/);

  const repository = execute(['repo', 'view', '--json', 'owner,name,defaultBranchRef']);
  assert.equal(repository.status, 0, repository.stderr);
  assert.deepEqual(JSON.parse(repository.stdout), {
    owner: { login: 'evaluation-fixture' }, name: 'knowledge-evaluation', defaultBranchRef: { name: 'main' },
  });
  const repositoryName = execute(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  assert.equal(repositoryName.status, 0, repositoryName.stderr);
  assert.equal(repositoryName.stdout, 'evaluation-fixture/knowledge-evaluation\n');
  const unsupportedProjection = execute(['repo', 'view', '--json', 'name', '--jq', '.missing']);
  assert.equal(unsupportedProjection.status, 1);

  const missing = execute(['pr', 'view', '--json', 'url,state,isDraft,headRefName,baseRefName']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no open pull request/i);
  const empty = execute(['pr', 'list', '--json', 'url,state,isDraft,headRefName,baseRefName']);
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(JSON.parse(empty.stdout), []);

  const bodyPath = path.join(staged.root, 'draft-body.md');
  fs.writeFileSync(bodyPath, 'Draft body from file.');
  const created = execute(['pr', 'create', '--draft', '--head', 'evaluation/knowledge-cell', '--base', 'main', '--title', 'Fixture draft', '--body-file', bodyPath]);
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout.trim(), /^https:\/\/github\.com\/evaluation-fixture\/knowledge-evaluation\/pull\/1$/);

  const viewedUrl = execute(['pr', 'view', '--json', 'url', '--jq', '.url']);
  assert.equal(viewedUrl.status, 0, viewedUrl.stderr);
  assert.equal(viewedUrl.stdout, created.stdout);
  const viewed = execute(['pr', 'view', '--json', 'url,state,isDraft,headRefName,baseRefName']);
  assert.equal(viewed.status, 0, viewed.stderr);
  assert.deepEqual(JSON.parse(viewed.stdout), {
    url: created.stdout.trim(), state: 'OPEN', isDraft: true,
    headRefName: 'evaluation/knowledge-cell', baseRefName: 'main',
  });
  const listed = execute(['pr', 'list', '--json', 'url,state,isDraft,headRefName,baseRefName']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout), [JSON.parse(viewed.stdout)]);
  assert.equal(JSON.parse(fs.readFileSync(staged.ghStatePath, 'utf8')).pullRequests[0].body, 'Draft body from file.');

  const duplicate = execute(['pr', 'create', '--draft', '--head', 'evaluation/knowledge-cell', '--base', 'main', '--title', 'Duplicate', '--body', 'Duplicate']);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /already has an open pull request/i);
  const unsupported = execute(['api', 'repos/example/example']);
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /unsupported local gh fixture command/i);
});

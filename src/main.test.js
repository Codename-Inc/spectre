import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveProjectStore } from '../plugins/spectre/hooks/scripts/knowledge/store.mjs';

const CLI_PATH = path.resolve('bin/spectre.js');

function noGit() {
  throw new Error('not a Git project');
}

function writeRecord(storePath, {
  id,
  category = 'feature',
  description,
  triggers,
}) {
  const recordDir = path.join(storePath, 'knowledge', id);
  fs.mkdirSync(recordDir, { recursive: true });
  fs.writeFileSync(
    path.join(recordDir, 'SKILL.md'),
    [
      '---',
      `name: ${id}`,
      `description: ${description}`,
      'metadata:',
      `  spectre-category: "${category}"`,
      `  spectre-triggers: '${JSON.stringify(triggers)}'`,
      '  spectre-status: "active"',
      '  spectre-version: "1"',
      '---',
      `# ${id}`,
      '',
    ].join('\n'),
  );
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: options.cwd || path.resolve('.'),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });
}

async function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-main-test-'));
  const projectDir = path.join(root, 'workspace', 'project');
  const spectreHome = path.join(root, 'spectre-home');
  fs.mkdirSync(projectDir, { recursive: true });
  const store = await resolveProjectStore(projectDir, {
    spectreHome,
    gitRunner: noGit,
  });
  writeRecord(store.storePath, {
    id: 'feature-auth',
    description: 'Authentication and session behavior.',
    triggers: ['account sign in'],
  });
  writeRecord(store.storePath, {
    id: 'procedure-release',
    category: 'procedures',
    description: 'Publish a release.',
    triggers: ['release publish'],
  });
  return { root, projectDir, spectreHome };
}

test('knowledge search is target-independent with project-dir, human, JSON, and empty-query output', async () => {
  const fixture = await makeFixture();
  try {
    const human = runCli([
      'knowledge',
      'search',
      'account sign in',
      '--project-dir',
      fixture.projectDir,
    ], {
      env: { SPECTRE_HOME: fixture.spectreHome },
    });
    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /feature-auth/);
    assert.match(human.stdout, /account sign in/);
    assert.doesNotMatch(human.stderr, /Codex target/);

    const json = runCli([
      'knowledge',
      'search',
      'release',
      '--project-dir',
      fixture.projectDir,
      '--json',
    ], {
      env: { SPECTRE_HOME: fixture.spectreHome },
    });
    assert.equal(json.status, 0, json.stderr);
    const parsed = JSON.parse(json.stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.results.map(({ id }) => id), ['procedure-release']);

    const empty = runCli([
      'knowledge',
      'search',
      '',
      '--project-dir',
      fixture.projectDir,
    ], {
      env: { SPECTRE_HOME: fixture.spectreHome },
    });
    assert.equal(empty.status, 0, empty.stderr);
    assert.match(empty.stdout, /feature:/);
    assert.match(empty.stdout, /procedures:/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('knowledge CLI returns stable JSON failures, recognizes future mutators, and preserves Codex grammar', () => {
  const unknown = runCli(['knowledge', 'unknown', '--json']);
  assert.notEqual(unknown.status, 0);
  assert.deepEqual(JSON.parse(unknown.stdout), {
    ok: false,
    code: 'UNKNOWN_KNOWLEDGE_COMMAND',
    message: 'Unknown knowledge command "unknown".',
  });
  assert.equal(unknown.stderr, '');

  for (const command of ['register', 'migrate']) {
    const recognized = runCli(['knowledge', command, '--json']);
    assert.notEqual(recognized.status, 0);
    const parsed = JSON.parse(recognized.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, 'KNOWLEDGE_COMMAND_NOT_IMPLEMENTED');
    assert.match(parsed.message, new RegExp(`knowledge ${command}`));
  }

  const installGrammar = runCli(['install', 'unsupported', '--scope', 'project']);
  assert.notEqual(installGrammar.status, 0);
  assert.match(installGrammar.stderr, /Only the Codex target is currently implemented/);
});

test('knowledge search treats no matches and a missing store as successful empty results', async () => {
  const fixture = await makeFixture();
  try {
    const noMatches = runCli([
      'knowledge',
      'search',
      'does-not-exist',
      '--project-dir',
      fixture.projectDir,
      '--json',
    ], {
      env: { SPECTRE_HOME: fixture.spectreHome },
    });
    assert.equal(noMatches.status, 0, noMatches.stderr);
    assert.deepEqual(JSON.parse(noMatches.stdout).results, []);

    const missingProject = path.join(fixture.root, 'workspace', 'missing');
    fs.mkdirSync(missingProject, { recursive: true });
    const noStore = runCli([
      'knowledge',
      'search',
      '',
      '--project-dir',
      missingProject,
      '--json',
    ], {
      env: { SPECTRE_HOME: fixture.spectreHome },
    });
    assert.equal(noStore.status, 0, noStore.stderr);
    assert.deepEqual(JSON.parse(noStore.stdout).results, []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('knowledge search serializes unexpected runtime failures when JSON is requested', async () => {
  const fixture = await makeFixture();
  try {
    const projectsRoot = path.join(fixture.spectreHome, 'projects');
    const projectMetadata = [];
    const pending = [projectsRoot];
    while (pending.length > 0) {
      const current = pending.pop();
      if (fs.existsSync(path.join(current, 'project.json'))) {
        projectMetadata.push(current);
        continue;
      }
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory()) pending.push(path.join(current, entry.name));
      }
    }
    assert.equal(projectMetadata.length, 1);
    fs.mkdirSync(path.join(projectMetadata[0], 'index.json'));

    const failed = runCli([
      'knowledge',
      'search',
      'account',
      '--project-dir',
      fixture.projectDir,
      '--json',
    ], {
      env: { SPECTRE_HOME: fixture.spectreHome },
    });

    assert.notEqual(failed.status, 0);
    const parsed = JSON.parse(failed.stdout);
    assert.deepEqual(Object.keys(parsed).sort(), ['code', 'message', 'ok']);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, 'KNOWLEDGE_SEARCH_FAILED');
    assert.equal(typeof parsed.message, 'string');
    assert.notEqual(parsed.message, '');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

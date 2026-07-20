import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildPromptContext } from './knowledge/matcher.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const SEARCH_MODULE_URL = new URL('./knowledge/search.mjs', import.meta.url);
const SPECTRE_BIN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'bin',
  'spectre.js',
);

async function loadSearchModule() {
  try {
    return await import(`${SEARCH_MODULE_URL.href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

function noGit() {
  throw new Error('not a Git project');
}

function writeRecord(storePath, {
  id,
  category = 'feature',
  description,
  triggers,
  status = 'active',
  version = 1,
}) {
  const recordDir = path.join(storePath, 'knowledge', id);
  fs.mkdirSync(recordDir, { recursive: true });
  const content = [
    '---',
    `name: ${id}`,
    `description: ${description}`,
    'metadata:',
    `  spectre-category: "${category}"`,
    `  spectre-triggers: '${JSON.stringify(triggers)}'`,
    `  spectre-status: "${status}"`,
    `  spectre-version: "${version}"`,
    '---',
    `# ${id}`,
    '',
    `Guidance for ${id}.`,
    '',
  ].join('\n');
  const skillPath = path.join(recordDir, 'SKILL.md');
  fs.writeFileSync(skillPath, content);
  return skillPath;
}

async function makeStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-search-'));
  const projectDir = path.join(root, 'workspace', 'project');
  const spectreHome = path.join(root, 'spectre-home');
  fs.mkdirSync(projectDir, { recursive: true });
  const store = await resolveProjectStore(projectDir, {
    spectreHome,
    gitRunner: noGit,
  });
  return { root, projectDir, spectreHome, storePath: store.storePath };
}

test('lexical search ranks exact phrases, trigger overlap, description overlap, then stable ID', async () => {
  const { searchKnowledge } = await loadSearchModule();
  assert.equal(typeof searchKnowledge, 'function');
  const fixture = await makeStore();
  try {
    writeRecord(fixture.storePath, {
      id: 'feature-exact',
      description: 'Use when changing the sign in experience.',
      triggers: ['sign in'],
    });
    writeRecord(fixture.storePath, {
      id: 'feature-trigger-overlap',
      description: 'Use when changing access.',
      triggers: ['account access flow'],
    });
    writeRecord(fixture.storePath, {
      id: 'feature-description-overlap',
      description: 'Use when changing an account access flow.',
      triggers: ['permissions'],
    });
    writeRecord(fixture.storePath, {
      id: 'feature-a-tie',
      description: 'Use when changing unrelated behavior.',
      triggers: ['account'],
    });
    writeRecord(fixture.storePath, {
      id: 'feature-b-tie',
      description: 'Use when changing unrelated behavior.',
      triggers: ['account'],
    });
    writeRecord(fixture.storePath, {
      id: 'feature-inactive',
      description: 'Use when changing an account access flow.',
      triggers: ['account access flow'],
      status: 'archived',
    });

    const result = await searchKnowledge({
      projectDir: fixture.projectDir,
      query: 'account access flow',
      spectreHome: fixture.spectreHome,
      gitRunner: noGit,
    });

    assert.deepEqual(
      result.results.map(({ id }) => id),
      [
        'feature-trigger-overlap',
        'feature-description-overlap',
        'feature-a-tie',
        'feature-b-tie',
      ],
    );
    assert.equal(result.results[0].matchedExactPhrase, true);
    assert.equal(result.results[0].triggerOverlap, 3);
    assert.equal(result.results[1].descriptionOverlap, 3);
    assert.ok(result.results.every(({ status }) => status === 'active'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('empty search lists the complete active corpus and refreshes direct metadata edits', async () => {
  const { searchKnowledge } = await loadSearchModule();
  assert.equal(typeof searchKnowledge, 'function');
  const fixture = await makeStore();
  try {
    const editablePath = writeRecord(fixture.storePath, {
      id: 'feature-editable',
      category: 'feature',
      description: 'Old database guidance.',
      triggers: ['old database'],
    });
    writeRecord(fixture.storePath, {
      id: 'procedure-deploy',
      category: 'procedures',
      description: 'Deploy the service.',
      triggers: ['service deploy'],
    });
    writeRecord(fixture.storePath, {
      id: 'feature-disputed',
      description: 'Do not include this record.',
      triggers: ['hidden'],
      status: 'disputed',
    });

    const initial = await searchKnowledge({
      projectDir: fixture.projectDir,
      query: '',
      spectreHome: fixture.spectreHome,
      gitRunner: noGit,
    });
    assert.deepEqual(
      initial.results.map(({ id }) => id),
      ['feature-editable', 'procedure-deploy'],
    );

    fs.writeFileSync(
      editablePath,
      fs.readFileSync(editablePath, 'utf8')
        .replace('Old database guidance.', 'New queue guidance.')
        .replace('["old database"]', '["queue retry"]'),
    );
    const edited = await searchKnowledge({
      projectDir: fixture.projectDir,
      query: 'queue retry',
      spectreHome: fixture.spectreHome,
      gitRunner: noGit,
    });

    assert.deepEqual(edited.results.map(({ id }) => id), ['feature-editable']);
    assert.equal(edited.results[0].description, 'New queue guidance.');
    assert.deepEqual(edited.results[0].triggers, ['queue retry']);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('the emitted secondary search hint resolves its record through the CLI', async () => {
  const fixture = await makeStore();
  try {
    writeRecord(fixture.storePath, {
      id: 'feature-trigger-overlap',
      description: 'Use when changing access.',
      triggers: ['account access flow'],
    });
    const framed = buildPromptContext({
      host: 'claude',
      primary: {
        id: 'feature-primary',
        content: '# Primary\n\nPrimary guidance.',
      },
      secondaryMatches: [{
        id: 'feature-trigger-overlap',
        description: 'Use when changing access.',
        matchedTrigger: 'account access flow',
      }],
    });
    const hint = framed.secondaryMetadata.match(
      /`spectre knowledge search "([^"]+)"`/,
    );
    assert.notEqual(hint, null);

    const result = spawnSync(
      process.execPath,
      [SPECTRE_BIN, 'knowledge', 'search', hint[1], '--json'],
      {
        cwd: fixture.projectDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          SPECTRE_HOME: fixture.spectreHome,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      JSON.parse(result.stdout).results.map(({ id }) => id),
      ['feature-trigger-overlap'],
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('search skips invalid records, returns no-store success, and never reaches a model or network', async () => {
  const { searchKnowledge } = await loadSearchModule();
  assert.equal(typeof searchKnowledge, 'function');
  const fixture = await makeStore();
  const originalFetch = globalThis.fetch;
  let networkAttempts = 0;
  globalThis.fetch = async () => {
    networkAttempts += 1;
    throw new Error('network access is forbidden');
  };
  try {
    writeRecord(fixture.storePath, {
      id: 'feature-valid',
      description: 'Queue retry behavior.',
      triggers: ['queue retry'],
    });
    const invalidDir = path.join(fixture.storePath, 'knowledge', 'feature-invalid');
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, 'SKILL.md'), 'not frontmatter');

    const result = await searchKnowledge({
      projectDir: fixture.projectDir,
      query: 'queue',
      spectreHome: fixture.spectreHome,
      gitRunner: noGit,
    });
    assert.deepEqual(result.results.map(({ id }) => id), ['feature-valid']);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0].message, /missing opening frontmatter delimiter/);

    const missingProject = path.join(fixture.root, 'workspace', 'missing');
    fs.mkdirSync(missingProject, { recursive: true });
    const missing = await searchKnowledge({
      projectDir: missingProject,
      query: 'anything',
      spectreHome: fixture.spectreHome,
      gitRunner: noGit,
    });
    assert.deepEqual(missing, { results: [], warnings: [] });
    assert.equal(networkAttempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

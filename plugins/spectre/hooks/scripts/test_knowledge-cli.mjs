#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveProjectStore } from './knowledge/store.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const NPM_CLI = path.join(REPOSITORY_ROOT, 'bin', 'spectre.js');
const BUNDLED_CLI = path.join(SCRIPT_DIR, 'knowledge-cli.mjs');

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-cli-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

function skillContent(id) {
  return [
    '---',
    `name: ${id}`,
    'description: Use when testing neutral knowledge retrieval.',
    'metadata:',
    '  spectre-category: "feature"',
    '  spectre-triggers: \'["neutral knowledge retrieval","knowledge-cli.mjs"]\'',
    '  spectre-status: "active"',
    '  spectre-version: "2"',
    '---',
    '',
    '# Neutral retrieval',
    '',
    'Exact CLI content sentinel.',
    '',
  ].join('\n');
}

async function fixture(t) {
  const root = makeTmp(t);
  const projectDir = path.join(root, 'project');
  const spectreHome = path.join(root, 'spectre-home');
  const isolatedPath = path.join(root, 'isolated-path');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(isolatedPath);
  fs.symlinkSync(process.execPath, path.join(isolatedPath, 'node'));
  const { storePath } = await resolveProjectStore(projectDir, { spectreHome });
  const id = 'feature-neutral-cli';
  const recordDirectory = path.join(storePath, 'knowledge', id);
  fs.mkdirSync(path.join(recordDirectory, 'references'), { recursive: true });
  const content = skillContent(id);
  fs.writeFileSync(path.join(recordDirectory, 'SKILL.md'), content);
  fs.writeFileSync(path.join(recordDirectory, 'references', 'guide.md'), 'guide\n');
  return {
    root,
    projectDir,
    spectreHome,
    storePath,
    isolatedPath,
    id,
    content,
    recordDirectory,
  };
}

function run(kind, args, fixtureValue) {
  const script = kind === 'npm' ? NPM_CLI : BUNDLED_CLI;
  const prefix = kind === 'npm' ? ['knowledge'] : [];
  const executable = kind === 'npm' ? process.execPath : script;
  const executableArgs = kind === 'npm' ? [script, ...prefix, ...args] : args;
  return spawnSync(executable, executableArgs, {
    cwd: fixtureValue.projectDir,
    env: {
      ...process.env,
      SPECTRE_HOME: fixtureValue.spectreHome,
      PATH: fixtureValue.isolatedPath,
    },
    encoding: 'utf8',
  });
}

function json(result) {
  assert.notEqual(result.stdout, '', result.stderr);
  return JSON.parse(result.stdout);
}

function snapshotTree(root) {
  const snapshot = [];
  function walk(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) {
        snapshot.push([
          path.relative(root, fullPath),
          fs.readFileSync(fullPath).toString('base64'),
          fs.statSync(fullPath).mtimeMs,
        ]);
      }
    }
  }
  walk(root);
  return snapshot;
}

function withoutVolatileLoadFields(result) {
  const { activity, ...stable } = result;
  return stable;
}

describe('neutral bundled and npm knowledge CLI', () => {
  it('previews the exact host payload and diagnostics without writing through either CLI', async (t) => {
    const value = await fixture(t);
    const before = snapshotTree(value.storePath);

    for (const host of ['claude', 'codex']) {
      const npm = run('npm', [
        'registry',
        '--host',
        host,
        '--project-dir',
        value.projectDir,
        '--json',
      ], value);
      const bundled = run('bundled', [
        'registry',
        '--host',
        host,
        '--project-dir',
        value.projectDir,
        '--json',
      ], value);
      assert.equal(npm.status, 0, npm.stderr);
      assert.equal(bundled.status, 0, bundled.stderr);
      assert.deepEqual(json(bundled), json(npm));
      const preview = json(npm);
      assert.equal(preview.ok, true);
      assert.equal(preview.host, host);
      assert.equal(preview.injected, true);
      assert.equal(preview.measurement.ok, true);
      assert.equal(preview.includedCount, 1);
      assert.equal(preview.omittedCount, 0);
      assert.deepEqual(preview.includedRecords, [{ id: value.id, version: 2 }]);
      assert.deepEqual(preview.omittedRecords, []);
      assert.match(
        preview.payload.hookSpecificOutput.additionalContext,
        /## Before You Work[\s\S]*## Available Knowledge/,
      );
      assert.match(preview.payload.hookSpecificOutput.additionalContext, new RegExp(value.id));
      assert.equal(preview.payload.hookSpecificOutput.additionalContext.includes('Exact CLI content sentinel'), false);
      assert.deepEqual(snapshotTree(value.storePath), before);
    }
  });

  it('rejects an unsupported preview host without changing the knowledge store', async (t) => {
    const value = await fixture(t);
    const before = snapshotTree(value.storePath);

    for (const kind of ['npm', 'bundled']) {
      const result = run(kind, [
        'registry',
        '--host',
        'unknown',
        '--project-dir',
        value.projectDir,
        '--json',
      ], value);
      assert.notEqual(result.status, 0);
      assert.deepEqual(json(result), {
        ok: false,
        code: 'KNOWLEDGE_REGISTRY_FAILED',
        message: 'Unsupported registry host: unknown',
      });
      assert.deepEqual(snapshotTree(value.storePath), before);
    }
  });

  it('routes register and migrate through the same neutral bundled entry point', async (t) => {
    const value = await fixture(t);
    const proposalId = 'feature-neutral-registration';
    const proposalDir = path.join(value.root, 'proposal', proposalId);
    fs.mkdirSync(proposalDir, { recursive: true });
    fs.writeFileSync(path.join(proposalDir, 'SKILL.md'), skillContent(proposalId));

    const registration = run('bundled', [
      'register',
      '--record',
      proposalDir,
      '--project-dir',
      value.projectDir,
      '--json',
    ], value);
    assert.equal(registration.status, 0, registration.stderr);
    assert.equal(json(registration).id, proposalId);

    const migration = run('bundled', [
      'migrate',
      '--project-dir',
      value.projectDir,
      '--json',
    ], value);
    assert.equal(migration.status, 0, migration.stderr);
    const migrated = json(migration);
    assert.equal(migrated.ok, true);
    assert.deepEqual(migrated.entries, []);
  });

  it('works without a global spectre binary or recall skill and has JSON search/load parity', async (t) => {
    const value = await fixture(t);
    assert.deepEqual(fs.readdirSync(value.isolatedPath), ['node']);
    assert.equal(
      fs.existsSync(path.join(value.projectDir, '.agents', 'skills', 'spectre-recall')),
      false,
    );

    const npmSearch = run('npm', [
      'search',
      'neutral retrieval',
      '--project-dir',
      value.projectDir,
      '--json',
    ], value);
    const bundledSearch = run('bundled', [
      'search',
      'neutral retrieval',
      '--project-dir',
      value.projectDir,
      '--json',
    ], value);
    assert.equal(npmSearch.status, 0, npmSearch.stderr);
    assert.equal(bundledSearch.status, 0, bundledSearch.stderr);
    assert.deepEqual(json(bundledSearch), json(npmSearch));

    const npmLoad = run('npm', [
      'load',
      value.id,
      '--project-dir',
      value.projectDir,
      '--json',
    ], value);
    const bundledLoad = run('bundled', [
      'load',
      value.id,
      '--project-dir',
      value.projectDir,
      '--json',
    ], value);
    assert.equal(npmLoad.status, 0, npmLoad.stderr);
    assert.equal(bundledLoad.status, 0, bundledLoad.stderr);
    const npmLoaded = json(npmLoad);
    const bundledLoaded = json(bundledLoad);
    assert.deepEqual(
      withoutVolatileLoadFields(bundledLoaded),
      withoutVolatileLoadFields(npmLoaded),
    );
    assert.equal(npmLoaded.content, value.content);
    assert.equal(npmLoaded.activity.successfulLoads, 1);
    assert.equal(bundledLoaded.activity.successfulLoads, 2);
    assert.deepEqual(npmLoaded.resources, [{
      relativePath: 'references/guide.md',
      absolutePath: path.join(value.recordDirectory, 'references', 'guide.md'),
    }]);
  });

  it('has equivalent human search/load output and stable error exits', async (t) => {
    const value = await fixture(t);
    for (const command of [
      ['search', 'neutral retrieval', '--project-dir', value.projectDir],
      ['load', value.id, '--project-dir', value.projectDir],
    ]) {
      const npm = run('npm', command, value);
      const bundled = run('bundled', command, value);
      assert.equal(npm.status, 0, npm.stderr);
      assert.equal(bundled.status, 0, bundled.stderr);
      assert.equal(bundled.stdout, npm.stdout);
      assert.equal(bundled.stderr, npm.stderr);
      if (command[0] === 'load') {
        assert.equal(npm.stdout.startsWith(value.content), true);
        const footer = npm.stdout
          .split('\n')
          .find((line) => line.startsWith('SPECTRE_KNOWLEDGE_RESOURCE_LOCATIONS='));
        assert.ok(footer);
        const locations = JSON.parse(footer.slice(footer.indexOf('=') + 1));
        assert.equal(locations.recordDirectory, value.recordDirectory);
        assert.deepEqual(locations.resources.map(({ relativePath }) => relativePath), [
          'references/guide.md',
        ]);
      }
    }

    const command = [
      'load',
      'feature-missing-record',
      '--project-dir',
      value.projectDir,
      '--json',
    ];
    const npmError = run('npm', command, value);
    const bundledError = run('bundled', command, value);
    assert.notEqual(npmError.status, 0);
    assert.equal(bundledError.status, npmError.status);
    assert.deepEqual(json(bundledError), json(npmError));
    assert.deepEqual(json(npmError), {
      ok: false,
      code: 'KNOWLEDGE_NOT_FOUND',
      message: 'Knowledge record not found: feature-missing-record',
    });
    assert.equal(npmError.stderr, '');
    assert.equal(bundledError.stderr, '');

    const humanCommand = command.filter((value) => value !== '--json');
    const npmHumanError = run('npm', humanCommand, value);
    const bundledHumanError = run('bundled', humanCommand, value);
    assert.notEqual(npmHumanError.status, 0);
    assert.equal(bundledHumanError.status, npmHumanError.status);
    assert.equal(bundledHumanError.stdout, npmHumanError.stdout);
    assert.equal(bundledHumanError.stderr, npmHumanError.stderr);
    assert.match(npmHumanError.stderr, /Knowledge record not found/);
  });

  it('preserves search results and exit zero when diagnostic activity cannot be written', async (t) => {
    for (const kind of ['npm', 'bundled']) {
      const value = await fixture(t);
      fs.mkdirSync(path.join(value.storePath, 'activity.json'));

      const result = run(kind, [
        'search',
        'neutral retrieval',
        '--project-dir',
        value.projectDir,
        '--json',
      ], value);
      assert.equal(result.status, 0, result.stderr);
      const parsed = json(result);
      assert.deepEqual(parsed.results.map(({ id }) => id), [value.id]);
      assert.deepEqual(
        parsed.warnings.map(({ code }) => code),
        ['KNOWLEDGE_SEARCH_DIAGNOSTIC_WRITE_FAILED'],
      );
      assert.equal(typeof parsed.warnings[0].message, 'string');
      assert.match(parsed.warnings[0].message, /activity\.json/);

      const human = run(kind, [
        'search',
        'neutral retrieval',
        '--project-dir',
        value.projectDir,
      ], value);
      assert.equal(human.status, 0, human.stderr);
      assert.match(human.stdout, new RegExp(value.id));
      assert.match(human.stderr, /KNOWLEDGE_SEARCH_DIAGNOSTIC_WRITE_FAILED/);
    }
  });

  it('normalizes a value-less project-dir flag across JSON and human search/load errors', async (t) => {
    const value = await fixture(t);
    for (const [command, expectedCode] of [
      ['search', 'KNOWLEDGE_SEARCH_FAILED'],
      ['load', 'KNOWLEDGE_LOAD_FAILED'],
    ]) {
      const jsonArgs = [command, value.id, '--project-dir', '--json'];
      const npmJson = run('npm', jsonArgs, value);
      const bundledJson = run('bundled', jsonArgs, value);
      assert.notEqual(npmJson.status, 0);
      assert.equal(bundledJson.status, npmJson.status);
      assert.deepEqual(json(bundledJson), json(npmJson));
      assert.deepEqual(json(npmJson), {
        ok: false,
        code: expectedCode,
        message: 'Missing value for --project-dir.',
      });
      assert.equal(npmJson.stderr, '');
      assert.equal(bundledJson.stderr, '');

      const humanArgs = [command, value.id, '--project-dir'];
      const npmHuman = run('npm', humanArgs, value);
      const bundledHuman = run('bundled', humanArgs, value);
      assert.notEqual(npmHuman.status, 0);
      assert.equal(bundledHuman.status, npmHuman.status);
      assert.equal(bundledHuman.stdout, npmHuman.stdout);
      assert.equal(bundledHuman.stderr, npmHuman.stderr);
      assert.equal(npmHuman.stderr, 'Missing value for --project-dir.\n');
    }
  });
});

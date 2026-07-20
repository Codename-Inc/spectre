#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.join(__dirname, 'register_learning.mjs');
const REGISTER_BIN = path.resolve('plugins/spectre/bin/spectre-register');
const MIGRATE_BIN = path.resolve('plugins/spectre/bin/spectre-migrate');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-rl-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runRegister(args, options = {}) {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: options.cwd || path.resolve('.'),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });
  return result;
}

function runMigrate(args, options = {}) {
  return spawnSync(MIGRATE_BIN, args, {
    cwd: options.cwd || path.resolve('.'),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });
}

function waitForProcess(child) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function writeCanonicalProposal(root, {
  id,
  category = 'feature',
  description = `Use when applying ${id}`,
  triggers = [id],
  status = 'active',
  version = '1',
  body = `\n# ${id}\n\nKeep these bytes.\n`,
  extraFrontmatter = [],
  metadata = {},
  resources = {},
}) {
  const recordDir = path.join(root, id);
  fs.mkdirSync(recordDir, { recursive: true });
  fs.writeFileSync(
    path.join(recordDir, 'SKILL.md'),
    [
      '---',
      `name: ${JSON.stringify(id)}`,
      `description: ${JSON.stringify(description)}`,
      ...extraFrontmatter,
      'metadata:',
      ...Object.entries(metadata)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`),
      `  spectre-category: ${JSON.stringify(category)}`,
      `  spectre-triggers: ${JSON.stringify(JSON.stringify(triggers))}`,
      `  spectre-status: ${JSON.stringify(status)}`,
      `  spectre-version: ${JSON.stringify(version)}`,
      '---',
    ].join('\n') + body,
  );
  for (const [relativePath, bytes] of Object.entries(resources)) {
    const target = path.join(recordDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return recordDir;
}

function findOnlyStore(spectreHome) {
  const projectsDir = path.join(spectreHome, 'projects');
  const stores = [];
  const pending = [projectsDir];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!fs.existsSync(current)) continue;
    if (fs.existsSync(path.join(current, 'project.json'))) {
      stores.push(current);
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) pending.push(path.join(current, entry.name));
    }
  }
  assert.equal(stores.length, 1);
  return stores[0];
}

function snapshot(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

describe('canonical knowledge registration process', () => {
  it('creates and updates user-level records/resources/index without legacy registry side effects', () => {
    const tmp = createTmpDir();
    try {
      const projectDir = path.join(tmp, 'workspace', 'project');
      const spectreHome = path.join(tmp, 'spectre-home');
      const proposals = path.join(tmp, 'proposals');
      fs.mkdirSync(projectDir, { recursive: true });
      const nativeSkill = path.join(projectDir, '.claude', 'skills', 'feature-auth', 'SKILL.md');
      fs.mkdirSync(path.dirname(nativeSkill), { recursive: true });
      fs.writeFileSync(nativeSkill, '---\nname: feature-auth\ndescription: Original native skill\n---\n\n# Native\n');
      const record = writeCanonicalProposal(proposals, {
        id: 'feature-auth',
        triggers: ['login flow'],
        metadata: { owner: 'platform' },
        resources: { 'references/details.md': 'resource bytes\n' },
      });

      const created = runRegister([
        '--project-root', projectDir,
        '--record', record,
        '--json',
      ], {
        env: { SPECTRE_HOME: spectreHome },
      });

      assert.equal(created.status, 0, created.stderr);
      const parsed = JSON.parse(created.stdout);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.id, 'feature-auth');
      const storePath = findOnlyStore(spectreHome);
      const canonicalPath = path.join(storePath, 'knowledge', 'feature-auth', 'SKILL.md');
      assert.equal(fs.existsSync(canonicalPath), true);
      assert.match(fs.readFileSync(canonicalPath, 'utf8'), /spectre-category: "feature"/);
      assert.match(fs.readFileSync(canonicalPath, 'utf8'), /owner: "platform"/);
      assert.deepEqual(
        fs.readFileSync(path.join(storePath, 'knowledge', 'feature-auth', 'references', 'details.md'), 'utf8'),
        'resource bytes\n',
      );
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(storePath, 'index.json'), 'utf8')).records.map(({ id }) => id),
        ['feature-auth'],
      );
      assert.equal(
        fs.existsSync(path.join(projectDir, '.claude', 'skills', 'spectre-recall')),
        false,
      );
      assert.equal(fs.readFileSync(nativeSkill, 'utf8').includes('TRIGGER when:'), false);

      const updated = writeCanonicalProposal(proposals, {
        id: 'feature-auth',
        triggers: ['login flow', 'oauth callback'],
        version: '2',
        body: '\n# Updated\n\nReplacement bytes.\n',
      });
      const second = runRegister([
        '--project-root', projectDir,
        '--record', updated,
        '--json',
      ], {
        env: { SPECTRE_HOME: spectreHome },
      });
      assert.equal(second.status, 0, second.stderr);
      const index = JSON.parse(fs.readFileSync(path.join(storePath, 'index.json'), 'utf8'));
      assert.deepEqual(index.records[0].triggers, ['login flow', 'oauth callback']);
      assert.equal(index.records[0].version, 2);
      assert.match(fs.readFileSync(canonicalPath, 'utf8'), /Replacement bytes/);
    } finally {
      cleanup(tmp);
    }
  });

  it('rejects invalid, oversized, and host-unsafe proposals without changing prior record or index', () => {
    const tmp = createTmpDir();
    try {
      const projectDir = path.join(tmp, 'workspace', 'project');
      const spectreHome = path.join(tmp, 'spectre-home');
      const proposals = path.join(tmp, 'proposals');
      fs.mkdirSync(projectDir, { recursive: true });
      const valid = writeCanonicalProposal(proposals, {
        id: 'feature-safe',
        triggers: ['safe'],
      });
      assert.equal(runRegister([
        '--project-root', projectDir,
        '--record', valid,
        '--json',
      ], { env: { SPECTRE_HOME: spectreHome } }).status, 0);
      const storePath = findOnlyStore(spectreHome);
      const canonicalPath = path.join(storePath, 'knowledge', 'feature-safe', 'SKILL.md');
      const indexPath = path.join(storePath, 'index.json');
      const priorRecord = snapshot(canonicalPath);
      const priorIndex = snapshot(indexPath);

      for (const [name, options, expectedCode] of [
        ['invalid-top-level', {
          id: 'feature-safe',
          extraFrontmatter: ['spectre-category: feature'],
        }, 'KNOWLEDGE_RECORD_INVALID'],
        ['oversized', {
          id: 'feature-safe',
          body: `\n${'x'.repeat(9_100)}\n`,
        }, 'KNOWLEDGE_RECORD_INVALID'],
        ['host-unsafe', {
          id: 'feature-safe',
          body: `\n${'!'.repeat(8_300)}\n`,
        }, 'KNOWLEDGE_PAYLOAD_UNSAFE'],
      ]) {
        const proposal = writeCanonicalProposal(path.join(proposals, name), options);
        const failed = runRegister([
          '--project-root', projectDir,
          '--record', proposal,
          '--json',
        ], {
          env: { SPECTRE_HOME: spectreHome },
        });
        assert.notEqual(failed.status, 0, name);
        assert.equal(JSON.parse(failed.stdout).code, expectedCode);
        assert.deepEqual(snapshot(canonicalPath), priorRecord, `${name} must preserve record`);
        assert.deepEqual(snapshot(indexPath), priorIndex, `${name} must preserve index`);
      }
    } finally {
      cleanup(tmp);
    }
  });

  it('times out behind a live store lock without partial writes', () => {
    const tmp = createTmpDir();
    try {
      const projectDir = path.join(tmp, 'workspace', 'project');
      const spectreHome = path.join(tmp, 'spectre-home');
      const proposals = path.join(tmp, 'proposals');
      fs.mkdirSync(projectDir, { recursive: true });
      const seed = writeCanonicalProposal(proposals, {
        id: 'feature-lock-seed',
        triggers: ['seed'],
      });
      assert.equal(runRegister([
        '--project-root', projectDir,
        '--record', seed,
        '--json',
      ], { env: { SPECTRE_HOME: spectreHome } }).status, 0);
      const storePath = findOnlyStore(spectreHome);
      fs.writeFileSync(
        path.join(storePath, '.spectre.lock'),
        JSON.stringify({
          pid: process.pid,
          timestamp: new Date().toISOString(),
          operation: 'held-by-test',
        }),
      );

      const blockedProposal = writeCanonicalProposal(proposals, {
        id: 'feature-lock-timeout',
        triggers: ['timeout'],
      });
      const blocked = runRegister([
        '--project-root', projectDir,
        '--record', blockedProposal,
        '--json',
        '--lock-timeout-ms', '20',
      ], {
        env: { SPECTRE_HOME: spectreHome },
      });
      assert.notEqual(blocked.status, 0);
      assert.equal(JSON.parse(blocked.stdout).code, 'LOCK_TIMEOUT');
      assert.equal(
        fs.existsSync(path.join(storePath, 'knowledge', 'feature-lock-timeout')),
        false,
      );
    } finally {
      cleanup(tmp);
    }
  });

  it('serializes concurrent plugin-bin registrations into one complete index', async () => {
    const tmp = createTmpDir();
    try {
      const projectDir = path.join(tmp, 'workspace', 'project');
      const spectreHome = path.join(tmp, 'spectre-home');
      const proposals = path.join(tmp, 'proposals');
      fs.mkdirSync(projectDir, { recursive: true });
      const alpha = writeCanonicalProposal(proposals, {
        id: 'feature-alpha',
        triggers: ['alpha'],
      });
      const beta = writeCanonicalProposal(proposals, {
        id: 'feature-beta',
        triggers: ['beta'],
      });
      const env = { ...process.env, SPECTRE_HOME: spectreHome };
      const first = spawn(REGISTER_BIN, [
        '--project-root', projectDir,
        '--record', alpha,
        '--json',
      ], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      const second = spawn(REGISTER_BIN, [
        '--project-root', projectDir,
        '--record', beta,
        '--json',
      ], { env, stdio: ['ignore', 'pipe', 'pipe'] });

      const results = await Promise.all([waitForProcess(first), waitForProcess(second)]);
      assert.deepEqual(results.map(({ status }) => status), [0, 0], JSON.stringify(results));
      const storePath = findOnlyStore(spectreHome);
      const index = JSON.parse(fs.readFileSync(path.join(storePath, 'index.json'), 'utf8'));
      assert.deepEqual(index.records.map(({ id }) => id), ['feature-alpha', 'feature-beta']);
      for (const id of ['feature-alpha', 'feature-beta']) {
        assert.equal(
          fs.existsSync(path.join(storePath, 'knowledge', id, 'SKILL.md')),
          true,
        );
      }
    } finally {
      cleanup(tmp);
    }
  });
});

describe('plugin migration entry point', () => {
  it('exposes spectre-migrate for Claude plugin users', () => {
    const tmp = createTmpDir();
    try {
      const projectDir = path.join(tmp, 'workspace', 'project');
      const spectreHome = path.join(tmp, 'spectre-home');
      fs.mkdirSync(path.join(projectDir, '.claude', 'skills', 'feature-legacy'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, '.claude', 'skills', 'feature-legacy', 'SKILL.md'),
        [
          '---',
          'name: feature-legacy',
          'description: Use when applying legacy',
          'user-invocable: true',
          '---',
          '',
          '# Legacy',
          '',
        ].join('\n'),
      );
      fs.mkdirSync(
        path.join(projectDir, '.claude', 'skills', 'spectre-recall', 'references'),
        { recursive: true },
      );
      fs.writeFileSync(
        path.join(projectDir, '.claude', 'skills', 'spectre-recall', 'references', 'registry.toon'),
        'feature-legacy|feature|legacy|Use when applying legacy\n',
      );

      const migrated = runMigrate([
        '--project-root', projectDir,
        '--json',
      ], {
        env: { SPECTRE_HOME: spectreHome },
      });

      assert.equal(migrated.status, 0, migrated.stderr);
      const parsed = JSON.parse(migrated.stdout);
      assert.equal(parsed.ok, true);
      assert.deepEqual(parsed.entries.map(({ code }) => code), ['MIGRATED']);
      assert.equal(
        fs.existsSync(path.join(findOnlyStore(spectreHome), 'knowledge', 'feature-legacy', 'SKILL.md')),
        true,
      );
    } finally {
      cleanup(tmp);
    }
  });
});

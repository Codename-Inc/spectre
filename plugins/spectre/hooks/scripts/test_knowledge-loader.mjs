#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOADER_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'loader.mjs');
const STORE_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'store.mjs');
const execFileAsync = promisify(execFile);

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-loader-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

async function loadModules() {
  const [loader, store] = await Promise.all([
    import(pathToFileURL(LOADER_MODULE).href),
    import(pathToFileURL(STORE_MODULE).href),
  ]);
  return { ...loader, ...store };
}

function skillContent(id, options = {}) {
  return [
    '---',
    `name: ${id}`,
    `description: ${options.description || `Use when working with ${id}.`}`,
    'metadata:',
    `  spectre-category: "${options.category || 'feature'}"`,
    `  spectre-triggers: '${JSON.stringify(options.triggers || [`${id} workflow`])}'`,
    `  spectre-status: "${options.status || 'active'}"`,
    `  spectre-version: "${options.version || 1}"`,
    '---',
    '',
    options.body || `# ${id}\n\nExact canonical body.`,
    '',
  ].join('\n');
}

async function fixture(t) {
  const tmp = makeTmp(t);
  const projectDir = path.join(tmp, 'project');
  const spectreHome = path.join(tmp, 'spectre-home');
  fs.mkdirSync(projectDir, { recursive: true });
  const { resolveProjectStore } = await loadModules();
  const { storePath } = await resolveProjectStore(projectDir, { spectreHome });
  return { tmp, projectDir, spectreHome, storePath };
}

function writeRecord(storePath, id, content = skillContent(id)) {
  const recordDirectory = path.join(storePath, 'knowledge', id);
  fs.mkdirSync(recordDirectory, { recursive: true });
  const recordPath = path.join(recordDirectory, 'SKILL.md');
  fs.writeFileSync(recordPath, content);
  return { content, recordDirectory, recordPath };
}

function assertLoadError(code) {
  return (error) => {
    assert.equal(error?.code, code);
    assert.equal(Object.hasOwn(error || {}, 'content'), false);
    assert.equal(Object.hasOwn(error || {}, 'body'), false);
    return true;
  };
}

function readActivity(storePath) {
  const activityPath = path.join(storePath, 'activity.json');
  return fs.existsSync(activityPath)
    ? JSON.parse(fs.readFileSync(activityPath, 'utf8'))
    : null;
}

describe('verified exact-ID knowledge loader', () => {
  it('returns exact current metadata, full content, safe resources, and one committed load', async (t) => {
    const { projectDir, spectreHome, storePath, tmp } = await fixture(t);
    const id = 'feature-exact-loader';
    const record = writeRecord(storePath, id, skillContent(id, {
      description: 'Use when validating the exact knowledge loader.',
      triggers: ['exact knowledge loader', 'knowledge load <id>'],
      version: 3,
      body: '# Exact loader\n\nFull canonical content sentinel.',
    }));
    fs.mkdirSync(path.join(record.recordDirectory, 'references', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(record.recordDirectory, 'references', 'guide.md'), 'guide\n');
    fs.writeFileSync(
      path.join(record.recordDirectory, 'references', 'nested', 'raw.bin'),
      Buffer.from([0, 10, 13, 255, 42]),
    );
    const outside = path.join(tmp, 'outside-secret.txt');
    fs.writeFileSync(outside, 'outside\n');
    fs.symlinkSync(outside, path.join(record.recordDirectory, 'references', 'escape.txt'));
    fs.symlinkSync(
      path.join(record.recordDirectory, 'references', 'guide.md'),
      path.join(record.recordDirectory, 'references', 'guide-link.md'),
    );

    const { loadKnowledgeById } = await loadModules();
    const result = await loadKnowledgeById({
      projectDir,
      spectreHome,
      id,
      now: () => Date.parse('2026-07-22T20:00:00.000Z'),
    });

    assert.deepEqual(result, {
      ok: true,
      id,
      category: 'feature',
      description: 'Use when validating the exact knowledge loader.',
      triggers: ['exact knowledge loader', 'knowledge load <id>'],
      status: 'active',
      version: 3,
      sourceFingerprint: `sha256:${createHash('sha256').update(record.content).digest('hex')}`,
      content: record.content,
      recordPath: record.recordPath,
      recordDirectory: record.recordDirectory,
      resources: [
        {
          relativePath: 'references/guide.md',
          absolutePath: path.join(record.recordDirectory, 'references', 'guide.md'),
        },
        {
          relativePath: path.join('references', 'nested', 'raw.bin'),
          absolutePath: path.join(record.recordDirectory, 'references', 'nested', 'raw.bin'),
        },
      ],
      activity: {
        successfulLoads: 1,
        lastLoadedAt: '2026-07-22T20:00:00.000Z',
      },
    });
    assert.equal(result.resources.some(({ absolutePath }) => absolutePath === outside), false);
    assert.equal(result.resources.some(({ relativePath }) => relativePath === 'SKILL.md'), false);

    const activity = readActivity(storePath);
    assert.equal(activity.records[id].versions['3'].successfulLoads, 1);
  });

  it('increments the exact id@version exactly once per invocation', async (t) => {
    const { projectDir, spectreHome, storePath } = await fixture(t);
    const id = 'procedures-repeat-load';
    writeRecord(storePath, id, skillContent(id, { category: 'procedures', version: 4 }));
    const { loadKnowledgeById } = await loadModules();

    await loadKnowledgeById({ projectDir, spectreHome, id });
    const second = await loadKnowledgeById({ projectDir, spectreHome, id });

    assert.equal(second.activity.successfulLoads, 2);
    assert.equal(readActivity(storePath).records[id].versions['4'].successfulLoads, 2);
  });

  it('serializes concurrent exact loads without losing increments', async (t) => {
    const { projectDir, spectreHome, storePath } = await fixture(t);
    const id = 'procedures-concurrent-load';
    writeRecord(storePath, id, skillContent(id, { category: 'procedures', version: 2 }));
    const loaderUrl = pathToFileURL(LOADER_MODULE).href;
    const worker = [
      `import { loadKnowledgeById } from ${JSON.stringify(loaderUrl)};`,
      'const [projectDir, spectreHome, id] = process.argv.slice(1);',
      'await loadKnowledgeById({ projectDir, spectreHome, id });',
    ].join('\n');
    const invocations = 12;

    await Promise.all(Array.from({ length: invocations }, () => execFileAsync(
      process.execPath,
      ['--input-type=module', '--eval', worker, projectDir, spectreHome, id],
      { timeout: 15_000 },
    )));

    assert.equal(
      readActivity(storePath).records[id].versions['2'].successfulLoads,
      invocations,
    );
  });

  it('distinguishes unknown, inactive, and invalid exact records without content or activity', async (t) => {
    const { projectDir, spectreHome, storePath } = await fixture(t);
    writeRecord(
      storePath,
      'feature-inactive-record',
      skillContent('feature-inactive-record', { status: 'archived' }),
    );
    writeRecord(storePath, 'feature-invalid-record', '---\nname: feature-invalid-record\n---\ninvalid\n');
    const { loadKnowledgeById } = await loadModules();

    await assert.rejects(
      loadKnowledgeById({ projectDir, spectreHome, id: 'feature-missing-record' }),
      assertLoadError('KNOWLEDGE_NOT_FOUND'),
    );
    await assert.rejects(
      loadKnowledgeById({ projectDir, spectreHome, id: 'feature-inactive-record' }),
      assertLoadError('KNOWLEDGE_NOT_ACTIVE'),
    );
    await assert.rejects(
      loadKnowledgeById({ projectDir, spectreHome, id: 'feature-invalid-record' }),
      assertLoadError('KNOWLEDGE_INVALID'),
    );
    await assert.rejects(
      loadKnowledgeById({ projectDir, spectreHome, id: '../feature-escape' }),
      assertLoadError('KNOWLEDGE_INVALID'),
    );
    assert.equal(readActivity(storePath), null);
  });

  it('returns no body and no activity when the source fingerprint races', async (t) => {
    const { projectDir, spectreHome, storePath } = await fixture(t);
    const id = 'gotchas-fingerprint-race';
    const record = writeRecord(storePath, id, skillContent(id, { category: 'gotchas' }));
    const changed = record.content.replace('Exact canonical body.', 'Changed canonical body.');
    const { loadKnowledgeById } = await loadModules();

    await assert.rejects(
      loadKnowledgeById({
        projectDir,
        spectreHome,
        id,
        recordReadOptions: { readFile: () => changed },
      }),
      assertLoadError('KNOWLEDGE_CHANGED_DURING_READ'),
    );
    assert.equal(readActivity(storePath), null);
  });

  it('rejects a queued resource directory swapped to an external symlink before traversal', async (t) => {
    const { projectDir, spectreHome, storePath, tmp } = await fixture(t);
    const id = 'gotchas-resource-directory-swap';
    const record = writeRecord(storePath, id, skillContent(id, { category: 'gotchas' }));
    const referencesDirectory = path.join(record.recordDirectory, 'references');
    fs.mkdirSync(referencesDirectory, { recursive: true });
    fs.writeFileSync(path.join(referencesDirectory, 'inside.md'), 'inside\n');
    const outsideDirectory = path.join(tmp, 'outside-resources');
    fs.mkdirSync(outsideDirectory);
    fs.writeFileSync(path.join(outsideDirectory, 'secret.md'), 'external secret\n');
    const originalReaddirSync = fs.readdirSync;
    let recordDirectoryReads = 0;
    fs.readdirSync = function injectedDirectorySwap(currentPath, options) {
      const entries = originalReaddirSync.call(this, currentPath, options);
      if (path.resolve(currentPath) === record.recordDirectory) {
        recordDirectoryReads += 1;
        if (recordDirectoryReads === 2) {
          fs.rmSync(referencesDirectory, { recursive: true, force: true });
          fs.symlinkSync(outsideDirectory, referencesDirectory, 'dir');
        }
      }
      return entries;
    };

    const { loadKnowledgeById } = await loadModules();
    try {
      await assert.rejects(
        loadKnowledgeById({ projectDir, spectreHome, id }),
        (error) =>
          ['KNOWLEDGE_CHANGED_DURING_READ', 'KNOWLEDGE_INVALID'].includes(error?.code)
          && assertLoadError(error.code)(error),
      );
    } finally {
      fs.readdirSync = originalReaddirSync;
    }
    assert.equal(recordDirectoryReads, 2);
    assert.equal(readActivity(storePath), null);
  });

  it('preserves corrupt activity bytes and returns no body', async (t) => {
    const { projectDir, spectreHome, storePath } = await fixture(t);
    const id = 'feature-corrupt-activity';
    writeRecord(storePath, id);
    const activityPath = path.join(storePath, 'activity.json');
    const corrupt = '{not valid activity}\n';
    fs.writeFileSync(activityPath, corrupt);
    const { loadKnowledgeById } = await loadModules();

    await assert.rejects(
      loadKnowledgeById({ projectDir, spectreHome, id }),
      assertLoadError('KNOWLEDGE_ACTIVITY_CORRUPT'),
    );
    assert.equal(fs.readFileSync(activityPath, 'utf8'), corrupt);
  });

  it('maps store lock timeout without returning content or changing activity', async (t) => {
    const { projectDir, spectreHome, storePath } = await fixture(t);
    const id = 'feature-locked-load';
    writeRecord(storePath, id);
    fs.writeFileSync(path.join(storePath, '.spectre.lock'), JSON.stringify({
      pid: process.pid,
      timestamp: new Date().toISOString(),
      operation: 'other-operation',
    }));
    const { loadKnowledgeById } = await loadModules();

    await assert.rejects(
      loadKnowledgeById({
        projectDir,
        spectreHome,
        id,
        lockOptions: { timeoutMs: 5, retryDelayMs: 1, staleMs: 60_000 },
      }),
      assertLoadError('KNOWLEDGE_LOCK_TIMEOUT'),
    );
    assert.equal(readActivity(storePath), null);
  });

  it('maps atomic activity write failure and never releases prepared content', async (t) => {
    const { projectDir, spectreHome, storePath } = await fixture(t);
    const id = 'feature-write-failure';
    writeRecord(storePath, id);
    const { loadKnowledgeById } = await loadModules();
    await loadKnowledgeById({ projectDir, spectreHome, id });

    await assert.rejects(
      loadKnowledgeById({
        projectDir,
        spectreHome,
        id,
        activityWriteOptions: {
          atomicWriteOptions: {
            beforeRename() {
              throw new Error('injected activity rename failure');
            },
          },
        },
      }),
      assertLoadError('KNOWLEDGE_ACTIVITY_WRITE_FAILED'),
    );
    assert.equal(readActivity(storePath).records[id].versions['1'].successfulLoads, 1);
  });
});

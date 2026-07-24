#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ACTIVITY_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'activity.mjs');

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-activity-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

async function loadActivityModule() {
  return import(pathToFileURL(ACTIVITY_MODULE).href);
}

function readSerializedActivity(storePath) {
  return fs.readFileSync(path.join(storePath, 'activity.json'), 'utf8');
}

function assertCorrupt(error) {
  return error?.code === 'KNOWLEDGE_ACTIVITY_CORRUPT'
    && /activity\.json/.test(error.message);
}

describe('knowledge activity schema', () => {
  it('treats a missing activity file as versioned zero history without writing it', async (t) => {
    const storePath = makeTmp(t);
    const { readKnowledgeActivity } = await loadActivityModule();

    assert.deepEqual(readKnowledgeActivity(storePath), {
      schemaVersion: 1,
      records: {},
      search: {
        matches: 0,
        misses: 0,
        recordMatches: {},
      },
    });
    assert.equal(fs.existsSync(path.join(storePath, 'activity.json')), false);
  });

  it('rejects malformed, future, and structurally invalid state without replacing bytes', async (t) => {
    const storePath = makeTmp(t);
    const activityPath = path.join(storePath, 'activity.json');
    const { readKnowledgeActivity, recordKnowledgeLoad } = await loadActivityModule();
    const invalidStates = [
      '{not-json}\n',
      '{"schemaVersion":2,"records":{},"search":{}}\n',
      '{"schemaVersion":1,"records":{"feature-a":{"versions":{"1":{"successfulLoads":-1,"lastLoadedAt":"yesterday"}}}},"search":{"matches":0,"misses":0,"recordMatches":{}}}\n',
      '{"schemaVersion":1,"records":{},"search":{"matches":0,"misses":0,"recordMatches":{},"query":"private"}}\n',
    ];

    for (const original of invalidStates) {
      fs.writeFileSync(activityPath, original);
      assert.throws(() => readKnowledgeActivity(storePath), assertCorrupt);
      await assert.rejects(
        recordKnowledgeLoad({ storePath, id: 'feature-a', version: 1 }),
        assertCorrupt,
      );
      assert.equal(readSerializedActivity(storePath), original);
    }
  });
});

describe('knowledge load aggregates', () => {
  it('aggregates successful loads by exact record version and across versions', async (t) => {
    const storePath = makeTmp(t);
    const {
      aggregateKnowledgeRecordActivity,
      incrementKnowledgeLoadActivity,
      readKnowledgeActivity,
      recordKnowledgeLoad,
      writeKnowledgeActivity,
    } = await loadActivityModule();

    await recordKnowledgeLoad({
      storePath,
      id: 'feature-learning',
      version: 7,
      now: () => Date.parse('2026-07-22T10:00:00.000Z'),
    });
    await recordKnowledgeLoad({
      storePath,
      id: 'feature-learning',
      version: 8,
      now: () => Date.parse('2026-07-22T11:00:00.000Z'),
    });
    const current = await recordKnowledgeLoad({
      storePath,
      id: 'feature-learning',
      version: 8,
      now: () => Date.parse('2026-07-22T12:00:00.000Z'),
      prompt: 'must not be serialized',
      transcript: '/private/transcript.jsonl',
      host: 'codex',
      sessionId: 'secret-session',
      toolOutput: 'full record content',
      projectPath: '/private/project',
    });
    const transactionUpdate = incrementKnowledgeLoadActivity(readKnowledgeActivity(storePath), {
      id: 'gotchas-hooks',
      version: 2,
      now: () => Date.parse('2026-07-22T11:30:00.000Z'),
    });
    writeKnowledgeActivity(storePath, transactionUpdate.activity);
    assert.deepEqual(transactionUpdate.versionActivity, {
      successfulLoads: 1,
      lastLoadedAt: '2026-07-22T11:30:00.000Z',
    });

    assert.deepEqual(current, {
      successfulLoads: 2,
      lastLoadedAt: '2026-07-22T12:00:00.000Z',
    });
    const activity = readKnowledgeActivity(storePath);
    assert.deepEqual(activity.records['feature-learning'], {
      versions: {
        '7': {
          successfulLoads: 1,
          lastLoadedAt: '2026-07-22T10:00:00.000Z',
        },
        '8': {
          successfulLoads: 2,
          lastLoadedAt: '2026-07-22T12:00:00.000Z',
        },
      },
    });
    assert.deepEqual(aggregateKnowledgeRecordActivity(activity, 'feature-learning'), {
      successfulLoads: 3,
      lastLoadedAt: '2026-07-22T12:00:00.000Z',
    });
    assert.deepEqual(aggregateKnowledgeRecordActivity(activity, 'gotchas-hooks'), {
      successfulLoads: 1,
      lastLoadedAt: '2026-07-22T11:30:00.000Z',
    });

    const serialized = readSerializedActivity(storePath);
    for (const forbidden of [
      'prompt',
      'query',
      'content',
      'transcript',
      'host',
      'session',
      'toolOutput',
      'tool-output',
      'projectPath',
      'project-path',
      '/private',
      'must not be serialized',
      'full record content',
    ]) {
      assert.equal(serialized.includes(forbidden), false, `serialized ${forbidden}`);
    }
  });

  it('serializes concurrent process updates through one linked-worktree store', async (t) => {
    const tmp = makeTmp(t);
    const storePath = path.join(tmp, 'shared-store');
    const linkedStorePath = path.join(tmp, 'linked-worktree-store');
    fs.mkdirSync(storePath);
    fs.symlinkSync(storePath, linkedStorePath, 'dir');
    const activityUrl = pathToFileURL(ACTIVITY_MODULE).href;
    const invocations = 24;
    const worker = [
      `import { recordKnowledgeLoad } from ${JSON.stringify(activityUrl)};`,
      'const [storePath] = process.argv.slice(1);',
      "await recordKnowledgeLoad({ storePath, id: 'shared-record', version: 3 });",
    ].join('\n');

    await Promise.all(Array.from({ length: invocations }, (_, index) =>
      execFileAsync(
        process.execPath,
        ['--input-type=module', '--eval', worker, index % 2 === 0 ? storePath : linkedStorePath],
        { timeout: 15_000 },
      )));

    const { aggregateKnowledgeRecordActivity, readKnowledgeActivity } = await loadActivityModule();
    const activity = readKnowledgeActivity(storePath);
    assert.equal(
      activity.records['shared-record'].versions['3'].successfulLoads,
      invocations,
    );
    assert.equal(
      aggregateKnowledgeRecordActivity(activity, 'shared-record').successfulLoads,
      invocations,
    );
  });
});

describe('knowledge search diagnostics', () => {
  it('records query-free matches and misses separately from load activity', async (t) => {
    const storePath = makeTmp(t);
    const {
      readKnowledgeActivity,
      recordKnowledgeLoad,
      recordKnowledgeSearch,
    } = await loadActivityModule();
    await recordKnowledgeLoad({
      storePath,
      id: 'feature-learning',
      version: 8,
      now: () => Date.parse('2026-07-22T10:00:00.000Z'),
    });
    const loadsBefore = readKnowledgeActivity(storePath).records;

    await recordKnowledgeSearch({
      storePath,
      results: [{ id: 'feature-learning' }, { id: 'feature-learning' }, { id: 'gotchas-hooks' }],
      now: () => Date.parse('2026-07-22T11:00:00.000Z'),
      query: 'private customer terms',
      prompt: 'private prompt',
    });
    await recordKnowledgeSearch({
      storePath,
      results: [],
      now: () => Date.parse('2026-07-22T12:00:00.000Z'),
      query: 'missing private terms',
    });

    const activity = readKnowledgeActivity(storePath);
    assert.deepEqual(activity.records, loadsBefore);
    assert.deepEqual(activity.search, {
      matches: 1,
      misses: 1,
      lastMatchAt: '2026-07-22T11:00:00.000Z',
      lastMissAt: '2026-07-22T12:00:00.000Z',
      recordMatches: {
        'feature-learning': {
          count: 1,
          lastMatchedAt: '2026-07-22T11:00:00.000Z',
        },
        'gotchas-hooks': {
          count: 1,
          lastMatchedAt: '2026-07-22T11:00:00.000Z',
        },
      },
    });
    const serialized = readSerializedActivity(storePath);
    assert.equal(serialized.includes('private customer terms'), false);
    assert.equal(serialized.includes('missing private terms'), false);
    assert.equal(serialized.includes('private prompt'), false);
  });
});

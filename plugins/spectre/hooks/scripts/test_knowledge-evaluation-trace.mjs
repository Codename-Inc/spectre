import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { refreshKnowledgeIndex } from './knowledge/records.mjs';
import { detectTraceBypass } from './knowledge/evaluation-trace.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_CLI = path.join(SCRIPT_DIR, 'knowledge-cli.mjs');

function record(id, content = 'SPECTRE_TRACE_RECORD_BODY') {
  return {
    schemaVersion: 1, id, kind: 'knowledge', title: 'Trace fixture',
    summary: 'Trace real public knowledge operations.', tags: ['trace'], applicability: { scope: 'project' },
    provenance: { origin: 'captured', capturedAt: '2026-09-06T00:00:00.000Z' }, relatedRecordIds: [],
    category: 'pattern', useWhen: 'Use when handling secret query text through the public knowledge CLI.', content,
    evidence: 'A runtime trace fixture.', status: 'active',
  };
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-evaluation-trace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectDir = path.join(root, 'project');
  const spectreHome = path.join(root, 'spectre-home');
  fs.mkdirSync(projectDir, { recursive: true });
  const { storePath } = await resolveProjectStore(projectDir, { spectreHome });
  const id = 'trace-record';
  const recordPath = path.join(storePath, 'knowledge', id, 'record.json');
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(record(id), null, 2)}\n`);
  refreshKnowledgeIndex(storePath);
  return { root, projectDir, spectreHome, storePath, id };
}

function run(value, tracePath, args) {
  return spawnSync(process.execPath, [KNOWLEDGE_CLI, ...args, '--project-dir', value.projectDir, '--json'], {
    cwd: value.projectDir,
    env: { ...process.env, SPECTRE_HOME: value.spectreHome, SPECTRE_KNOWLEDGE_EVALUATION_TRACE: tracePath, SPECTRE_KNOWLEDGE_EVALUATION_CONTEXT_ID: 'trace-context' },
    encoding: 'utf8',
  });
}

test('runtime trace is opt-in and records actual public search, load, and capture results without query or body text', async (t) => {
  const value = await fixture(t);
  const disabledPath = path.join(value.root, 'disabled.json');
  const disabled = run(value, '', ['search', 'secret query text']);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.equal(fs.existsSync(disabledPath), false);

  const tracePath = path.join(value.root, 'trace.json');
  for (const args of [
    ['search', 'secret query text'],
    ['load', value.id],
  ]) {
    const result = run(value, tracePath, args);
    assert.equal(result.status, 0, result.stderr);
  }
  const proposal = path.join(value.root, 'proposal', 'trace-created');
  fs.mkdirSync(proposal, { recursive: true });
  fs.writeFileSync(path.join(proposal, 'record.json'), JSON.stringify(record('trace-created', 'SPECTRE_CAPTURE_BODY')));
  const registered = run(value, tracePath, ['register', '--record', proposal]);
  assert.equal(registered.status, 0, registered.stderr);

  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  assert.deepEqual(trace.events.map(({ type }) => type), ['search', 'load', 'capture']);
  const [search, load, capture] = trace.events;
  assert.match(search.queryHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(search.contextHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(search.results.map(({ id }) => id), [value.id]);
  assert.match(search.results[0].revisionToken, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Number.isSafeInteger(search.responseBytes), true);
  assert.equal(load.id, value.id);
  assert.match(load.revisionToken, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Number.isSafeInteger(load.loadedBytes), true);
  assert.deepEqual(capture, { ...capture, type: 'capture', id: 'trace-created', outcome: 'created' });
  const serialized = JSON.stringify(trace);
  assert.equal(serialized.includes('secret query text'), false);
  assert.equal(serialized.includes('SPECTRE_TRACE_RECORD_BODY'), false);
  assert.equal(serialized.includes('SPECTRE_CAPTURE_BODY'), false);
});

test('bypass detection scopes direct and shell reads to known knowledge fixtures and reports uncertainty', () => {
  const knownPath = '/isolated/store/knowledge/trace-record/record.json';
  const events = detectTraceBypass([
    { name: 'Read', input: { file_path: knownPath } },
    { name: 'exec', input: { command: `node -e "require('node:fs').readFileSync('${knownPath}')"` } },
    { name: 'exec', input: { command: `python3 -c "open('${knownPath}')"` } },
    { name: 'exec', input: { command: 'cat README.md' } },
    { name: 'Read', input: {} },
  ], { knownPaths: [knownPath] });
  assert.deepEqual(events.map(({ reason, evidence }) => ({ reason, evidence })), [
    { reason: 'direct-read', evidence: 'detected' },
    { reason: 'shell-read', evidence: 'detected' },
    { reason: 'shell-read', evidence: 'detected' },
    { reason: 'direct-read', evidence: 'suspected' },
  ]);
  assert.equal(JSON.stringify(events).includes(knownPath), false);
});

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { invokeKnowledgeHost, normalizeKnowledgeHostTranscript } from './knowledge-evaluation-hosts.mjs';

function childFor({ stdout = '', stderr = '', exitCode = 0, signal = null, delay = 0 }) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    signal = 'SIGTERM';
    exitCode = null;
  };
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    setTimeout(() => child.emit('close', exitCode, signal), delay);
  });
  return child;
}

async function fixture(host) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `knowledge-host-${host}-`));
  const value = {
    projectDir: path.join(root, 'project'),
    storeDir: path.join(root, 'store'),
    pluginDir: path.join(root, 'plugin'),
    freshStore: true,
    codexHome: path.join(root, 'codex'),
    claudeHome: path.join(root, 'claude'),
  };
  await Promise.all(Object.values(value).filter((directory) => typeof directory === 'string').map((directory) => fs.mkdir(directory, { recursive: true })));
  return { root, value, rawLogDirectory: path.join(root, 'raw-host-logs') };
}

test('Claude transcript preserves primary and worker native usage, tools, and final text', async () => {
  const setup = await fixture('claude');
  const stdout = [
    JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: '/fixture/record.json' } },
      { type: 'text', text: 'I read the record.' },
    ] } }),
    JSON.stringify({ type: 'assistant', is_sidechain: true, worker_id: 'worker-a', message: { usage: { input_tokens: 9, output_tokens: 4 }, content: [
      { type: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'node probe.mjs' } },
    ] } }),
    JSON.stringify({ type: 'result', duration_ms: 123, result: 'Claude final answer', usage: {
      input_tokens: 101, cache_read_input_tokens: 7, cache_creation_input_tokens: 2, output_tokens: 13,
      aggregated_output: 'loaded record-id',
    } }),
  ].join('\n');
  const result = await invokeKnowledgeHost({
    host: 'claude', model: 'opus', effort: 'medium', prompt: 'use fixture',
    preparedFixture: setup.value, rawLogDirectory: setup.rawLogDirectory,
  }, { spawn: () => childFor({ stdout }) });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.usage.primary, {
    input: 101, cache: 7, cacheWrite: 2, output: 13, reasoning: null,
  });
  assert.equal(result.usage.fullCycle, null);
  assert.deepEqual(result.usage.workers, [{
    id: 'worker-a', input: 9, cache: null, cacheWrite: null, output: 4, reasoning: null,
  }]);
  assert.equal(result.toolOperations.length, 2);
  assert.deepEqual(result.toolOperations.map((operation) => operation.name), ['Read', 'Bash']);
  assert.ok(result.textFinalAnswers.includes('Claude final answer'));
  assert.equal(result.timing.nativeDurationMs, 123);
  assert.equal(result.isolation.freshStore, true);
});

test('Claude model totals are the only full-cycle aggregate and duplicate worker messages do not inflate it', () => {
  const transcript = normalizeKnowledgeHostTranscript('claude', [
    JSON.stringify({ type: 'assistant', is_sidechain: true, worker_id: 'worker-a', message: { id: 'same-step', usage: { input_tokens: 9, output_tokens: 999 } } }),
    JSON.stringify({ type: 'assistant', is_sidechain: true, worker_id: 'worker-a', message: { id: 'same-step', usage: { input_tokens: 9, output_tokens: 999 } } }),
    JSON.stringify({ type: 'result', usage: { input_tokens: 10, output_tokens: 4 }, modelUsage: {
      'claude-test': { inputTokens: 12, cacheReadInputTokens: 3, cacheCreationInputTokens: 2, outputTokens: 8 },
    } }),
  ].join('\n'));
  assert.deepEqual(transcript.usage.primary, { input: 10, cache: null, cacheWrite: null, output: 4, reasoning: null });
  assert.equal(transcript.usage.workers.length, 1);
  assert.deepEqual(transcript.usage.fullCycle, {
    source: 'result.modelUsage',
    models: [{ model: 'claude-test', input: 12, cache: 3, cacheWrite: 2, output: 8, reasoning: null }],
    total: { input: 12, cache: 3, cacheWrite: 2, output: 8, reasoning: null },
  });
});

test('Claude preserves parent tool linkage without treating a bare agent id as worker proof', () => {
  const transcript = normalizeKnowledgeHostTranscript('claude', [
    JSON.stringify({ type: 'assistant', agent_id: 'root-agent', message: { content: [{ type: 'tool_use', id: 'primary-read', name: 'Read', input: {} }] } }),
    JSON.stringify({ type: 'assistant', agent_id: 'child-agent', parent_tool_use_id: 'task-1', message: { content: [{ type: 'tool_use', id: 'child-read', name: 'Read', input: {} }] } }),
  ].join('\n'));
  assert.deepEqual(transcript.toolOperations.map(({ id, actorRole, actorId, parentToolUseId }) => ({ id, actorRole, actorId, parentToolUseId })), [
    { id: 'primary-read', actorRole: 'primary', actorId: 'root-agent', parentToolUseId: null },
    { id: 'child-read', actorRole: 'worker', actorId: 'child-agent', parentToolUseId: 'task-1' },
  ]);
});

test('Codex transcript reports command timing without inventing omitted usage fields', async () => {
  const setup = await fixture('codex');
  const stdout = [
    JSON.stringify({ type: 'item.completed', item: {
      type: 'command_execution', id: 'exec-1', command: 'cat record.json', status: 'completed',
      started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:00:00.025Z', duration_ms: 25,
      aggregated_output: 'loaded record-id',
    } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Codex final answer' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 22, output_tokens: 6 } }),
  ].join('\n');
  const result = await invokeKnowledgeHost({
    host: 'codex', model: 'gpt-test', effort: 'high', prompt: 'use fixture',
    preparedFixture: setup.value, rawLogDirectory: setup.rawLogDirectory,
  }, { spawn: () => childFor({ stdout }) });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.usage.primary, {
    input: 22, cache: null, cacheWrite: null, output: 6, reasoning: null,
  });
  assert.equal(result.usage.workers, null);
  assert.equal(result.usage.fullCycle, null);
  assert.deepEqual(result.toolOperations[0], {
    id: 'exec-1', host: 'codex', name: 'exec', type: 'command_execution',
    input: { command: 'cat record.json' }, status: 'completed',
    startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:00:00.025Z', durationMs: 25,
    actorRole: 'primary', actorId: null, parentToolUseId: null, eventOrdinal: 0,
  });
  assert.deepEqual(result.toolResults, [{ host: 'codex', toolUseId: 'exec-1', eventOrdinal: 0, content: 'loaded record-id' }]);
  assert.deepEqual(result.textFinalAnswers, ['Codex final answer']);
});

test('nonzero host exits retain normalized evidence and remove staged Codex auth in finally', async () => {
  const setup = await fixture('codex');
  const authSource = path.join(setup.root, 'source-auth.json');
  await fs.writeFile(authSource, JSON.stringify({ token: 'do-not-return-this' }));
  const result = await invokeKnowledgeHost({
    host: 'codex', model: 'gpt-test', effort: 'medium', prompt: 'use fixture',
    preparedFixture: setup.value, rawLogDirectory: setup.rawLogDirectory, authSourcePath: authSource,
  }, { spawn: () => childFor({ stdout: JSON.stringify({ type: 'turn.completed', usage: {} }), stderr: 'exit failure', exitCode: 7 }) });

  assert.equal(result.status, 'failed');
  assert.equal(result.exit.exitCode, 7);
  assert.equal(result.usage.primary.input, null);
  assert.equal(await fs.stat(path.join(setup.value.codexHome, 'auth.json')).then(() => true, () => false), false);
  assert.equal(JSON.stringify(result).includes('do-not-return-this'), false);
});

test('cleanup failure is reported without losing a completed host result', async () => {
  const setup = await fixture('codex');
  const authSource = path.join(setup.root, 'source-auth.json');
  await fs.writeFile(authSource, '{}');
  const result = await invokeKnowledgeHost({
    host: 'codex', model: 'gpt-test', effort: 'medium', prompt: 'use fixture',
    preparedFixture: setup.value, rawLogDirectory: setup.rawLogDirectory, authSourcePath: authSource,
  }, {
    spawn: () => childFor({ stdout: JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1 } }) }),
    removeFile: async () => { throw new Error('cleanup denied'); },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.cleanup, { stagedAuth: 'cleanup-failed' });
});

test('configured timeout terminates a host and still writes bounded external logs', async () => {
  const setup = await fixture('claude');
  const result = await invokeKnowledgeHost({
    host: 'claude', model: 'opus', effort: 'medium', prompt: 'use fixture',
    preparedFixture: setup.value, rawLogDirectory: setup.rawLogDirectory,
    limits: { timeoutMs: 5, terminationGraceMs: 1, maxOutputBytes: 1024 },
  }, { spawn: () => childFor({ stdout: '{"type":"assistant"}', delay: 50 }) });

  assert.equal(result.status, 'timed_out');
  assert.equal(result.exit.timedOut, true);
  assert.equal(await fs.readFile(result.rawLogs.stdoutPath, 'utf8'), '{"type":"assistant"}');
});

test('rejects raw host logs inside the checkout before launching a host', async () => {
  const setup = await fixture('claude');
  let launched = false;
  await assert.rejects(() => invokeKnowledgeHost({
    host: 'claude', model: 'opus', effort: 'medium', prompt: 'use fixture',
    preparedFixture: setup.value, rawLogDirectory: path.join(process.cwd(), 'raw-host-logs'),
    repositoryRoot: process.cwd(),
  }, { spawn: () => { launched = true; return childFor({}); } }), /outside the checkout/);
  assert.equal(launched, false);
});

test('no-knowledge invocation omits plugin and store arguments while retaining the isolated project', async () => {
  const setup = await fixture('codex');
  let launched;
  await invokeKnowledgeHost({
    host: 'codex', model: 'gpt-test', effort: 'medium', prompt: 'ordinary task',
    preparedFixture: { projectDir: setup.value.projectDir, codexHome: setup.value.codexHome, claudeHome: setup.value.claudeHome, freshStore: true, noKnowledge: true },
    rawLogDirectory: setup.rawLogDirectory,
  }, { spawn: (command, args) => { launched = { command, args }; return childFor({ stdout: JSON.stringify({ type: 'turn.completed', usage: {} }) }); } });
  assert.equal(launched.args.includes('--add-dir'), false);
  assert.equal(launched.args.includes(setup.value.storeDir), false);
});

test('Codex permits git metadata writes only for an attested isolated fixture', async () => {
  const setup = await fixture('codex');
  let launched;
  const result = await invokeKnowledgeHost({
    host: 'codex', model: 'gpt-test', effort: 'medium', prompt: 'complete the local workflow',
    preparedFixture: { ...setup.value, isolatedGitWorkflow: true }, rawLogDirectory: setup.rawLogDirectory,
  }, { spawn: (_command, args) => { launched = args; return childFor({ stdout: JSON.stringify({ type: 'turn.completed', usage: {} }) }); } });
  const sandbox = launched.indexOf('--sandbox');
  assert.equal(launched[sandbox + 1], 'danger-full-access');
  assert.equal(result.isolation.codexSandbox, 'danger-full-access');
});

test('every host invocation receives both isolated provider homes and removes staged Codex auth', async () => {
  const setup = await fixture('claude');
  const authSource = path.join(setup.root, 'source-auth.json');
  await fs.writeFile(authSource, '{}');
  let environment;
  const result = await invokeKnowledgeHost({
    host: 'claude', model: 'opus', effort: 'medium', prompt: 'workflow task',
    preparedFixture: setup.value, rawLogDirectory: setup.rawLogDirectory, authSourcePath: authSource,
  }, { spawn: (_command, _args, options) => { environment = options.env; return childFor({ stdout: JSON.stringify({ type: 'result', usage: {} }) }); } });
  assert.equal(environment.CODEX_HOME, setup.value.codexHome);
  assert.equal(environment.CLAUDE_CONFIG_DIR, setup.value.claudeHome);
  assert.equal(environment.CLAUDE_SECURESTORAGE_CONFIG_DIR, '');
  assert.deepEqual({ claudeHome: result.isolation.claudeHome, codexHome: result.isolation.codexHome }, { claudeHome: setup.value.claudeHome, codexHome: setup.value.codexHome });
  assert.equal(await fs.stat(path.join(setup.value.codexHome, 'auth.json')).then(() => true, () => false), false);
});

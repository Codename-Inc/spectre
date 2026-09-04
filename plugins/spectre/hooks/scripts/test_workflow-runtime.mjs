#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

import { resolveProjectStore } from './knowledge/store.mjs';
import {
  cleanupAllWorkflowStores,
  cleanupProjectWorkflow,
  purgeProjectWorkflow,
} from './workflow/retention.mjs';
import {
  readWorkflowRun,
  recordWorkflowEvents,
  startWorkflowRun,
  workflowPaths,
} from './workflow/store.mjs';
import {
  finishMeasurement,
  persistShipMeasurement,
  startMeasurement,
  summarizeMeasurement,
} from './workflow/measurement.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-workflow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectDir = path.join(root, 'project');
  const spectreHome = path.join(root, 'home');
  const featureRoot = path.join(projectDir, '.spectre', 'features', 'runtime-test');
  const sourcePath = path.join(featureRoot, 'specs', 'tasks.json');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    meta: {
      schema_version: 1,
      feature: 'runtime-test',
      feature_root: '.spectre/features/runtime-test',
    },
    phases: [{
      id: '1',
      title: 'Build',
      parents: [{
        id: '1.1',
        title: 'Parent',
        subtasks: [{ id: '1.1.1', title: 'Child', type: 'Build' }],
      }],
    }],
  }, null, 2));
  return { root, projectDir, spectreHome, sourcePath };
}

async function completeFixtureRun(value, options = {}) {
  const immutableSource = fs.readFileSync(value.sourcePath, 'utf8');
  const started = await startWorkflowRun({
    projectDir: value.projectDir,
    spectreHome: value.spectreHome,
    source: value.sourcePath,
    owner: options.owner || 'self',
    provider: options.provider || 'openai',
    model: options.model || 'gpt-5.6-sol',
    effort: options.effort || 'high',
    now: options.now,
  });
  const dispatch = await recordWorkflowEvents({
    projectDir: value.projectDir,
    spectreHome: value.spectreHome,
    runId: started.runId,
    idempotencyKey: 'dispatch:1',
    now: options.now,
    events: [{
      type: 'agent.dispatched',
      actorId: started.primaryActorId,
      assignmentId: 'assignment_1',
      attempt: 1,
      payload: {
        workerActorId: 'actor_00000000-0000-4000-8000-000000000001',
        provider: 'openai',
        model: 'gpt-5.6-terra',
        effort: 'high',
        taskDefinitions: [{ id: '1.1' }, { id: '1.1.1' }],
      },
    }, ...['1.1', '1.1.1'].map((taskId) => ({
      type: 'task.assigned',
      actorId: started.primaryActorId,
      taskId,
      assignmentId: 'assignment_1',
      attempt: 1,
      payload: { assignedActorId: 'actor_00000000-0000-4000-8000-000000000001' },
    }))],
  });
    assert.equal(dispatch.events[0].type, 'agent.dispatched');
    assert.equal(dispatch.events[0].payload.taskDefinitions[1].level, 'subtask');
  const workerActorId = dispatch.events[0].payload.workerActorId;
  for (const taskId of ['1.1', '1.1.1']) {
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      now: options.now,
      events: [{ type: 'task.started', actorId: workerActorId, taskId, attempt: 1, payload: {} }],
    });
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      now: options.now,
      events: [{ type: 'task.submitted', actorId: workerActorId, taskId, attempt: 1, payload: {} }],
    });
  }
  const verification = await recordWorkflowEvents({
    projectDir: value.projectDir,
    spectreHome: value.spectreHome,
    runId: started.runId,
    now: options.now,
    events: [{
      type: 'gate.recorded',
      actorId: started.primaryActorId,
      waveId: '1',
      payload: {
        kind: 'verification',
        status: 'pass',
        taskIds: ['1.1', '1.1.1'],
        checkIds: ['lint:affected', 'test:runtime-focused'],
      },
    }],
  });
  const gateEventId = verification.events[0].eventId;
  for (const taskId of ['1.1.1', '1.1']) {
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      now: options.now,
      events: [{
        type: 'task.completed',
        actorId: started.primaryActorId,
        taskId,
        payload: { gateEventId },
      }],
    });
  }
  assert.equal(fs.readFileSync(value.sourcePath, 'utf8'), immutableSource);
  return { ...started, workerActorId };
}

describe('workflow event runtime', () => {
  it('rejects duplicate task identities before creating a run', async (t) => {
    const value = fixture(t);
    const document = JSON.parse(fs.readFileSync(value.sourcePath, 'utf8'));
    document.phases[0].parents[0].subtasks.push({ id: '1.1' });
    fs.writeFileSync(value.sourcePath, JSON.stringify(document));
    await assert.rejects(
      startWorkflowRun({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        source: value.sourcePath,
      }),
      (error) => error?.code === 'DUPLICATE_TASK_ID',
    );
  });

  it('records every task level while reserving acceptance for the primary and a passing gate', async (t) => {
    const value = fixture(t);
    const run = await completeFixtureRun(value);
    const loaded = await readWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: run.runId,
    });
    assert.equal(loaded.state.tasks['1.1'].state, 'completed');
    assert.equal(loaded.state.tasks['1.1.1'].state, 'completed');
    assert.equal(Object.hasOwn(loaded.state.tasks['1.1'], 'sourceStatus'), false);
    assert.equal(Object.hasOwn(loaded.state.tasks['1.1.1'], 'sourceStatus'), false);
    const verificationGate = Object.values(loaded.state.gates)
      .find((gate) => gate.kind === 'verification');
    assert.deepEqual(verificationGate.checkIds, ['lint:affected', 'test:runtime-focused']);
    assert.deepEqual(
      loaded.events.filter((event) => event.type === 'task.started').map((event) => event.taskId),
      ['1.1', '1.1.1'],
    );

    await assert.rejects(
      recordWorkflowEvents({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        runId: run.runId,
        events: [{
          type: 'task.completed',
          actorId: run.workerActorId,
          taskId: '1.1',
          payload: { gateEventId: loaded.events.find((event) => event.type === 'gate.recorded').eventId },
        }],
      }),
      (error) => error?.code === 'PRIMARY_REQUIRED' || error?.code === 'INVALID_TASK_TRANSITION',
    );
  });

  it('resumes a compatible active run and deduplicates retried events', async (t) => {
    const value = fixture(t);
    const first = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: value.sourcePath,
    });
    const resumed = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: value.sourcePath,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.runId, first.runId);

    const options = {
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: first.runId,
      idempotencyKey: 'stage:execute:start',
      events: [{ type: 'stage.started', actorId: first.primaryActorId, stage: 'execute', payload: {} }],
    };
    const initial = await recordWorkflowEvents(options);
    const retried = await recordWorkflowEvents(options);
    assert.equal(retried.idempotent, true);
    assert.equal(retried.events[0].eventId, initial.events[0].eventId);
  });

  it('requires all tasks and a passing proof before a self-owned pass', async (t) => {
    const value = fixture(t);
    const run = await completeFixtureRun(value);
    await assert.rejects(
      recordWorkflowEvents({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        runId: run.runId,
        events: [{ type: 'run.completed', actorId: run.primaryActorId, payload: {} }],
      }),
      (error) => error?.code === 'PASSING_PROOF_REQUIRED',
    );
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: run.runId,
      events: [{
        type: 'gate.recorded',
        actorId: run.primaryActorId,
        payload: { kind: 'proof', status: 'pass', taskIds: ['1.1', '1.1.1'] },
      }],
    });
    const completed = await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: run.runId,
      events: [{ type: 'run.completed', actorId: run.primaryActorId, payload: {} }],
    });
    assert.equal(completed.status, 'passed');
    const resolved = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const paths = workflowPaths(resolved.storePath, run.runId);
    assert.equal(JSON.parse(fs.readFileSync(paths.summaryPath, 'utf8')).status, 'passed');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(paths.summaryPath, 'utf8')).routing,
      [
        { role: 'primary', provider: 'openai', model: 'gpt-5.6-sol', effort: 'high' },
        { role: 'worker', provider: 'openai', model: 'gpt-5.6-terra', effort: 'high' },
      ],
    );
  });

  it('requires verification gates to cover the accepted task and rejects free-form marker data', async (t) => {
    const value = fixture(t);
    const started = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: value.sourcePath,
    });
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{ type: 'task.started', actorId: started.primaryActorId, taskId: '1.1.1', payload: {} }],
    });
    await assert.rejects(
      recordWorkflowEvents({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        runId: started.runId,
        events: [{
          type: 'task.blocked',
          actorId: started.primaryActorId,
          taskId: '1.1.1',
          payload: { reasonCode: 'raw private explanation' },
        }],
      }),
      (error) => error?.code === 'INVALID_EVENT_VALUE',
    );
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{ type: 'task.submitted', actorId: started.primaryActorId, taskId: '1.1.1', payload: {} }],
    });
    const gate = await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{
        type: 'gate.recorded',
        actorId: started.primaryActorId,
        payload: { kind: 'verification', status: 'pass', taskIds: ['1.1'] },
      }],
    });
    await assert.rejects(
      recordWorkflowEvents({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        runId: started.runId,
        events: [{
          type: 'task.completed',
          actorId: started.primaryActorId,
          taskId: '1.1.1',
          payload: { gateEventId: gate.events[0].eventId },
        }],
      }),
      (error) => error?.code === 'GATE_TASK_MISMATCH',
    );
  });

  it('repairs an incomplete final line without accepting malformed interior events', async (t) => {
    const value = fixture(t);
    const started = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: value.sourcePath,
    });
    const resolved = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const paths = workflowPaths(resolved.storePath, started.runId);
    fs.appendFileSync(paths.eventsPath, '{"partial"');
    const recorded = await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{ type: 'stage.started', actorId: started.primaryActorId, stage: 'execute', payload: {} }],
    });
    assert.equal(recorded.events[0].type, 'stage.started');
    assert.equal(fs.readdirSync(workflowPaths(resolved.storePath).recoveryDir).length, 1);
  });

  it('stores references and hashes without serializing evidence contents', async (t) => {
    const value = fixture(t);
    const secretPath = path.join(value.projectDir, 'verification.txt');
    fs.writeFileSync(secretPath, 'PRIVATE_OUTPUT_MUST_NOT_BE_STORED');
    const started = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: value.sourcePath,
    });
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{
        type: 'gate.recorded',
        actorId: started.primaryActorId,
        evidence: [secretPath],
        payload: { kind: 'verification', status: 'fail', taskIds: [] },
      }],
    });
    const resolved = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const serialized = fs.readFileSync(workflowPaths(resolved.storePath, started.runId).eventsPath, 'utf8');
    assert.match(serialized, /verification\.txt/);
    assert.doesNotMatch(serialized, /PRIVATE_OUTPUT_MUST_NOT_BE_STORED/);
  });

  it('stores Execute runs under their namespace and migrates a legacy run directory', async (t) => {
    const value = fixture(t);
    const started = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: value.sourcePath,
    });
    const resolved = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const namespaced = workflowPaths(resolved.storePath, started.runId);
    assert.equal(
      namespaced.runDir,
      path.join(resolved.storePath, 'workflow', 'execute', 'runs', started.runId),
    );

    const legacyRunDir = path.join(resolved.storePath, 'workflow', 'runs', started.runId);
    fs.mkdirSync(path.dirname(legacyRunDir), { recursive: true });
    fs.renameSync(namespaced.runDir, legacyRunDir);

    const loaded = await readWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
    });
    assert.equal(loaded.paths.runDir, namespaced.runDir);
    assert.equal(fs.existsSync(namespaced.statePath), true);
    assert.equal(fs.existsSync(legacyRunDir), false);
  });
});

function writeJsonl(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

function measurementFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-measurement-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    projectDir: path.join(root, 'project'),
    spectreHome: path.join(root, 'home'),
    codexSessionsDir: path.join(root, 'codex', 'sessions'),
    claudeProjectsDir: path.join(root, 'claude', 'projects'),
  };
}

function codexUsage(totalTokens, inputTokens = totalTokens - 10, outputTokens = 10) {
  return {
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: inputTokens,
          cached_input_tokens: 0,
          output_tokens: outputTokens,
          reasoning_output_tokens: 0,
          total_tokens: totalTokens,
        },
      },
    },
  };
}

function claudeUsage(inputTokens, outputTokens, {
  cacheCreationInputTokens = 0,
  cacheReadInputTokens = 0,
} = {}) {
  return {
    type: 'assistant',
    message: {
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: cacheCreationInputTokens,
        cache_read_input_tokens: cacheReadInputTokens,
      },
    },
  };
}

describe('workflow measurement runtime', () => {
  it('returns an exact Codex stage delta from cumulative token_count counters', (t) => {
    const hosts = measurementFixture(t);
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const sessionPath = path.join(hosts.codexSessionsDir, `rollout-2026-${sessionId}.jsonl`);
    writeJsonl(sessionPath, [codexUsage(120)]);
    const snapshot = startMeasurement({
      label: 'Sweep',
      now: () => 1_000,
      env: { CODEX_SESSION_ID: sessionId },
      hosts,
    });
    writeJsonl(sessionPath, [codexUsage(120), codexUsage(185)]);

    const row = finishMeasurement({ snapshot, now: () => 1_250, hosts });
    assert.deepEqual(row, {
      stage: 'Sweep',
      runs: 1,
      elapsedMs: 250,
      tokens: 65,
      tokenScope: 'stage',
      status: 'complete',
      hostCounters: {
        start: { inputTokens: 110, cachedInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: 120 },
        end: { inputTokens: 175, cachedInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: 185 },
      },
    });
  });

  it('uses the returned Claude child identity for an attributable exact stage total', (t) => {
    const hosts = measurementFixture(t);
    const parentId = '22222222-2222-4222-8222-222222222222';
    const childId = '33333333-3333-4333-8333-333333333333';
    writeJsonl(path.join(hosts.claudeProjectsDir, 'project', `${parentId}.jsonl`), [claudeUsage(20, 2)]);
    writeJsonl(path.join(hosts.claudeProjectsDir, 'project', `${childId}.jsonl`), [claudeUsage(40, 4), claudeUsage(50, 6)]);
    const snapshot = startMeasurement({
      label: 'Prune',
      now: () => 2_000,
      env: { CLAUDE_SESSION_ID: parentId },
      hosts,
    });

    const row = finishMeasurement({ snapshot, childAgentId: childId, now: () => 2_600, hosts });
    assert.equal(row.tokens, 100);
    assert.equal(row.tokenScope, 'stage');
    assert.equal(Object.hasOwn(row, 'hostSession'), false);
    assert.deepEqual(row.hostCounters.start, {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    });
  });

  it('includes Claude cache creation and read tokens in an exact stage delta', (t) => {
    const hosts = measurementFixture(t);
    const sessionId = '77777777-7777-4777-8777-777777777777';
    const sessionPath = path.join(hosts.claudeProjectsDir, 'project', `${sessionId}.jsonl`);
    const startUsage = claudeUsage(10, 5, {
      cacheCreationInputTokens: 4,
      cacheReadInputTokens: 6,
    });
    const finishUsage = claudeUsage(20, 7, {
      cacheCreationInputTokens: 8,
      cacheReadInputTokens: 9,
    });
    writeJsonl(sessionPath, [startUsage]);
    const snapshot = startMeasurement({
      label: 'Sweep',
      now: () => 4_000,
      env: { CLAUDE_SESSION_ID: sessionId },
      hosts,
    });
    writeJsonl(sessionPath, [startUsage, finishUsage]);

    const row = finishMeasurement({ snapshot, now: () => 4_100, hosts });
    assert.equal(row.tokens, 44);
    assert.equal(row.hostCounters.start.totalTokens, 25);
    assert.equal(row.hostCounters.end.totalTokens, 69);
  });

  it('collapses unattributed concurrent pairs to one exact parallel-group total', (t) => {
    const hosts = measurementFixture(t);
    const sessionId = '44444444-4444-4444-8444-444444444444';
    const sessionPath = path.join(hosts.codexSessionsDir, `rollout-2026-${sessionId}.jsonl`);
    writeJsonl(sessionPath, [codexUsage(100)]);
    const outer = startMeasurement({ label: 'Ship', now: () => 1_000, env: { CODEX_SESSION_ID: sessionId }, hosts });
    const prune = startMeasurement({ label: 'Prune', now: () => 1_100, env: { CODEX_SESSION_ID: sessionId }, hosts });
    writeJsonl(sessionPath, [codexUsage(100), codexUsage(140)]);
    const test = startMeasurement({ label: 'Test', now: () => 1_200, env: { CODEX_SESSION_ID: sessionId }, hosts });
    writeJsonl(sessionPath, [codexUsage(100), codexUsage(190)]);
    const rows = [
      finishMeasurement({ snapshot: prune, now: () => 1_500, hosts }),
      finishMeasurement({ snapshot: test, now: () => 1_600, hosts }),
    ];

    const result = summarizeMeasurement({ rows, outerSnapshot: outer, now: () => 1_700 });
    assert.equal(result.rows[0].tokens, 90);
    assert.equal(result.rows[0].tokenScope, 'parallel-group');
    assert.equal(result.rows[1].tokens, 'unavailable');
    assert.equal(result.rows[1].tokenScope, 'parallel-group');
    assert.match(result.table, /Prune \| 1 \| 400ms \| 90 \| parallel-group \| complete/);
    assert.match(result.table, /Test \| 1 \| 400ms \| unavailable \| parallel-group \| complete/);
    assert.equal(result.totalElapsedMs, 700);
  });

  it('keeps malformed trailing JSONL data from discarding complete Codex counters', (t) => {
    const hosts = measurementFixture(t);
    const sessionId = '66666666-6666-4666-8666-666666666666';
    const sessionPath = path.join(hosts.codexSessionsDir, `rollout-2026-${sessionId}.jsonl`);
    writeJsonl(sessionPath, [codexUsage(100)]);
    const snapshot = startMeasurement({
      label: 'Sweep', now: () => 1_000, env: { CODEX_SESSION_ID: sessionId }, hosts,
    });
    fs.appendFileSync(sessionPath, `${JSON.stringify(codexUsage(145))}\n{\"incomplete\":`);

    const row = finishMeasurement({ snapshot, now: () => 1_100, hosts });
    assert.equal(row.tokens, 45);
    assert.equal(row.status, 'complete');
  });

  it('rejects malformed interior JSONL data rather than silently skipping it', (t) => {
    const hosts = measurementFixture(t);
    const sessionId = '67676767-6767-4676-8676-676767676767';
    const sessionPath = path.join(hosts.codexSessionsDir, `rollout-2026-${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, `${JSON.stringify(codexUsage(100))}\n{\"bad\":\n${JSON.stringify(codexUsage(145))}\n`);
    const snapshot = startMeasurement({
      label: 'Sweep', now: () => 1_000, env: { CODEX_SESSION_ID: sessionId }, hosts,
    });

    const row = finishMeasurement({ snapshot, now: () => 1_100, hosts });
    assert.equal(row.tokens, 'unavailable');
    assert.equal(row.status, 'unavailable');
  });

  it('aggregates repeated finished stage rows and refuses mixed token scopes', () => {
    const outerSnapshot = { label: 'Ship', epochMs: 1_000 };
    const result = summarizeMeasurement({
      outerSnapshot,
      now: () => 1_900,
      rows: [
        { stage: 'Sweep', runs: 1, elapsedMs: 100, tokens: 10, tokenScope: 'stage', status: 'complete' },
        { stage: 'Sweep', runs: 1, elapsedMs: 200, tokens: 20, tokenScope: 'stage', status: 'complete' },
        { stage: 'Rebase', runs: 1, elapsedMs: 100, tokens: 10, tokenScope: 'stage', status: 'complete' },
        { stage: 'Rebase', runs: 1, elapsedMs: 200, tokens: 'unavailable', tokenScope: 'unavailable', status: 'unavailable' },
      ],
    });
    const sweep = result.rows.find((row) => row.stage === 'Sweep');
    const rebase = result.rows.find((row) => row.stage === 'Rebase');
    assert.deepEqual(sweep, {
      stage: 'Sweep', runs: 2, elapsedMs: 300, tokens: 30, tokenScope: 'stage', status: 'complete',
    });
    assert.deepEqual(rebase, {
      stage: 'Rebase', runs: 2, elapsedMs: 300, tokens: 'unavailable', tokenScope: 'unavailable', status: 'unavailable',
    });
  });

  it('downgrades an unpaired parallel fallback to unavailable', () => {
    const result = summarizeMeasurement({
      outerSnapshot: { label: 'Ship', epochMs: 1_000 },
      now: () => 1_500,
      rows: [{
        stage: 'Prune', runs: 1, elapsedMs: 100, tokens: 30, tokenScope: 'parallel-group', status: 'complete',
        hostCounters: { start: { totalTokens: 10 }, end: { totalTokens: 40 } },
      }],
    });
    const prune = result.rows.find((row) => row.stage === 'Prune');
    assert.equal(prune.tokens, 'unavailable');
    assert.equal(prune.tokenScope, 'unavailable');
  });

  it('does not double-count cached Codex input when total_tokens is unavailable', (t) => {
    const hosts = measurementFixture(t);
    const sessionId = '68686868-6868-4686-8686-686868686868';
    const sessionPath = path.join(hosts.codexSessionsDir, `rollout-2026-${sessionId}.jsonl`);
    const usage = (input, cached, output) => ({
      type: 'event_msg',
      payload: { type: 'token_count', info: { total_token_usage: {
        input_tokens: input, cached_input_tokens: cached, output_tokens: output,
      } } },
    });
    writeJsonl(sessionPath, [usage(100, 40, 10)]);
    const snapshot = startMeasurement({
      label: 'Sweep', now: () => 1_000, env: { CODEX_SESSION_ID: sessionId }, hosts,
    });
    writeJsonl(sessionPath, [usage(100, 40, 10), usage(150, 60, 20)]);
    assert.equal(finishMeasurement({ snapshot, now: () => 1_100, hosts }).tokens, 60);
  });

  it('degrades unsupported or ambiguous discovery without writing project workflow data', (t) => {
    const hosts = measurementFixture(t);
    const sessionId = '55555555-5555-4555-8555-555555555555';
    writeJsonl(path.join(hosts.codexSessionsDir, `one-${sessionId}.jsonl`), [codexUsage(10)]);
    writeJsonl(path.join(hosts.codexSessionsDir, `two-${sessionId}.jsonl`), [codexUsage(10)]);
    fs.mkdirSync(hosts.projectDir, { recursive: true });
    const before = fs.readdirSync(hosts.projectDir, { recursive: true }).sort();
    const snapshot = startMeasurement({
      label: 'Rebase',
      now: () => 3_000,
      env: { CODEX_SESSION_ID: sessionId },
      hosts,
    });
    const row = finishMeasurement({ snapshot, now: () => 3_010, hosts });
    assert.equal(snapshot.session, null);
    assert.equal(snapshot.counters, null);
    assert.equal(row.tokens, 'unavailable');
    assert.equal(row.tokenScope, 'unavailable');
    assert.equal(row.status, 'unavailable');
    assert.deepEqual(fs.readdirSync(hosts.projectDir, { recursive: true }).sort(), before);
    assert.equal(fs.existsSync(path.join(hosts.projectDir, '.spectre')), false);
  });

  it('rejects labels outside the fixed Ship measurement surface', () => {
    assert.throws(
      () => startMeasurement({ label: 'Benchmark', now: () => 0, env: {}, hosts: {} }),
      (error) => error?.code === 'INVALID_MEASUREMENT_LABEL',
    );
  });

  it('accepts every documented fixed label through the CLI', () => {
    const cli = path.resolve('plugins/spectre/hooks/scripts/workflow-cli.mjs');
    for (const label of ['Ship', 'Prune', 'Test', 'Sweep', 'Rebase', 'Full suite', 'Create PR']) {
      const result = spawnSync(process.execPath, [cli, 'measure', 'start', '--label', label, '--json'], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      assert.equal(JSON.parse(result.stdout).label, label);
    }
  });

  it('persists a bounded, private Ship summary and makes a retry idempotent', async (t) => {
    const value = measurementFixture(t);
    const cli = path.resolve('plugins/spectre/hooks/scripts/workflow-cli.mjs');
    const start = spawnSync(process.execPath, [cli, 'measure', 'start', '--label', 'Ship', '--json'], {
      encoding: 'utf8',
    });
    assert.equal(start.status, 0, start.stderr);
    const outerSnapshot = JSON.parse(start.stdout);
    assert.match(outerSnapshot.measurementId, /^[0-9a-f-]{36}$/i);
    outerSnapshot.session = null;
    outerSnapshot.counters = null;

    const rows = ['Prune', 'Test', 'Sweep', 'Rebase', 'Full suite', 'Create PR'].map((stage) => ({
      stage,
      runs: 1,
      elapsedMs: 10,
      tokens: 20,
      tokenScope: 'stage',
      status: 'complete',
    }));
    const args = [cli, 'measure', 'summary', '--rows', JSON.stringify(rows), '--outer-snapshot', JSON.stringify(outerSnapshot),
      '--persist', '--project-dir', value.projectDir, '--spectre-home', value.spectreHome,
      '--feature-root', '.spectre/features/runtime-test', '--base-sha', 'a'.repeat(40),
      '--head-sha', 'b'.repeat(40), '--diff-sha256', 'c'.repeat(64), '--json'];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const result = JSON.parse(first.stdout);
    assert.equal(result.persistence.status, 'stored');
    const store = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const historyPath = path.join(store.storePath, 'workflow', 'ship', 'measurements.json');
    assert.equal(result.persistence.historyPath, historyPath);
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    assert.equal(history.schema_version, 1);
    assert.equal(history.measurements.length, 1);
    assert.deepEqual(history.measurements[0], {
      measurement_id: outerSnapshot.measurementId,
      recorded_at: history.measurements[0].recorded_at,
      feature_root: '.spectre/features/runtime-test',
      host: 'unavailable',
      base_sha: 'a'.repeat(40),
      head_sha: 'b'.repeat(40),
      diff_sha256: 'c'.repeat(64),
      total_elapsed_ms: history.measurements[0].total_elapsed_ms,
      rows: rows.map((row) => ({
        stage: row.stage,
        runs: row.runs,
        elapsed_ms: row.elapsedMs,
        tokens: row.tokens,
        token_scope: row.tokenScope,
        status: row.status,
      })),
    });
    assert.doesNotMatch(JSON.stringify(history), /session|counter|transcript|hostCounters/i);

    const retry = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(retry.status, 0, retry.stderr);
    assert.equal(JSON.parse(retry.stdout).persistence.status, 'duplicate');
    assert.equal(JSON.parse(fs.readFileSync(historyPath, 'utf8')).measurements.length, 1);
  });

  it('migrates legacy flat Ship history into the Ship namespace without losing rows', async (t) => {
    const value = measurementFixture(t);
    const store = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const legacyPath = path.join(store.storePath, 'workflow', 'ship-measurements.json');
    const legacyMeasurementId = crypto.randomUUID();
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify({
      schema_version: 1,
      updated_at: '2026-01-01T00:00:00.000Z',
      measurements: [{ measurement_id: legacyMeasurementId }],
    }));

    const measurementId = crypto.randomUUID();
    const summary = summarizeMeasurement({
      rows: [],
      outerSnapshot: { label: 'Ship', epochMs: 1_000 },
      now: () => 1_020,
    });
    await persistShipMeasurement({
      summary,
      outerSnapshot: { label: 'Ship', measurementId, session: null },
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      featureRoot: '.spectre/features/runtime-test',
      candidate: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), diffSha256: 'c'.repeat(64) },
    });

    const historyPath = path.join(store.storePath, 'workflow', 'ship', 'measurements.json');
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    assert.deepEqual(
      history.measurements.map((measurement) => measurement.measurement_id),
      [legacyMeasurementId, measurementId],
    );
    assert.equal(fs.existsSync(legacyPath), false);
  });

  it('keeps the latest persisted Ship summaries in oldest-first bounded order', async (t) => {
    const value = measurementFixture(t);
    const summary = summarizeMeasurement({
      rows: [],
      outerSnapshot: { label: 'Ship', epochMs: 1_000 },
      now: () => 1_020,
    });
    const candidate = { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), diffSha256: 'c'.repeat(64) };
    const measurementIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const measurementId of measurementIds) {
      await persistShipMeasurement({
        summary,
        outerSnapshot: { label: 'Ship', measurementId, session: null },
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        featureRoot: '.spectre/features/runtime-test',
        candidate,
        maxMeasurements: 2,
      });
    }
    const store = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const history = JSON.parse(fs.readFileSync(path.join(
      store.storePath, 'workflow', 'ship', 'measurements.json',
    ), 'utf8'));
    assert.equal(history.measurements.length, 2);
    assert.deepEqual(history.measurements.map((measurement) => measurement.measurement_id), measurementIds.slice(1));
  });

  it('serializes concurrent Ship summaries without losing records', async (t) => {
    const value = measurementFixture(t);
    const summary = summarizeMeasurement({
      rows: [], outerSnapshot: { label: 'Ship', epochMs: 1_000 }, now: () => 1_020,
    });
    const candidate = { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), diffSha256: 'c'.repeat(64) };
    const measurementIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await Promise.all(measurementIds.map((measurementId) => persistShipMeasurement({
      summary,
      outerSnapshot: { label: 'Ship', measurementId, session: null },
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      featureRoot: '.spectre/features/runtime-test',
      candidate,
    })));
    const store = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const history = JSON.parse(fs.readFileSync(path.join(
      store.storePath, 'workflow', 'ship', 'measurements.json',
    ), 'utf8'));
    assert.deepEqual(
      new Set(history.measurements.map((measurement) => measurement.measurement_id)),
      new Set(measurementIds),
    );
  });

  it('returns a live summary with a stable degraded result when persistence validation fails', () => {
    const cli = path.resolve('plugins/spectre/hooks/scripts/workflow-cli.mjs');
    const rows = [];
    const outerSnapshot = { label: 'Ship', epochMs: Date.now(), measurementId: crypto.randomUUID() };
    const result = spawnSync(process.execPath, [cli, 'measure', 'summary', '--rows', JSON.stringify(rows),
      '--outer-snapshot', JSON.stringify(outerSnapshot), '--persist', '--project-dir', process.cwd(),
      '--feature-root', '../outside', '--base-sha', 'a'.repeat(40), '--head-sha', 'b'.repeat(40),
      '--diff-sha256', 'c'.repeat(64), '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.match(summary.table, /Stage \| Runs/);
    assert.deepEqual(summary.persistence, {
      status: 'degraded',
      errorCode: 'INVALID_SHIP_FEATURE_ROOT',
    });
  });
});

describe('workflow retention', () => {
  it('removes expired raw events before summaries and confines purge to workflow data', async (t) => {
    const value = fixture(t);
    const day0 = Date.parse('2026-01-01T00:00:00.000Z');
    const run = await completeFixtureRun(value, { owner: 'parent', now: () => day0 });
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: run.runId,
      now: () => day0,
      events: [{
        type: 'run.implementation_ready',
        actorId: run.primaryActorId,
        payload: {},
      }],
    });
    const resolved = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    const paths = workflowPaths(resolved.storePath, run.runId);
    fs.writeFileSync(path.join(resolved.storePath, 'knowledge-preserved.txt'), 'keep');
    const cleanup = await cleanupProjectWorkflow({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      now: () => day0 + 31 * 24 * 60 * 60 * 1_000,
    });
    assert.equal(cleanup.ok, true);
    assert.equal(fs.existsSync(paths.eventsPath), false);
    assert.equal(fs.existsSync(paths.statePath), false);
    assert.equal(fs.existsSync(paths.summaryPath), true);

    await purgeProjectWorkflow({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      confirm: true,
    });
    assert.equal(fs.existsSync(workflowPaths(resolved.storePath).workflowRoot), false);
    assert.equal(fs.readFileSync(path.join(resolved.storePath, 'knowledge-preserved.txt'), 'utf8'), 'keep');
  });

  it('interrupts and retains stale runs after their project checkout is removed', async (t) => {
    const value = fixture(t);
    const day0 = Date.parse('2026-01-01T00:00:00.000Z');
    const started = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: value.sourcePath,
      now: () => day0,
    });
    const resolved = await resolveProjectStore(value.projectDir, { spectreHome: value.spectreHome });
    fs.rmSync(value.projectDir, { recursive: true, force: true });

    const cleanup = await cleanupAllWorkflowStores({
      spectreHome: value.spectreHome,
      now: () => day0 + 8 * 24 * 60 * 60 * 1_000,
      force: true,
    });
    assert.equal(cleanup.ok, true);
    const paths = workflowPaths(resolved.storePath, started.runId);
    assert.equal(JSON.parse(fs.readFileSync(paths.statePath, 'utf8')).status, 'interrupted');
    assert.equal(JSON.parse(fs.readFileSync(paths.summaryPath, 'utf8')).status, 'interrupted');
  });

  it('runs a plan-direct markdown source end-to-end with lazily registered workstreams', async (t) => {
    const value = fixture(t);
    const planPath = path.join(
      value.projectDir, '.spectre', 'features', 'runtime-test', 'specs', 'plan.md',
    );
    fs.writeFileSync(planPath, [
      '# Runtime test plan',
      '',
      'Feature: runtime-test',
      'Feature Root: .spectre/features/runtime-test',
      'Execution Mode: direct',
      '',
      '## Overview',
      'Plan-direct fixture.',
    ].join('\n'));

    const started = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: planPath,
      owner: 'self',
    });
    const dispatch = await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{
        type: 'agent.dispatched',
        actorId: started.primaryActorId,
        assignmentId: 'assignment_1',
        attempt: 1,
        payload: {
          workerActorId: 'actor_00000000-0000-4000-8000-000000000001',
          taskDefinitions: [{ id: 'ws-1' }],
        },
      }, {
        type: 'task.assigned',
        actorId: started.primaryActorId,
        taskId: 'ws-1',
        assignmentId: 'assignment_1',
        attempt: 1,
        payload: { assignedActorId: 'actor_00000000-0000-4000-8000-000000000001' },
      }],
    });
    assert.equal(dispatch.events[0].payload.taskDefinitions[0].level, 'workstream');
    const workerActorId = dispatch.events[0].payload.workerActorId;
    for (const type of ['task.started', 'task.submitted']) {
      await recordWorkflowEvents({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        runId: started.runId,
        events: [{ type, actorId: workerActorId, taskId: 'ws-1', attempt: 1, payload: {} }],
      });
    }
    const verification = await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{
        type: 'gate.recorded',
        actorId: started.primaryActorId,
        payload: { kind: 'verification', status: 'pass', taskIds: ['ws-1'] },
      }],
    });
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{
        type: 'task.completed',
        actorId: started.primaryActorId,
        taskId: 'ws-1',
        payload: { gateEventId: verification.events[0].eventId },
      }],
    });
    await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{
        type: 'gate.recorded',
        actorId: started.primaryActorId,
        payload: { kind: 'proof', status: 'pass', taskIds: ['ws-1'] },
      }],
    });
    const finished = await recordWorkflowEvents({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
      events: [{ type: 'run.completed', actorId: started.primaryActorId, payload: {} }],
    });
    assert.equal(finished.status, 'passed');
    const loaded = await readWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      runId: started.runId,
    });
    assert.equal(loaded.state.planDirect, true);
    assert.equal(loaded.state.tasks['ws-1'].state, 'completed');
  });

  it('still requires a passing verification gate before plan-direct completion', async (t) => {
    const value = fixture(t);
    const planPath = path.join(
      value.projectDir, '.spectre', 'features', 'runtime-test', 'specs', 'plan.md',
    );
    fs.writeFileSync(planPath, 'Execution Mode: direct\n');
    const started = await startWorkflowRun({
      projectDir: value.projectDir,
      spectreHome: value.spectreHome,
      source: planPath,
    });
    for (const type of ['task.started', 'task.submitted']) {
      await recordWorkflowEvents({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        runId: started.runId,
        events: [{ type, actorId: started.primaryActorId, taskId: 'ws-1', attempt: 1, payload: {} }],
      });
    }
    await assert.rejects(
      recordWorkflowEvents({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        runId: started.runId,
        events: [{
          type: 'task.completed',
          actorId: started.primaryActorId,
          taskId: 'ws-1',
          payload: { gateEventId: 'evt_missing' },
        }],
      }),
      /PASSING_GATE_REQUIRED|passing verification gate/,
    );
  });

  it('keeps rejecting malformed structured JSON sources', async (t) => {
    const value = fixture(t);
    fs.writeFileSync(value.sourcePath, '# not json\n');
    await assert.rejects(
      startWorkflowRun({
        projectDir: value.projectDir,
        spectreHome: value.spectreHome,
        source: value.sourcePath,
      }),
      /TASK_SOURCE_MALFORMED|not valid JSON/,
    );
  });
});

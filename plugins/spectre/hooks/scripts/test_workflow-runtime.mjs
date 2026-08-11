#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
      status: 'pending',
      parents: [{
        id: '1.1',
        title: 'Parent',
        status: 'pending',
        subtasks: [{ id: '1.1.1', title: 'Child', type: 'Build', status: 'pending' }],
      }],
    }],
  }, null, 2));
  return { root, projectDir, spectreHome, sourcePath };
}

function updateTaskStatuses(sourcePath, status) {
  const document = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  document.phases[0].status = status;
  document.phases[0].parents[0].status = status;
  document.phases[0].parents[0].subtasks[0].status = status;
  fs.writeFileSync(sourcePath, `${JSON.stringify(document, null, 2)}\n`);
}

async function completeFixtureRun(value, options = {}) {
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
  updateTaskStatuses(value.sourcePath, 'done');
  const verification = await recordWorkflowEvents({
    projectDir: value.projectDir,
    spectreHome: value.spectreHome,
    runId: started.runId,
    now: options.now,
    events: [{
      type: 'gate.recorded',
      actorId: started.primaryActorId,
      waveId: '1',
      payload: { kind: 'verification', status: 'pass', taskIds: ['1.1', '1.1.1'] },
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
  return { ...started, workerActorId };
}

describe('workflow event runtime', () => {
  it('rejects duplicate task identities before creating a run', async (t) => {
    const value = fixture(t);
    const document = JSON.parse(fs.readFileSync(value.sourcePath, 'utf8'));
    document.phases[0].parents[0].subtasks.push({ id: '1.1', status: 'pending' });
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
    assert.equal(loaded.state.tasks['1.1'].sourceStatus, 'done');
    assert.equal(loaded.state.tasks['1.1.1'].sourceStatus, 'done');
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
    updateTaskStatuses(value.sourcePath, 'done');
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

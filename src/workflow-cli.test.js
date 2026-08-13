import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const CLI_PATH = path.resolve('bin/spectre.js');
const BUNDLED_CLI_PATH = path.resolve('plugins/spectre/hooks/scripts/workflow-cli.mjs');

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-workflow-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectDir = path.join(root, 'project');
  const spectreHome = path.join(root, 'spectre-home');
  const sourcePath = path.join(projectDir, '.spectre', 'features', 'cli', 'specs', 'tasks.json');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    meta: { schema_version: 1, feature_root: '.spectre/features/cli' },
    phases: [{
      id: '1',
      status: 'pending',
      parents: [{
        id: '1.1',
        status: 'pending',
        subtasks: [{ id: '1.1.1', status: 'pending' }],
      }],
    }],
  }));
  return { root, projectDir, spectreHome, sourcePath };
}

function invoke(script, args, value) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: value.projectDir,
    env: { ...process.env, SPECTRE_HOME: value.spectreHome },
    encoding: 'utf8',
  });
}

test('top-level and bundled workflow CLIs share stable JSON commands', (t) => {
  const value = makeFixture(t);
  const started = invoke(CLI_PATH, [
    'workflow',
    'run',
    'start',
    '--source',
    value.sourcePath,
    '--project-dir',
    value.projectDir,
    '--json',
  ], value);
  assert.equal(started.status, 0, started.stderr);
  const run = JSON.parse(started.stdout);
  assert.equal(run.ok, true);
  assert.match(run.runId, /^run_/);
  assert.match(run.primaryActorId, /^actor_/);

  const stage = invoke(BUNDLED_CLI_PATH, [
    'stage',
    'start',
    '--run-id',
    run.runId,
    '--actor-id',
    run.primaryActorId,
    '--id',
    'execute',
    '--project-dir',
    value.projectDir,
    '--json',
  ], value);
  assert.equal(stage.status, 0, stage.stderr);
  const stageResult = JSON.parse(stage.stdout);
  assert.equal(stageResult.ok, true);
  assert.match(stageResult.eventId, /^evt_/);
  assert.deepEqual(Object.keys(stageResult).sort(), ['eventId', 'ok']);
});

test('workflow CLI returns minimal confirmations across the task lifecycle', (t) => {
  const value = makeFixture(t);
  const common = ['--project-dir', value.projectDir, '--json'];
  const run = JSON.parse(invoke(BUNDLED_CLI_PATH, [
    'run', 'start', '--source', value.sourcePath, ...common,
  ], value).stdout);
  assert.deepEqual(
    Object.keys(run).sort(),
    ['ok', 'primaryActorId', 'resumed', 'runId', 'status'],
  );

  const ids = ['--run-id', run.runId, '--actor-id', run.primaryActorId];
  const dispatch = invoke(BUNDLED_CLI_PATH, [
    'agent', 'dispatch', ...ids, '--tasks', '1.1,1.1.1', '--attempt', '1', ...common,
  ], value);
  assert.equal(dispatch.status, 0, dispatch.stderr);
  const dispatched = JSON.parse(dispatch.stdout);
  assert.equal(dispatched.ok, true);
  assert.match(dispatched.workerActorId, /^actor_/);
  assert.match(dispatched.assignmentId, /^assignment_/);
  assert.deepEqual(dispatched.taskIds, ['1.1', '1.1.1']);
  assert.doesNotMatch(dispatch.stdout, /taskDefinitions|payload|sourceRawHash/);

  for (const taskId of ['1.1', '1.1.1']) {
    for (const action of ['start', 'submit']) {
      const step = invoke(BUNDLED_CLI_PATH, [
        'task', action, '--run-id', run.runId,
        '--actor-id', dispatched.workerActorId,
        '--task-id', taskId, ...common,
      ], value);
      assert.equal(step.status, 0, step.stderr);
      const confirmed = JSON.parse(step.stdout);
      assert.deepEqual(Object.keys(confirmed).sort(), ['eventId', 'ok']);
      assert.doesNotMatch(step.stdout, /taskDefinition|sourceStatus/);
    }
  }

  const source = JSON.parse(fs.readFileSync(value.sourcePath, 'utf8'));
  source.phases[0].status = 'done';
  source.phases[0].parents[0].status = 'done';
  source.phases[0].parents[0].subtasks[0].status = 'done';
  fs.writeFileSync(value.sourcePath, JSON.stringify(source));

  const gate = JSON.parse(invoke(BUNDLED_CLI_PATH, [
    'gate', 'record', ...ids, '--kind', 'verification', '--status', 'pass',
    '--tasks', '1.1,1.1.1', '--wave-id', '1', ...common,
  ], value).stdout);
  assert.deepEqual(Object.keys(gate).sort(), ['eventId', 'ok']);

  for (const taskId of ['1.1.1', '1.1']) {
    const complete = invoke(BUNDLED_CLI_PATH, [
      'task', 'complete', ...ids, '--task-id', taskId,
      '--gate-event-id', gate.eventId, ...common,
    ], value);
    assert.equal(complete.status, 0, complete.stderr);
    assert.deepEqual(Object.keys(JSON.parse(complete.stdout)).sort(), ['eventId', 'ok']);
  }

  const replay = JSON.parse(invoke(BUNDLED_CLI_PATH, [
    'gate', 'record', ...ids, '--kind', 'verification', '--status', 'pass',
    '--tasks', '1.1,1.1.1', '--wave-id', '1', ...common,
  ], value).stdout);
  assert.deepEqual(replay, { ok: true, idempotent: true, eventId: gate.eventId });
});

test('workflow CLI reports stable coded JSON errors', (t) => {
  const value = makeFixture(t);
  const missing = invoke(BUNDLED_CLI_PATH, [
    'task',
    'start',
    '--json',
  ], value);
  assert.notEqual(missing.status, 0);
  assert.deepEqual(JSON.parse(missing.stdout), {
    ok: false,
    code: 'MISSING_ARGUMENT',
    message: '--run-id is required',
  });
  assert.equal(missing.stderr, '');
});

test('workflow CLI records a local plan telemetry lifecycle', (t) => {
  const value = makeFixture(t);
  const featureRoot = path.join(value.projectDir, '.spectre', 'features', 'cli');
  const common = ['--project-dir', value.projectDir, '--json'];
  const started = invoke(BUNDLED_CLI_PATH, [
    'plan',
    'start',
    '--feature-root',
    featureRoot,
    '--scope',
    'PRIVATE_SCOPE_BOUNDARY_MUST_BE_HASHED',
    '--classification',
    'MICRO',
    '--plan-id',
    'plan-2.1',
    '--plan-hash',
    'a'.repeat(64),
    ...common,
  ], value);
  assert.equal(started.status, 0, started.stderr);
  const start = JSON.parse(started.stdout);
  assert.deepEqual(Object.keys(start).sort(), ['eventId', 'ok', 'planRunId']);
  assert.match(start.planRunId, /^plan_run_/);
  assert.match(start.eventId, /^evt_/);

  const reclassified = invoke(BUNDLED_CLI_PATH, [
    'plan',
    'record',
    '--plan-run-id',
    start.planRunId,
    '--event-type',
    'plan.reclassified',
    '--feature-root',
    '.spectre/features/cli',
    '--scope-hash',
    'b'.repeat(64),
    '--classification',
    'STANDARD-DIRECT',
    '--previous-classification',
    'LIGHT',
    '--reason-code',
    'routing-change',
    ...common,
  ], value);
  assert.equal(reclassified.status, 0, reclassified.stderr);
  assert.deepEqual(Object.keys(JSON.parse(reclassified.stdout)).sort(), ['eventId', 'ok', 'planRunId']);

  const review = invoke(BUNDLED_CLI_PATH, [
    'plan',
    'record',
    '--plan-run-id',
    start.planRunId,
    '--event-type',
    'plan.review_completed',
    '--feature-root',
    '.spectre/features/cli',
    '--scope-hash',
    'c'.repeat(64),
    '--review-status',
    'pass',
    '--review-kind',
    'plan',
    ...common,
  ], value);
  assert.equal(review.status, 0, review.stderr);

  const gate = invoke(BUNDLED_CLI_PATH, [
    'plan',
    'record',
    '--plan-run-id',
    start.planRunId,
    '--event-type',
    'plan.gate_completed',
    '--feature-root',
    '.spectre/features/cli',
    '--scope-hash',
    'd'.repeat(64),
    '--gate-kind',
    'planning',
    '--gate-status',
    'pass',
    ...common,
  ], value);
  assert.equal(gate.status, 0, gate.stderr);

  const completed = invoke(BUNDLED_CLI_PATH, [
    'plan',
    'record',
    '--plan-run-id',
    start.planRunId,
    '--event-type',
    'plan.completed',
    '--feature-root',
    '.spectre/features/cli',
    '--scope-hash',
    'e'.repeat(64),
    '--completion-status',
    'ready',
    ...common,
  ], value);
  assert.equal(completed.status, 0, completed.stderr);

  const outcome = invoke(BUNDLED_CLI_PATH, [
    'plan',
    'record',
    '--plan-run-id',
    start.planRunId,
    '--event-type',
    'plan.execution_outcome',
    '--feature-root',
    '.spectre/features/cli',
    '--scope-hash',
    'f'.repeat(64),
    '--execution-id',
    'exec-2.1',
    '--execution-hash',
    '1'.repeat(64),
    '--outcome-status',
    'failed',
    '--failure-kind',
    'test',
    ...common,
  ], value);
  assert.equal(outcome.status, 0, outcome.stderr);

  const telemetryPath = path.join(value.projectDir, '.spectre', 'telemetry', 'plan-classification.jsonl');
  const serialized = fs.readFileSync(telemetryPath, 'utf8');
  assert.doesNotMatch(serialized, /PRIVATE_SCOPE_BOUNDARY_MUST_BE_HASHED/);
  const events = serialized.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(events.map((event) => event.event_type), [
    'plan.started',
    'plan.reclassified',
    'plan.review_completed',
    'plan.gate_completed',
    'plan.completed',
    'plan.execution_outcome',
  ]);
  assert.equal(events[0].payload.classification, 'XS');
  assert.equal(events[1].payload.classification, 'M');
  assert.equal(events[1].payload.previous_classification, 'S');
  assert.equal(events[5].payload.authoritative, false);
});

test('workflow CLI rejects plan telemetry payload keys outside the allow-list', (t) => {
  const value = makeFixture(t);
  const invalid = invoke(BUNDLED_CLI_PATH, [
    'plan',
    'start',
    '--feature-root',
    '.spectre/features/cli',
    '--scope-hash',
    'a'.repeat(64),
    '--classification',
    'MICRO',
    '--payload-json',
    JSON.stringify({ classification: 'MICRO', private_prose: 'do not persist' }),
    '--project-dir',
    value.projectDir,
    '--json',
  ], value);
  assert.notEqual(invalid.status, 0);
  assert.deepEqual(JSON.parse(invalid.stdout), {
    ok: false,
    code: 'INVALID_PLAN_PAYLOAD',
    message: 'plan.started payload contains unsupported key private_prose',
  });
  assert.equal(invalid.stderr, '');
});

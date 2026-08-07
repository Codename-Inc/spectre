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
  assert.equal(JSON.parse(stage.stdout).events[0].type, 'stage.started');
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

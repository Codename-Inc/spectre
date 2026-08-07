#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cleanupProjectWorkflow,
  maybeCleanupProjectWorkflow,
  purgeProjectWorkflow,
} from './workflow/retention.mjs';
import {
  codedError,
  recordWorkflowEvents,
  startWorkflowRun,
} from './workflow/store.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      flags.set(value, true);
      continue;
    }
    flags.set(value, next);
    index += 1;
  }
  return { positional, flags };
}

function usage() {
  return [
    'Usage:',
    '  spectre-workflow run start --source <tasks.json> [--owner self|parent] [--provider <id> --model <id> --effort <id>] [--project-dir <path>] --json',
    '  spectre-workflow run finish --run-id <id> --actor-id <id> --status <status> --json',
    '  spectre-workflow stage|phase|wave start|finish --run-id <id> --actor-id <id> --id <value> --json',
    '  spectre-workflow agent dispatch|start|finish --run-id <id> --actor-id <id> --json',
    '  spectre-workflow task assign|start|submit|complete|block|skip --run-id <id> --task-id <id> --actor-id <id> --json',
    '  spectre-workflow gate record --run-id <id> --actor-id <id> --kind verification|review|proof --status pass|fail --json',
    '  spectre-workflow human-input require|resolve --run-id <id> --actor-id <id> --json',
    '  spectre-workflow cleanup [--project-dir <path>] [--dry-run] --json',
    '  spectre-workflow purge [--project-dir <path>] --yes --json',
    '',
  ].join('\n');
}

function required(flags, flag) {
  const value = flags.get(flag);
  if (value === undefined || value === true || value === '') {
    throw codedError('MISSING_ARGUMENT', `${flag} is required`);
  }
  return value;
}

function listFlag(flags, flag) {
  const value = flags.get(flag);
  if (!value || value === true) return [];
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function integerFlag(flags, flag, fallback) {
  const value = flags.get(flag);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw codedError('INVALID_ARGUMENT', `${flag} must be a positive integer`);
  }
  return parsed;
}

function commonOptions(flags) {
  return {
    projectDir: path.resolve(flags.get('--project-dir') || process.cwd()),
    spectreHome: flags.get('--spectre-home') || process.env.SPECTRE_HOME,
  };
}

function outputResult(result, flags, output = process.stdout) {
  if (flags.get('--json')) {
    output.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const event = result.events?.at(-1);
  if (event) {
    output.write(`${event.type} ${event.eventId} (${result.runId})\n`);
    return;
  }
  output.write(`${JSON.stringify(result, null, 2)}\n`);
}

function idempotencyKey(flags, fallback) {
  const explicit = flags.get('--idempotency-key');
  return explicit && explicit !== true ? String(explicit) : fallback;
}

async function record(flags, events, fallbackKey) {
  const common = commonOptions(flags);
  await maybeCleanupProjectWorkflow(common);
  return recordWorkflowEvents({
    ...common,
    runId: required(flags, '--run-id'),
    idempotencyKey: idempotencyKey(flags, fallbackKey),
    events,
  });
}

async function runCommand(action, flags) {
  if (action === 'start') {
    const common = commonOptions(flags);
    await maybeCleanupProjectWorkflow(common);
    const result = await startWorkflowRun({
      ...common,
      source: required(flags, '--source'),
      owner: flags.get('--owner') || 'self',
      provider: flags.get('--provider') || null,
      model: flags.get('--model') || null,
      effort: flags.get('--effort') || null,
      resume: flags.get('--no-resume') ? false : true,
    });
    return result;
  }
  if (action !== 'finish') throw codedError('UNKNOWN_WORKFLOW_COMMAND', `Unknown run command ${action}`);
  const status = required(flags, '--status');
  const type = {
    implementation_ready: 'run.implementation_ready',
    passed: 'run.completed',
    failed: 'run.failed',
    blocked: 'run.blocked',
    interrupted: 'run.interrupted',
  }[status];
  if (!type) throw codedError('INVALID_RUN_STATUS', `Invalid run status ${status}`);
  return record(flags, [{
    type,
    actorId: required(flags, '--actor-id'),
    payload: { reasonCode: flags.get('--reason') || null },
  }], `run:finish:${required(flags, '--run-id')}:${status}`);
}

async function boundaryCommand(kind, action, flags) {
  const id = kind === 'stage'
    ? (flags.get('--id') || 'execute')
    : required(flags, '--id');
  const status = action === 'start' ? 'started' : (flags.get('--status') || 'completed');
  if (!['started', 'completed', 'failed'].includes(status)) {
    throw codedError('INVALID_BOUNDARY_STATUS', `${kind} cannot finish as ${status}`);
  }
  const event = {
    type: `${kind}.${status}`,
    actorId: required(flags, '--actor-id'),
    ...(kind === 'stage' ? { stage: id } : {}),
    ...(kind === 'phase' ? { phaseId: id } : {}),
    ...(kind === 'wave' ? { waveId: id } : {}),
    payload: { reasonCode: flags.get('--reason') || null },
  };
  return record(
    flags,
    [event],
    `${kind}:${status}:${required(flags, '--run-id')}:${id}`,
  );
}

async function agentCommand(action, flags) {
  const runId = required(flags, '--run-id');
  if (action === 'dispatch') {
    const workerActorId = `actor_${crypto.randomUUID()}`;
    const assignmentId = `assignment_${crypto.randomUUID()}`;
    const taskIds = listFlag(flags, '--tasks');
    if (taskIds.length === 0) throw codedError('MISSING_ARGUMENT', '--tasks is required');
    const events = [{
      type: 'agent.dispatched',
      actorId: required(flags, '--actor-id'),
      assignmentId,
      attempt: integerFlag(flags, '--attempt', 1),
      payload: {
        workerActorId,
        provider: flags.get('--provider') || null,
        model: flags.get('--model') || null,
        effort: flags.get('--effort') || null,
        taskDefinitions: taskIds.map((id) => ({ id })),
      },
    }, ...taskIds.map((taskId) => ({
      type: 'task.assigned',
      actorId: required(flags, '--actor-id'),
      taskId,
      assignmentId,
      attempt: integerFlag(flags, '--attempt', 1),
      payload: { assignedActorId: workerActorId },
    }))];
    const result = await record(
      flags,
      events,
      idempotencyKey(flags, `agent:dispatch:${runId}:${taskIds.join(',')}`),
    );
    const dispatched = result.events[0];
    return {
      ...result,
      workerActorId: dispatched?.payload?.workerActorId || workerActorId,
      assignmentId: dispatched?.assignmentId || assignmentId,
      taskIds,
    };
  }
  if (!['start', 'finish'].includes(action)) {
    throw codedError('UNKNOWN_WORKFLOW_COMMAND', `Unknown agent command ${action}`);
  }
  const actorId = required(flags, '--actor-id');
  return record(flags, [{
    type: action === 'start' ? 'agent.started' : 'agent.completed',
    actorId,
    assignmentId: flags.get('--assignment-id') || undefined,
    payload: { result: flags.get('--result') || null },
  }], `agent:${action}:${runId}:${actorId}`);
}

async function taskCommand(action, flags) {
  const runId = required(flags, '--run-id');
  const actorId = required(flags, '--actor-id');
  const taskId = required(flags, '--task-id');
  const attempt = integerFlag(flags, '--attempt', 1);
  const common = {
    actorId,
    taskId,
    assignmentId: flags.get('--assignment-id') || undefined,
    attempt,
    evidence: listFlag(flags, '--evidence'),
  };
  let event;
  if (action === 'assign') {
    event = {
      ...common,
      type: 'task.assigned',
      payload: { assignedActorId: flags.get('--assigned-actor-id') || actorId },
    };
  } else if (action === 'start') {
    event = { ...common, type: 'task.started', payload: {} };
  } else if (action === 'submit') {
    event = {
      ...common,
      type: 'task.submitted',
      payload: {
        commit: flags.get('--commit') || null,
        source: flags.get('--source-kind') || 'worker',
      },
    };
  } else if (action === 'complete') {
    event = {
      ...common,
      type: 'task.completed',
      payload: { gateEventId: required(flags, '--gate-event-id') },
    };
  } else if (action === 'block') {
    event = {
      ...common,
      type: 'task.blocked',
      payload: { reasonCode: required(flags, '--reason') },
    };
  } else if (action === 'skip') {
    event = {
      ...common,
      type: 'task.skipped',
      payload: { reasonCode: required(flags, '--reason') },
    };
  } else {
    throw codedError('UNKNOWN_WORKFLOW_COMMAND', `Unknown task command ${action}`);
  }
  return record(flags, [event], `task:${action}:${runId}:${taskId}:${attempt}`);
}

async function gateCommand(action, flags) {
  if (action !== 'record') throw codedError('UNKNOWN_WORKFLOW_COMMAND', `Unknown gate command ${action}`);
  const kind = required(flags, '--kind');
  const status = required(flags, '--status');
  if (!['verification', 'review', 'proof'].includes(kind)) {
    throw codedError('INVALID_GATE_KIND', `Invalid gate kind ${kind}`);
  }
  if (!['pass', 'fail'].includes(status)) {
    throw codedError('INVALID_GATE_STATUS', `Invalid gate status ${status}`);
  }
  const taskIds = listFlag(flags, '--tasks');
  return record(flags, [{
    type: 'gate.recorded',
    actorId: required(flags, '--actor-id'),
    phaseId: flags.get('--phase-id') || undefined,
    waveId: flags.get('--wave-id') || undefined,
    evidence: listFlag(flags, '--evidence'),
    payload: { kind, status, taskIds },
  }], idempotencyKey(
    flags,
    `gate:${kind}:${status}:${required(flags, '--run-id')}:${flags.get('--wave-id') || flags.get('--phase-id') || taskIds.join(',')}`,
  ));
}

async function humanInputCommand(action, flags) {
  if (!['require', 'resolve'].includes(action)) {
    throw codedError('UNKNOWN_WORKFLOW_COMMAND', `Unknown human-input command ${action}`);
  }
  return record(flags, [{
    type: action === 'require' ? 'human_input.required' : 'human_input.resolved',
    actorId: required(flags, '--actor-id'),
    payload: { reasonCode: flags.get('--reason') || null },
  }], `human-input:${action}:${required(flags, '--run-id')}`);
}

export async function main(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const { positional, flags } = parseArgs(argv);
  const [resource, action] = positional;
  if (!resource || resource === 'help' || resource === '--help') {
    stdout.write(usage());
    return;
  }

  let result;
  if (resource === 'run') result = await runCommand(action, flags);
  else if (['stage', 'phase', 'wave'].includes(resource)) {
    result = await boundaryCommand(resource, action, flags);
  } else if (resource === 'agent') result = await agentCommand(action, flags);
  else if (resource === 'task') result = await taskCommand(action, flags);
  else if (resource === 'gate') result = await gateCommand(action, flags);
  else if (resource === 'human-input') result = await humanInputCommand(action, flags);
  else if (resource === 'cleanup') {
    result = await cleanupProjectWorkflow({
      ...commonOptions(flags),
      dryRun: Boolean(flags.get('--dry-run')),
    });
  } else if (resource === 'purge') {
    result = await purgeProjectWorkflow({
      ...commonOptions(flags),
      confirm: Boolean(flags.get('--yes')),
    });
  } else {
    throw codedError('UNKNOWN_WORKFLOW_COMMAND', `Unknown workflow command ${resource}`);
  }
  outputResult(result, flags, stdout);
  return result;
}

function canonicalEntryPath(value) {
  if (!value) return null;
  const absolute = path.resolve(value);
  try {
    return fs.realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

const directPath = canonicalEntryPath(process.argv[1]);
if (directPath && directPath === canonicalEntryPath(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (process.argv.includes('--json') && error?.code) {
      process.stdout.write(`${JSON.stringify({ ok: false, code: error.code, message })}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
  });
}

export { parseArgs, usage };

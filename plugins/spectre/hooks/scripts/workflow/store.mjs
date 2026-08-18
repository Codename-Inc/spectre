import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  atomicWriteFile,
  atomicWriteJson,
  resolveProjectStore,
  withStoreLock,
} from '../knowledge/store.mjs';

const WORKFLOW_SCHEMA_VERSION = 1;
const TERMINAL_RUN_STATUSES = new Set([
  'implementation_ready',
  'passed',
  'failed',
  'interrupted',
]);
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RUN_ID_PATTERN = /^run_[0-9a-f-]{36}$/;
const ACTOR_ID_PATTERN = /^actor_[0-9a-f-]{36}$/;
const SAFE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ROUTING_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function timestamp(now) {
  const value = typeof now === 'function' ? now() : Date.now();
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds)) {
    throw codedError('INVALID_TIMESTAMP', 'now must resolve to a valid timestamp');
  }
  return new Date(milliseconds).toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalPath(inputPath) {
  const absolutePath = path.resolve(inputPath);
  try {
    return fs.realpathSync.native(absolutePath);
  } catch {
    return absolutePath;
  }
}

function relativeProjectPath(projectDir, candidatePath) {
  const projectRoot = canonicalPath(projectDir);
  const absolute = canonicalPath(candidatePath);
  const relative = path.relative(projectRoot, absolute);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return relative || '.';
  }
  throw codedError('PATH_OUTSIDE_PROJECT', `${candidatePath} is outside ${projectRoot}`);
}

function gitValue(projectDir, args, fallback = 'unknown') {
  try {
    return execFileSync('git', args, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function checkoutMetadata(projectDir) {
  const checkoutRoot = canonicalPath(projectDir);
  return {
    checkoutId: sha256(checkoutRoot),
    branch: gitValue(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    headSha: gitValue(projectDir, ['rev-parse', 'HEAD']),
  };
}

function stripTaskStatuses(value) {
  if (Array.isArray(value)) return value.map(stripTaskStatuses);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'status')
      .map(([key, child]) => [key, stripTaskStatuses(child)]),
  );
}

function validateTaskId(id) {
  if (typeof id !== 'string' || !TASK_ID_PATTERN.test(id)) {
    throw codedError('INVALID_TASK_ID', `Invalid task id ${JSON.stringify(id)}`);
  }
}

function flattenTasks(tasksDocument) {
  const tasks = {};
  const addTask = (task) => {
    if (tasks[task.id]) {
      throw codedError('DUPLICATE_TASK_ID', `Duplicate task id ${task.id}`);
    }
    tasks[task.id] = task;
  };
  for (const phase of tasksDocument.phases || []) {
    for (const parent of phase.parents || []) {
      validateTaskId(parent.id);
      addTask({
        id: parent.id,
        level: 'parent',
        phaseId: String(phase.id),
        parentId: null,
      });
      for (const subtask of parent.subtasks || []) {
        validateTaskId(subtask.id);
        addTask({
          id: subtask.id,
          level: 'subtask',
          phaseId: String(phase.id),
          parentId: parent.id,
        });
      }
    }
  }
  return tasks;
}

export function readTaskSource(projectDir, sourcePath) {
  if (!sourcePath) throw codedError('MISSING_TASK_SOURCE', '--source is required');
  const absolutePath = canonicalPath(path.resolve(projectDir, sourcePath));
  const relativePath = relativeProjectPath(projectDir, absolutePath);
  let raw;
  try {
    raw = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw codedError('TASK_SOURCE_UNREADABLE', `${relativePath}: ${error.message}`);
  }
  if (!absolutePath.endsWith('.json')) {
    // Plan-direct source: an opaque readable plan. Workstream ids register
    // lazily from events; durable status authority lives in execution state,
    // so no task graph is flattened or validated here.
    return {
      absolutePath,
      relativePath,
      rawHash: sha256(raw),
      definitionHash: sha256(raw),
      featureRoot: path.dirname(path.dirname(relativePath)),
      tasks: {},
      planDirect: true,
    };
  }
  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw codedError('TASK_SOURCE_MALFORMED', `${relativePath}: ${error.message}`);
  }
  if (!document || typeof document !== 'object' || !Array.isArray(document.phases)) {
    throw codedError('TASK_SOURCE_MALFORMED', `${relativePath}: expected phases[]`);
  }
  const tasks = flattenTasks(document);
  if (Object.keys(tasks).length === 0) {
    throw codedError('TASK_SOURCE_EMPTY', `${relativePath}: no parent tasks or subtasks`);
  }
  return {
    absolutePath,
    relativePath,
    rawHash: sha256(raw),
    definitionHash: sha256(JSON.stringify(stripTaskStatuses(document))),
    featureRoot: document.meta?.feature_root || path.dirname(path.dirname(relativePath)),
    tasks,
  };
}

function executeContractHash(options = {}) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const contractPath = options.contractPath || path.resolve(
    scriptDir,
    '..',
    '..',
    '..',
    'skills',
    'spectre-execute',
    'SKILL.md',
  );
  try {
    return sha256(fs.readFileSync(contractPath));
  } catch (error) {
    throw codedError('EXECUTE_CONTRACT_UNREADABLE', `${contractPath}: ${error.message}`);
  }
}

function workflowPaths(storePath, runId) {
  const workflowRoot = path.join(storePath, 'workflow');
  const runsDir = path.join(workflowRoot, 'runs');
  const runDir = runId ? path.join(runsDir, runId) : null;
  return {
    workflowRoot,
    runsDir,
    recoveryDir: path.join(workflowRoot, 'recovery'),
    runDir,
    eventsPath: runDir ? path.join(runDir, 'events.jsonl') : null,
    statePath: runDir ? path.join(runDir, 'state.json') : null,
    summaryPath: runDir ? path.join(runDir, 'summary.json') : null,
  };
}

function validateRunId(runId) {
  if (!RUN_ID_PATTERN.test(runId || '')) {
    throw codedError('INVALID_RUN_ID', `Invalid run id ${JSON.stringify(runId)}`);
  }
}

function validateActorId(actorId) {
  if (!ACTOR_ID_PATTERN.test(actorId || '')) {
    throw codedError('INVALID_ACTOR_ID', `Invalid actor id ${JSON.stringify(actorId)}`);
  }
}

function validateSafeCode(value, label, { nullable = true } = {}) {
  if ((value === null || value === undefined || value === '') && nullable) return;
  if (typeof value !== 'string' || !SAFE_CODE_PATTERN.test(value)) {
    throw codedError('INVALID_EVENT_VALUE', `${label} must be a short machine-readable code`);
  }
}

function validateEventSpec(spec) {
  validateSafeCode(spec.stage, 'stage');
  validateSafeCode(spec.phaseId, 'phase id');
  validateSafeCode(spec.waveId, 'wave id');
  validateSafeCode(spec.payload?.reasonCode, 'reason code');
  validateSafeCode(spec.payload?.result, 'result code');
  for (const field of ['provider', 'model', 'effort']) {
    const value = spec.payload?.[field];
    if (value && (typeof value !== 'string' || !ROUTING_VALUE_PATTERN.test(value))) {
      throw codedError('INVALID_EVENT_VALUE', `${field} must be a machine-readable routing value`);
    }
  }
  if (spec.payload?.checkIds !== undefined && !Array.isArray(spec.payload.checkIds)) {
    throw codedError('INVALID_EVENT_VALUE', 'check ids must be a list');
  }
  for (const checkId of spec.payload?.checkIds || []) {
    if (typeof checkId !== 'string' || !ROUTING_VALUE_PATTERN.test(checkId)) {
      throw codedError('INVALID_EVENT_VALUE', 'check id must be a short machine-readable value');
    }
  }
  if (spec.payload?.commit && !/^[0-9a-f]{7,64}$/i.test(spec.payload.commit)) {
    throw codedError('INVALID_EVENT_VALUE', 'commit must be a Git object id');
  }
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw codedError(code, `${filePath}: ${error.message}`);
  }
}

function readEventLog(paths, options = {}) {
  if (!fs.existsSync(paths.eventsPath)) return { events: [], repaired: false };
  let raw = fs.readFileSync(paths.eventsPath, 'utf8');
  const lines = raw.split('\n');
  let repaired = false;
  if (lines.at(-1) !== '') {
    const tail = lines.at(-1);
    try {
      JSON.parse(tail);
    } catch {
      if (!options.repairTail) {
        throw codedError('WORKFLOW_EVENT_LOG_CORRUPT', `${paths.eventsPath}: incomplete final event`);
      }
      fs.mkdirSync(paths.recoveryDir, { recursive: true, mode: 0o700 });
      const recoveryPath = path.join(
        paths.recoveryDir,
        `${path.basename(paths.runDir)}-${Date.now()}.jsonl`,
      );
      fs.writeFileSync(recoveryPath, tail, { mode: 0o600 });
      lines.pop();
      raw = `${lines.filter(Boolean).join('\n')}${lines.some(Boolean) ? '\n' : ''}`;
      atomicWriteFile(paths.eventsPath, raw);
      repaired = true;
    }
  }
  const events = [];
  const eventLines = raw.split('\n').filter(Boolean);
  for (let index = 0; index < eventLines.length; index += 1) {
    try {
      events.push(JSON.parse(eventLines[index]));
    } catch (error) {
      throw codedError(
        'WORKFLOW_EVENT_LOG_CORRUPT',
        `${paths.eventsPath}:${index + 1}: ${error.message}`,
      );
    }
  }
  return { events, repaired };
}

function appendEvents(eventsPath, events) {
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(eventsPath, 'a', 0o600);
  try {
    fs.writeFileSync(fd, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function actor(state, actorId) {
  validateActorId(actorId);
  const value = state.actors[actorId];
  if (!value) throw codedError('UNKNOWN_ACTOR', `Unknown actor ${actorId}`);
  return value;
}

function requirePrimary(state, actorId) {
  if (actor(state, actorId).role !== 'primary') {
    throw codedError('PRIMARY_REQUIRED', `${actorId} is not the primary actor`);
  }
}

function sourceTask(state, event) {
  const definition = event.payload?.taskDefinition;
  if (definition && !state.tasks[event.taskId]) {
    state.tasks[event.taskId] = {
      ...definition,
      state: 'pending',
      attempt: 0,
    };
  }
  const task = state.tasks[event.taskId];
  if (!task) throw codedError('UNKNOWN_TASK', `Unknown task ${event.taskId}`);
  return task;
}

function assertTaskState(task, allowed, eventType) {
  if (!allowed.includes(task.state)) {
    throw codedError(
      'INVALID_TASK_TRANSITION',
      `${eventType} is invalid from ${task.id}:${task.state}`,
    );
  }
}

function assertAllTasksTerminal(state) {
  const unfinished = Object.values(state.tasks)
    .filter((task) => !['completed', 'skipped'].includes(task.state))
    .map((task) => `${task.id}:${task.state}`);
  if (unfinished.length > 0) {
    throw codedError('RUN_TASKS_INCOMPLETE', `Run has unfinished tasks: ${unfinished.join(', ')}`);
  }
}

function hasPassingGate(state, kind) {
  return Object.values(state.gates).some((gate) => gate.kind === kind && gate.status === 'pass');
}

function applyEvent(state, event) {
  switch (event.type) {
    case 'run.started':
      return state;
    case 'agent.dispatched': {
      requirePrimary(state, event.actorId);
      const workerActorId = event.payload.workerActorId;
      validateActorId(workerActorId);
      if (state.actors[workerActorId]) {
        throw codedError('ACTOR_EXISTS', `Actor already exists: ${workerActorId}`);
      }
      state.actors[workerActorId] = {
        id: workerActorId,
        role: 'worker',
        state: 'dispatched',
        assignmentId: event.assignmentId,
        provider: event.payload.provider || null,
        model: event.payload.model || null,
        effort: event.payload.effort || null,
      };
      break;
    }
    case 'agent.started': {
      const current = actor(state, event.actorId);
      if (!['dispatched', 'active'].includes(current.state)) {
        throw codedError('INVALID_AGENT_TRANSITION', `Cannot start ${event.actorId} from ${current.state}`);
      }
      current.state = 'active';
      break;
    }
    case 'agent.completed':
      actor(state, event.actorId).state = 'completed';
      break;
    case 'task.assigned': {
      requirePrimary(state, event.actorId);
      const task = sourceTask(state, event);
      assertTaskState(task, ['pending', 'blocked'], event.type);
      const assignedActor = event.payload.assignedActorId || event.actorId;
      actor(state, assignedActor);
      task.state = 'assigned';
      task.actorId = assignedActor;
      task.assignmentId = event.assignmentId || null;
      task.attempt = Number(event.attempt || task.attempt + 1);
      break;
    }
    case 'task.started': {
      const task = sourceTask(state, event);
      assertTaskState(task, ['pending', 'assigned', 'blocked', 'in_progress'], event.type);
      const currentActor = actor(state, event.actorId);
      if (currentActor.role !== 'primary' && task.actorId !== event.actorId) {
        throw codedError('TASK_ACTOR_MISMATCH', `${event.actorId} is not assigned ${task.id}`);
      }
      task.state = 'in_progress';
      task.actorId = event.actorId;
      task.attempt = Math.max(task.attempt || 0, Number(event.attempt || 1));
      break;
    }
    case 'task.submitted': {
      const task = sourceTask(state, event);
      assertTaskState(task, ['in_progress'], event.type);
      const currentActor = actor(state, event.actorId);
      if (currentActor.role !== 'primary' && task.actorId !== event.actorId) {
        throw codedError('TASK_ACTOR_MISMATCH', `${event.actorId} is not assigned ${task.id}`);
      }
      task.state = 'submitted';
      task.submittedBy = event.actorId;
      break;
    }
    case 'task.blocked': {
      const task = sourceTask(state, event);
      assertTaskState(task, ['assigned', 'in_progress', 'submitted'], event.type);
      const currentActor = actor(state, event.actorId);
      if (currentActor.role !== 'primary' && task.actorId !== event.actorId) {
        throw codedError('TASK_ACTOR_MISMATCH', `${event.actorId} is not assigned ${task.id}`);
      }
      task.state = 'blocked';
      task.blockedReason = event.payload.reasonCode || 'unknown';
      break;
    }
    case 'task.completed': {
      requirePrimary(state, event.actorId);
      const task = sourceTask(state, event);
      assertTaskState(task, ['submitted'], event.type);
      const gate = state.gates[event.payload.gateEventId];
      if (!gate || gate.status !== 'pass' || gate.kind !== 'verification') {
        throw codedError('PASSING_GATE_REQUIRED', `${task.id} requires a passing verification gate`);
      }
      if (!gate.taskIds.includes(task.id)) {
        throw codedError('GATE_TASK_MISMATCH', `${gate.kind} gate does not cover ${task.id}`);
      }
      task.state = 'completed';
      task.completedAt = event.timestamp;
      task.gateEventId = event.payload.gateEventId;
      break;
    }
    case 'task.skipped': {
      requirePrimary(state, event.actorId);
      const task = sourceTask(state, event);
      assertTaskState(task, ['pending', 'assigned', 'blocked'], event.type);
      task.state = 'skipped';
      task.skipReason = event.payload.reasonCode || 'unspecified';
      break;
    }
    case 'gate.recorded':
      requirePrimary(state, event.actorId);
      state.gates[event.eventId] = {
        kind: event.payload.kind,
        status: event.payload.status,
        phaseId: event.phaseId || null,
        waveId: event.waveId || null,
        taskIds: event.payload.taskIds || [],
        checkIds: event.payload.checkIds || [],
      };
      break;
    case 'stage.started':
    case 'stage.completed':
    case 'stage.failed':
      requirePrimary(state, event.actorId);
      state.stages[event.stage] = event.type.split('.')[1];
      break;
    case 'phase.started':
    case 'phase.completed':
    case 'phase.failed':
      requirePrimary(state, event.actorId);
      state.phases[event.phaseId] = event.type.split('.')[1];
      break;
    case 'wave.started':
    case 'wave.completed':
    case 'wave.failed':
      requirePrimary(state, event.actorId);
      state.waves[event.waveId] = event.type.split('.')[1];
      break;
    case 'human_input.required':
      requirePrimary(state, event.actorId);
      state.humanInput = 'required';
      break;
    case 'human_input.resolved':
      requirePrimary(state, event.actorId);
      state.humanInput = 'resolved';
      break;
    case 'run.implementation_ready':
      requirePrimary(state, event.actorId);
      if (state.owner !== 'parent') {
        throw codedError('RUN_OWNER_MISMATCH', 'Only parent-owned runs finish as implementation_ready');
      }
      assertAllTasksTerminal(state);
      state.status = 'implementation_ready';
      state.endedAt = event.timestamp;
      break;
    case 'run.completed':
      requirePrimary(state, event.actorId);
      if (state.owner !== 'self') {
        throw codedError('RUN_OWNER_MISMATCH', 'Only self-owned runs finish as passed');
      }
      assertAllTasksTerminal(state);
      if (!hasPassingGate(state, 'proof')) {
        throw codedError('PASSING_PROOF_REQUIRED', 'A passing proof gate is required');
      }
      state.status = 'passed';
      state.endedAt = event.timestamp;
      break;
    case 'run.failed':
      requirePrimary(state, event.actorId);
      state.status = 'failed';
      state.endedAt = event.timestamp;
      break;
    case 'run.blocked':
      requirePrimary(state, event.actorId);
      state.status = 'blocked';
      break;
    case 'run.interrupted':
      requirePrimary(state, event.actorId);
      state.status = 'interrupted';
      state.endedAt = event.timestamp;
      break;
    default:
      throw codedError('UNKNOWN_WORKFLOW_EVENT', `Unknown event type ${event.type}`);
  }
  state.lastSequence = event.sequence;
  state.lastEventAt = event.timestamp;
  if (event.idempotencyKey) state.idempotency[event.idempotencyKey] = event.eventId;
  return state;
}

function loadRun(storePath, runId, options = {}) {
  validateRunId(runId);
  const paths = workflowPaths(storePath, runId);
  if (!fs.existsSync(paths.statePath)) {
    throw codedError('RUN_NOT_FOUND', `Run not found: ${runId}`);
  }
  const state = readJson(paths.statePath, 'WORKFLOW_STATE_CORRUPT');
  if (state.schemaVersion !== WORKFLOW_SCHEMA_VERSION) {
    throw codedError('WORKFLOW_STATE_UNSUPPORTED', `Unsupported workflow state for ${runId}`);
  }
  const { events, repaired } = readEventLog(paths, { repairTail: options.repairTail });
  for (const event of events) {
    if (event.sequence > state.lastSequence) applyEvent(state, event);
  }
  return { paths, state, events, repaired };
}

function eventById(events, eventId) {
  return events.find((event) => event.eventId === eventId) || null;
}

function normalizeEvidence(projectDir, evidencePaths = []) {
  return evidencePaths.filter(Boolean).map((value) => {
    const absolutePath = canonicalPath(path.resolve(projectDir, value));
    const relativePath = relativeProjectPath(projectDir, absolutePath);
    let stat;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      return { path: relativePath, exists: false };
    }
    if (!stat.isFile()) return { path: relativePath, exists: true, kind: 'directory' };
    return {
      path: relativePath,
      exists: true,
      sha256: sha256(fs.readFileSync(absolutePath)),
    };
  });
}

function summaryFor(state, events) {
  const eventCounts = {};
  for (const event of events) eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
  const taskCounts = {};
  for (const task of Object.values(state.tasks)) {
    taskCounts[task.state] = (taskCounts[task.state] || 0) + 1;
  }
  const routing = Object.values(state.actors).map((currentActor) => ({
    role: currentActor.role,
    provider: currentActor.provider || null,
    model: currentActor.model || null,
    effort: currentActor.effort || null,
  }));
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    runId: state.runId,
    workflow: state.workflow,
    status: state.status,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    lastEventAt: state.lastEventAt,
    eventCount: events.length,
    eventCounts,
    taskCounts,
    routing,
    contractHash: state.contractHash,
    sourceDefinitionHash: state.sourceDefinitionHash,
  };
}

function persistState(paths, state, events) {
  atomicWriteJson(paths.statePath, state);
  if (TERMINAL_RUN_STATUSES.has(state.status)) {
    atomicWriteJson(paths.summaryPath, summaryFor(state, events));
  }
}

export async function startWorkflowRun(options) {
  const projectDir = canonicalPath(options.projectDir || process.cwd());
  const owner = options.owner || 'self';
  if (!['self', 'parent'].includes(owner)) {
    throw codedError('INVALID_RUN_OWNER', `Invalid run owner ${JSON.stringify(owner)}`);
  }
  for (const [field, value] of Object.entries({
    provider: options.provider,
    model: options.model,
    effort: options.effort,
  })) {
    if (value && (typeof value !== 'string' || !ROUTING_VALUE_PATTERN.test(value))) {
      throw codedError('INVALID_EVENT_VALUE', `${field} must be a machine-readable routing value`);
    }
  }
  const source = readTaskSource(projectDir, options.source);
  const checkout = checkoutMetadata(projectDir);
  const contractHash = executeContractHash(options);
  const resolved = await resolveProjectStore(projectDir, { spectreHome: options.spectreHome });
  const paths = workflowPaths(resolved.storePath);
  fs.mkdirSync(paths.runsDir, { recursive: true, mode: 0o700 });

  return withStoreLock(resolved.storePath, 'workflow-run-start', async () => {
    if (options.resume !== false) {
      for (const entry of fs.readdirSync(paths.runsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) continue;
        let candidate;
        try {
          candidate = loadRun(resolved.storePath, entry.name, { repairTail: true }).state;
        } catch {
          continue;
        }
        if (
          ['active', 'blocked'].includes(candidate.status)
          && candidate.checkoutId === checkout.checkoutId
          && candidate.sourcePath === source.relativePath
          && candidate.featureRoot === source.featureRoot
          && candidate.contractHash === contractHash
        ) {
          return {
            ok: true,
            resumed: true,
            runId: candidate.runId,
            primaryActorId: candidate.primaryActorId,
            status: candidate.status,
          };
        }
      }
    }

    const runId = `run_${crypto.randomUUID()}`;
    const primaryActorId = `actor_${crypto.randomUUID()}`;
    const startedAt = timestamp(options.now);
    const runPaths = workflowPaths(resolved.storePath, runId);
    fs.mkdirSync(runPaths.runDir, { recursive: true, mode: 0o700 });
    const state = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      runId,
      workflow: 'execute',
      status: 'active',
      owner,
      checkoutId: checkout.checkoutId,
      branch: checkout.branch,
      sourcePath: source.relativePath,
      sourceRawHash: source.rawHash,
      sourceDefinitionHash: source.definitionHash,
      featureRoot: source.featureRoot,
      planDirect: source.planDirect || false,
      contractHash,
      primaryActorId,
      startedAt,
      lastEventAt: startedAt,
      endedAt: null,
      lastSequence: 1,
      actors: {
        [primaryActorId]: {
          id: primaryActorId,
          role: 'primary',
          state: 'active',
          provider: options.provider || null,
          model: options.model || null,
          effort: options.effort || null,
        },
      },
      tasks: Object.fromEntries(Object.entries(source.tasks).map(([id, task]) => [id, {
        ...task,
        state: 'pending',
        attempt: 0,
      }])),
      gates: {},
      stages: {},
      phases: {},
      waves: {},
      humanInput: null,
      idempotency: {},
    };
    const event = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      eventId: `evt_${crypto.randomUUID()}`,
      sequence: 1,
      runId,
      timestamp: startedAt,
      type: 'run.started',
      actorId: primaryActorId,
      git: { headSha: checkout.headSha },
      payload: {
        workflow: 'execute',
        owner: state.owner,
        sourcePath: source.relativePath,
        sourceRawHash: source.rawHash,
        sourceDefinitionHash: source.definitionHash,
        featureRoot: source.featureRoot,
        contractHash,
        provider: options.provider || null,
        model: options.model || null,
        effort: options.effort || null,
      },
    };
    appendEvents(runPaths.eventsPath, [event]);
    persistState(runPaths, state, [event]);
    return {
      ok: true,
      resumed: false,
      runId,
      primaryActorId,
      eventId: event.eventId,
      sequence: event.sequence,
      status: state.status,
    };
  });
}

export async function recordWorkflowEvents(options) {
  const projectDir = canonicalPath(options.projectDir || process.cwd());
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    readOnly: true,
  });
  if (!resolved.storePath) throw codedError('RUN_NOT_FOUND', `No Spectre store for ${projectDir}`);
  if (
    options.idempotencyKey
    && !/^[A-Za-z0-9][A-Za-z0-9._,:/-]{0,255}$/.test(options.idempotencyKey)
  ) {
    throw codedError('INVALID_IDEMPOTENCY_KEY', 'idempotency key must be a short machine-readable value');
  }
  return withStoreLock(resolved.storePath, 'workflow-event-record', async () => {
    const loaded = loadRun(resolved.storePath, options.runId, { repairTail: true });
    const { state, events, paths } = loaded;
    if (TERMINAL_RUN_STATUSES.has(state.status)) {
      throw codedError('RUN_TERMINAL', `${state.runId} is already ${state.status}`);
    }
    if (options.idempotencyKey && state.idempotency[options.idempotencyKey]) {
      const existing = eventById(events, state.idempotency[options.idempotencyKey]);
      return {
        ok: true,
        idempotent: true,
        runId: state.runId,
        status: state.status,
        events: existing ? [existing] : [],
      };
    }

    const source = readTaskSource(projectDir, state.sourcePath);
    const checkout = checkoutMetadata(projectDir);
    const eventSpecs = options.events || [];
    const newEvents = [];
    for (const spec of eventSpecs) {
      validateEventSpec(spec);
      const resolveDefinition = (id) => {
        const definition = source.tasks[id];
        if (definition) return definition;
        if (source.planDirect) {
          validateTaskId(id);
          return { id, level: 'workstream' };
        }
        throw codedError('UNKNOWN_TASK', `${id} is absent from ${state.sourcePath}`);
      };
      const taskDefinition = spec.taskId ? resolveDefinition(spec.taskId) : null;
      let payload = spec.payload || {};
      if (spec.type === 'agent.dispatched') {
        const taskDefinitions = (payload.taskDefinitions || []).map(({ id }) => resolveDefinition(id));
        payload = { ...payload, taskDefinitions };
      }
      const event = {
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        eventId: `evt_${crypto.randomUUID()}`,
        sequence: state.lastSequence + 1,
        runId: state.runId,
        timestamp: timestamp(options.now),
        type: spec.type,
        ...(spec.actorId ? { actorId: spec.actorId } : {}),
        ...(spec.stage ? { stage: spec.stage } : {}),
        ...(spec.phaseId ? { phaseId: String(spec.phaseId) } : {}),
        ...(spec.waveId ? { waveId: String(spec.waveId) } : {}),
        ...(spec.taskId ? { taskId: spec.taskId } : {}),
        ...(spec.assignmentId ? { assignmentId: spec.assignmentId } : {}),
        ...(spec.attempt ? { attempt: Number(spec.attempt) } : {}),
        ...(options.idempotencyKey ? {
          idempotencyKey: eventSpecs.length === 1
            ? options.idempotencyKey
            : `${options.idempotencyKey}:${newEvents.length + 1}`,
        } : {}),
        git: { headSha: checkout.headSha },
        evidence: normalizeEvidence(projectDir, spec.evidence || []),
        payload: {
          ...payload,
          ...(taskDefinition ? { taskDefinition } : {}),
          sourceRawHash: source.rawHash,
          sourceDefinitionHash: source.definitionHash,
        },
      };
      applyEvent(state, event);
      newEvents.push(event);
    }
    if (options.idempotencyKey && newEvents.length > 0) {
      state.idempotency[options.idempotencyKey] = newEvents[0].eventId;
    }
    state.sourceRawHash = source.rawHash;
    state.sourceDefinitionHash = source.definitionHash;
    appendEvents(paths.eventsPath, newEvents);
    const allEvents = [...events, ...newEvents];
    persistState(paths, state, allEvents);
    return {
      ok: true,
      idempotent: false,
      runId: state.runId,
      status: state.status,
      events: newEvents,
    };
  });
}

export async function readWorkflowRun(options) {
  const projectDir = canonicalPath(options.projectDir || process.cwd());
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    readOnly: true,
  });
  if (!resolved.storePath) throw codedError('RUN_NOT_FOUND', `No Spectre store for ${projectDir}`);
  return loadRun(resolved.storePath, options.runId, { repairTail: false });
}

export async function interruptStoredWorkflowRun(options) {
  const storePath = canonicalPath(options.storePath);
  return withStoreLock(storePath, 'workflow-retention-interrupt', async () => {
    const loaded = loadRun(storePath, options.runId, { repairTail: true });
    const { state, events, paths } = loaded;
    if (!['active', 'blocked'].includes(state.status)) {
      return { ok: true, skipped: 'RUN_NOT_ACTIVE', runId: state.runId, status: state.status };
    }
    const idempotencyKey = `retention:interrupt:${state.runId}`;
    if (state.idempotency[idempotencyKey]) {
      return { ok: true, idempotent: true, runId: state.runId, status: state.status };
    }
    const event = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      eventId: `evt_${crypto.randomUUID()}`,
      sequence: state.lastSequence + 1,
      runId: state.runId,
      timestamp: timestamp(options.now),
      type: 'run.interrupted',
      actorId: state.primaryActorId,
      idempotencyKey,
      git: { headSha: 'unavailable' },
      evidence: [],
      payload: {
        reasonCode: 'inactive-retention',
        sourceRawHash: state.sourceRawHash,
        sourceDefinitionHash: state.sourceDefinitionHash,
      },
    };
    applyEvent(state, event);
    appendEvents(paths.eventsPath, [event]);
    const allEvents = [...events, event];
    persistState(paths, state, allEvents);
    return { ok: true, runId: state.runId, status: state.status, events: [event] };
  });
}

export {
  ACTOR_ID_PATTERN,
  RUN_ID_PATTERN,
  TERMINAL_RUN_STATUSES,
  WORKFLOW_SCHEMA_VERSION,
  appendEvents,
  canonicalPath,
  codedError,
  readEventLog,
  relativeProjectPath,
  sha256,
  summaryFor,
  timestamp,
  withStoreLock,
  workflowPaths,
};

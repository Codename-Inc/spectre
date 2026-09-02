import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  atomicWriteJson,
  resolveProjectStore,
  withStoreLock,
} from '../knowledge/store.mjs';

const STAGES = ['Prune', 'Test', 'Sweep', 'Rebase', 'Full suite', 'Create PR'];
const LABELS = new Set(['Ship', ...STAGES]);
const PARALLEL_STAGES = new Set(['Prune', 'Test', 'Full suite', 'Create PR']);
const HISTORY_SCHEMA_VERSION = 1;
const HISTORY_MAX_MEASUREMENTS = 500;

function measurementError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function emptyCounters() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function counters(value = {}, { claude = false } = {}) {
  const inputTokens = number(value.input_tokens);
  const outputTokens = number(value.output_tokens);
  const cachedInputTokens = claude
    ? number(value.cache_creation_input_tokens) + number(value.cache_read_input_tokens)
    : number(value.cached_input_tokens ?? value.cache_read_input_tokens);
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens: number(value.reasoning_output_tokens),
    totalTokens: !claude && Number.isSafeInteger(value.total_tokens) && value.total_tokens >= 0
      ? value.total_tokens
      : claude
        ? inputTokens + cachedInputTokens + outputTokens
        : inputTokens + outputTokens,
  };
}

function addCounters(left, right) {
  return Object.fromEntries(Object.keys(emptyCounters()).map((key) => [key, left[key] + right[key]]));
}

function findMatchingFile(root, sessionId, match) {
  if (!root || !sessionId || !fs.existsSync(root)) return null;
  const matches = [];
  const directories = [root];
  while (directories.length > 0 && matches.length < 2) {
    const directory = directories.pop();
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) directories.push(candidate);
      else if (entry.isFile() && match(entry.name, sessionId)) matches.push(candidate);
      if (matches.length > 1) return null;
    }
  }
  return matches[0] || null;
}

function codexFile(root, sessionId) {
  return findMatchingFile(root, sessionId, (name, id) => name.endsWith(`-${id}.jsonl`));
}

function claudeFile(root, sessionId) {
  if (!root || !sessionId || !fs.existsSync(root)) return null;
  const matches = [];
  let projects;
  try {
    projects = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const project of projects) {
    const directory = project.isDirectory() ? path.join(root, project.name) : root;
    let entries;
    try {
      entries = project.isDirectory() ? fs.readdirSync(directory, { withFileTypes: true }) : [project];
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.name !== `${sessionId}.jsonl`) continue;
      matches.push(path.join(directory, entry.name));
      if (matches.length > 1) return null;
    }
  }
  return matches[0] || null;
}

function readJsonLines(filePath, visit) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, 'r');
  } catch {
    return null;
  }
  try {
    const chunk = Buffer.allocUnsafe(64 * 1024);
    let remainder = '';
    let pending = null;
    const visitInterior = (line) => {
      if (pending !== null) visit(JSON.parse(pending));
      pending = line;
    };
    for (let bytes = fs.readSync(descriptor, chunk, 0, chunk.length, null); bytes > 0; bytes = fs.readSync(descriptor, chunk, 0, chunk.length, null)) {
      const lines = `${remainder}${chunk.toString('utf8', 0, bytes)}`.split('\n');
      remainder = lines.pop();
      for (const line of lines) {
        if (line) visitInterior(line);
      }
    }
    if (remainder) visitInterior(remainder);
    if (pending !== null) {
      try {
        visit(JSON.parse(pending));
      } catch {
        // A torn final JSONL record is expected while a host is still writing it.
      }
    }
  } catch {
    return null;
  } finally {
    fs.closeSync(descriptor);
  }
  return true;
}

function readCodexCounters(filePath) {
  let latest = null;
  const read = readJsonLines(filePath, (entry) => {
    const usage = entry?.type === 'event_msg' && entry.payload?.type === 'token_count'
      ? entry.payload.info?.total_token_usage
      : null;
    if (usage) latest = counters(usage);
  });
  return read && latest ? latest : null;
}

function readClaudeCounters(filePath) {
  let total = emptyCounters();
  let found = false;
  const read = readJsonLines(filePath, (entry) => {
    const usage = entry?.type === 'assistant' ? entry.message?.usage : null;
    if (usage) {
      total = addCounters(total, counters(usage, { claude: true }));
      found = true;
    }
  });
  return read && found ? total : null;
}

function hostDirectories(hosts = {}) {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return {
    codexSessionsDir: hosts.codexSessionsDir || process.env.SPECTRE_CODEX_SESSIONS_DIR || path.join(codexHome, 'sessions'),
    claudeProjectsDir: hosts.claudeProjectsDir || process.env.SPECTRE_CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects'),
  };
}

function parseIdentity(value, fallbackHost) {
  if (!value || value === true) return null;
  const text = String(value);
  const match = /^(codex|claude):(.+)$/.exec(text);
  return match ? { host: match[1], id: match[2] } : (fallbackHost ? { host: fallbackHost, id: text } : null);
}

function readHostSession(session, hosts) {
  if (!session?.host || !session.id) return null;
  const directories = hostDirectories(hosts);
  const filePath = session.host === 'codex'
    ? codexFile(directories.codexSessionsDir, session.id)
    : session.host === 'claude'
      ? claudeFile(directories.claudeProjectsDir, session.id)
      : null;
  if (!filePath) return null;
  const value = session.host === 'codex' ? readCodexCounters(filePath) : readClaudeCounters(filePath);
  return value ? { session, counters: value } : null;
}

function detectHostSession(env, hosts) {
  const candidates = [
    parseIdentity(env.CODEX_SESSION_ID || env.CODEX_THREAD_ID, 'codex'),
    parseIdentity(env.CLAUDE_SESSION_ID, 'claude'),
  ].filter(Boolean);
  if (candidates.length !== 1) return null;
  return readHostSession(candidates[0], hosts);
}

function parallelScope(label, childAgentId) {
  return !childAgentId && PARALLEL_STAGES.has(label) ? 'parallel-group' : 'stage';
}

function unavailableRow(snapshot, elapsedMs) {
  return {
    stage: snapshot.label,
    runs: 1,
    elapsedMs,
    tokens: 'unavailable',
    tokenScope: 'unavailable',
    status: 'unavailable',
  };
}

function executeUnavailableMeasurement() {
  return {
    elapsedMs: 'unavailable',
    elapsedStatus: 'unavailable',
    totalTokens: 'unavailable',
    primaryTokens: 'unavailable',
    workerTokens: 'unavailable',
    tokenStatus: 'unavailable',
    reconciliationStatus: 'unavailable',
  };
}

function executeSnapshotResult(snapshot, { now = Date.now, hosts = {} } = {}) {
  if (!snapshot || !Number.isSafeInteger(snapshot.epochMs)) {
    return { elapsedMs: 'unavailable', elapsedStatus: 'unavailable', tokens: 'unavailable' };
  }
  const elapsedMs = Math.max(0, now() - snapshot.epochMs);
  const current = readHostSession(snapshot.session, hosts);
  if (!current || !snapshot.counters) {
    return { elapsedMs, elapsedStatus: 'complete', tokens: 'unavailable' };
  }
  const tokens = current.counters.totalTokens - snapshot.counters.totalTokens;
  return {
    elapsedMs,
    elapsedStatus: 'complete',
    tokens: Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : 'unavailable',
  };
}

// Execute snapshots remain caller memory. This module intentionally returns only
// aggregate values; session identities and counter snapshots never cross into
// durable workflow state.
export function startExecuteMeasurement({ now = Date.now, env = process.env, hosts = {} } = {}) {
  const detected = detectHostSession(env, hosts);
  return {
    epochMs: now(),
    session: detected?.session || null,
    counters: detected?.counters || null,
  };
}

export function finishExecuteMeasurement({
  primarySnapshot,
  workerSnapshots = [],
  workersExpected = false,
  now = Date.now,
  hosts = {},
} = {}) {
  const primary = executeSnapshotResult(primarySnapshot, { now, hosts });
  const workers = workerSnapshots.map((snapshot) => executeSnapshotResult(snapshot, { now, hosts }));
  const primaryAvailable = Number.isSafeInteger(primary.tokens);
  const workersAvailable = workers.length > 0
    ? workers.every((worker) => Number.isSafeInteger(worker.tokens))
    : !workersExpected;
  const workerTokens = workersAvailable
    ? workers.reduce((total, worker) => total + worker.tokens, 0)
    : 'unavailable';
  const totalTokens = primaryAvailable && workersAvailable
    ? primary.tokens + workerTokens
    : 'unavailable';
  return {
    elapsedMs: primary.elapsedMs,
    elapsedStatus: primary.elapsedStatus,
    totalTokens,
    primaryTokens: primaryAvailable ? primary.tokens : 'unavailable',
    workerTokens,
    tokenStatus: Number.isSafeInteger(totalTokens) ? 'complete' : 'unavailable',
    reconciliationStatus: Number.isSafeInteger(totalTokens) ? 'reconciled' : 'unavailable',
  };
}

export { executeUnavailableMeasurement };

export function startMeasurement({ label, now = Date.now, env = process.env, hosts = {} }) {
  if (!LABELS.has(label)) {
    throw measurementError('INVALID_MEASUREMENT_LABEL', `Unsupported measurement label ${label}`);
  }
  const detected = detectHostSession(env, hosts);
  const snapshot = {
    label,
    epochMs: now(),
    session: detected?.session || null,
    counters: detected?.counters || null,
  };
  if (label === 'Ship') snapshot.measurementId = crypto.randomUUID();
  return snapshot;
}

export function finishMeasurement({ snapshot, childAgentId = null, now = Date.now, hosts = {} }) {
  if (!snapshot || !LABELS.has(snapshot.label) || !Number.isSafeInteger(snapshot.epochMs)) {
    throw measurementError('INVALID_MEASUREMENT_SNAPSHOT', 'A measurement snapshot is required');
  }
  const elapsedMs = Math.max(0, now() - snapshot.epochMs);
  const child = parseIdentity(childAgentId, snapshot.session?.host);
  const current = child ? readHostSession(child, hosts) : readHostSession(snapshot.session, hosts);
  if (!current || !snapshot.counters) return unavailableRow(snapshot, elapsedMs);
  const start = child ? emptyCounters() : snapshot.counters;
  const delta = current.counters.totalTokens - start.totalTokens;
  if (!Number.isSafeInteger(delta) || delta < 0) return unavailableRow(snapshot, elapsedMs);
  return {
    stage: snapshot.label,
    runs: 1,
    elapsedMs,
    tokens: delta,
    tokenScope: parallelScope(snapshot.label, childAgentId),
    status: 'complete',
    hostCounters: { start, end: current.counters },
  };
}

function unavailableTokens(row) {
  row.tokens = 'unavailable';
  row.tokenScope = 'unavailable';
  row.status = 'unavailable';
}

function summarizeStage(stage, rows) {
  const runs = rows.reduce((total, row) => total + (Number.isSafeInteger(row.runs) ? row.runs : 1), 0);
  const elapsedMs = rows.reduce((total, row) => total + (Number.isSafeInteger(row.elapsedMs) ? row.elapsedMs : 0), 0);
  const complete = rows.every((row) => row.status === 'complete');
  const scope = new Set(rows.map((row) => row.tokenScope));
  const numericTokens = rows.every((row) => Number.isSafeInteger(row.tokens) && row.tokens >= 0);
  const tokenScope = scope.size === 1 ? rows[0].tokenScope : 'unavailable';
  const row = {
    stage,
    runs,
    elapsedMs,
    tokens: numericTokens && tokenScope !== 'unavailable'
      ? rows.reduce((total, entry) => total + entry.tokens, 0)
      : 'unavailable',
    tokenScope: numericTokens ? tokenScope : 'unavailable',
    status: complete ? 'complete' : 'unavailable',
  };
  if (row.tokenScope === 'unavailable') row.tokens = 'unavailable';
  return row;
}

function groupRows(summaryRows, sourceRows, firstStage, secondStage) {
  const first = summaryRows.find((row) => row.stage === firstStage);
  const second = summaryRows.find((row) => row.stage === secondStage);
  const firstRuns = sourceRows.filter((row) => row.stage === firstStage);
  const secondRuns = sourceRows.filter((row) => row.stage === secondStage);
  const grouped = (row) => row.tokenScope === 'parallel-group'
    && Number.isSafeInteger(row.tokens) && row.tokens >= 0;
  if (!first || !second || !firstRuns.length || !secondRuns.length) {
    if (first?.tokenScope === 'parallel-group') unavailableTokens(first);
    if (second?.tokenScope === 'parallel-group') unavailableTokens(second);
    return;
  }
  if (!firstRuns.every(grouped) || !secondRuns.every(grouped) || firstRuns.length !== secondRuns.length) {
    if (first.tokenScope === 'parallel-group') unavailableTokens(first);
    if (second.tokenScope === 'parallel-group') unavailableTokens(second);
    return;
  }
  let tokens = 0;
  for (let index = 0; index < firstRuns.length; index += 1) {
    const pair = [firstRuns[index], secondRuns[index]];
    const starts = pair.map((row) => row.hostCounters?.start?.totalTokens);
    const ends = pair.map((row) => row.hostCounters?.end?.totalTokens);
    if (![...starts, ...ends].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      unavailableTokens(first);
      unavailableTokens(second);
      return;
    }
    tokens += Math.max(...ends) - Math.min(...starts);
  }
  first.tokens = tokens;
  first.tokenScope = 'parallel-group';
  second.tokens = 'unavailable';
  second.tokenScope = 'parallel-group';
}

export function summarizeMeasurement({ rows, outerSnapshot, now = Date.now }) {
  if (!Array.isArray(rows) || !outerSnapshot || !Number.isSafeInteger(outerSnapshot.epochMs)) {
    throw measurementError('INVALID_MEASUREMENT_SUMMARY', 'Finished rows and an outer snapshot are required');
  }
  const summaryRows = STAGES.map((stage) => {
    const stageRows = rows.filter((row) => row?.stage === stage);
    return stageRows.length ? summarizeStage(stage, stageRows) : {
      stage,
      runs: 0,
      elapsedMs: 0,
      tokens: 'unavailable',
      tokenScope: 'unavailable',
      status: 'unavailable',
    };
  });
  groupRows(summaryRows, rows, 'Prune', 'Test');
  groupRows(summaryRows, rows, 'Full suite', 'Create PR');
  const table = [
    'Stage | Runs | Elapsed | Tokens | Token scope | Status',
    '--- | ---: | ---: | ---: | --- | ---',
    ...summaryRows.map((row) => `${row.stage} | ${row.runs} | ${row.elapsedMs}ms | ${row.tokens} | ${row.tokenScope} | ${row.status}`),
  ].join('\n');
  return {
    rows: summaryRows,
    totalElapsedMs: Math.max(0, now() - outerSnapshot.epochMs),
    table,
  };
}

function persistenceError(code, message) {
  return measurementError(code, message);
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function relativeFeatureRoot(featureRoot) {
  return typeof featureRoot === 'string'
    && featureRoot.length > 0
    && !path.isAbsolute(featureRoot)
    && !featureRoot.split(/[\\/]/).includes('..');
}

function validSha(value, length) {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`, 'i').test(value);
}

function validSummaryRows(rows) {
  return Array.isArray(rows)
    && rows.length === STAGES.length
    && rows.every((row, index) => row
      && row.stage === STAGES[index]
      && safeInteger(row.runs)
      && safeInteger(row.elapsedMs)
      && (safeInteger(row.tokens) || row.tokens === 'unavailable')
      && ['stage', 'parallel-group', 'unavailable'].includes(row.tokenScope)
      && ['complete', 'unavailable'].includes(row.status));
}

function validatedPersistenceInput({ summary, outerSnapshot, featureRoot, candidate }) {
  if (!summary || !safeInteger(summary.totalElapsedMs) || !validSummaryRows(summary.rows)) {
    throw persistenceError('INVALID_SHIP_MEASUREMENT_SUMMARY', 'A completed Ship summary is required');
  }
  if (outerSnapshot?.label !== 'Ship' || !validSha(outerSnapshot.measurementId?.replaceAll('-', ''), 32)) {
    throw persistenceError('INVALID_SHIP_MEASUREMENT_ID', 'A Ship measurement ID is required');
  }
  if (!relativeFeatureRoot(featureRoot)) {
    throw persistenceError('INVALID_SHIP_FEATURE_ROOT', 'A repository-relative feature root is required');
  }
  if (!candidate || !validSha(candidate.baseSha, 40) || !validSha(candidate.headSha, 40) || !validSha(candidate.diffSha256, 64)) {
    throw persistenceError('INVALID_SHIP_CANDIDATE', 'A complete final candidate tuple is required');
  }
}

function readHistory(historyPath) {
  if (!fs.existsSync(historyPath)) return [];
  let history;
  try {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch {
    throw persistenceError('INVALID_SHIP_MEASUREMENT_HISTORY', 'Ship measurement history is invalid');
  }
  if (history?.schema_version !== HISTORY_SCHEMA_VERSION || !Array.isArray(history.measurements)) {
    throw persistenceError('INVALID_SHIP_MEASUREMENT_HISTORY', 'Ship measurement history is invalid');
  }
  return history.measurements;
}

function persistedRows(rows) {
  return rows.map((row) => ({
    stage: row.stage,
    runs: row.runs,
    elapsed_ms: row.elapsedMs,
    tokens: row.tokens,
    token_scope: row.tokenScope,
    status: row.status,
  }));
}

export async function persistShipMeasurement({
  summary,
  outerSnapshot,
  projectDir,
  spectreHome,
  featureRoot,
  candidate,
  now = Date.now,
  maxMeasurements = HISTORY_MAX_MEASUREMENTS,
}) {
  validatedPersistenceInput({ summary, outerSnapshot, featureRoot, candidate });
  if (!projectDir || !Number.isSafeInteger(maxMeasurements) || maxMeasurements < 1) {
    throw persistenceError('INVALID_SHIP_MEASUREMENT_PERSISTENCE', 'A project directory and positive history limit are required');
  }
  const store = await resolveProjectStore(projectDir, { spectreHome });
  const historyPath = path.join(store.storePath, 'workflow', 'ship-measurements.json');
  return withStoreLock(store.storePath, 'persist-ship-measurement', async () => {
    const measurements = readHistory(historyPath);
    if (measurements.some((measurement) => measurement?.measurement_id === outerSnapshot.measurementId)) {
      return { status: 'duplicate', historyPath };
    }
    const measurement = {
      measurement_id: outerSnapshot.measurementId,
      recorded_at: new Date(now()).toISOString(),
      feature_root: featureRoot,
      host: ['codex', 'claude'].includes(outerSnapshot.session?.host) ? outerSnapshot.session.host : 'unavailable',
      base_sha: candidate.baseSha,
      head_sha: candidate.headSha,
      diff_sha256: candidate.diffSha256,
      total_elapsed_ms: summary.totalElapsedMs,
      rows: persistedRows(summary.rows),
    };
    atomicWriteJson(historyPath, {
      schema_version: HISTORY_SCHEMA_VERSION,
      updated_at: new Date(now()).toISOString(),
      measurements: [...measurements, measurement].slice(-maxMeasurements),
    });
    return { status: 'stored', historyPath };
  });
}

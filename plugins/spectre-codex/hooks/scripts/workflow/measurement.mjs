import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STAGES = ['Prune', 'Test', 'Sweep', 'Rebase', 'Full suite', 'Create PR'];
const LABELS = new Set(['Ship', ...STAGES]);
const PARALLEL_STAGES = new Set(['Prune', 'Test', 'Full suite', 'Create PR']);

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
      : inputTokens + cachedInputTokens + outputTokens,
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
  return findMatchingFile(root, sessionId, (name, id) => name === `${id}.jsonl`);
}

function readJsonLines(filePath, visit) {
  let lines;
  try {
    lines = fs.readFileSync(filePath, 'utf8').split('\n');
  } catch {
    return null;
  }
  try {
    for (const line of lines) {
      if (line) visit(JSON.parse(line));
    }
  } catch {
    return null;
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
    hostSession: null,
    hostCounters: null,
  };
}

export function startMeasurement({ label, now = Date.now, env = process.env, hosts = {} }) {
  if (!LABELS.has(label)) {
    throw measurementError('INVALID_MEASUREMENT_LABEL', `Unsupported measurement label ${label}`);
  }
  const detected = detectHostSession(env, hosts);
  return {
    label,
    epochMs: now(),
    session: detected?.session || null,
    counters: detected?.counters || null,
  };
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
    hostSession: current.session,
    hostCounters: { start, end: current.counters },
  };
}

function groupRows(rows, firstStage, secondStage) {
  const first = rows.find((row) => row.stage === firstStage && row.tokenScope === 'parallel-group');
  const second = rows.find((row) => row.stage === secondStage && row.tokenScope === 'parallel-group');
  if (!first || !second || first.hostSession?.host !== second.hostSession?.host || first.hostSession?.id !== second.hostSession?.id) return;
  const starts = [first.hostCounters?.start?.totalTokens, second.hostCounters?.start?.totalTokens];
  const ends = [first.hostCounters?.end?.totalTokens, second.hostCounters?.end?.totalTokens];
  if (![...starts, ...ends].every((value) => Number.isSafeInteger(value))) return;
  first.tokens = Math.max(...ends) - Math.min(...starts);
  first.tokenScope = 'parallel-group';
  second.tokens = 'unavailable';
  second.tokenScope = 'parallel-group';
}

export function summarizeMeasurement({ rows, outerSnapshot, now = Date.now }) {
  if (!Array.isArray(rows) || !outerSnapshot || !Number.isSafeInteger(outerSnapshot.epochMs)) {
    throw measurementError('INVALID_MEASUREMENT_SUMMARY', 'Finished rows and an outer snapshot are required');
  }
  const summaryRows = STAGES.map((stage) => {
    const row = rows.find((entry) => entry.stage === stage);
    return row ? { ...row } : {
      stage,
      runs: 0,
      elapsedMs: 0,
      tokens: 'unavailable',
      tokenScope: 'unavailable',
      status: 'unavailable',
      hostSession: null,
      hostCounters: null,
    };
  });
  groupRows(summaryRows, 'Prune', 'Test');
  groupRows(summaryRows, 'Full suite', 'Create PR');
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

export { STAGES };

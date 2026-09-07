import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 1;
const EVENT_TYPES = new Set(['search', 'load', 'resource-read', 'history-read', 'expansion', 'capture', 'bypass']);
const RECORD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REVISION_TOKEN = /^sha256:[a-f0-9]{64}$/;
const OUTCOMES = new Set(['created', 'updated', 'noop', 'merged', 'loaded', 'failed', 'unknown']);

function hash(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function safeRecord(id, revisionToken) {
  if (typeof id !== 'string' || !RECORD_ID.test(id)) return null;
  return {
    id,
    ...(typeof revisionToken === 'string' && REVISION_TOKEN.test(revisionToken) ? { revisionToken } : {}),
  };
}

function safeResults(results) {
  if (!Array.isArray(results)) return [];
  return results.map((result) => safeRecord(result?.id, result?.revisionToken)).filter(Boolean);
}

function safeEvent(event, defaults = {}) {
  if (!EVENT_TYPES.has(event?.type)) throw new Error(`Unsupported evaluation trace event: ${event?.type}`);
  const result = { type: event.type, at: new Date(event.at || Date.now()).toISOString() };
  const query = event.query;
  const actorId = event.actorId ?? defaults.actorId;
  const contextId = event.contextId ?? defaults.contextId;
  if (query !== undefined) result.queryHash = hash(query);
  if (actorId !== undefined) result.actorHash = hash(actorId);
  if (contextId !== undefined) result.contextHash = hash(contextId);

  const record = safeRecord(event.id, event.revisionToken);
  if (record) Object.assign(result, record);
  const results = safeResults(event.results);
  if (results.length > 0) result.results = results;
  for (const field of ['responseBytes', 'loadedBytes', 'responseTokens', 'loadedTokens']) {
    const value = safeInteger(event[field]);
    if (value !== undefined) result[field] = value;
  }
  if (OUTCOMES.has(event.outcome)) result.outcome = event.outcome;
  if (event.type === 'bypass') {
    result.reason = event.reason === 'shell-read' ? 'shell-read' : 'direct-read';
    result.evidence = event.evidence === 'detected' ? 'detected' : 'suspected';
    if (typeof event.target === 'string') result.targetHash = hash(event.target);
  }
  return result;
}

function readTrace(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed?.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.events)) return parsed.events;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
  }
  return [];
}

function writeTrace(filePath, events) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, events }, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

/** Opt-in evaluator-only trace. It deliberately never stores task text or record bodies. */
export function createEvaluationTrace(options = {}) {
  const enabled = options.enabled === true;
  const filePath = enabled && typeof options.filePath === 'string' && options.filePath.trim()
    ? path.resolve(options.filePath)
    : null;
  const events = [];
  return {
    record(event) {
      if (!enabled) return null;
      const safe = safeEvent(event, options);
      events.push(safe);
      if (filePath) {
        try { writeTrace(filePath, [...readTrace(filePath), safe]); } catch { /* Trace collection must not change runtime behavior. */ }
      }
      return safe;
    },
    events() { return events.map((event) => ({ ...event, results: event.results?.map((result) => ({ ...result })) })); },
    write(destination = filePath) {
      if (!enabled || !destination) return false;
      writeTrace(path.resolve(destination), this.events());
      return true;
    },
  };
}

export function runtimeEvaluationTrace() {
  const filePath = process.env.SPECTRE_KNOWLEDGE_EVALUATION_TRACE;
  return createEvaluationTrace({
    enabled: typeof filePath === 'string' && filePath.trim() !== '',
    filePath,
    actorId: process.env.SPECTRE_KNOWLEDGE_EVALUATION_ACTOR_ID,
    contextId: process.env.SPECTRE_KNOWLEDGE_EVALUATION_CONTEXT_ID,
  });
}

function operationPath(operation) {
  const input = operation?.input;
  return input?.file_path ?? input?.filePath ?? input?.path ?? operation?.path ?? null;
}

function knownPath(value, paths) {
  if (typeof value !== 'string') return null;
  return paths.find((candidate) => value === candidate || value.includes(candidate)) ?? null;
}

function directShellRead(command) {
  return /(?:^|\s)(?:cat|sed|less|head|tail|awk|grep)\b/.test(command)
    || /\b(?:readFileSync|readFile|createReadStream|open)\s*\(/.test(command);
}

/** Classifies only normalized host operations against evaluator-supplied fixture paths. */
export function detectTraceBypass(toolOperations = [], options = {}) {
  const knownPaths = (options.knownPaths || []).filter((candidate) => typeof candidate === 'string' && candidate);
  const findings = [];
  for (const operation of toolOperations) {
    const isRead = operation?.name === 'Read' || operation?.type === 'Read';
    const command = operation?.input?.command ?? operation?.command;
    const isShell = operation?.name === 'Bash' || operation?.name === 'exec' || typeof command === 'string';
    if (isRead) {
      const target = knownPath(operationPath(operation), knownPaths);
      if (target || operationPath(operation) == null) {
        findings.push({
          type: 'bypass', reason: 'direct-read', evidence: target ? 'detected' : 'suspected',
          ...(target ? { targetHash: hash(target) } : {}),
        });
      }
      continue;
    }
    if (!isShell) continue;
    if (typeof command !== 'string') {
      findings.push({ type: 'bypass', reason: 'shell-read', evidence: 'suspected' });
      continue;
    }
    const target = knownPath(command, knownPaths);
    if (!target) continue;
    findings.push({
      type: 'bypass', reason: 'shell-read', evidence: directShellRead(command) ? 'detected' : 'suspected', targetHash: hash(target),
    });
  }
  return findings;
}

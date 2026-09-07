import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 1;

function hash(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function safeEvent(event) {
  const allowed = new Set(['search', 'load', 'resource-read', 'history-read', 'expansion', 'capture', 'bypass']);
  if (!allowed.has(event.type)) throw new Error(`Unsupported evaluation trace event: ${event.type}`);
  const result = { type: event.type, at: new Date(event.at || Date.now()).toISOString() };
  if (event.query !== undefined) result.queryHash = hash(event.query);
  if (event.contextId !== undefined) result.contextHash = hash(event.contextId);
  for (const field of ['id', 'revisionToken', 'responseTokens', 'loadedTokens', 'resultIds', 'reason']) {
    if (event[field] !== undefined) result[field] = event[field];
  }
  return result;
}

/** Opt-in evaluator-only trace. It deliberately never stores task text or record bodies. */
export function createEvaluationTrace(options = {}) {
  if (!options.enabled) return { record() {}, events: () => [] };
  const events = [];
  return {
    record(event) { events.push(safeEvent(event)); },
    events() { return events.map(event => ({ ...event, resultIds: event.resultIds && [...event.resultIds] })); },
    write(filePath) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, events: this.events() }, null, 2)}\n`);
    },
  };
}

export function detectTraceBypass(toolEvents = []) {
  return toolEvents.filter(event => event?.type === 'Read' || (event?.type === 'shell' && /(?:cat|sed|less|head|tail)\s+.*(?:record\.json|knowledge-history)/.test(event.command || '')))
    .map(event => ({ type: 'bypass', reason: event.type === 'Read' ? 'direct-read' : 'shell-read' }));
}

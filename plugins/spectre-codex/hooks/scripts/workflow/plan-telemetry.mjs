import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectStore } from '../knowledge/store.mjs';
import {
  appendEvents,
  canonicalPath,
  codedError,
  readEventLog,
  relativeProjectPath,
  sha256,
  timestamp,
  withStoreLock,
} from './store.mjs';

const PLAN_TELEMETRY_SCHEMA_VERSION = 1;
const PLAN_RUN_ID_PATTERN = /^plan_run_[0-9a-f-]{36}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EVENT_TYPES = new Set([
  'plan.started',
  'plan.reclassified',
  'plan.review_completed',
  'plan.gate_completed',
  'plan.completed',
  'plan.execution_outcome',
]);
const CLASSIFICATIONS = new Map([
  ['MICRO', 'XS'],
  ['LIGHT', 'S'],
  ['STANDARD-DIRECT', 'M'],
  ['STANDARD', 'L'],
  ['COMPREHENSIVE', 'XL'],
  ['XS', 'XS'],
  ['S', 'S'],
  ['M', 'M'],
  ['L', 'L'],
  ['XL', 'XL'],
]);
const PAYLOAD_KEYS = {
  'plan.started': new Set(['classification']),
  'plan.reclassified': new Set(['classification', 'previous_classification', 'reason_code']),
  'plan.review_completed': new Set(['review_kind', 'status']),
  'plan.gate_completed': new Set(['gate_kind', 'status']),
  'plan.completed': new Set(['status']),
  'plan.execution_outcome': new Set(['status', 'failure_kind', 'authoritative']),
};
const ENUMS = {
  review_kind: new Set(['scope', 'plan', 'routing']),
  gate_kind: new Set(['scope', 'planning', 'review', 'execution']),
  status: new Set(['pass', 'fail', 'ready', 'blocked', 'cancelled', 'passed', 'failed']),
  failure_kind: new Set(['test', 'review', 'runtime', 'human', 'unknown']),
};

function planTelemetryPaths(projectDir) {
  const root = path.join(projectDir, '.spectre', 'telemetry');
  return {
    root,
    recoveryDir: path.join(root, 'recovery'),
    runDir: root,
    eventsPath: path.join(root, 'plan-classification.jsonl'),
  };
}

function assertSafeCode(value, label) {
  if (value === null || value === undefined || value === '') return;
  if (typeof value !== 'string' || !SAFE_CODE_PATTERN.test(value)) {
    throw codedError('INVALID_PLAN_PAYLOAD', `${label} must be a short machine-readable code`);
  }
}

function assertSafeId(value, label) {
  if (value === null || value === undefined || value === '') return;
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
    throw codedError('INVALID_PLAN_PAYLOAD', `${label} must be a short machine-readable id`);
  }
}

function normalizeClassification(value, label = 'classification') {
  const normalized = CLASSIFICATIONS.get(String(value || '').toUpperCase());
  if (!normalized) throw codedError('INVALID_PLAN_ENUM', `Invalid ${label} ${JSON.stringify(value)}`);
  return normalized;
}

function validateHash(value, label) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw codedError('INVALID_PLAN_HASH', `${label} must be a sha256 hex hash`);
  }
  return value.toLowerCase();
}

function validatePlanRunId(planRunId) {
  if (!PLAN_RUN_ID_PATTERN.test(planRunId || '')) {
    throw codedError('INVALID_PLAN_RUN', `Invalid plan run id ${JSON.stringify(planRunId)}`);
  }
}

function normalizeFeatureRoot(projectDir, featureRoot) {
  if (!featureRoot) throw codedError('INVALID_PLAN_PATH', '--feature-root is required');
  let relative;
  try {
    relative = relativeProjectPath(projectDir, path.resolve(projectDir, featureRoot));
  } catch (error) {
    if (error?.code === 'PATH_OUTSIDE_PROJECT') {
      throw codedError('INVALID_PLAN_PATH', error.message);
    }
    throw error;
  }
  const normalized = relative.split(path.sep).join('/');
  if (!normalized.startsWith('.spectre/features/')) {
    throw codedError('INVALID_PLAN_PATH', 'feature_root must be managed under .spectre/features/');
  }
  return normalized;
}

function scopeHashFrom(options) {
  if (options.scopeHash) return validateHash(options.scopeHash, 'scope_hash');
  if (typeof options.scope === 'string' && options.scope.length > 0) return sha256(options.scope);
  throw codedError('INVALID_PLAN_HASH', '--scope-hash or --scope is required');
}

function parsePayloadJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected object');
    }
    return parsed;
  } catch (error) {
    throw codedError('INVALID_PLAN_PAYLOAD', `--payload-json is invalid: ${error.message}`);
  }
}

function assertAllowedPayload(eventType, payload) {
  const allowed = PAYLOAD_KEYS[eventType];
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw codedError('INVALID_PLAN_PAYLOAD', `${eventType} payload contains unsupported key ${key}`);
    }
  }
}

function eventPayload(eventType, options) {
  if (!EVENT_TYPES.has(eventType)) {
    throw codedError('INVALID_PLAN_ENUM', `Invalid event type ${JSON.stringify(eventType)}`);
  }
  const payload = parsePayloadJson(options.payloadJson);
  if (eventType === 'plan.started' || eventType === 'plan.reclassified') {
    payload.classification = normalizeClassification(options.classification || payload.classification);
  }
  if (eventType === 'plan.reclassified') {
    payload.previous_classification = normalizeClassification(
      options.previousClassification || payload.previous_classification,
      'previous_classification',
    );
    payload.reason_code = options.reasonCode || payload.reason_code || null;
  }
  if (eventType === 'plan.review_completed') {
    payload.review_kind = options.reviewKind || payload.review_kind || 'plan';
    payload.status = options.reviewStatus || payload.status;
  }
  if (eventType === 'plan.gate_completed') {
    payload.gate_kind = options.gateKind || payload.gate_kind || 'planning';
    payload.status = options.gateStatus || payload.status;
  }
  if (eventType === 'plan.completed') {
    payload.status = options.completionStatus || payload.status;
  }
  if (eventType === 'plan.execution_outcome') {
    payload.status = options.outcomeStatus || payload.status;
    payload.failure_kind = options.failureKind || payload.failure_kind || null;
    payload.authoritative = false;
  }
  assertAllowedPayload(eventType, payload);
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'classification' || key === 'previous_classification') continue;
    if (key === 'authoritative') {
      if (value !== false) {
        throw codedError('INVALID_PLAN_PAYLOAD', 'execution outcome authority must be false');
      }
      continue;
    }
    if (ENUMS[key] && !ENUMS[key].has(value)) {
      throw codedError('INVALID_PLAN_ENUM', `Invalid ${key} ${JSON.stringify(value)}`);
    }
    assertSafeCode(value, key);
  }
  return payload;
}

async function appendPlanEvent(options, eventType, planRunId) {
  const projectDir = canonicalPath(options.projectDir || process.cwd());
  const featureRoot = normalizeFeatureRoot(projectDir, options.featureRoot);
  const payload = eventPayload(eventType, options);
  const event = {
    schema_version: PLAN_TELEMETRY_SCHEMA_VERSION,
    event_id: `evt_${crypto.randomUUID()}`,
    plan_run_id: planRunId,
    timestamp: timestamp(options.now),
    event_type: eventType,
    feature_root: featureRoot,
    scope_hash: scopeHashFrom(options),
    ...(options.planId ? { plan_id: options.planId } : {}),
    ...(options.planHash ? { plan_hash: validateHash(options.planHash, 'plan_hash') } : {}),
    ...(options.executionId ? { execution_id: options.executionId } : {}),
    ...(options.executionHash ? { execution_hash: validateHash(options.executionHash, 'execution_hash') } : {}),
    payload,
  };
  assertSafeId(event.plan_id, 'plan_id');
  assertSafeId(event.execution_id, 'execution_id');

  const resolved = await resolveProjectStore(projectDir, { spectreHome: options.spectreHome });
  const paths = planTelemetryPaths(projectDir);
  return withStoreLock(resolved.storePath, 'plan-telemetry-record', async () => {
    readEventLog(paths, { repairTail: true });
    appendEvents(paths.eventsPath, [event]);
    return { ok: true, planRunId, eventId: event.event_id, event };
  });
}

export async function startPlanTelemetry(options = {}) {
  const planRunId = `plan_run_${crypto.randomUUID()}`;
  return appendPlanEvent(options, 'plan.started', planRunId);
}

export async function recordPlanTelemetry(options = {}) {
  validatePlanRunId(options.planRunId);
  return appendPlanEvent(options, options.eventType, options.planRunId);
}

export {
  PLAN_RUN_ID_PATTERN,
  PLAN_TELEMETRY_SCHEMA_VERSION,
  planTelemetryPaths,
};

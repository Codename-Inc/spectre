import crypto from 'node:crypto';
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
const REASON_CODES = new Set([
  'KNOWN_PATTERN',
  'ATOMIC_CHANGE',
  'DIRECT_CHANGE',
  'STRUCTURED_WORK',
  'MODERATE_UNCERTAINTY',
  'HIGH_UNCERTAINTY',
  'PROTECTED_BOUNDARY',
  'HIGH_TASK_GRAPH_RISK',
  'PROBE_RESOLVED',
  'ROUTING_CHANGE',
]);
const SURPRISE_CODES = new Set([
  'NONE',
  'MISSED_BOUNDARY',
  'UNPLANNED_DEPENDENCY',
  'TASK_GRAPH_MISMATCH',
  'ROUTE_TOO_SMALL',
  'ROUTE_TOO_LARGE',
]);
const ENUMS = {
  shape: new Set(['ATOMIC', 'DIRECT', 'STRUCTURED']),
  uncertainty: new Set(['LOW', 'MODERATE', 'HIGH']),
  evidence: new Set(['SUFFICIENT', 'PROBE_REQUIRED', 'PROBED']),
  task_graph_risk: new Set(['LOW', 'HIGH']),
  route: new Set(['XS_DIRECT', 'S_DIRECT', 'M_REVIEWED_DIRECT', 'L_STRUCTURED', 'XL_REVIEWED_STRUCTURED']),
  regret_direction: new Set(['NONE', 'SMALLER', 'LARGER']),
  review_kind: new Set(['correctness', 'simplification', 'task']),
  gate_kind: new Set(['design', 'final']),
  outcome: new Set(['approved', 'feedback', 'declined']),
  change_category: new Set(['none', 'scope_preserving', 'scope_change']),
  continuation: new Set(['execute', 'goal', 'pause', 'cancelled']),
  outcome_status: new Set(['implementation_ready', 'passed', 'failed', 'blocked', 'interrupted']),
  proof_result: new Set(['PASS', 'FAIL', 'PARTIAL', 'SKIPPED']),
  review_result: new Set(['CLEAN', 'FINDINGS', 'SKIPPED']),
};
const INPUT_KEYS = {
  'plan.started': new Set([
    'classification', 'size', 'shape', 'uncertainty', 'evidence', 'task_graph_risk', 'route',
    'design_authority_required', 'probe_used', 'probe_sufficient', 'reason_codes',
    'protected_boundaries',
  ]),
  'plan.reclassified': new Set([
    'classification', 'previous_classification', 'observed_size', 'initial_size', 'shape',
    'uncertainty', 'evidence', 'task_graph_risk', 'route', 'design_authority_required',
    'regret_direction', 'reason_codes', 'protected_boundaries',
  ]),
  'plan.review_completed': new Set([
    'review_kind', 'finding_count', 'applied_count', 'structure_before', 'structure_after',
  ]),
  'plan.gate_completed': new Set(['gate_kind', 'outcome', 'change_category']),
  'plan.completed': new Set([
    'artifact_count', 'artifact_hashes', 'planning_elapsed_ms', 'continuation',
  ]),
  'plan.execution_outcome': new Set([
    'outcome_status', 'workstream_count', 'task_count', 'wave_count', 'proof_result',
    'review_result', 'surprise_codes', 'authoritative',
  ]),
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

function invalidPayload(message) {
  throw codedError('INVALID_PLAN_PAYLOAD', message);
}

function normalizeEnum(value, key) {
  const normalized = typeof value === 'string' ? value.toUpperCase() : value;
  if (!ENUMS[key]?.has(normalized) && !ENUMS[key]?.has(value)) {
    throw codedError('INVALID_PLAN_ENUM', `Invalid ${key} ${JSON.stringify(value)}`);
  }
  return ENUMS[key].has(normalized) ? normalized : value;
}

function normalizeClassification(value, label = 'classification') {
  const normalized = CLASSIFICATIONS.get(String(value || '').toUpperCase());
  if (!normalized) throw codedError('INVALID_PLAN_ENUM', `Invalid ${label} ${JSON.stringify(value)}`);
  return normalized;
}

function validateHash(value, label) {
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

function assertSafeId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
    invalidPayload(`${label} must be a short machine-readable id`);
  }
  return value;
}

function normalizeFeatureRoot(projectDir, featureRoot) {
  if (!featureRoot) throw codedError('INVALID_PLAN_PATH', '--feature-root is required');
  let relative;
  try {
    relative = relativeProjectPath(projectDir, path.resolve(projectDir, featureRoot));
  } catch (error) {
    if (error?.code === 'PATH_OUTSIDE_PROJECT') throw codedError('INVALID_PLAN_PATH', error.message);
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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected object');
    return parsed;
  } catch (error) {
    throw codedError('INVALID_PLAN_PAYLOAD', `--payload-json is invalid: ${error.message}`);
  }
}

function parseJsonArray(value, label) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('expected array');
    return parsed;
  } catch (error) {
    invalidPayload(`${label} is invalid: ${error.message}`);
  }
}

function assertAllowedPayload(eventType, payload) {
  for (const key of Object.keys(payload)) {
    if (!INPUT_KEYS[eventType].has(key)) {
      invalidPayload(`${eventType} payload contains unsupported key ${key}`);
    }
  }
}

function required(value, key, eventType) {
  if (value === null || value === undefined || value === '') {
    invalidPayload(`${eventType} payload requires ${key}`);
  }
  return value;
}

function parseBoolean(value, key, eventType) {
  required(value, key, eventType);
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  invalidPayload(`${key} must be true or false`);
}

function parseCount(value, key, eventType) {
  const count = Number(required(value, key, eventType));
  if (!Number.isSafeInteger(count) || count < 0) invalidPayload(`${key} must be a non-negative integer`);
  return count;
}

function parseCodes(value, key, allowed, eventType) {
  const raw = Array.isArray(value) ? value : String(required(value, key, eventType)).split(',');
  const codes = raw.filter(Boolean).map((item) => String(item).trim().toUpperCase().replaceAll('-', '_'));
  if (codes.length === 0 || codes.some((code) => !SAFE_CODE_PATTERN.test(code) || !allowed.has(code))) {
    throw codedError('INVALID_PLAN_ENUM', `Invalid ${key} ${JSON.stringify(value)}`);
  }
  return codes;
}

function parseHashes(value, key, eventType) {
  const raw = Array.isArray(value) ? value : String(required(value, key, eventType)).split(',');
  return raw.filter(Boolean).map((hash) => validateHash(String(hash).trim(), key));
}

function protectedBoundaries(value) {
  return parseJsonArray(value, 'protected_boundaries').map((boundary) => {
    if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) {
      invalidPayload('protected_boundaries entries must be objects');
    }
    const type = String(required(boundary.type, 'type', 'protected_boundaries'));
    if (!SAFE_CODE_PATTERN.test(type)) invalidPayload('protected boundary type must be a short code');
    const invariantHash = boundary.invariant_hash
      ? validateHash(boundary.invariant_hash, 'invariant_hash')
      : sha256(String(required(boundary.threatened_invariant, 'threatened_invariant', 'protected_boundaries')));
    const failureModeHash = boundary.failure_mode_hash
      ? validateHash(boundary.failure_mode_hash, 'failure_mode_hash')
      : sha256(String(required(boundary.failure_mode, 'failure_mode', 'protected_boundaries')));
    return { type, invariant_hash: invariantHash, failure_mode_hash: failureModeHash };
  });
}

function semanticPayload(options, payload, eventType) {
  return {
    shape: normalizeEnum(required(options.shape || payload.shape, 'shape', eventType), 'shape'),
    uncertainty: normalizeEnum(required(options.uncertainty || payload.uncertainty, 'uncertainty', eventType), 'uncertainty'),
    evidence: normalizeEnum(required(options.evidence || payload.evidence, 'evidence', eventType), 'evidence'),
    task_graph_risk: normalizeEnum(required(options.taskGraphRisk || payload.task_graph_risk, 'task_graph_risk', eventType), 'task_graph_risk'),
    route: normalizeEnum(required(options.route || payload.route, 'route', eventType), 'route'),
    design_authority_required: parseBoolean(
      options.designAuthorityRequired ?? payload.design_authority_required,
      'design_authority_required',
      eventType,
    ),
    protected_boundaries: protectedBoundaries(
      options.protectedBoundariesJson || payload.protected_boundaries || [],
    ),
  };
}

function eventPayload(eventType, options) {
  if (!EVENT_TYPES.has(eventType)) {
    throw codedError('INVALID_PLAN_ENUM', `Invalid event type ${JSON.stringify(eventType)}`);
  }
  const input = parsePayloadJson(options.payloadJson);
  assertAllowedPayload(eventType, input);

  if (eventType === 'plan.started') {
    return {
      ...semanticPayload(options, input, eventType),
      size: normalizeClassification(options.classification || input.classification || input.size),
      probe_used: parseBoolean(options.probeUsed ?? input.probe_used, 'probe_used', eventType),
      probe_sufficient: parseBoolean(options.probeSufficient ?? input.probe_sufficient, 'probe_sufficient', eventType),
      reason_codes: parseCodes(options.reasonCodes || input.reason_codes, 'reason_codes', REASON_CODES, eventType),
    };
  }
  if (eventType === 'plan.reclassified') {
    return {
      ...semanticPayload(options, input, eventType),
      initial_size: normalizeClassification(
        options.previousClassification || input.previous_classification || input.initial_size,
        'initial_size',
      ),
      observed_size: normalizeClassification(
        options.classification || input.classification || input.observed_size,
        'observed_size',
      ),
      regret_direction: normalizeEnum(
        required(options.regretDirection || input.regret_direction, 'regret_direction', eventType),
        'regret_direction',
      ),
      reason_codes: parseCodes(options.reasonCodes || input.reason_codes, 'reason_codes', REASON_CODES, eventType),
    };
  }
  if (eventType === 'plan.review_completed') {
    return {
      review_kind: normalizeEnum(required(options.reviewKind || input.review_kind, 'review_kind', eventType), 'review_kind'),
      finding_count: parseCount(options.findingCount ?? input.finding_count, 'finding_count', eventType),
      applied_count: parseCount(options.appliedCount ?? input.applied_count, 'applied_count', eventType),
      structure_before: parseCount(options.structureBefore ?? input.structure_before, 'structure_before', eventType),
      structure_after: parseCount(options.structureAfter ?? input.structure_after, 'structure_after', eventType),
    };
  }
  if (eventType === 'plan.gate_completed') {
    return {
      gate_kind: normalizeEnum(required(options.gateKind || input.gate_kind, 'gate_kind', eventType), 'gate_kind'),
      outcome: normalizeEnum(required(options.gateOutcome || input.outcome, 'outcome', eventType), 'outcome'),
      change_category: normalizeEnum(
        required(options.changeCategory || input.change_category, 'change_category', eventType),
        'change_category',
      ),
    };
  }
  if (eventType === 'plan.completed') {
    const artifactHashes = parseHashes(options.artifactHashes || input.artifact_hashes, 'artifact_hashes', eventType);
    const artifactCount = parseCount(options.artifactCount ?? input.artifact_count, 'artifact_count', eventType);
    if (artifactHashes.length !== artifactCount) invalidPayload('artifact_count must equal artifact_hashes length');
    return {
      artifact_count: artifactCount,
      artifact_hashes: artifactHashes,
      planning_elapsed_ms: parseCount(
        options.planningElapsedMs ?? input.planning_elapsed_ms,
        'planning_elapsed_ms',
        eventType,
      ),
      continuation: normalizeEnum(
        required(options.continuation || input.continuation, 'continuation', eventType),
        'continuation',
      ),
    };
  }
  return {
    outcome_status: normalizeEnum(
      required(options.outcomeStatus || input.outcome_status, 'outcome_status', eventType),
      'outcome_status',
    ),
    workstream_count: parseCount(options.workstreamCount ?? input.workstream_count, 'workstream_count', eventType),
    task_count: parseCount(options.taskCount ?? input.task_count, 'task_count', eventType),
    wave_count: parseCount(options.waveCount ?? input.wave_count, 'wave_count', eventType),
    proof_result: normalizeEnum(required(options.proofResult || input.proof_result, 'proof_result', eventType), 'proof_result'),
    review_result: normalizeEnum(
      required(options.executionReviewResult || input.review_result, 'review_result', eventType),
      'review_result',
    ),
    surprise_codes: parseCodes(options.surpriseCodes || input.surprise_codes, 'surprise_codes', SURPRISE_CODES, eventType),
    authoritative: false,
  };
}

async function appendPlanEvent(options, eventType, planRunId, starting = false) {
  const projectDir = canonicalPath(options.projectDir || process.cwd());
  const featureRoot = normalizeFeatureRoot(projectDir, options.featureRoot);
  const scopeHash = scopeHashFrom(options);
  const payload = eventPayload(eventType, options);
  const event = {
    schema_version: PLAN_TELEMETRY_SCHEMA_VERSION,
    event_id: `plan_evt_${crypto.randomUUID()}`,
    plan_run_id: planRunId,
    timestamp: timestamp(options.now),
    event_type: eventType,
    feature_root: featureRoot,
    scope_hash: scopeHash,
    ...(options.planHash ? { plan_hash: validateHash(options.planHash, 'plan_hash') } : {}),
    ...(options.executionRunId
      ? { execution_run_id: assertSafeId(options.executionRunId, 'execution_run_id') }
      : {}),
    payload,
  };
  if (eventType === 'plan.execution_outcome' && !event.execution_run_id) {
    invalidPayload('plan.execution_outcome requires execution_run_id');
  }

  const resolved = await resolveProjectStore(projectDir, { spectreHome: options.spectreHome });
  const paths = planTelemetryPaths(projectDir);
  return withStoreLock(resolved.storePath, 'plan-telemetry-record', async () => {
    const { events } = readEventLog(paths, { repairTail: true });
    if (!starting) {
      const started = events.find((candidate) => (
        candidate.plan_run_id === planRunId && candidate.event_type === 'plan.started'
      ));
      if (!started) throw codedError('INVALID_PLAN_RUN', `Unknown plan run id ${JSON.stringify(planRunId)}`);
      if (started.feature_root !== featureRoot || started.scope_hash !== scopeHash) {
        throw codedError('INVALID_PLAN_RUN', 'Plan run feature_root and scope_hash must match plan.started');
      }
      if (eventType === 'plan.reclassified' && !event.plan_hash) {
        invalidPayload('plan.reclassified requires plan_hash');
      }
      if (eventType === 'plan.execution_outcome') {
        if (!event.plan_hash) invalidPayload('plan.execution_outcome requires plan_hash');
        const completed = events.find((candidate) => (
          candidate.plan_run_id === planRunId
          && candidate.event_type === 'plan.completed'
          && candidate.payload?.artifact_hashes?.includes(event.plan_hash)
        ));
        if (!completed) {
          invalidPayload('plan.execution_outcome plan_hash must match a plan.completed artifact hash');
        }
      }
    }
    appendEvents(paths.eventsPath, [event]);
    return { ok: true, planRunId, eventId: event.event_id, event };
  });
}

export async function startPlanTelemetry(options = {}) {
  const planRunId = `plan_run_${crypto.randomUUID()}`;
  return appendPlanEvent(options, 'plan.started', planRunId, true);
}

export async function recordPlanTelemetry(options = {}) {
  validatePlanRunId(options.planRunId);
  return appendPlanEvent(options, options.eventType, options.planRunId, false);
}

export {
  PLAN_RUN_ID_PATTERN,
  PLAN_TELEMETRY_SCHEMA_VERSION,
  planTelemetryPaths,
};

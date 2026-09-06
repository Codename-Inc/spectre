import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteJson, resolveProjectStore, withStoreLock } from './store.mjs';

const WORK_ASSOCIATION_FILE_NAME = 'work-associations.json';
const WORK_ASSOCIATION_SCHEMA_VERSION = 1;
const WORK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function emptyAssociationIndex() {
  return {
    schemaVersion: WORK_ASSOCIATION_SCHEMA_VERSION,
    sourceRuns: {},
    pullRequests: {},
    candidates: {},
  };
}

export function workAssociationPath(storePath) {
  return path.join(storePath, WORK_ASSOCIATION_FILE_NAME);
}

function validateWorkId(workId) {
  if (!isNonEmptyString(workId) || !WORK_ID_PATTERN.test(workId)) {
    throw codedError('WORK_ID_INVALID', `Not a canonical work id: ${JSON.stringify(workId)}`);
  }
  return workId;
}

function validateCandidate(candidate) {
  if (!isPlainObject(candidate) || Object.keys(candidate).some((key) =>
    !['repository', 'base', 'head', 'diff'].includes(key))) {
    throw codedError('WORK_CANDIDATE_INVALID', 'A candidate needs only repository, base, head, and diff.');
  }
  for (const field of ['repository', 'base', 'head', 'diff']) {
    if (!isNonEmptyString(candidate[field])) {
      throw codedError('WORK_CANDIDATE_INVALID', `candidate.${field} must be a non-empty string.`);
    }
  }
  return {
    repository: candidate.repository,
    base: candidate.base,
    head: candidate.head,
    diff: candidate.diff,
  };
}

export function candidateAssociationKey(candidate) {
  const normalized = validateCandidate(candidate);
  return JSON.stringify([normalized.repository, normalized.base, normalized.head, normalized.diff]);
}

function requestedAssociations(options) {
  const associations = [];
  if (options.sourceRunId !== undefined) {
    if (!isNonEmptyString(options.sourceRunId)) {
      throw codedError('WORK_ASSOCIATION_INVALID', 'sourceRunId must be a non-empty string.');
    }
    associations.push(['sourceRuns', options.sourceRunId]);
  }
  if (options.pullRequestId !== undefined) {
    if (!isNonEmptyString(options.pullRequestId)) {
      throw codedError('WORK_ASSOCIATION_INVALID', 'pullRequestId must be a non-empty string.');
    }
    associations.push(['pullRequests', options.pullRequestId]);
  }
  if (options.candidate !== undefined) {
    associations.push(['candidates', candidateAssociationKey(options.candidate)]);
  }
  return associations;
}

function validateAssociationIndex(value, indexPath) {
  if (!isPlainObject(value) || value.schemaVersion !== WORK_ASSOCIATION_SCHEMA_VERSION) {
    throw codedError('WORK_ASSOCIATION_INDEX_INVALID', `${indexPath}: unsupported work association index`);
  }
  for (const type of ['sourceRuns', 'pullRequests', 'candidates']) {
    if (!isPlainObject(value[type])) {
      throw codedError('WORK_ASSOCIATION_INDEX_INVALID', `${indexPath}: ${type} must be an object`);
    }
    for (const workId of Object.values(value[type])) validateWorkId(workId);
  }
  return value;
}

function readAssociationIndex(storePath) {
  const indexPath = workAssociationPath(storePath);
  if (!fs.existsSync(indexPath)) return emptyAssociationIndex();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    throw codedError('WORK_ASSOCIATION_INDEX_INVALID', `${indexPath}: malformed JSON: ${error.message}`);
  }
  return validateAssociationIndex(parsed, indexPath);
}

function sortedAssociationIndex(index) {
  return {
    schemaVersion: WORK_ASSOCIATION_SCHEMA_VERSION,
    sourceRuns: Object.fromEntries(Object.entries(index.sourceRuns).sort(([left], [right]) => left.localeCompare(right))),
    pullRequests: Object.fromEntries(Object.entries(index.pullRequests).sort(([left], [right]) => left.localeCompare(right))),
    candidates: Object.fromEntries(Object.entries(index.candidates).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function resolveFromIndex(index, options) {
  const associations = requestedAssociations(options);
  const suppliedWorkId = options.workId === undefined ? null : validateWorkId(options.workId);
  const resolvedIds = new Set(
    associations
      .map(([type, key]) => index[type][key])
      .filter(Boolean),
  );
  if (suppliedWorkId !== null) {
    const conflicts = [...resolvedIds].filter((workId) => workId !== suppliedWorkId);
    if (conflicts.length > 0) {
      throw codedError(
        'WORK_IDENTITY_CONFLICT',
        `Supplied work id ${suppliedWorkId} conflicts with an existing exact association.`,
        { workId: suppliedWorkId, conflictingWorkIds: conflicts },
      );
    }
    return { status: resolvedIds.size === 0 ? 'unresolved' : 'resolved', workId: suppliedWorkId, associations };
  }
  if (resolvedIds.size > 1) {
    throw codedError(
      'WORK_IDENTITY_AMBIGUOUS',
      'Exact associations resolve to different work ids; identify the work id explicitly.',
      { workIds: [...resolvedIds].sort() },
    );
  }
  if (resolvedIds.size === 1) {
    return { status: 'resolved', workId: [...resolvedIds][0], associations };
  }
  return { status: 'unresolved', workId: null, associations };
}

async function resolveStore(options, readOnly) {
  return resolveProjectStore(path.resolve(options.projectDir || process.cwd()), {
    spectreHome: options.spectreHome,
    gitRunner: options.gitRunner,
    allocationLockOptions: options.allocationLockOptions,
    readOnly,
  });
}

/** Resolves only exact run, PR, or repository/base/head/diff associations. */
export async function resolveWorkIdentity(options) {
  const resolved = await resolveStore(options, true);
  if (!resolved.storePath) return { status: 'unresolved', workId: null };
  return withStoreLock(resolved.storePath, 'resolve-work-identity', async () => {
    const identity = resolveFromIndex(readAssociationIndex(resolved.storePath), options);
    return { status: identity.status, workId: identity.workId };
  }, options.lockOptions);
}

/**
 * Associates an explicit work id or allocates one once. The lock makes a repeated source
 * run or unchanged candidate converge on one identity without branch or recency guesses.
 */
export async function resolveOrAllocateWorkIdentity(options) {
  const resolved = await resolveStore(options, false);
  return withStoreLock(resolved.storePath, 'resolve-work-identity', async () => {
    const index = readAssociationIndex(resolved.storePath);
    const identity = resolveFromIndex(index, options);
    const workId = identity.workId || `work-${crypto.randomUUID()}`;
    let changed = false;
    for (const [type, key] of identity.associations) {
      const current = index[type][key];
      if (current && current !== workId) {
        throw codedError(
          'WORK_IDENTITY_CONFLICT',
          `Exact ${type} association is already assigned to ${current}.`,
          { workId, conflictingWorkIds: [current] },
        );
      }
      if (!current) {
        index[type][key] = workId;
        changed = true;
      }
    }
    if (changed) atomicWriteJson(workAssociationPath(resolved.storePath), sortedAssociationIndex(index));
    return {
      ok: true,
      status: identity.status === 'resolved' && !changed ? 'noop' : identity.status === 'resolved' ? 'updated' : 'created',
      workId,
      storePath: resolved.storePath,
      associationPath: workAssociationPath(resolved.storePath),
    };
  }, options.lockOptions);
}

export { WORK_ASSOCIATION_FILE_NAME, WORK_ASSOCIATION_SCHEMA_VERSION };

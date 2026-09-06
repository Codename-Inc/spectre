import fs from 'node:fs';
import path from 'node:path';

import {
  incrementKnowledgeLoadActivity,
  readKnowledgeActivity,
  writeKnowledgeActivity,
} from './activity.mjs';
import {
  parseKnowledgeRecord,
  readVerifiedIndexedRecord,
  RECORD_FILE_NAME,
  refreshKnowledgeIndex,
  renderKnowledgeRecord,
} from './records.mjs';
import { resolveProjectStore, withStoreLock } from './store.mjs';

const RECORD_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RETIRED_RECORD_FILE_NAME = 'SKILL.md';
// Load activity aggregates per record until revision identity replaces the integer key.
const RECORD_ACTIVITY_VERSION = 1;

function knowledgeLoadError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function validateExactId(id) {
  if (typeof id !== 'string' || !RECORD_ID_PATTERN.test(id)) {
    throw knowledgeLoadError(
      'KNOWLEDGE_INVALID',
      'Knowledge ID must be an exact canonical record ID.',
    );
  }
}

function canonicalRecordPath(storePath, id) {
  return path.join(storePath, 'knowledge', id, RECORD_FILE_NAME);
}

function classifyMissingActiveEntry(storePath, id) {
  const recordPath = canonicalRecordPath(storePath, id);
  const recordDirectory = path.dirname(recordPath);
  let directoryStat;
  let recordStat;
  try {
    directoryStat = fs.lstatSync(recordDirectory);
    recordStat = fs.lstatSync(recordPath);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      if (fs.existsSync(path.join(recordDirectory, RETIRED_RECORD_FILE_NAME))) {
        throw knowledgeLoadError(
          'KNOWLEDGE_INVALID',
          `Knowledge record still uses the retired ${RETIRED_RECORD_FILE_NAME} package and must be migrated: ${id}`,
        );
      }
      throw knowledgeLoadError(
        'KNOWLEDGE_NOT_FOUND',
        `Knowledge record not found: ${id}`,
      );
    }
    throw knowledgeLoadError(
      'KNOWLEDGE_INVALID',
      `Knowledge record could not be inspected: ${id}`,
      { cause: error },
    );
  }

  if (
    !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || !recordStat.isFile()
    || recordStat.isSymbolicLink()
  ) {
    throw knowledgeLoadError(
      'KNOWLEDGE_INVALID',
      `Knowledge record is not a safe canonical record: ${id}`,
    );
  }

  let parsed;
  try {
    parsed = parseKnowledgeRecord(recordPath);
  } catch (error) {
    throw knowledgeLoadError(
      'KNOWLEDGE_INVALID',
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
  if (parsed.record.id !== id) {
    throw knowledgeLoadError(
      'KNOWLEDGE_INVALID',
      `Knowledge record ID does not match its canonical directory: ${id}`,
    );
  }
  if (parsed.record.kind === 'knowledge' && parsed.record.status !== 'active') {
    throw knowledgeLoadError(
      'KNOWLEDGE_NOT_ACTIVE',
      `Knowledge record is not active: ${id}`,
    );
  }
  throw knowledgeLoadError(
    'KNOWLEDGE_INVALID',
    `Current knowledge record was not present in the refreshed index: ${id}`,
  );
}

function resourceManifest(recordDirectory, relativePaths, expectedCanonicalDirectory) {
  const absoluteDirectory = path.resolve(recordDirectory);
  let directoryStat;
  let canonicalDirectory;
  try {
    directoryStat = fs.lstatSync(absoluteDirectory);
    canonicalDirectory = fs.realpathSync.native(absoluteDirectory);
  } catch (error) {
    throw knowledgeLoadError(
      'KNOWLEDGE_CHANGED_DURING_READ',
      'Knowledge record directory changed while resources were being verified.',
      { cause: error },
    );
  }
  if (
    !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || canonicalDirectory !== expectedCanonicalDirectory
  ) {
    throw knowledgeLoadError(
      'KNOWLEDGE_CHANGED_DURING_READ',
      'Knowledge record directory changed while resources were being verified.',
    );
  }

  return relativePaths.map((relativePath) => {
    const absolutePath = path.resolve(absoluteDirectory, relativePath);
    if (!absolutePath.startsWith(`${absoluteDirectory}${path.sep}`)) {
      throw knowledgeLoadError(
        'KNOWLEDGE_INVALID',
        `Knowledge resource escapes its canonical record directory: ${relativePath}`,
      );
    }
    let resourceStat;
    let canonicalResourcePath;
    try {
      resourceStat = fs.lstatSync(absolutePath);
      canonicalResourcePath = fs.realpathSync.native(absolutePath);
    } catch (error) {
      throw knowledgeLoadError(
        'KNOWLEDGE_CHANGED_DURING_READ',
        `Knowledge resource changed while it was being verified: ${relativePath}`,
        { cause: error },
      );
    }
    if (
      !resourceStat.isFile()
      || resourceStat.isSymbolicLink()
      || !canonicalResourcePath.startsWith(`${canonicalDirectory}${path.sep}`)
    ) {
      throw knowledgeLoadError(
        'KNOWLEDGE_CHANGED_DURING_READ',
        `Knowledge resource changed while it was being verified: ${relativePath}`,
      );
    }
    return { relativePath, absolutePath };
  });
}

function mapLockError(error) {
  if (error?.code !== 'LOCK_TIMEOUT') return error;
  return knowledgeLoadError(
    'KNOWLEDGE_LOCK_TIMEOUT',
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}

export async function loadKnowledgeById(options = {}) {
  validateExactId(options.id);
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    gitRunner: options.gitRunner,
    readOnly: true,
  });
  if (!resolved.storePath) {
    throw knowledgeLoadError(
      'KNOWLEDGE_NOT_FOUND',
      `Knowledge record not found: ${options.id}`,
    );
  }

  try {
    return await withStoreLock(
      resolved.storePath,
      'load-knowledge',
      async () => {
        const { index } = refreshKnowledgeIndex(resolved.storePath);
        const entry = index.records.find((candidate) => candidate.id === options.id);
        if (!entry) classifyMissingActiveEntry(resolved.storePath, options.id);

        const recordPath = path.resolve(resolved.storePath, entry.recordPath);
        const recordDirectory = path.dirname(recordPath);
        let expectedCanonicalDirectory;
        try {
          const directoryStat = fs.lstatSync(recordDirectory);
          if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
            throw new Error('record directory is not canonical');
          }
          expectedCanonicalDirectory = fs.realpathSync.native(recordDirectory);
        } catch (error) {
          throw knowledgeLoadError(
            'KNOWLEDGE_CHANGED_DURING_READ',
            `Knowledge record changed while it was being verified: ${options.id}`,
            { cause: error },
          );
        }

        const parsed = readVerifiedIndexedRecord(
          resolved.storePath,
          entry,
          options.recordReadOptions,
        );
        if (!parsed) {
          throw knowledgeLoadError(
            'KNOWLEDGE_CHANGED_DURING_READ',
            `Knowledge record changed while it was being verified: ${options.id}`,
          );
        }

        const resources = resourceManifest(
          recordDirectory,
          parsed.resources,
          expectedCanonicalDirectory,
        );
        const currentActivity = readKnowledgeActivity(resolved.storePath);
        const { activity, versionActivity } = incrementKnowledgeLoadActivity(currentActivity, {
          id: parsed.record.id,
          version: RECORD_ACTIVITY_VERSION,
          now: options.now,
        });
        try {
          writeKnowledgeActivity(
            resolved.storePath,
            activity,
            options.activityWriteOptions,
          );
        } catch (error) {
          if (error?.code === 'KNOWLEDGE_ACTIVITY_CORRUPT') throw error;
          throw knowledgeLoadError(
            'KNOWLEDGE_ACTIVITY_WRITE_FAILED',
            `Could not commit load activity for knowledge record: ${options.id}`,
            { cause: error },
          );
        }

        return {
          ok: true,
          id: parsed.record.id,
          kind: parsed.record.kind,
          record: parsed.record,
          rendered: renderKnowledgeRecord(parsed.record),
          recordPath,
          recordDirectory,
          resources,
          activity: versionActivity,
        };
      },
      options.lockOptions,
    );
  } catch (error) {
    throw mapLockError(error);
  }
}

export function serializeKnowledgeLoadError(error) {
  return {
    ok: false,
    code: error?.code || 'KNOWLEDGE_LOAD_FAILED',
    message: error instanceof Error ? error.message : String(error),
    ...(Array.isArray(error?.paths) ? { paths: error.paths } : {}),
  };
}

export function formatKnowledgeLoadHuman(result) {
  const content = result.rendered.endsWith('\n') ? result.rendered : `${result.rendered}\n`;
  const locations = {
    recordDirectory: result.recordDirectory,
    resources: result.resources,
  };
  return `${content}\nSPECTRE_KNOWLEDGE_RESOURCE_LOCATIONS=${JSON.stringify(locations)}\n`;
}

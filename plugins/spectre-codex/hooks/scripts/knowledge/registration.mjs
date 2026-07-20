import fs from 'node:fs';
import path from 'node:path';

import { measurePayload } from './payload.mjs';
import { parseKnowledgeRecord, refreshKnowledgeIndex } from './records.mjs';
import { resolveProjectStore, withStoreLock } from './store.mjs';

const RETIRED_NATIVE_RECORD_IDS = new Set(['spectre-recall', 'spectre-find']);

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function proposalRecordDir(recordPath) {
  if (!recordPath) {
    throw codedError('MISSING_RECORD', 'Missing required --record <path>.');
  }
  const absolutePath = path.resolve(recordPath);
  let stat;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    throw codedError('MISSING_RECORD', `Record path does not exist: ${absolutePath}`);
  }
  return stat.isDirectory() ? absolutePath : path.dirname(absolutePath);
}

function frameForMeasurement(content) {
  return [
    '# Spectre applied knowledge',
    '',
    content,
    '',
    'x'.repeat(750),
  ].join('\n');
}

function validatePayloadSafe(content, skillPath) {
  const framed = frameForMeasurement(content);
  const claude = measurePayload('claude', framed);
  const codex = measurePayload('codex', framed);
  if (!claude.ok || !codex.ok) {
    throw codedError(
      'KNOWLEDGE_PAYLOAD_UNSAFE',
      `${skillPath}: framed record exceeds a host payload budget`,
      { measurements: { claude, codex } },
    );
  }
}

function copyDirectory(sourceDir, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw codedError('KNOWLEDGE_RECORD_INVALID', `${sourcePath}: symlinks are not supported`);
    }
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
    } else {
      throw codedError('KNOWLEDGE_RECORD_INVALID', `${sourcePath}: unsupported filesystem entry`);
    }
  }
}

function removeRegistrationStages(storePath) {
  for (const entry of fs.readdirSync(storePath, { withFileTypes: true })) {
    if (entry.name.startsWith('.registration-stage-') && entry.isDirectory()) {
      fs.rmSync(path.join(storePath, entry.name), { recursive: true, force: true });
    }
  }
}

function beginRecordDirectoryReplacement(destinationPath, stagePath) {
  const backupPath = `${destinationPath}.previous-${process.pid}-${Date.now()}`;
  let backedUp = false;
  try {
    if (fs.existsSync(destinationPath)) {
      fs.renameSync(destinationPath, backupPath);
      backedUp = true;
    }
    fs.renameSync(stagePath, destinationPath);
  } catch (error) {
    fs.rmSync(destinationPath, { recursive: true, force: true });
    if (backedUp && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, destinationPath);
    }
    throw error;
  }
  return {
    commit() {
      if (backedUp) fs.rmSync(backupPath, { recursive: true, force: true });
    },
    rollback() {
      fs.rmSync(destinationPath, { recursive: true, force: true });
      if (backedUp && fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, destinationPath);
      }
    },
  };
}

function validateStagedRecord(stagePath) {
  let parsed;
  try {
    parsed = parseKnowledgeRecord(path.join(stagePath, 'SKILL.md'));
  } catch (error) {
    throw codedError(
      'KNOWLEDGE_RECORD_INVALID',
      error instanceof Error ? error.message : String(error),
    );
  }
  if (RETIRED_NATIVE_RECORD_IDS.has(parsed.record.id)) {
    throw codedError(
      'KNOWLEDGE_RECORD_INVALID',
      `${parsed.record.id} is a retired generated recall surface, not learned knowledge`,
    );
  }
  validatePayloadSafe(parsed.content, path.join(stagePath, 'SKILL.md'));
  return parsed;
}

export async function registerCanonicalKnowledge(options) {
  const projectDir = path.resolve(options.projectDir || options.projectRoot || process.cwd());
  const sourceDir = proposalRecordDir(options.recordPath || options.record);
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    gitRunner: options.gitRunner,
    allocationLockOptions: options.allocationLockOptions,
  });
  const storePath = resolved.storePath;

  return withStoreLock(
    storePath,
    'register-knowledge',
    async () => {
      removeRegistrationStages(storePath);
      const stageRoot = path.join(storePath, `.registration-stage-${process.pid}-${Date.now()}`);
      fs.mkdirSync(stageRoot, { recursive: true });
      try {
        const stagedRecordDir = path.join(stageRoot, path.basename(sourceDir));
        copyDirectory(sourceDir, stagedRecordDir);
        const parsed = validateStagedRecord(stagedRecordDir);
        const destinationPath = path.join(storePath, 'knowledge', parsed.record.id);
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        const replacement = beginRecordDirectoryReplacement(destinationPath, stagedRecordDir);
        try {
          if (options.afterRecordSwap) options.afterRecordSwap();
          refreshKnowledgeIndex(storePath);
          replacement.commit();
        } catch (error) {
          replacement.rollback();
          throw error;
        }
        return {
          ok: true,
          id: parsed.record.id,
          storePath,
          recordPath: path.join(destinationPath, 'SKILL.md'),
          indexPath: path.join(storePath, 'index.json'),
        };
      } catch (error) {
        if (error?.code) throw error;
        throw codedError(
          'KNOWLEDGE_REGISTRATION_FAILED',
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        fs.rmSync(stageRoot, { recursive: true, force: true });
      }
    },
    options.lockOptions,
  );
}

export function serializeKnowledgeError(error) {
  const code = error?.code || 'KNOWLEDGE_REGISTRATION_FAILED';
  return {
    ok: false,
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

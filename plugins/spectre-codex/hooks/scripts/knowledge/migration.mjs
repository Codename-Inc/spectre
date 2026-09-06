import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  parseKnowledgeRecord,
  refreshKnowledgeIndex,
} from './records.mjs';
import {
  findImportReceipt,
  readImportReceipts,
  withImportReceipt,
} from './receipts.mjs';
import {
  atomicWriteJson,
  resolveProjectStore,
  withStoreLock,
} from './store.mjs';

const LEGACY_ROOTS = [
  { nativeRoot: '.claude', recallName: 'spectre-recall' },
  { nativeRoot: '.agents', recallName: 'spectre-recall' },
  { nativeRoot: '.claude', recallName: 'spectre-find' },
  { nativeRoot: '.agents', recallName: 'spectre-find' },
];
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

function recoverable(message) {
  const error = new Error(message);
  error.code = 'RECOVERABLE_FAILURE';
  return error;
}

function packageEntries(root) {
  const entries = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw recoverable(`${entryPath}: symlinks cannot be imported`);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) entries.push({
        relativePath: path.relative(root, entryPath).split(path.sep).join('/'),
        sourcePath: entryPath,
      });
      else throw recoverable(`${entryPath}: unsupported source entry`);
    }
  }
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function sourcePackageDigest(sourceDir) {
  const hash = createHash('sha256');
  for (const entry of packageEntries(sourceDir)) {
    hash.update(entry.relativePath);
    hash.update('\0');
    hash.update(fs.readFileSync(entry.sourcePath));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function copyPackage(sourceDir, destinationDir) {
  for (const entry of packageEntries(sourceDir)) {
    const destination = path.join(destinationDir, entry.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(entry.sourcePath, destination);
  }
}

function legacyRows(projectDir) {
  const rows = [];
  for (const root of LEGACY_ROOTS) {
    const registryPath = path.join(
      projectDir, root.nativeRoot, 'skills', root.recallName, 'references', 'registry.toon',
    );
    if (!fs.existsSync(registryPath)) continue;
    for (const line of fs.readFileSync(registryPath, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.startsWith('#')) continue;
      const [id, category, rawCues, ...descriptionParts] = line.split('|');
      rows.push({
        id: id?.trim() || '',
        category: category?.trim() || '',
        cues: rawCues?.trim() || '',
        description: descriptionParts.join('|').trim(),
        registryPath,
        sourceDir: path.join(projectDir, root.nativeRoot, 'skills', id?.trim() || ''),
      });
    }
  }
  return rows;
}

function parseLegacySource(sourceDir, expectedId, row) {
  const sourcePath = path.join(sourceDir, 'SKILL.md');
  let text;
  try {
    text = fs.readFileSync(sourcePath, 'utf8');
  } catch {
    throw recoverable(`${sourcePath}: missing legacy SKILL.md source`);
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw recoverable(`${sourcePath}: legacy source is missing frontmatter`);
  const fields = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator <= 0 || /^\s/.test(line)) continue;
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ''));
  }
  const id = fields.get('name');
  const description = fields.get('description');
  if (id !== expectedId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || '')) {
    throw recoverable(`${sourcePath}: legacy name must match its canonical directory ID`);
  }
  if (!description) throw recoverable(`${sourcePath}: legacy description is required`);
  return {
    title: id,
    summary: description.replace(/\s+TRIGGER when:.*$/i, '').trim(),
    body: text.slice(match[0].length),
    useWhen: description.replace(/\s+TRIGGER when:.*$/i, '').trim(),
    cues: row.cues.split(',').map((cue) => cue.trim()).filter(Boolean),
    category: fields.get('spectre-category') || row.category || 'unknown — imported record',
    status: fields.get('spectre-status') || 'unknown — imported record',
    version: fields.get('spectre-version') || 'unknown — imported record',
  };
}

function sourceArchivePath(storePath, sourceDigest) {
  return path.join(storePath, 'knowledge-history', 'imported-sources', sourceDigest.replace(':', '-'));
}

function workRecord(id, source, sourceDigest, now) {
  return {
    schemaVersion: 1,
    id,
    kind: 'work',
    title: source.title,
    summary: source.summary,
    tags: [],
    applicability: { scope: 'project' },
    provenance: {
      origin: 'legacy-import',
      capturedAt: new Date(typeof now === 'function' ? now() : Date.now()).toISOString(),
      sourceFingerprint: sourceDigest,
    },
    relatedRecordIds: [],
    work: {
      requestedOutcome: 'unknown — imported record',
      scope: 'unknown — imported record',
      actualChanges: 'unknown — imported record',
      reasons: 'unknown — imported record',
      discoveries: 'unknown — imported record',
      verification: 'unknown — imported record',
      remainingWork: 'unknown — imported record',
      relatedContext: 'unknown — imported record',
      execution: { state: 'unknown' },
      verificationState: { state: 'unknown' },
      pullRequest: { state: 'unknown' },
      associations: { sourceRunIds: [], pullRequestIds: [], candidates: [] },
    },
    importedSource: {
      body: source.body,
      useWhen: source.useWhen,
      cues: source.cues,
      category: source.category,
      status: source.status,
      version: source.version,
    },
  };
}

function destinationId(storePath, sourceId, sourceDigest) {
  const primary = path.join(storePath, 'knowledge', sourceId);
  if (!fs.existsSync(primary)) return sourceId;
  try {
    const parsed = parseKnowledgeRecord(path.join(primary, 'record.json'));
    if (
      parsed.record.provenance.origin === 'legacy-import'
      && parsed.record.provenance.sourceFingerprint === sourceDigest
    ) return sourceId;
  } catch {
    // An unreadable package is never an unsafe replacement target.
  }
  const suffix = `-imported-${sourceDigest.slice(7, 15)}`;
  return `${sourceId.slice(0, 64 - suffix.length)}${suffix}`;
}

function receiptEntry(sourceDigest, recordId, revisionToken, now) {
  return {
    sourceDigest,
    recordId,
    revisionToken,
    importedAt: new Date(typeof now === 'function' ? now() : Date.now()).toISOString(),
  };
}

function removeRegistryRows(rows) {
  const byPath = new Map();
  for (const row of rows) {
    if (!byPath.has(row.registryPath)) byPath.set(row.registryPath, new Set());
    byPath.get(row.registryPath).add(row.id);
  }
  for (const [registryPath, ids] of byPath) {
    const retained = fs.readFileSync(registryPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !ids.has(line.split('|')[0]?.trim()))
      .join('\n');
    fs.writeFileSync(registryPath, retained);
  }
}

function importOne(storePath, row, options) {
  const sourceDigest = sourcePackageDigest(row.sourceDir);
  const receipt = findImportReceipt(storePath, sourceDigest);
  if (receipt) return { id: row.id, code: 'NOOP', sourceDigest, recordId: receipt.recordId };

  const archivePath = sourceArchivePath(storePath, sourceDigest);
  if (!fs.existsSync(archivePath)) {
    const stage = `${archivePath}.stage-${process.pid}-${Date.now()}`;
    copyPackage(row.sourceDir, stage);
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.renameSync(stage, archivePath);
  }

  let source;
  try {
    source = parseLegacySource(row.sourceDir, row.id, row);
  } catch (error) {
    return { id: row.id, code: 'RECOVERABLE_FAILURE', sourceDigest, message: error.message };
  }
  const id = destinationId(storePath, row.id, sourceDigest);
  const destination = path.join(storePath, 'knowledge', id);
  if (fs.existsSync(destination)) {
    const parsed = parseKnowledgeRecord(path.join(destination, 'record.json'));
    if (parsed.record.provenance.sourceFingerprint === sourceDigest) {
      atomicWriteJson(path.join(storePath, 'import-receipts.json'), withImportReceipt(
        readImportReceipts(storePath), receiptEntry(sourceDigest, id, parsed.revisionToken, options.now),
      ));
      return { id: row.id, code: 'NOOP', sourceDigest, recordId: id };
    }
    throw recoverable(`${destination}: import redirect collision is not recoverable automatically`);
  }
  const stageRoot = path.join(storePath, `.migration-stage-${process.pid}-${Date.now()}`);
  const stage = path.join(stageRoot, id);
  copyPackage(row.sourceDir, path.join(stage, 'imported-source'));
  atomicWriteJson(path.join(stage, 'record.json'), workRecord(id, source, sourceDigest, options.now));
  const parsed = parseKnowledgeRecord(path.join(stage, 'record.json'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(stage, destination);
  fs.rmSync(stageRoot, { recursive: true, force: true });
  atomicWriteJson(path.join(storePath, 'import-receipts.json'), withImportReceipt(
    readImportReceipts(storePath), receiptEntry(sourceDigest, id, parsed.revisionToken, options.now),
  ));
  return { id: row.id, code: 'IMPORTED', sourceDigest, recordId: id };
}

export async function migrateLegacyKnowledge(options) {
  const projectDir = path.resolve(options.projectDir);
  const rows = legacyRows(projectDir);
  let storePath = options.storePath ? path.resolve(options.storePath) : null;
  if (!storePath) {
    const resolved = await resolveProjectStore(projectDir, {
      spectreHome: options.spectreHome,
      gitRunner: options.gitRunner,
      readOnly: rows.length === 0,
      allocationLockOptions: options.allocationLockOptions,
    });
    storePath = resolved.storePath;
  }
  if (!storePath) return { schemaVersion: 1, entries: [] };

  return withStoreLock(storePath, 'migrate-legacy-knowledge', async () => {
    if (rows.length === 0) {
      return {
        schemaVersion: 1,
        entries: readImportReceipts(storePath).receipts.map((receipt) => ({
          id: receipt.recordId,
          code: 'NOOP',
          sourceDigest: receipt.sourceDigest,
          recordId: receipt.recordId,
        })),
      };
    }
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.id)) groups.set(row.id, []);
      groups.get(row.id).push(row);
    }
    const entries = [];
    for (const [id, sources] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      try {
        const digests = sources.map((row) => sourcePackageDigest(row.sourceDir));
        if (new Set(digests).size !== 1) {
          entries.push({
            id,
            code: 'RECOVERABLE_FAILURE',
            message: `Legacy sources for ${id} differ and require a deliberate recovery choice.`,
          });
          continue;
        }
        entries.push(importOne(storePath, sources[0], options));
      } catch (error) {
        entries.push({ id, code: 'RECOVERABLE_FAILURE', message: error.message });
      }
    }
    refreshKnowledgeIndex(storePath);
    removeRegistryRows(rows);
    for (const [id, sources] of groups) {
      const entry = entries.find((candidate) => candidate.id === id);
      if (entry?.code === 'IMPORTED' || entry?.code === 'NOOP') {
        for (const source of sources) {
          fs.rmSync(source.sourceDir, { recursive: true, force: true });
        }
      }
    }
    return { schemaVersion: 1, entries };
  }, options.lockOptions);
}

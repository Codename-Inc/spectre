import fs from 'node:fs';
import path from 'node:path';

import { measurePayload } from './payload.mjs';
import {
  CATEGORIES,
  parseKnowledgeRecord,
  refreshKnowledgeIndex,
} from './records.mjs';
import {
  atomicWriteFile,
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
const STANDARD_FIELDS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
  'user-invocable',
]);
const SPECTRE_METADATA = new Set([
  'spectre-category',
  'spectre-triggers',
  'spectre-status',
  'spectre-version',
]);

function malformed(message) {
  const error = new Error(message);
  error.code = 'MALFORMED';
  return error;
}

function parseString(rawValue, key) {
  const value = rawValue.trim();
  if (value === '') throw malformed(`${key} must be a string`);
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string') throw malformed(`${key} must be a string`);
      return parsed;
    } catch (error) {
      if (error.code === 'MALFORMED') throw error;
      throw malformed(`${key} contains an invalid quoted string`);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw malformed(`${key} contains an invalid quoted string`);
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (
    /^(?:true|false|null|~)$/i.test(value) ||
    /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value) ||
    value.startsWith('[') ||
    value.startsWith('{')
  ) {
    throw malformed(`${key} must be a string`);
  }
  return value.replace(/\s+#.*$/, '');
}

function splitLegacySkill(content, sourcePath) {
  const opening = content.match(/^---\r?\n/);
  if (!opening) throw malformed(`${sourcePath}: missing frontmatter`);
  const remainder = content.slice(opening[0].length);
  const closing = remainder.match(/\r?\n---(?=\r?\n|$)/);
  if (!closing) throw malformed(`${sourcePath}: missing closing frontmatter`);
  return {
    frontmatter: remainder.slice(0, closing.index),
    body: remainder.slice(closing.index + closing[0].length),
  };
}

function parseLegacyFrontmatter(frontmatter, sourcePath) {
  const lines = frontmatter.split(/\r?\n/);
  const fields = {};
  const metadata = {};
  let currentMap = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indentation = line.length - line.trimStart().length;
    const trimmed = line.trim();
    const separator = trimmed.indexOf(':');
    if (separator <= 0) throw malformed(`${sourcePath}: malformed frontmatter`);
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1);

    if (indentation === 0) {
      currentMap = null;
      if (!STANDARD_FIELDS.has(key)) {
        throw malformed(`${sourcePath}: unknown top-level field ${key}`);
      }
      if (Object.hasOwn(fields, key)) {
        throw malformed(`${sourcePath}: duplicate top-level field ${key}`);
      }
      if (key === 'metadata') {
        if (rawValue.trim() !== '' && rawValue.trim() !== '{}') {
          throw malformed(`${sourcePath}: metadata must be a mapping`);
        }
        fields.metadata = metadata;
        currentMap = metadata;
        continue;
      }
      if (key === 'user-invocable') {
        if (!/^(?:true|false)$/i.test(rawValue.trim())) {
          throw malformed(`${sourcePath}: user-invocable must be boolean`);
        }
        fields[key] = rawValue.trim().toLowerCase() === 'true';
        continue;
      }
      if (rawValue.trim() === '|' || rawValue.trim() === '>') {
        const folded = rawValue.trim() === '>';
        const parts = [];
        while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
          index += 1;
          parts.push(lines[index].trim());
        }
        fields[key] = folded ? parts.join(' ') : parts.join('\n');
        continue;
      }
      fields[key] = parseString(rawValue, key);
      continue;
    }

    if (currentMap !== metadata) {
      throw malformed(`${sourcePath}: unexpected indentation`);
    }
    if (Object.hasOwn(metadata, key)) {
      throw malformed(`${sourcePath}: duplicate metadata field ${key}`);
    }
    metadata[key] = parseString(rawValue, `metadata.${key}`);
  }
  return { fields, metadata };
}

function normalizeLegacyRecord(sourcePath, id, category, triggers) {
  const skillPath = path.join(sourcePath, 'SKILL.md');
  const sourceBytes = fs.readFileSync(skillPath);
  const content = sourceBytes.toString('utf8');
  if (!Buffer.from(content, 'utf8').equals(sourceBytes)) {
    throw malformed(`${skillPath}: source is not valid UTF-8`);
  }
  const { frontmatter, body } = splitLegacySkill(content, sourcePath);
  const { fields, metadata } = parseLegacyFrontmatter(frontmatter, sourcePath);
  if (
    fields.name !== id ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
    id.length > 64
  ) {
    throw malformed(`${sourcePath}: legacy name must match its valid directory ID`);
  }
  const description = fields.description
    ?.replace(/\s+TRIGGER when:.*$/, '')
    .trim();
  if (!description || description.length > 1_024) {
    throw malformed(`${sourcePath}: invalid description`);
  }
  if (fields.compatibility !== undefined && fields.compatibility.length > 500) {
    throw malformed(`${sourcePath}: invalid compatibility`);
  }

  const unrelatedMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SPECTRE_METADATA.has(key)) unrelatedMetadata[key] = value;
  }
  const canonical = {
    id,
    description,
    ...(fields.license === undefined ? {} : { license: fields.license }),
    ...(fields.compatibility === undefined ? {} : { compatibility: fields.compatibility }),
    ...(fields['allowed-tools'] === undefined ? {} : { allowedTools: fields['allowed-tools'] }),
    metadata: unrelatedMetadata,
    category,
    triggers,
    status: 'active',
    version: 1,
    body,
  };
  return {
    canonical,
    content: buildCanonicalContent(canonical),
  };
}

function buildCanonicalContent(record) {
  const lines = [
    '---',
    `name: ${JSON.stringify(record.id)}`,
    `description: ${JSON.stringify(record.description)}`,
  ];
  if (record.license !== undefined) lines.push(`license: ${JSON.stringify(record.license)}`);
  if (record.compatibility !== undefined) {
    lines.push(`compatibility: ${JSON.stringify(record.compatibility)}`);
  }
  if (record.allowedTools !== undefined) {
    lines.push(`allowed-tools: ${JSON.stringify(record.allowedTools)}`);
  }
  lines.push('metadata:');
  for (const [key, value] of Object.entries(record.metadata).sort(([left], [right]) =>
    left.localeCompare(right))) {
    lines.push(`  ${key}: ${JSON.stringify(value)}`);
  }
  lines.push(
    `  spectre-category: ${JSON.stringify(record.category)}`,
    `  spectre-triggers: ${JSON.stringify(JSON.stringify(record.triggers))}`,
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
  );
  return `${lines.join('\n')}${record.body}`;
}

function directorySnapshot(root) {
  const snapshot = {};
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw malformed(`${entryPath}: symlinks are not migratable`);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) {
        snapshot[path.relative(root, entryPath)] = fs.readFileSync(entryPath).toString('base64');
      } else {
        throw malformed(`${entryPath}: unsupported filesystem entry`);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function expectedDestinationSnapshot(sourcePath, canonicalContent) {
  const snapshot = directorySnapshot(sourcePath);
  snapshot['SKILL.md'] = Buffer.from(canonicalContent).toString('base64');
  return Object.fromEntries(
    Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseTriggers(rawTriggers) {
  const triggers = [];
  const seen = new Set();
  for (const part of rawTriggers.split(',')) {
    const trigger = part.trim();
    const key = trigger.toLocaleLowerCase();
    if (!trigger || seen.has(key)) continue;
    seen.add(key);
    triggers.push(trigger);
  }
  if (triggers.length === 0) throw malformed('registry triggers must not be empty');
  return triggers;
}

function readRegistryRows(projectDir) {
  const rows = [];
  for (const root of LEGACY_ROOTS) {
    const skillsDir = path.join(projectDir, root.nativeRoot, 'skills');
    const registryPath = path.join(
      skillsDir,
      root.recallName,
      'references',
      'registry.toon',
    );
    if (!fs.existsSync(registryPath)) continue;
    const lines = fs.readFileSync(registryPath, 'utf8').split(/\r?\n/);
    for (const [lineIndex, line] of lines.entries()) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split('|');
      const id = parts[0]?.trim() || `malformed-row-${lineIndex + 1}`;
      rows.push({
        id,
        category: parts[1]?.trim(),
        rawTriggers: parts[2] ?? '',
        description: parts.slice(3).join('|').trim(),
        raw: line,
        lineIndex,
        registryPath,
        nativeRoot: root.nativeRoot,
        recallName: root.recallName,
        sourcePath: path.join(skillsDir, id),
        malformed: parts.length < 4,
      });
    }
  }
  return rows;
}

function readExistingReport(reportPath) {
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (report?.schemaVersion === 1 && Array.isArray(report.entries)) return report;
  } catch {
    // Missing or invalid reports are replaced after the next classified run.
  }
  return null;
}

function mergeTriggers(rows) {
  const merged = [];
  const seen = new Set();
  for (const row of rows) {
    for (const trigger of parseTriggers(row.rawTriggers)) {
      const key = trigger.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trigger);
    }
  }
  return merged;
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

function matchesCommittedDestination(destinationPath, id, category, triggers) {
  const skillPath = path.join(destinationPath, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return false;
  try {
    const { record } = parseKnowledgeRecord(skillPath);
    return (
      record.id === id &&
      record.category === category &&
      snapshotsEqual(record.triggers, triggers) &&
      record.status === 'active' &&
      record.version === 1
    );
  } catch {
    return false;
  }
}

function matchesCommittedDestinationFromSources(
  destinationPath,
  sourcePaths,
  id,
  category,
  triggers,
) {
  if (!fs.existsSync(destinationPath) || sourcePaths.length === 0) return false;
  try {
    const sourceSnapshots = sourcePaths.map(directorySnapshot);
    if (
      sourceSnapshots.some((snapshot) =>
        !snapshotsEqual(snapshot, sourceSnapshots[0]))
    ) {
      return false;
    }
    const normalized = normalizeLegacyRecord(
      sourcePaths[0],
      id,
      category,
      triggers,
    );
    const expected = expectedDestinationSnapshot(
      sourcePaths[0],
      normalized.content,
    );
    return snapshotsEqual(directorySnapshot(destinationPath), expected);
  } catch {
    return false;
  }
}

function classifyGroup(id, rows, storePath) {
  const sourcePaths = [...new Set(rows.map(({ sourcePath }) => sourcePath))];
  const destinationPath = path.join(storePath, 'knowledge', id);
  const base = {
    id,
    sourcePaths,
    registryPaths: [...new Set(rows.map(({ registryPath }) => registryPath))],
    destinationPath,
  };

  try {
    if (rows.some(({ malformed: rowMalformed }) => rowMalformed)) {
      throw malformed(`${id}: malformed registry row`);
    }
    if (rows.some(({ category }) => !CATEGORIES.has(category))) {
      throw malformed(`${id}: invalid category`);
    }
    const missingSourcePaths = sourcePaths.filter(
      (sourcePath) => !fs.existsSync(path.join(sourcePath, 'SKILL.md')),
    );
    if (missingSourcePaths.length > 0) {
      const existingSourcePaths = sourcePaths.filter(
        (sourcePath) => !missingSourcePaths.includes(sourcePath),
      );
      const categories = new Set(rows.map(({ category }) => category));
      const triggers = mergeTriggers(rows);
      if (
        categories.size === 1 &&
        (
          (
            existingSourcePaths.length === 0 &&
            matchesCommittedDestination(
              destinationPath,
              id,
              rows[0].category,
              triggers,
            )
          ) ||
          matchesCommittedDestinationFromSources(
            destinationPath,
            existingSourcePaths,
            id,
            rows[0].category,
            triggers,
          )
        )
      ) {
        return { ...base, code: 'ALREADY_MIGRATED' };
      }
      return { ...base, code: 'SOURCE_MISSING' };
    }
    const categories = new Set(rows.map(({ category }) => category));
    const sourceSnapshots = sourcePaths.map(directorySnapshot);
    if (
      categories.size !== 1 ||
      sourceSnapshots.some((snapshot) => !snapshotsEqual(snapshot, sourceSnapshots[0]))
    ) {
      return { ...base, code: 'DIVERGENT' };
    }

    const category = rows[0].category;
    const triggers = mergeTriggers(rows);
    const normalized = normalizeLegacyRecord(sourcePaths[0], id, category, triggers);
    const framed = frameForMeasurement(normalized.content);
    if (
      normalized.content.length > 9_000 ||
      !measurePayload('claude', framed).ok ||
      !measurePayload('codex', framed).ok
    ) {
      const grandfatheredClaudeNativeDiscovery = sourcePaths.some((sourcePath) =>
        sourcePath.includes(`${path.sep}.claude${path.sep}`));
      return {
        ...base,
        code: 'OVERSIZED',
        grandfatheredClaudeNativeDiscovery,
      };
    }

    const expected = expectedDestinationSnapshot(sourcePaths[0], normalized.content);
    if (fs.existsSync(destinationPath)) {
      return {
        ...base,
        code: snapshotsEqual(directorySnapshot(destinationPath), expected)
          ? 'ALREADY_MIGRATED'
          : 'CONFLICT',
        canonical: normalized.canonical,
        canonicalContent: normalized.content,
      };
    }
    return {
      ...base,
      code: sourcePaths.length > 1 ? 'DEDUPLICATED' : 'MIGRATED',
      canonical: normalized.canonical,
      canonicalContent: normalized.content,
    };
  } catch (error) {
    if (error.code !== 'MALFORMED') throw error;
    return { ...base, code: 'MALFORMED', message: error.message };
  }
}

export function classifyLegacyKnowledge({ projectDir, storePath }) {
  const rows = readRegistryRows(path.resolve(projectDir));
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.id)) grouped.set(row.id, []);
    grouped.get(row.id).push(row);
  }
  const entries = [...grouped.entries()]
    .map(([id, groupedRows]) => classifyGroup(id, groupedRows, path.resolve(storePath)))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    schemaVersion: 1,
    grandfatheredClaudeNativeDiscoveryIncomplete: entries.some(
      ({ code, grandfatheredClaudeNativeDiscovery }) =>
        code === 'OVERSIZED' && grandfatheredClaudeNativeDiscovery,
    ),
    entries,
  };
}

function durableReport(classification) {
  return {
    schemaVersion: 1,
    grandfatheredClaudeNativeDiscoveryIncomplete:
      classification.grandfatheredClaudeNativeDiscoveryIncomplete,
    entries: classification.entries.map((entry) => {
      const {
        canonical: _canonical,
        canonicalContent: _canonicalContent,
        ...durable
      } = entry;
      return durable;
    }),
  };
}

function stageClassifiedRecords(storePath, classification) {
  const stageRoot = path.join(
    storePath,
    `.migration-stage-${process.pid}-${Date.now()}`,
  );
  const staged = [];
  fs.mkdirSync(stageRoot, { recursive: true });
  try {
    for (const entry of classification.entries) {
      if (!['MIGRATED', 'DEDUPLICATED'].includes(entry.code)) continue;
      const stagePath = path.join(stageRoot, entry.id);
      fs.cpSync(entry.sourcePaths[0], stagePath, { recursive: true });
      fs.writeFileSync(path.join(stagePath, 'SKILL.md'), entry.canonicalContent);
      parseKnowledgeRecord(path.join(stagePath, 'SKILL.md'));
      staged.push({ entry, stagePath });
    }
    return { stageRoot, staged };
  } catch (error) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

function commitStagedRecords(storePath, staged) {
  const knowledgeDir = path.join(storePath, 'knowledge');
  fs.mkdirSync(knowledgeDir, { recursive: true });
  for (const { entry, stagePath } of staged) {
    if (fs.existsSync(entry.destinationPath)) {
      throw new Error(`Canonical migration target appeared during commit: ${entry.destinationPath}`);
    }
    fs.renameSync(stagePath, entry.destinationPath);
  }
  refreshKnowledgeIndex(storePath);
}

function registryRowId(line) {
  if (!line.trim() || line.startsWith('#')) return null;
  return line.split('|')[0]?.trim() || null;
}

function removeResolvedRegistryRows(projectDir, resolvedIds) {
  if (resolvedIds.size === 0) return;
  for (const root of LEGACY_ROOTS) {
    const registryPath = path.join(
      projectDir,
      root.nativeRoot,
      'skills',
      root.recallName,
      'references',
      'registry.toon',
    );
    if (!fs.existsSync(registryPath)) continue;
    const original = fs.readFileSync(registryPath, 'utf8');
    const lines = original.split(/\r?\n/);
    if (!lines.some((line) => resolvedIds.has(registryRowId(line)))) continue;
    const retained = lines.filter((line) => {
      const id = registryRowId(line);
      return id === null || !resolvedIds.has(id);
    });
    atomicWriteFile(registryPath, retained.join('\n'));
  }
}

function unresolvedRegistryRows(projectDir) {
  let count = 0;
  for (const root of LEGACY_ROOTS) {
    const registryPath = path.join(
      projectDir,
      root.nativeRoot,
      'skills',
      root.recallName,
      'references',
      'registry.toon',
    );
    if (!fs.existsSync(registryPath)) continue;
    count += fs.readFileSync(registryPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.startsWith('#'))
      .length;
  }
  return count;
}

function removeGeneratedRecallWhenResolved(projectDir) {
  if (unresolvedRegistryRows(projectDir) !== 0) return;
  for (const root of LEGACY_ROOTS) {
    fs.rmSync(
      path.join(projectDir, root.nativeRoot, 'skills', root.recallName),
      { recursive: true, force: true },
    );
  }
}

function cleanResolvedSources(projectDir, classification) {
  const resolved = classification.entries.filter(({ code }) =>
    ['MIGRATED', 'DEDUPLICATED', 'ALREADY_MIGRATED'].includes(code));
  const resolvedIds = new Set(resolved.map(({ id }) => id));
  for (const entry of resolved) {
    for (const sourcePath of entry.sourcePaths) {
      fs.rmSync(sourcePath, { recursive: true, force: true });
    }
  }
  removeResolvedRegistryRows(projectDir, resolvedIds);
  removeGeneratedRecallWhenResolved(projectDir);
}

export async function migrateLegacyKnowledge(options) {
  const projectDir = path.resolve(options.projectDir);
  const legacyRows = readRegistryRows(projectDir);
  let storePath = options.storePath ? path.resolve(options.storePath) : null;
  if (!storePath) {
    const resolved = await resolveProjectStore(projectDir, {
      spectreHome: options.spectreHome,
      gitRunner: options.gitRunner,
      readOnly: legacyRows.length === 0,
      allocationLockOptions: options.allocationLockOptions,
    });
    storePath = resolved.storePath;
  }
  if (!storePath) {
    return {
      schemaVersion: 1,
      grandfatheredClaudeNativeDiscoveryIncomplete: false,
      entries: [],
    };
  }
  const reportPath = path.join(storePath, 'migration-report.json');
  const initialClassification = classifyLegacyKnowledge({ projectDir, storePath });
  if (initialClassification.entries.length === 0) {
    return readExistingReport(reportPath) || durableReport(initialClassification);
  }

  try {
    return await withStoreLock(
      storePath,
      'migrate-legacy-knowledge',
      async () => {
        const classification = classifyLegacyKnowledge({ projectDir, storePath });
        const { stageRoot, staged } = stageClassifiedRecords(storePath, classification);
        try {
          commitStagedRecords(storePath, staged);
        } finally {
          fs.rmSync(stageRoot, { recursive: true, force: true });
        }
        if (options.afterCanonicalCommit) options.afterCanonicalCommit();
        cleanResolvedSources(projectDir, classification);
        const report = durableReport(classification);
        atomicWriteJson(reportPath, report);
        return report;
      },
      options.lockOptions,
    );
  } catch (error) {
    if (error.code !== 'LOCK_TIMEOUT' || !options.failOpenOnLockTimeout) throw error;
    return {
      schemaVersion: 1,
      grandfatheredClaudeNativeDiscoveryIncomplete: false,
      entries: [],
      skipped: 'LOCK_TIMEOUT',
    };
  }
}

export { buildCanonicalContent };

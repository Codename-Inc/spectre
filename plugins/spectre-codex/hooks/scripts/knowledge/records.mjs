import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteJson } from './store.mjs';

const STANDARD_FIELDS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]);
const SPECTRE_FIELDS = [
  'spectre-category',
  'spectre-triggers',
  'spectre-status',
  'spectre-version',
];
const CATEGORIES = new Set([
  'feature',
  'gotchas',
  'patterns',
  'decisions',
  'procedures',
  'integration',
  'performance',
  'testing',
  'ux',
  'strategy',
]);
const STATUSES = new Set(['active', 'disputed', 'superseded', 'archived']);
const CORE_CHARACTER_LIMIT = 9_000;

function recordError(skillPath, message) {
  return new Error(`${skillPath}: ${message}`);
}

function parseScalar(rawValue, skillPath, key) {
  const value = rawValue.trim();
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string') {
        throw recordError(skillPath, `${key} must be a string`);
      }
      return parsed;
    } catch (error) {
      if (error.message.startsWith(skillPath)) throw error;
      throw recordError(skillPath, `invalid quoted string for ${key}`);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      throw recordError(skillPath, `invalid quoted string for ${key}`);
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (
    /^(?:true|false|null|~)$/i.test(value) ||
    /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value) ||
    value.startsWith('[') ||
    value.startsWith('{')
  ) {
    throw recordError(skillPath, `${key} must be a string`);
  }
  return value.replace(/\s+#.*$/, '');
}

function parseFrontmatter(content, skillPath) {
  if (!content.startsWith('---\n')) {
    throw recordError(skillPath, 'missing opening frontmatter delimiter');
  }
  const lines = content.split('\n');
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');
  if (closingIndex === -1) {
    throw recordError(skillPath, 'missing closing frontmatter delimiter');
  }

  const fields = {};
  const metadata = {};
  let currentMap = null;

  for (let index = 1; index < closingIndex; index += 1) {
    const line = lines[index];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indentation = line.length - line.trimStart().length;
    const trimmed = line.trim();
    const separator = trimmed.indexOf(':');
    if (separator <= 0) throw recordError(skillPath, `malformed frontmatter line ${index + 1}`);
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1);

    if (indentation === 0) {
      currentMap = null;
      if (!STANDARD_FIELDS.has(key)) {
        throw recordError(skillPath, `unknown top-level field ${key}`);
      }
      if (Object.hasOwn(fields, key)) {
        throw recordError(skillPath, `duplicate top-level field ${key}`);
      }
      if (key === 'metadata') {
        if (rawValue.trim() !== '' && rawValue.trim() !== '{}') {
          throw recordError(skillPath, 'metadata must be a mapping');
        }
        fields.metadata = metadata;
        currentMap = metadata;
        continue;
      }
      if (rawValue.trim() === '|' || rawValue.trim() === '>') {
        const folded = rawValue.trim() === '>';
        const parts = [];
        while (index + 1 < closingIndex && /^\s+/.test(lines[index + 1])) {
          index += 1;
          parts.push(lines[index].trim());
        }
        fields[key] = folded ? parts.join(' ') : parts.join('\n');
        continue;
      }
      fields[key] = parseScalar(rawValue, skillPath, key);
      continue;
    }

    if (currentMap !== metadata) {
      throw recordError(skillPath, `unexpected indentation on line ${index + 1}`);
    }
    if (Object.hasOwn(metadata, key)) {
      throw recordError(skillPath, `duplicate metadata field ${key}`);
    }
    metadata[key] = parseScalar(rawValue, skillPath, `metadata.${key}`);
  }

  return {
    fields,
    body: lines.slice(closingIndex + 1).join('\n'),
  };
}

function validateFields(fields, skillPath) {
  const directoryName = path.basename(path.dirname(skillPath));
  if (
    typeof fields.name !== 'string' ||
    fields.name.length < 1 ||
    fields.name.length > 64 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name)
  ) {
    throw recordError(skillPath, 'name does not satisfy Agent Skills naming rules');
  }
  if (fields.name !== directoryName) {
    throw recordError(skillPath, 'name must match its parent directory');
  }
  if (
    typeof fields.description !== 'string' ||
    fields.description.length < 1 ||
    fields.description.length > 1_024
  ) {
    throw recordError(skillPath, 'description must contain 1-1,024 characters');
  }
  if (
    fields.compatibility !== undefined &&
    (fields.compatibility.length < 1 || fields.compatibility.length > 500)
  ) {
    throw recordError(skillPath, 'compatibility must contain 1-500 characters');
  }
  for (const optionalField of ['license', 'allowed-tools']) {
    if (fields[optionalField] !== undefined && fields[optionalField].length < 1) {
      throw recordError(skillPath, `${optionalField} must not be empty`);
    }
  }
  if (!fields.metadata || typeof fields.metadata !== 'object') {
    throw recordError(skillPath, 'metadata mapping is required');
  }
  for (const key of SPECTRE_FIELDS) {
    if (typeof fields.metadata[key] !== 'string' || fields.metadata[key] === '') {
      throw recordError(skillPath, `metadata.${key} must be a non-empty string`);
    }
  }

  const category = fields.metadata['spectre-category'];
  if (!CATEGORIES.has(category)) {
    throw recordError(skillPath, `unknown Spectre category ${category}`);
  }
  let triggers;
  try {
    triggers = JSON.parse(fields.metadata['spectre-triggers']);
  } catch {
    throw recordError(skillPath, 'spectre-triggers must contain JSON');
  }
  if (
    !Array.isArray(triggers) ||
    triggers.length === 0 ||
    triggers.some((trigger) => typeof trigger !== 'string' || trigger.trim() === '') ||
    new Set(triggers).size !== triggers.length
  ) {
    throw recordError(skillPath, 'spectre-triggers must be a unique non-empty string array');
  }
  const status = fields.metadata['spectre-status'];
  if (!STATUSES.has(status)) {
    throw recordError(skillPath, `unknown Spectre status ${status}`);
  }
  const versionValue = fields.metadata['spectre-version'];
  if (!/^[1-9]\d*$/.test(versionValue)) {
    throw recordError(skillPath, 'spectre-version must be a positive base-10 integer');
  }

  return {
    id: fields.name,
    name: fields.name,
    description: fields.description,
    ...(fields.license === undefined ? {} : { license: fields.license }),
    ...(fields.compatibility === undefined ? {} : { compatibility: fields.compatibility }),
    ...(fields['allowed-tools'] === undefined ? {} : { allowedTools: fields['allowed-tools'] }),
    metadata: { ...fields.metadata },
    category,
    triggers,
    status,
    version: Number(versionValue),
  };
}

function fingerprint(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function listResources(recordDir) {
  const resources = [];
  const pending = [recordDir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile() && entryPath !== path.join(recordDir, 'SKILL.md')) {
        resources.push(path.relative(recordDir, entryPath));
      }
    }
  }
  return resources.sort();
}

function parseKnowledgeContent(content, skillPath, resources = []) {
  if (content.length > CORE_CHARACTER_LIMIT) {
    throw recordError(skillPath, `core size exceeds ${CORE_CHARACTER_LIMIT} characters`);
  }
  const { fields, body } = parseFrontmatter(content, skillPath);
  return {
    record: { ...validateFields(fields, skillPath), body },
    content,
    fingerprint: fingerprint(content),
    resources,
  };
}

export function parseKnowledgeRecord(skillPath) {
  const content = fs.readFileSync(skillPath, 'utf8');
  return parseKnowledgeContent(content, skillPath, listResources(path.dirname(skillPath)));
}

function indexEntry(storePath, skillPath, parsed) {
  const stat = fs.statSync(skillPath);
  return {
    id: parsed.record.id,
    category: parsed.record.category,
    description: parsed.record.description,
    triggers: parsed.record.triggers,
    status: parsed.record.status,
    version: parsed.record.version,
    recordPath: path.relative(storePath, skillPath),
    sourceFingerprint: parsed.fingerprint,
    sourceSize: stat.size,
    sourceMtimeMs: stat.mtimeMs,
  };
}

function readExistingIndex(indexPath) {
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (index?.schemaVersion !== 1 || !Array.isArray(index.records)) return null;
    return index;
  } catch {
    return null;
  }
}

export function refreshKnowledgeIndex(storePath, options = {}) {
  const knowledgeDir = path.join(storePath, 'knowledge');
  const records = [];
  const errors = [];
  if (fs.existsSync(knowledgeDir)) {
    const entries = fs.readdirSync(knowledgeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const skillPath = path.join(knowledgeDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      try {
        const parsed = parseKnowledgeRecord(skillPath);
        if (parsed.record.status === 'active') {
          records.push(indexEntry(storePath, skillPath, parsed));
        }
      } catch (error) {
        errors.push({ path: skillPath, message: error.message });
      }
    }
  }

  const indexPath = path.join(storePath, 'index.json');
  const existing = readExistingIndex(indexPath);
  const unchanged =
    existing !== null &&
    JSON.stringify(existing.records) === JSON.stringify(records);
  if (unchanged) {
    return { index: existing, rebuilt: false, errors };
  }

  const nowValue = typeof options.now === 'function' ? options.now() : Date.now();
  const index = {
    schemaVersion: 1,
    generatedAt: new Date(nowValue).toISOString(),
    records,
  };
  if (options.persist !== false) atomicWriteJson(indexPath, index);
  return { index, rebuilt: true, errors };
}

export function readVerifiedIndexedRecord(storePath, entry, options = {}) {
  const absoluteStore = path.resolve(storePath);
  const skillPath = path.resolve(absoluteStore, entry.recordPath);
  if (!skillPath.startsWith(`${absoluteStore}${path.sep}`)) return null;
  const readFile = options.readFile || ((filePath) => fs.readFileSync(filePath, 'utf8'));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let content;
    try {
      content = readFile(skillPath);
    } catch {
      return null;
    }
    if (fingerprint(content) !== entry.sourceFingerprint) continue;
    try {
      return parseKnowledgeContent(content, skillPath);
    } catch {
      return null;
    }
  }
  return null;
}

export {
  CATEGORIES,
  CORE_CHARACTER_LIMIT,
  SPECTRE_FIELDS,
  STATUSES,
};

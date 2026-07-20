#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RECORD_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'records.mjs');

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-record-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

async function loadRecordModule() {
  assert.equal(
    fs.existsSync(RECORD_MODULE),
    true,
    'knowledge/records.mjs must provide canonical record and index behavior',
  );
  return import(pathToFileURL(RECORD_MODULE).href);
}

function skillContent(options = {}) {
  const name = options.name ?? 'feature-auth-flow';
  const description = options.description ?? 'Explains auth flow behavior. Use when changing authentication.';
  const status = options.status ?? 'active';
  const metadataLines = options.metadataLines || [
    '  spectre-category: "feature"',
    '  spectre-triggers: \'["auth flow","login"]\'',
    `  spectre-status: "${status}"`,
    `  spectre-version: "${options.version ?? '1'}"`,
  ];
  const optionalLines = options.optionalLines || [];
  const topExtra = options.topExtra || [];
  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    ...optionalLines,
    ...topExtra,
    'metadata:',
    ...metadataLines,
    '---',
    options.body ?? '# Auth Flow\n\nApply the established authentication sequence.',
  ].join('\n');
}

function writeSkill(root, id, content = skillContent({ name: id })) {
  const skillPath = path.join(root, 'knowledge', id, 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, content);
  return skillPath;
}

function contentAtLength(length) {
  const base = skillContent({ body: '' });
  assert.equal(base.length <= length, true);
  return `${base}${'x'.repeat(length - base.length)}`;
}

describe('canonical Agent Skills records', () => {
  it('accepts official fields, string metadata, resources, and every lifecycle status', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();

    for (const status of ['active', 'disputed', 'superseded', 'archived']) {
      const id = `feature-${status}`;
      const skillPath = writeSkill(
        tmp,
        id,
        skillContent({
          name: id,
          status,
          optionalLines: [
            'license: MIT',
            'compatibility: Requires Node.js 20 or newer',
            'allowed-tools: Bash(git:*) Read',
          ],
          metadataLines: [
            '  author: "spectre"',
            '  spectre-category: "feature"',
            '  spectre-triggers: \'["auth flow","login"]\'',
            `  spectre-status: "${status}"`,
            '  spectre-version: "1"',
          ],
        }),
      );
      const referencePath = path.join(path.dirname(skillPath), 'references', 'details.md');
      fs.mkdirSync(path.dirname(referencePath), { recursive: true });
      fs.writeFileSync(referencePath, `details for ${status}`);

      const parsed = parseKnowledgeRecord(skillPath);
      assert.equal(parsed.record.id, id);
      assert.equal(parsed.record.status, status);
      assert.deepEqual(parsed.record.triggers, ['auth flow', 'login']);
      assert.equal(parsed.record.metadata.author, 'spectre');
      assert.equal(parsed.record.license, 'MIT');
      assert.equal(parsed.record.compatibility, 'Requires Node.js 20 or newer');
      assert.equal(parsed.record.allowedTools, 'Bash(git:*) Read');
      assert.deepEqual(parsed.resources, ['references/details.md']);
      assert.match(parsed.fingerprint, /^sha256:[a-f0-9]{64}$/);
    }
  });

  it('enforces official name and description bounds plus canonical directory identity', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();
    const valid64 = 'a'.repeat(64);
    const valid1024 = 'd'.repeat(1024);
    assert.equal(
      parseKnowledgeRecord(writeSkill(tmp, valid64, skillContent({
        name: valid64,
        description: valid1024,
      }))).record.description.length,
      1024,
    );

    const invalid = [
      ['Uppercase', 'Feature-auth', skillContent({ name: 'Feature-auth' })],
      ['consecutive hyphen', 'feature--auth', skillContent({ name: 'feature--auth' })],
      ['65 character name', 'a'.repeat(65), skillContent({ name: 'a'.repeat(65) })],
      ['empty description', 'feature-empty-description', skillContent({
        name: 'feature-empty-description',
        description: '""',
      })],
      ['1,025 character description', 'feature-long-description', skillContent({
        name: 'feature-long-description',
        description: 'd'.repeat(1025),
      })],
    ];
    for (const [label, id, content] of invalid) {
      assert.throws(() => parseKnowledgeRecord(writeSkill(tmp, id, content)), Error, label);
    }
    assert.throws(
      () => parseKnowledgeRecord(writeSkill(tmp, 'different-directory', skillContent())),
      /directory/i,
    );
  });

  it('rejects non-standard top-level fields, non-string metadata, and invalid triggers', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();
    const invalid = [
      ['unknown top-level', skillContent({ topExtra: ['owner: team-a'] })],
      ['top-level Spectre extension', skillContent({ topExtra: ['spectre-category: feature'] })],
      ['non-string metadata', skillContent({ metadataLines: [
        '  author: 7',
        '  spectre-category: "feature"',
        '  spectre-triggers: \'["auth"]\'',
        '  spectre-status: "active"',
        '  spectre-version: "1"',
      ] })],
      ['malformed trigger JSON', skillContent({ metadataLines: [
        '  spectre-category: "feature"',
        '  spectre-triggers: "not-json"',
        '  spectre-status: "active"',
        '  spectre-version: "1"',
      ] })],
      ['empty triggers', skillContent({ metadataLines: [
        '  spectre-category: "feature"',
        '  spectre-triggers: "[]"',
        '  spectre-status: "active"',
        '  spectre-version: "1"',
      ] })],
      ['duplicate triggers', skillContent({ metadataLines: [
        '  spectre-category: "feature"',
        '  spectre-triggers: \'["auth","auth"]\'',
        '  spectre-status: "active"',
        '  spectre-version: "1"',
      ] })],
    ];
    for (const [index, [label, content]] of invalid.entries()) {
      const id = `feature-invalid-metadata-${index}`;
      const namedContent = content.replace('name: feature-auth-flow', `name: ${id}`);
      assert.throws(
        () => parseKnowledgeRecord(writeSkill(tmp, id, namedContent)),
        Error,
        label,
      );
    }
  });

  it('rejects duplicate keys, malformed delimiters, and unknown lifecycle values', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();
    const duplicateTop = skillContent().replace(
      'description:',
      'name: duplicate-name\ndescription:',
    );
    const duplicateMetadata = skillContent().replace(
      '  spectre-status: "active"',
      '  spectre-status: "active"\n  spectre-status: "archived"',
    );
    const unknownStatus = skillContent({ status: 'reviewing' });
    const malformed = skillContent().replace('\n---\n# Auth Flow', '\n# Auth Flow');

    for (const [index, content] of [
      duplicateTop,
      duplicateMetadata,
      unknownStatus,
      malformed,
    ].entries()) {
      const id = `feature-invalid-shape-${index}`;
      const namedContent = content.replace('name: feature-auth-flow', `name: ${id}`);
      assert.throws(
        () => parseKnowledgeRecord(writeSkill(tmp, id, namedContent)),
      );
    }
  });

  it('accepts 8,999 and 9,000 character cores and rejects 9,001', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();

    for (const length of [8_999, 9_000]) {
      const id = `feature-size-${length}`;
      const content = contentAtLength(length).replace(
        'name: feature-auth-flow',
        `name: ${id}`,
      );
      const adjusted = content.length > length
        ? `${content.slice(0, length)}`
        : `${content}${'x'.repeat(length - content.length)}`;
      assert.equal(adjusted.length, length);
      assert.equal(parseKnowledgeRecord(writeSkill(tmp, id, adjusted)).content.length, length);
    }

    const oversizedId = 'feature-size-9001';
    const oversized = contentAtLength(9_001).replace(
      'name: feature-auth-flow',
      `name: ${oversizedId}`,
    );
    assert.throws(
      () => parseKnowledgeRecord(writeSkill(tmp, oversizedId, oversized)),
      /9,?000|size/i,
    );
  });
});

describe('disposable knowledge index', () => {
  it('rebuilds missing/corrupt indexes and reflects direct trigger, status, and version edits', async (t) => {
    const storePath = makeTmp(t);
    const skillPath = writeSkill(storePath, 'feature-indexed');
    const { refreshKnowledgeIndex } = await loadRecordModule();

    const missing = refreshKnowledgeIndex(storePath, { now: () => Date.parse('2026-07-19T00:00:00Z') });
    assert.equal(missing.rebuilt, true);
    assert.deepEqual(missing.index.records[0].triggers, ['auth flow', 'login']);
    assert.equal(missing.index.records[0].version, 1);
    assert.equal(fs.existsSync(path.join(storePath, 'index.json')), true);

    fs.writeFileSync(path.join(storePath, 'index.json'), '{corrupt');
    assert.equal(refreshKnowledgeIndex(storePath).rebuilt, true);

    fs.writeFileSync(
      skillPath,
      skillContent({
        name: 'feature-indexed',
        version: '2',
        metadataLines: [
          '  spectre-category: "feature"',
          '  spectre-triggers: \'["direct edit"]\'',
          '  spectre-status: "active"',
          '  spectre-version: "2"',
        ],
      }),
    );
    const edited = refreshKnowledgeIndex(storePath);
    assert.deepEqual(edited.index.records[0].triggers, ['direct edit']);
    assert.equal(edited.index.records[0].version, 2);

    fs.writeFileSync(skillPath, skillContent({ name: 'feature-indexed', status: 'archived' }));
    assert.deepEqual(refreshKnowledgeIndex(storePath).index.records, []);

    fs.rmSync(path.join(storePath, 'index.json'));
    fs.writeFileSync(skillPath, skillContent({ name: 'feature-indexed', version: '3' }));
    assert.equal(refreshKnowledgeIndex(storePath).index.records[0].version, 3);
  });

  it('indexes only valid active records and reports invalid neighbors without losing resources', async (t) => {
    const storePath = makeTmp(t);
    writeSkill(storePath, 'feature-active');
    writeSkill(storePath, 'feature-disputed', skillContent({
      name: 'feature-disputed',
      status: 'disputed',
    }));
    writeSkill(storePath, 'feature-invalid', skillContent({
      name: 'feature-invalid',
      topExtra: ['spectre-status: active'],
    }));
    const { refreshKnowledgeIndex } = await loadRecordModule();

    const result = refreshKnowledgeIndex(storePath);
    assert.deepEqual(result.index.records.map(({ id }) => id), ['feature-active']);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].path, /feature-invalid/);
  });

  it('rereads once on fingerprint mismatch and silently skips persistent races', async (t) => {
    const storePath = makeTmp(t);
    const skillPath = writeSkill(storePath, 'feature-race');
    const {
      refreshKnowledgeIndex,
      readVerifiedIndexedRecord,
    } = await loadRecordModule();
    const entry = refreshKnowledgeIndex(storePath).index.records[0];
    const canonical = fs.readFileSync(skillPath, 'utf8');
    const mutated = canonical.replace('auth flow', 'changed flow');

    let reads = 0;
    const recovered = readVerifiedIndexedRecord(storePath, entry, {
      readFile() {
        reads += 1;
        return reads === 1 ? mutated : canonical;
      },
    });
    assert.equal(reads, 2);
    assert.equal(recovered.record.id, 'feature-race');

    reads = 0;
    const skipped = readVerifiedIndexedRecord(storePath, entry, {
      readFile() {
        reads += 1;
        return mutated;
      },
    });
    assert.equal(reads, 2);
    assert.equal(skipped, null);
  });
});

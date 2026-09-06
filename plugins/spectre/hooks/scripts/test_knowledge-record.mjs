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
    'knowledge/records.mjs must provide canonical typed record and index behavior',
  );
  return import(pathToFileURL(RECORD_MODULE).href);
}

function knowledgeRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'auth-token-refresh',
    kind: 'knowledge',
    title: 'Refresh expired auth tokens before retrying',
    summary: 'Expired access tokens surface as a 401 on the retried request.',
    tags: ['auth', 'http'],
    applicability: { scope: 'project' },
    provenance: { origin: 'captured', capturedAt: '2026-07-19T00:00:00.000Z' },
    relatedRecordIds: [],
    category: 'pattern',
    useWhen: 'Changing retry behavior around authenticated requests.',
    content: 'Refresh the token, then retry the request exactly once.',
    evidence: 'Reproduced the 401 twice, then verified the refresh-then-retry fix.',
    status: 'active',
    ...overrides,
  };
}

function workRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'work-auth-retry',
    kind: 'work',
    title: 'Auth retry hardening',
    summary: 'Historical account of the auth retry work.',
    tags: ['auth'],
    applicability: { scope: 'work', workId: 'work-auth-retry' },
    provenance: {
      origin: 'legacy-import',
      capturedAt: '2026-07-19T00:00:00.000Z',
      sourceFingerprint: 'sha256:0123456789abcdef',
    },
    relatedRecordIds: ['auth-token-refresh'],
    ...overrides,
  };
}

function writeRecordPackage(root, record, options = {}) {
  const id = options.directoryName ?? record.id;
  const recordPath = path.join(root, 'knowledge', id, options.fileName ?? 'record.json');
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, options.raw ?? `${JSON.stringify(record, null, 2)}\n`);
  return recordPath;
}

describe('typed knowledge record packages', () => {
  it('round-trips both kinds, every knowledge category, and every status', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();

    const work = workRecord();
    const parsedWork = parseKnowledgeRecord(writeRecordPackage(tmp, work));
    assert.deepEqual(parsedWork.record, work);
    assert.match(parsedWork.digest, /^sha256:[a-f0-9]{64}$/);

    for (const category of ['decision', 'pattern', 'gotcha', 'blocker']) {
      for (const status of ['active', 'disputed', 'superseded', 'archived']) {
        const record = knowledgeRecord({
          id: `${category}-${status}`,
          category,
          status,
          ...(category === 'blocker'
            ? {
              blocker: {
                condition: 'The staging deploy rejects the refreshed token.',
                resolutionCriterion: 'A staging deploy accepts a refreshed token.',
              },
            }
            : {}),
        });
        const parsed = parseKnowledgeRecord(writeRecordPackage(tmp, record));
        assert.deepEqual(parsed.record, record);
      }
    }
  });

  it('rejects a blocker without an observed condition and a resolution criterion', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();

    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, knowledgeRecord({
        id: 'blocker-missing-package',
        category: 'blocker',
      }))),
      /blocker/,
    );
    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, knowledgeRecord({
        id: 'blocker-missing-condition',
        category: 'blocker',
        blocker: { resolutionCriterion: 'A staging deploy accepts a refreshed token.' },
      }))),
      /blocker\.condition/,
    );
    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, knowledgeRecord({
        id: 'blocker-missing-resolution',
        category: 'blocker',
        blocker: { condition: 'The staging deploy rejects the refreshed token.' },
      }))),
      /blocker\.resolutionCriterion/,
    );
    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, knowledgeRecord({
        id: 'pattern-with-blocker',
        blocker: {
          condition: 'The staging deploy rejects the refreshed token.',
          resolutionCriterion: 'A staging deploy accepts a refreshed token.',
        },
      }))),
      /blocker/,
    );
  });

  it('names the offending field for AgentSkills frontmatter and unknown schema versions', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();

    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, null, {
        directoryName: 'legacy-frontmatter',
        raw: [
          '---',
          'name: legacy-frontmatter',
          'description: Use when reading a retired skill package.',
          '---',
          '# Legacy',
        ].join('\n'),
      })),
      /frontmatter/i,
    );
    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, {
        ...knowledgeRecord({ id: 'legacy-metadata' }),
        metadata: { 'spectre-category': 'feature' },
      })),
      /metadata/,
    );
    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, {
        ...knowledgeRecord({ id: 'legacy-name-field' }),
        name: 'legacy-name-field',
      })),
      /name/,
    );
    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, knowledgeRecord({
        id: 'unsupported-schema-version',
        schemaVersion: 2,
      }))),
      /schemaVersion/,
    );
    assert.throws(
      () => parseKnowledgeRecord(writeRecordPackage(tmp, knowledgeRecord({
        id: 'legacy-skill-file',
      }), { fileName: 'SKILL.md' })),
      /record\.json/,
    );
  });

  it('enforces canonical identity, enumerations, and required typed fields', async (t) => {
    const tmp = makeTmp(t);
    const { parseKnowledgeRecord } = await loadRecordModule();

    const invalid = [
      ['directory mismatch', knowledgeRecord({ id: 'auth-token-refresh' }), { directoryName: 'other-directory' }, /directory/i],
      ['uppercase id', knowledgeRecord({ id: 'Auth-Token' }), {}, /id/],
      ['unknown kind', knowledgeRecord({ id: 'unknown-kind', kind: 'note' }), {}, /kind/],
      ['unknown category', knowledgeRecord({ id: 'unknown-category', category: 'feature' }), {}, /category/],
      ['unknown status', knowledgeRecord({ id: 'unknown-status', status: 'reviewing' }), {}, /status/],
      ['empty summary', knowledgeRecord({ id: 'empty-summary', summary: '' }), {}, /summary/],
      ['missing use-when', (() => {
        const record = knowledgeRecord({ id: 'missing-use-when' });
        delete record.useWhen;
        return record;
      })(), {}, /useWhen/],
      ['missing evidence', (() => {
        const record = knowledgeRecord({ id: 'missing-evidence' });
        delete record.evidence;
        return record;
      })(), {}, /evidence/],
      ['duplicate tags', knowledgeRecord({ id: 'duplicate-tags', tags: ['auth', 'auth'] }), {}, /tags/],
      ['non-canonical tag', knowledgeRecord({ id: 'bad-tag', tags: ['Auth Flow'] }), {}, /tags/],
      ['unknown applicability scope', knowledgeRecord({
        id: 'bad-scope',
        applicability: { scope: 'global' },
      }), {}, /applicability/],
      ['work scope without work identity', knowledgeRecord({
        id: 'missing-work-id',
        applicability: { scope: 'work' },
      }), {}, /workId/],
      ['unknown provenance origin', knowledgeRecord({
        id: 'bad-origin',
        provenance: { origin: 'guessed', capturedAt: '2026-07-19T00:00:00.000Z' },
      }), {}, /origin/],
      ['related id is not canonical', knowledgeRecord({
        id: 'bad-related',
        relatedRecordIds: ['Not Canonical'],
      }), {}, /relatedRecordIds/],
      ['knowledge fields on a work record', {
        ...workRecord({ id: 'work-with-status' }),
        status: 'active',
      }, {}, /status/],
      ['malformed JSON', null, { directoryName: 'malformed-json', raw: '{ not json' }, /JSON/i],
    ];

    for (const [label, record, options, expected] of invalid) {
      assert.throws(
        () => parseKnowledgeRecord(writeRecordPackage(tmp, record, options)),
        expected,
        label,
      );
    }
  });

  it('digests canonical field values independently of stored key order and spacing', async (t) => {
    const tmp = makeTmp(t);
    const { canonicalRecordBytes, canonicalRecordDigest, parseKnowledgeRecord } =
      await loadRecordModule();

    const record = knowledgeRecord({ id: 'canonical-digest' });
    const reordered = Object.fromEntries(Object.entries(record).reverse());
    const compactPath = writeRecordPackage(tmp, reordered, {
      directoryName: 'canonical-digest',
      raw: JSON.stringify(reordered),
    });

    assert.equal(canonicalRecordBytes(record), canonicalRecordBytes(reordered));
    assert.equal(
      parseKnowledgeRecord(compactPath).digest,
      canonicalRecordDigest(record),
    );
    assert.notEqual(
      canonicalRecordDigest(record),
      canonicalRecordDigest({ ...record, summary: 'Changed summary.' }),
    );
  });
});

#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const PAYLOAD_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'payload.mjs');
const HOST_HARNESS = path.join(REPO_ROOT, 'scripts', 'verify-knowledge-hosts.mjs');

const PROSE_CORE_CHARS = 6_000;
const CODE_CORE_CHARS = 4_000;
const SECONDARY_METADATA_RESERVE_CHARS = 750;
const CLAUDE_SAFE_OUTPUT_CHARS = 9_000;

const PROSE_PROMPT =
  'Apply the knowledge for spectre payload prose boundary and reply exactly ' +
  'SPECTRE_PROSE_INLINE_OK.';
const CODE_PROMPT =
  'Apply the knowledge for spectre payload code boundary and reply exactly ' +
  'SPECTRE_CODE_INLINE_OK.';
const NO_MATCH_PROMPT = 'This prompt deliberately matches no Spectre payload fixture.';

const REQUIRED_EVIDENCE_FIELDS = [
  'primarySentinelVisible',
  'requiredResponseObserved',
  'systemMessageNamedPrimary',
  'previewAbsent',
  'savedFilePathAbsent',
  'truncationAbsent',
  'fallbackNoticeAbsent',
  'repeatDeduped',
  'resetReapplied',
  'noMatchSilent',
];

function repeatToLength(unit, length) {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

function frameCore(core) {
  const secondaryReserve = repeatToLength(
    '[also matching: reserved metadata]\n',
    SECONDARY_METADATA_RESERVE_CHARS,
  );
  return [
    '# Spectre applied knowledge',
    '',
    core,
    '',
    '## Also matching',
    secondaryReserve,
  ].join('\n');
}

const FIXTURES = {
  prose: repeatToLength(
    'Reliable project knowledge is applied directly when its declared trigger matches. ',
    PROSE_CORE_CHARS,
  ),
  code: repeatToLength(
    'export function applyKnowledge(prompt) {\n  return prompt.trim();\n}\n',
    CODE_CORE_CHARS,
  ),
  punctuation: repeatToLength('(){}[]<>.,;:!?/\\|`~@#$%^&*-_=+ ', CLAUDE_SAFE_OUTPUT_CHARS),
  unicode: repeatToLength(
    'cafe\u0301 naive\u0308 Tokyo:\u6771\u4eac Greek:\u0394\u03bf\u03ba\u03b9\u03bc\u03ae guillemets:\u00ab\u00bb ',
    CLAUDE_SAFE_OUTPUT_CHARS,
  ),
};

async function loadMeasurePayload() {
  assert.equal(
    fs.existsSync(PAYLOAD_MODULE),
    true,
    'measurePayload module is intentionally missing until the GREEN payload-contract task',
  );
  const module = await import(pathToFileURL(PAYLOAD_MODULE).href);
  assert.equal(typeof module.measurePayload, 'function');
  return module.measurePayload;
}

function prepareHostFixture(t) {
  assert.equal(
    fs.existsSync(HOST_HARNESS),
    true,
    'host fixture harness is intentionally missing until the GREEN harness task',
  );

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-hosts-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const stdout = execFileSync(
    process.execPath,
    [HOST_HARNESS, '--fixture-root', fixtureRoot, '--json'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  return { fixtureRoot, manifest: JSON.parse(stdout) };
}

describe('knowledge payload feasibility contract (RED)', () => {
  it('accepts the minimum useful prose and code cores after framing reserve', async () => {
    assert.equal(FIXTURES.prose.length, PROSE_CORE_CHARS);
    assert.equal(FIXTURES.code.length, CODE_CORE_CHARS);

    const measurePayload = await loadMeasurePayload();
    assert.equal(measurePayload('codex', frameCore(FIXTURES.prose)).ok, true);
    assert.equal(measurePayload('codex', frameCore(FIXTURES.code)).ok, true);
  });

  it('measures punctuation-heavy and Unicode boundary fixtures deterministically', async () => {
    assert.equal(FIXTURES.punctuation.length, CLAUDE_SAFE_OUTPUT_CHARS);
    assert.equal(FIXTURES.unicode.length, CLAUDE_SAFE_OUTPUT_CHARS);

    const measurePayload = await loadMeasurePayload();
    for (const core of [FIXTURES.punctuation, FIXTURES.unicode]) {
      const first = measurePayload('codex', frameCore(core));
      const second = measurePayload('codex', frameCore(core));
      assert.deepEqual(second, first);
      assert.equal(Number.isFinite(first.measured), true);
      assert.equal(first.ok, false);
    }
  });

  it('enforces the Claude framing reserve at 9,000 and 9,001 characters', async () => {
    const emptyFrameLength = frameCore('').length;
    const exact = frameCore('x'.repeat(CLAUDE_SAFE_OUTPUT_CHARS - emptyFrameLength));
    const over = `${exact}x`;
    assert.equal(exact.length, CLAUDE_SAFE_OUTPUT_CHARS);
    assert.equal(over.length, CLAUDE_SAFE_OUTPUT_CHARS + 1);

    const measurePayload = await loadMeasurePayload();
    assert.deepEqual(measurePayload('claude', exact), {
      ok: true,
      measured: CLAUDE_SAFE_OUTPUT_CHARS,
      limit: CLAUDE_SAFE_OUTPUT_CHARS,
      reserve: 1_000,
    });
    assert.equal(measurePayload('claude', over).ok, false);
  });
});

describe('real-host fixture harness contract (RED)', () => {
  it('emits unique sentinels, exact prompts, and resolved host commands', (t) => {
    const { fixtureRoot, manifest } = prepareHostFixture(t);
    const expectedCommands = {
      claude:
        `SPECTRE_HOME="${path.join(fixtureRoot, '.spectre')}" ` +
        `claude --plugin-dir "${path.join(REPO_ROOT, 'plugins', 'spectre')}" ` +
        '--permission-mode dontAsk',
      codex:
        `SPECTRE_HOME="${path.join(fixtureRoot, '.spectre')}" ` +
        `CODEX_HOME="${path.join(fixtureRoot, '.codex')}" codex -C "${fixtureRoot}"`,
    };

    assert.deepEqual(manifest.commands, expectedCommands);
    assert.equal(manifest.prompts.prose, PROSE_PROMPT);
    assert.equal(manifest.prompts.code, CODE_PROMPT);
    assert.equal(manifest.prompts.noMatch, NO_MATCH_PROMPT);
    assert.deepEqual(
      manifest.primarySentinels,
      ['SPECTRE_PRIMARY_PROSE_6000_V1', 'SPECTRE_PRIMARY_CODE_4000_V1'],
    );
    assert.equal(new Set(manifest.primarySentinels).size, manifest.primarySentinels.length);
  });

  it('requires every inline and no-fallback observation in the evidence template', (t) => {
    const { manifest } = prepareHostFixture(t);
    assert.deepEqual(
      Object.keys(manifest.evidenceTemplate).sort(),
      [...REQUIRED_EVIDENCE_FIELDS].sort(),
    );
    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      assert.equal(manifest.evidenceTemplate[field], null);
    }
  });
});

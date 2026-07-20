#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseKnowledgeRecord } from './knowledge/records.mjs';
import { registerCanonicalKnowledge } from './knowledge/registration.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const PAYLOAD_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'payload.mjs');
const HOST_HARNESS = path.join(REPO_ROOT, 'scripts', 'verify-knowledge-hosts.mjs');

const PROSE_PROMPT =
  'Apply the knowledge for spectre payload prose boundary and reply exactly ' +
  'SPECTRE_PROSE_INLINE_OK.';
const CODE_PROMPT =
  'Apply the knowledge for spectre payload code boundary and reply exactly ' +
  'SPECTRE_CODE_INLINE_OK.';
const DENSE_PROMPT =
  'Apply the knowledge for spectre payload dense alphanumeric boundary and reply exactly ' +
  'SPECTRE_DENSE_INLINE_OK.';
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

function frameCore(core, secondaryMetadataReserveChars) {
  const secondaryReserve = repeatToLength(
    '[also matching: reserved metadata]\n',
    secondaryMetadataReserveChars,
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

function framePrimary(id, content) {
  return [
    `# Spectre applied knowledge: ${id}`,
    '',
    content,
  ].join('\n');
}

function numericTableRecord(length) {
  const prefix = [
    '---',
    'name: feature-numeric-table',
    'description: Numeric table boundary fixture.',
    'metadata:',
    '  spectre-category: "testing"',
    '  spectre-triggers: \'["numeric table boundary"]\'',
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
    '# Numeric table',
    '',
  ].join('\n');
  return `${prefix}${repeatToLength(
    '1234567890123456789012345678901 \n',
    length - prefix.length,
  )}`;
}

function payloadFixtures(boundaries) {
  return {
    prose: repeatToLength(
    'Reliable project knowledge is applied directly when its declared trigger matches. ',
      boundaries.proseCoreChars,
    ),
    code: repeatToLength(
      'export function applyKnowledge(prompt) {\n  return prompt.trim();\n}\n',
      boundaries.codeCoreChars,
    ),
    punctuation: repeatToLength(
      '(){}[]<>.,;:!?/\\|`~@#$%^&*-_=+ ',
      boundaries.punctuationUnsafeChars,
    ),
    unicode: repeatToLength(
      'cafe\u0301 naive\u0308 Tokyo:\u6771\u4eac Greek:\u0394\u03bf\u03ba\u03b9\u03bc\u03ae guillemets:\u00ab\u00bb ',
      boundaries.unicodeUnsafeChars,
    ),
    denseDigits: repeatToLength(
      '0123456789',
      boundaries.denseDigitUnsafeChars,
    ),
    denseAlphanumeric: repeatToLength(
      'Az09By18Cx27Dw36Ev45Fu54Gt63Hs72',
      boundaries.denseAlphanumericUnsafeChars,
    ),
    denseProbe: repeatToLength(
      'Az09By18Cx27Dw36Ev45Fu54Gt63Hs72',
      boundaries.denseAlphanumericProbeChars,
    ),
    numericTable: numericTableRecord(
      boundaries.numericTableUnsafeChars ?? 8_700,
    ),
  };
}

async function loadPayloadModule() {
  assert.equal(
    fs.existsSync(PAYLOAD_MODULE),
    true,
    'measurePayload module is intentionally missing until the GREEN payload-contract task',
  );
  const module = await import(pathToFileURL(PAYLOAD_MODULE).href);
  assert.equal(typeof module.measurePayload, 'function');
  assert.equal(typeof module.PAYLOAD_BOUNDARIES, 'object');
  return module;
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

describe('knowledge payload feasibility contract', () => {
  it('accepts the minimum useful prose and code cores after framing reserve', async () => {
    const { measurePayload, PAYLOAD_BOUNDARIES } = await loadPayloadModule();
    const fixtures = payloadFixtures(PAYLOAD_BOUNDARIES);
    assert.equal(fixtures.prose.length, PAYLOAD_BOUNDARIES.proseCoreChars);
    assert.equal(fixtures.code.length, PAYLOAD_BOUNDARIES.codeCoreChars);
    assert.equal(
      measurePayload(
        'codex',
        frameCore(fixtures.prose, PAYLOAD_BOUNDARIES.secondaryMetadataReserveChars),
      ).ok,
      true,
    );
    assert.equal(
      measurePayload(
        'codex',
        frameCore(fixtures.code, PAYLOAD_BOUNDARIES.secondaryMetadataReserveChars),
      ).ok,
      true,
    );
  });

  it('measures punctuation-heavy and Unicode boundary fixtures deterministically', async () => {
    const { measurePayload, PAYLOAD_BOUNDARIES } = await loadPayloadModule();
    const fixtures = payloadFixtures(PAYLOAD_BOUNDARIES);
    assert.equal(fixtures.punctuation.length, PAYLOAD_BOUNDARIES.punctuationUnsafeChars);
    assert.equal(fixtures.unicode.length, PAYLOAD_BOUNDARIES.unicodeUnsafeChars);

    for (const core of [fixtures.punctuation, fixtures.unicode]) {
      const framed = frameCore(core, PAYLOAD_BOUNDARIES.secondaryMetadataReserveChars);
      const first = measurePayload('codex', framed);
      const second = measurePayload('codex', framed);
      assert.deepEqual(second, first);
      assert.equal(Number.isFinite(first.measured), true);
      assert.equal(first.ok, false);
    }
  });

  it('rejects unsafe digit and mixed alphanumeric runs while accepting the dense probe', async () => {
    const { measurePayload, PAYLOAD_BOUNDARIES } = await loadPayloadModule();
    const fixtures = payloadFixtures(PAYLOAD_BOUNDARIES);
    assert.equal(
      fixtures.denseDigits.length,
      PAYLOAD_BOUNDARIES.denseDigitUnsafeChars,
    );
    assert.equal(
      fixtures.denseAlphanumeric.length,
      PAYLOAD_BOUNDARIES.denseAlphanumericUnsafeChars,
    );
    assert.equal(
      fixtures.denseProbe.length,
      PAYLOAD_BOUNDARIES.denseAlphanumericProbeChars,
    );

    for (const core of [fixtures.denseDigits, fixtures.denseAlphanumeric]) {
      const framed = frameCore(core, PAYLOAD_BOUNDARIES.secondaryMetadataReserveChars);
      const first = measurePayload('codex', framed);
      assert.deepEqual(measurePayload('codex', framed), first);
      assert.equal(first.ok, false);
      assert.equal(first.measured > first.limit, true);
    }

    const probe = measurePayload(
      'codex',
      frameCore(
        fixtures.denseProbe,
        PAYLOAD_BOUNDARIES.secondaryMetadataReserveChars,
      ),
    );
    assert.equal(probe.ok, true);
    assert.equal(probe.measured <= probe.limit, true);
  });

  it('rejects aggregate numeric tables below the long dense-run threshold', async (t) => {
    const { measurePayload, PAYLOAD_BOUNDARIES } = await loadPayloadModule();
    const fixtures = payloadFixtures(PAYLOAD_BOUNDARIES);
    const digitRuns = [...fixtures.numericTable.matchAll(/\d+/g)]
      .map(([run]) => run.length);
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-numeric-table-'));
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
    const recordDir = path.join(fixtureRoot, 'feature-numeric-table');
    fs.mkdirSync(recordDir);
    const skillPath = path.join(recordDir, 'SKILL.md');
    fs.writeFileSync(skillPath, fixtures.numericTable);

    assert.equal(PAYLOAD_BOUNDARIES.numericTableUnsafeChars, 8_700);
    assert.equal(PAYLOAD_BOUNDARIES.denseDigitRunMinChars, 4);
    assert.equal(fixtures.numericTable.length, 8_700);
    assert.equal(Math.max(...digitRuns), 31);
    assert.equal(/[A-Za-z0-9]{32,}/.test(fixtures.numericTable), false);
    assert.equal(parseKnowledgeRecord(skillPath).record.id, 'feature-numeric-table');

    const framed = framePrimary('feature-numeric-table', fixtures.numericTable);
    const first = measurePayload('codex', framed);
    assert.deepEqual(measurePayload('codex', framed), first);
    assert.equal(first.ok, false);
    assert.equal(first.measured > first.limit, true);
  });

  it('enforces the Claude framing reserve at 9,000 and 9,001 characters', async () => {
    const { measurePayload, PAYLOAD_BOUNDARIES } = await loadPayloadModule();
    const emptyFrameLength = frameCore(
      '',
      PAYLOAD_BOUNDARIES.secondaryMetadataReserveChars,
    ).length;
    const exact = frameCore(
      'x'.repeat(PAYLOAD_BOUNDARIES.claudeSafeOutputChars - emptyFrameLength),
      PAYLOAD_BOUNDARIES.secondaryMetadataReserveChars,
    );
    const over = `${exact}x`;
    assert.equal(exact.length, PAYLOAD_BOUNDARIES.claudeSafeOutputChars);
    assert.equal(over.length, PAYLOAD_BOUNDARIES.claudeSafeOutputChars + 1);

    assert.deepEqual(measurePayload('claude', exact), {
      ok: true,
      measured: PAYLOAD_BOUNDARIES.claudeSafeOutputChars,
      limit: PAYLOAD_BOUNDARIES.claudeSafeOutputChars,
      reserve: PAYLOAD_BOUNDARIES.claudeReserveChars,
    });
    assert.equal(measurePayload('claude', over).ok, false);
  });
});

describe('real-host fixture harness contract', () => {
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
    assert.equal(manifest.prompts.denseAlphanumeric, DENSE_PROMPT);
    assert.equal(manifest.prompts.noMatch, NO_MATCH_PROMPT);
    assert.deepEqual(
      manifest.primarySentinels,
      [
        'SPECTRE_PRIMARY_PROSE_6000_V1',
        'SPECTRE_PRIMARY_CODE_4000_V1',
        'SPECTRE_PRIMARY_DENSE_ALPHANUMERIC_V1',
      ],
    );
    assert.equal(new Set(manifest.primarySentinels).size, manifest.primarySentinels.length);
    assert.equal(manifest.fixtureRoot, fixtureRoot);
    assert.equal(manifest.spectreHome, path.join(fixtureRoot, '.spectre'));
    assert.match(
      manifest.evidencePath,
      /docs\/tasks\/main\/knowledge-surfacing\/verification\/host-payload-\d{4}-\d{2}-\d{2}\.md$/,
    );
    const localDate = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    assert.equal(
      path.basename(manifest.evidencePath),
      `host-payload-${localDate}.md`,
    );
    assert.equal(
      fs.existsSync(path.join(manifest.codexRuntimeCopyPath, 'payload.mjs')),
      true,
    );
    assert.equal(fs.existsSync(manifest.codexPromptHookPath), true);
    assert.equal(fs.existsSync(manifest.codexSessionStartHookPath), true);
    assert.equal(fs.existsSync(manifest.codexHooksPath), true);
    const hooks = JSON.parse(fs.readFileSync(manifest.codexHooksPath, 'utf8'));
    assert.match(
      hooks.hooks.UserPromptSubmit[0].hooks[0].command,
      /user-prompt-submit\.mjs['"]? --host codex$/,
    );
    assert.match(
      hooks.hooks.SessionStart[0].hooks[0].command,
      /load-knowledge\.mjs['"]? --host codex$/,
    );
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

  it('frames one fixture inline, dedupes by session, reapplies in a new session, and ignores no-match', (t) => {
    const { manifest } = prepareHostFixture(t);
    const invoke = (prompt, sessionId) =>
      execFileSync(
        process.execPath,
        [manifest.codexPromptHookPath, '--host', 'codex'],
        {
          cwd: manifest.fixtureRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            SPECTRE_HOME: manifest.spectreHome,
          },
          input: JSON.stringify({
            hook_event_name: 'UserPromptSubmit',
            prompt,
            session_id: sessionId,
            cwd: manifest.fixtureRoot,
          }),
        },
      );

    const first = JSON.parse(invoke(PROSE_PROMPT, 'session-one'));
    assert.equal(first.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(first.hookSpecificOutput.additionalContext, /SPECTRE_PRIMARY_PROSE_6000_V1/);
    assert.match(first.systemMessage, /testing-payload-prose/);
    assert.equal(invoke(PROSE_PROMPT, 'session-one'), '');

    execFileSync(
      process.execPath,
      [manifest.codexSessionStartHookPath, '--host', 'codex'],
      {
        cwd: manifest.fixtureRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          SPECTRE_HOME: manifest.spectreHome,
        },
        input: JSON.stringify({
          hook_event_name: 'SessionStart',
          source: 'compact',
          session_id: 'session-one',
          cwd: manifest.fixtureRoot,
        }),
      },
    );
    const reapplied = JSON.parse(invoke(PROSE_PROMPT, 'session-one'));
    assert.match(reapplied.hookSpecificOutput.additionalContext, /SPECTRE_PRIMARY_PROSE_6000_V1/);
    assert.equal(invoke(NO_MATCH_PROMPT, 'session-one'), '');
  });

  it('frames the accepted dense alphanumeric probe inline for Codex', (t) => {
    const { manifest } = prepareHostFixture(t);
    const stdout = execFileSync(
      process.execPath,
      [manifest.codexPromptHookPath, '--host', 'codex'],
      {
        cwd: manifest.fixtureRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          SPECTRE_HOME: manifest.spectreHome,
        },
        input: JSON.stringify({
          hook_event_name: 'UserPromptSubmit',
          prompt: DENSE_PROMPT,
          session_id: 'dense-probe-session',
          cwd: manifest.fixtureRoot,
        }),
      },
    );

    assert.notEqual(stdout, '', 'dense probe must produce inline hook output');
    const output = JSON.parse(stdout);
    assert.match(
      output.hookSpecificOutput.additionalContext,
      /SPECTRE_PRIMARY_DENSE_ALPHANUMERIC_V1/,
    );
    assert.match(output.systemMessage, /testing-payload-dense-alphanumeric/);
  });

  it('accepts the dense probe through the exact registration frame', async (t) => {
    const { manifest } = prepareHostFixture(t);
    const projectDir = path.join(manifest.fixtureRoot, 'registration-target');
    const spectreHome = path.join(manifest.fixtureRoot, 'registration-home');
    fs.mkdirSync(projectDir, { recursive: true });
    const recordPath = path.join(
      manifest.storePath,
      'knowledge',
      'testing-payload-dense-alphanumeric',
      'SKILL.md',
    );

    let result;
    let registrationError;
    try {
      result = await registerCanonicalKnowledge({
        projectDir,
        spectreHome,
        recordPath,
        gitRunner() {
          throw new Error('fixture is intentionally non-Git');
        },
      });
    } catch (error) {
      registrationError = error;
    }

    assert.equal(registrationError, undefined, registrationError?.message);
    assert.equal(result?.id, 'testing-payload-dense-alphanumeric');
  });
});

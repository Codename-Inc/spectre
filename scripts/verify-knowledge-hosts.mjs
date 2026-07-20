#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAYLOAD_BOUNDARIES } from '../plugins/spectre/hooks/scripts/knowledge/payload.mjs';
import { refreshKnowledgeIndex } from '../plugins/spectre/hooks/scripts/knowledge/records.mjs';
import { resolveProjectStore } from '../plugins/spectre/hooks/scripts/knowledge/store.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const PROSE_PROMPT =
  'Apply the knowledge for spectre payload prose boundary and reply exactly ' +
  'SPECTRE_PROSE_INLINE_OK.';
const CODE_PROMPT =
  'Apply the knowledge for spectre payload code boundary and reply exactly ' +
  'SPECTRE_CODE_INLINE_OK.';
const NO_MATCH_PROMPT = 'This prompt deliberately matches no Spectre payload fixture.';
const PRIMARY_SENTINELS = [
  'SPECTRE_PRIMARY_PROSE_6000_V1',
  'SPECTRE_PRIMARY_CODE_4000_V1',
];
const EVIDENCE_FIELDS = [
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

function parseArgs(argv) {
  const fixtureIndex = argv.indexOf('--fixture-root');
  if (fixtureIndex === -1 || !argv[fixtureIndex + 1]) {
    throw new Error('Usage: verify-knowledge-hosts.mjs --fixture-root <path> [--json]');
  }
  return {
    fixtureRoot: path.resolve(argv[fixtureIndex + 1]),
    json: argv.includes('--json'),
  };
}

function repeatToLength(prefix, unit, length) {
  const remainder = Math.max(0, length - prefix.length);
  return `${prefix}${unit.repeat(Math.ceil(remainder / unit.length)).slice(0, remainder)}`;
}

function skillContent({ id, description, trigger, sentinel, core, requiredResponse }) {
  return [
    '---',
    `name: ${id}`,
    `description: ${description}`,
    'metadata:',
    '  spectre-category: "testing"',
    `  spectre-triggers: '${JSON.stringify([trigger])}'`,
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
    `# ${id}`,
    '',
    sentinel,
    `Reply exactly: ${requiredResponse}`,
    '',
    core,
  ].join('\n');
}

function writeFixtureRecord(storePath, fixture) {
  const recordDir = path.join(storePath, 'knowledge', fixture.id);
  fs.mkdirSync(recordDir, { recursive: true });
  fs.writeFileSync(path.join(recordDir, 'SKILL.md'), skillContent(fixture));
}

async function prepareFixture(fixtureRoot) {
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const spectreHome = path.join(fixtureRoot, '.spectre');
  const codexHome = path.join(fixtureRoot, '.codex');
  const store = await resolveProjectStore(fixtureRoot, {
    spectreHome,
    gitRunner() {
      throw new Error('fixture identity is intentionally non-Git');
    },
  });

  const proseCore = repeatToLength(
    `${PRIMARY_SENTINELS[0]}\n`,
    'Reliable project knowledge remains visible inline and directly actionable. ',
    PAYLOAD_BOUNDARIES.proseCoreChars,
  );
  const codeCore = repeatToLength(
    `${PRIMARY_SENTINELS[1]}\n`,
    'export function fixture(value) {\n  return value.trim();\n}\n',
    PAYLOAD_BOUNDARIES.codeCoreChars,
  );
  writeFixtureRecord(store.storePath, {
    id: 'testing-payload-prose',
    description: 'Prose payload boundary fixture. Use for the real-host inline delivery gate.',
    trigger: 'spectre payload prose boundary',
    sentinel: PRIMARY_SENTINELS[0],
    requiredResponse: 'SPECTRE_PROSE_INLINE_OK',
    core: proseCore,
  });
  writeFixtureRecord(store.storePath, {
    id: 'testing-payload-code',
    description: 'Code payload boundary fixture. Use for the real-host inline delivery gate.',
    trigger: 'spectre payload code boundary',
    sentinel: PRIMARY_SENTINELS[1],
    requiredResponse: 'SPECTRE_CODE_INLINE_OK',
    core: codeCore,
  });
  refreshKnowledgeIndex(store.storePath);

  const codexRuntimeCopyPath = path.join(codexHome, 'spectre', 'hooks', 'scripts', 'knowledge');
  fs.rmSync(codexRuntimeCopyPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(codexRuntimeCopyPath), { recursive: true });
  fs.cpSync(
    path.join(REPO_ROOT, 'plugins', 'spectre', 'hooks', 'scripts', 'knowledge'),
    codexRuntimeCopyPath,
    { recursive: true },
  );

  const date = new Date().toISOString().slice(0, 10);
  return {
    schemaVersion: 1,
    fixtureRoot,
    spectreHome,
    codexHome,
    storePath: store.storePath,
    codexRuntimeCopyPath,
    evidencePath: path.join(
      REPO_ROOT,
      'docs',
      'tasks',
      'main',
      'knowledge-surfacing',
      'verification',
      `host-payload-${date}.md`,
    ),
    commands: {
      claude:
        `SPECTRE_HOME="${spectreHome}" ` +
        `claude --plugin-dir "${path.join(REPO_ROOT, 'plugins', 'spectre')}" ` +
        '--permission-mode dontAsk',
      codex:
        `SPECTRE_HOME="${spectreHome}" ` +
        `CODEX_HOME="${codexHome}" codex -C "${fixtureRoot}"`,
    },
    prompts: {
      prose: PROSE_PROMPT,
      code: CODE_PROMPT,
      noMatch: NO_MATCH_PROMPT,
    },
    primarySentinels: PRIMARY_SENTINELS,
    boundaries: PAYLOAD_BOUNDARIES,
    evidenceTemplate: Object.fromEntries(EVIDENCE_FIELDS.map((field) => [field, null])),
  };
}

const args = parseArgs(process.argv.slice(2));
const manifest = await prepareFixture(args.fixtureRoot);
if (args.json) {
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
} else {
  process.stdout.write(`${manifest.commands.claude}\n${manifest.commands.codex}\n`);
  process.stdout.write(`Evidence: ${manifest.evidencePath}\n`);
}

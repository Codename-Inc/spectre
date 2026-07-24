#!/usr/bin/env node
// Proof evidence runner for the knowledge-hook duplication fixes.
//
// Drives the REAL load-knowledge.mjs SessionStart hook and the REAL
// knowledge-cli.mjs against an isolated temp project, exactly as a host would.
// Nothing here reads the product's own assertions: every claim is decided by
// observed stdout bytes and their hashes.
//
// Usage: node run-journeys.mjs <plugin-root> <label>
//   plugin-root: path to a plugins/spectre directory (HEAD copy or working tree)

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [pluginRootArg, label, hostArg] = process.argv.slice(2);
if (!pluginRootArg || !label) {
  process.stderr.write('usage: run-journeys.mjs <plugin-root> <label>\n');
  process.exit(2);
}
const pluginRoot = path.resolve(pluginRootArg);
const host = hostArg || 'claude';

const HOOK = path.join(pluginRoot, 'hooks', 'scripts', 'load-knowledge.mjs');
const CLI = path.join(pluginRoot, 'hooks', 'scripts', 'knowledge-cli.mjs');
const HOOKS_JSON = path.join(pluginRoot, 'hooks', 'hooks.json');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function skillContent(id, description, triggers) {
  return [
    '---',
    `name: ${id}`,
    `description: ${description}`,
    'metadata:',
    '  spectre-category: "feature"',
    `  spectre-triggers: '${JSON.stringify(triggers)}'`,
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
    '',
    `# ${id}`,
    '',
    `PRIVATE_BODY_${id.toUpperCase().replaceAll('-', '_')}`,
    '',
  ].join('\n');
}

// Record ids are deliberately chosen so alphabetical order is the REVERSE of
// source-newness ranking. A renderer that follows the ranking puts zulu first;
// an id-ordered renderer puts alpha first.
const RECORDS = [
  ['feature-alpha', 'Use when proving alpha routing.', ['alpha cue'], 1_700_000_000_000],
  ['feature-mike', 'Use when proving mike routing.', ['mike cue'], 1_750_000_000_000],
  ['feature-zulu', 'Use when proving zulu routing.', ['zulu cue'], 1_800_000_000_000],
];

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), `proof-${label}-`));
const spectreHome = path.join(projectDir, 'spectre-home');

// Create the store through the product's own resolver so the layout is whatever
// the code under test actually expects, not something this script invents.
const { resolveProjectStore } = await import(
  path.join(pluginRoot, 'hooks', 'scripts', 'knowledge', 'store.mjs')
);
const resolved = await resolveProjectStore(projectDir, {
  spectreHome,
  gitRunner() {
    throw new Error('proof fixture is intentionally non-Git');
  },
});
const { storePath } = resolved;
fs.mkdirSync(path.join(storePath, 'knowledge'), { recursive: true });

for (const [id, description, triggers, mtimeMs] of RECORDS) {
  const dir = path.join(storePath, 'knowledge', id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'SKILL.md');
  fs.writeFileSync(file, skillContent(id, description, triggers));
  const date = new Date(mtimeMs);
  fs.utimesSync(file, date, date);
}

// Node realpaths module paths, so a plugin root under a symlinked /tmp is
// reported as /private/tmp inside the payload. Normalize both spellings or the
// preamble comparison reports a difference that is purely the symlink.
// Longest first: replacing "/tmp/x" before "/private/tmp/x" would leave a
// mangled "/private<PLUGIN_ROOT>" that no later alias can match.
const PATH_ALIASES = [
  [projectDir, '<PROJECT_DIR>'],
  [fs.realpathSync(projectDir), '<PROJECT_DIR>'],
  [pluginRoot, '<PLUGIN_ROOT>'],
  [fs.realpathSync(pluginRoot), '<PLUGIN_ROOT>'],
].sort(([left], [right]) => right.length - left.length);

function normalizePaths(value) {
  let normalized = value;
  for (const [from, to] of PATH_ALIASES) normalized = normalized.replaceAll(from, to);
  return normalized;
}

function runHook(source) {
  const result = spawnSync(process.execPath, [HOOK, '--host', host], {
    cwd: projectDir,
    input: JSON.stringify({
      hook_event_name: 'SessionStart',
      source,
      cwd: projectDir,
      session_id: `proof-${source}`,
    }),
    env: { ...process.env, SPECTRE_HOME: spectreHome, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  });
  const stdout = result.stdout || '';
  let context = null;
  try {
    context = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  } catch { /* no output is a valid observation */ }
  return {
    source,
    exitCode: result.status,
    stdoutChars: stdout.length,
    emitted: stdout.trim() !== '',
    contextChars: context === null ? 0 : context.length,
    contextSha256: context === null ? null : sha256(context),
    // The policy preamble must survive this change untouched. Hash it with the
    // run-specific project dir and plugin root replaced by placeholders: those
    // paths legitimately differ between the HEAD and working-tree runs and
    // would otherwise mask a real byte comparison.
    preambleSha256: context === null
      ? null
      : sha256(normalizePaths(context.slice(0, context.indexOf('## Available Knowledge')))),
    preambleChars: context === null
      ? 0
      : normalizePaths(context.slice(0, context.indexOf('## Available Knowledge'))).length,
    entryOrder: context === null
      ? []
      : [...context.matchAll(/^-?\s*(?:ID: )?(feature-(?:alpha|mike|zulu))/gm)].map(m => m[1]),
    loadCommandOccurrences: context === null
      ? 0
      : (context.match(/knowledge-cli\.mjs' load /g) || []).length,
    context,
  };
}

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: projectDir,
    env: { ...process.env, SPECTRE_HOME: spectreHome },
    encoding: 'utf8',
  });
  return { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

const evidence = { label, pluginRoot, projectDir, journeys: {} };

// J1-J4: every SessionStart source a host can send.
for (const source of ['startup', 'resume', 'clear', 'compact']) {
  evidence.journeys[`session_${source}`] = runHook(source);
}

// J5: the reported symptom. Inject, then perform a real verified load (which
// mutates ranking activity), then inject again. Compare the two attachments.
const first = runHook('startup');
const load = runCli(['load', 'feature-alpha', '--project-dir', projectDir]);
const second = runHook('compact');
evidence.journeys.reinjection_after_load = {
  loadExitCode: load.exitCode,
  loadEmitsResourceLocations: load.stdout.includes('SPECTRE_KNOWLEDGE_RESOURCE_LOCATIONS='),
  firstSha256: first.contextSha256,
  secondSha256: second.contextSha256,
  firstOrder: first.entryOrder,
  secondOrder: second.entryOrder,
  identical: first.contextSha256 === second.contextSha256,
};

// J6: the hoisted load command must actually work when an agent substitutes an
// ID verbatim. This is the risk introduced by removing per-record commands.
const startupContext = evidence.journeys.session_startup.context;
let constructed = null;
if (startupContext) {
  const template = startupContext.match(/^'.*knowledge-cli\.mjs' load '<ID>'.*$/m);
  if (template) {
    const command = template[0].replace("'<ID>'", "'feature-zulu'");
    const run = spawnSync('/bin/sh', ['-c', command], {
      cwd: projectDir,
      env: { ...process.env, SPECTRE_HOME: spectreHome },
      encoding: 'utf8',
    });
    constructed = {
      template: template[0],
      command,
      exitCode: run.status,
      returnedRecordBody: (run.stdout || '').includes('PRIVATE_BODY_FEATURE_ZULU'),
      returnedResourceLocations: (run.stdout || '').includes('SPECTRE_KNOWLEDGE_RESOURCE_LOCATIONS='),
    };
  }
}
evidence.journeys.constructed_load_command = constructed;

// J7: hooks.json wiring, read from the shipped file.
const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
evidence.journeys.hook_wiring = {
  groups: hooks.hooks.SessionStart.map(group => ({
    matcher: group.matcher,
    commands: group.hooks.map(hook =>
      path.basename((hook.command.match(/\S+\.mjs/) || ['<unknown>'])[0])),
  })),
};

// Strip full context bodies from the persisted record; hashes carry the proof.
for (const journey of Object.values(evidence.journeys)) {
  if (journey && typeof journey === 'object' && 'context' in journey) delete journey.context;
}

fs.rmSync(projectDir, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { writeKnowledgeActivity } from './knowledge/activity.mjs';
import { refreshKnowledgeIndex } from './knowledge/records.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'load-knowledge.mjs');
const BUNDLED_CLI = path.join(SCRIPT_DIR, 'knowledge-cli.mjs');
const HOOKS_PATH = path.join(SCRIPT_DIR, '..', 'hooks.json');
const START_MARKER = '<!-- spectre-knowledge:start -->';
const END_MARKER = '<!-- spectre-knowledge:end -->';

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-session-start-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

async function createStore(projectDir, spectreHome) {
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome,
    gitRunner() {
      throw new Error('fixture is intentionally non-Git');
    },
  });
  return resolved.storePath;
}

function skillContent(id, options = {}) {
  return [
    '---',
    `name: ${id}`,
    `description: ${options.description || `Use when working with ${id}.`}`,
    'metadata:',
    `  spectre-category: "${options.category || 'feature'}"`,
    `  spectre-triggers: '${JSON.stringify(options.triggers || [`${id} workflow`])}'`,
    `  spectre-status: "${options.status || 'active'}"`,
    `  spectre-version: "${options.version || 1}"`,
    '---',
    '',
    options.body || `# ${id}\n\nPRIVATE_BODY_${id.toUpperCase().replaceAll('-', '_')}`,
    '',
  ].join('\n');
}

function writeRecord(storePath, id, options = {}) {
  const recordDirectory = path.join(storePath, 'knowledge', id);
  fs.mkdirSync(recordDirectory, { recursive: true });
  const recordPath = path.join(recordDirectory, 'SKILL.md');
  const content = skillContent(id, options);
  fs.writeFileSync(recordPath, content);
  if (options.mtimeMs !== undefined) {
    const date = new Date(options.mtimeMs);
    fs.utimesSync(recordPath, date, date);
  }
  return { content, recordDirectory, recordPath };
}

function writeLegacyRecord(projectDir, id) {
  const skillDirectory = path.join(projectDir, '.claude', 'skills', id);
  const registryPath = path.join(
    projectDir,
    '.claude',
    'skills',
    'spectre-recall',
    'references',
    'registry.toon',
  );
  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(path.join(skillDirectory, 'SKILL.md'), [
    '---',
    `name: ${id}`,
    'description: Use when migrating legacy registry knowledge.',
    '---',
    '',
    '# Legacy record',
    '',
    'PRIVATE_LEGACY_MIGRATION_BODY',
    '',
  ].join('\n'));
  fs.writeFileSync(
    registryPath,
    `${id}|feature|legacy registry migration|Use when migrating legacy registry knowledge.\n`,
  );
  return skillDirectory;
}

function writeUnresolvedLegacyRegistryRow(projectDir, id) {
  const registryPath = path.join(
    projectDir,
    '.claude',
    'skills',
    'spectre-recall',
    'references',
    'registry.toon',
  );
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(
    registryPath,
    `${id}|feature|unresolved legacy migration|Use when testing lock contention.\n`,
  );
  return registryPath;
}

function emptyActivity() {
  return {
    schemaVersion: 1,
    records: {},
    search: { matches: 0, misses: 0, recordMatches: {} },
  };
}

function runHook({ cwd, spectreHome, host = 'claude', input, env = {}, timeout = 10_000 }) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--host', host], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: cwd,
      SPECTRE_HOME: spectreHome,
      ...env,
    },
    input: typeof input === 'string' ? input : JSON.stringify(input),
    timeout,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    elapsedMs: Date.now() - startedAt,
    signal: result.signal,
  };
}

function runBundled(args, { cwd, spectreHome }) {
  return spawnSync(BUNDLED_CLI, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SPECTRE_HOME: spectreHome },
    timeout: 10_000,
  });
}

function sessionInput(source, cwd) {
  return {
    hook_event_name: 'SessionStart',
    source,
    session_id: `${source}-session`,
    cwd,
  };
}

function statSnapshot(filePath) {
  const stat = fs.statSync(filePath);
  return {
    bytes: fs.readFileSync(filePath),
    mtimeMs: stat.mtimeMs,
  };
}

function assertSnapshotUnchanged(filePath, before) {
  assert.deepEqual(fs.readFileSync(filePath), before.bytes);
  assert.equal(fs.statSync(filePath).mtimeMs, before.mtimeMs);
}

function assertRegistryOutput(result, id, bodySentinel) {
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.signal, null);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output), ['hookSpecificOutput']);
  assert.deepEqual(Object.keys(output.hookSpecificOutput).sort(), [
    'additionalContext',
    'hookEventName',
  ]);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(typeof output.hookSpecificOutput.additionalContext, 'string');
  assert.match(output.hookSpecificOutput.additionalContext, new RegExp(`ID: ${id} \\(v\\d+\\)`));
  assert.match(output.hookSpecificOutput.additionalContext, /Use when:/);
  assert.match(output.hookSpecificOutput.additionalContext, /Cues:/);
  assert.equal('systemMessage' in output, false);
  assert.equal(output.hookSpecificOutput.additionalContext.includes(bodySentinel), false);
  assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /body preview|fallback file/i);
}

describe('knowledge registry SessionStart integration', () => {
  for (const source of ['startup', 'clear', 'compact']) {
    it(`emits exactly one metadata-only additionalContext for ${source}`, async (t) => {
      const projectDir = makeTmp(t);
      const spectreHome = path.join(projectDir, 'spectre-home');
      const storePath = await createStore(projectDir, spectreHome);
      const id = `feature-${source}-registry`;
      const bodySentinel = `PRIVATE_BODY_${id.toUpperCase().replaceAll('-', '_')}`;
      writeRecord(storePath, id, {
        description: `Use when validating ${source} knowledge registry delivery.`,
        triggers: [`${source} registry delivery`, 'load-knowledge.mjs'],
      });

      const result = runHook({
        cwd: projectDir,
        spectreHome,
        input: sessionInput(source, projectDir),
      });

      assertRegistryOutput(result, id, bodySentinel);
      const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
      const quotedCli = BUNDLED_CLI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(context, new RegExp(`'${quotedCli}' load '<ID>'`));
      assert.equal(
        (context.match(new RegExp(`'${quotedCli}' load `, 'g')) || []).length,
        1,
        'the load command template must be hoisted, not repeated per record',
      );
      assert.equal(fs.existsSync(path.join(storePath, 'activity.json')), false);
    });
  }

  it('emits no knowledge context on resume', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    writeRecord(storePath, 'feature-resume-must-not-inject');

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('resume', projectDir),
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stdout, '');
  });

  it('excludes resume from the knowledge SessionStart hook matcher', () => {
    const hooks = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
    assert.deepEqual(Object.keys(hooks.hooks), ['SessionStart']);
    const groups = hooks.hooks.SessionStart;
    const knowledgeGroups = groups.filter(group =>
      group.hooks.some(hook => hook.command.includes('load-knowledge.mjs')));
    assert.equal(knowledgeGroups.length, 1);
    assert.equal(knowledgeGroups[0].matcher, 'startup|clear|compact');
    assert.equal(knowledgeGroups[0].hooks.length, 1);

    // handoff-resume genuinely needs resume and must keep it.
    const resumeGroups = groups.filter(group => group.matcher.includes('resume'));
    assert.equal(resumeGroups.length, 1);
    assert.equal(resumeGroups[0].matcher, 'startup|resume|clear|compact');
    assert.equal(
      resumeGroups[0].hooks.some(hook => hook.command.includes('load-knowledge.mjs')),
      false,
    );
  });

  it('returns no context and creates nothing for a missing store', (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const before = fs.readdirSync(projectDir);

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('startup', projectDir),
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.deepEqual(fs.readdirSync(projectDir), before);
    assert.equal(fs.existsSync(spectreHome), false);
  });

  it('returns no context for an existing empty store', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    const projectMetadata = statSnapshot(path.join(storePath, 'project.json'));

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('clear', projectDir),
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stdout, '');
    assertSnapshotUnchanged(path.join(storePath, 'project.json'), projectMetadata);
    assert.equal(fs.existsSync(path.join(storePath, 'index.json')), false);
    assert.equal(fs.existsSync(path.join(storePath, 'activity.json')), false);
  });

  it('retains bounded legacy migration before rendering metadata', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const id = 'feature-legacy-registry';
    const legacyDirectory = writeLegacyRecord(projectDir, id);

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('startup', projectDir),
    });

    assertRegistryOutput(result, id, 'PRIVATE_LEGACY_MIGRATION_BODY');
    assert.equal(fs.existsSync(legacyDirectory), false);
    const resolved = await resolveProjectStore(projectDir, {
      spectreHome,
      readOnly: true,
      gitRunner() {
        throw new Error('fixture is intentionally non-Git');
      },
    });
    assert.equal(
      fs.existsSync(path.join(resolved.storePath, 'knowledge', id, 'SKILL.md')),
      true,
    );
  });

  it('reads index and activity without changing their bytes or mtimes', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    writeRecord(storePath, 'feature-read-only-startup');
    refreshKnowledgeIndex(storePath, { now: () => Date.parse('2026-07-22T20:00:00.000Z') });
    writeKnowledgeActivity(storePath, emptyActivity());
    const indexPath = path.join(storePath, 'index.json');
    const activityPath = path.join(storePath, 'activity.json');
    const indexBefore = statSnapshot(indexPath);
    const activityBefore = statSnapshot(activityPath);

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('startup', projectDir),
    });

    assertRegistryOutput(result, 'feature-read-only-startup', 'PRIVATE_BODY_FEATURE_READ_ONLY_STARTUP');
    assertSnapshotUnchanged(indexPath, indexBefore);
    assertSnapshotUnchanged(activityPath, activityBefore);
  });

  it('does not wait on an activity writer lock', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    writeRecord(storePath, 'feature-lock-free-startup');
    writeKnowledgeActivity(storePath, emptyActivity());
    const unresolvedRegistry = writeUnresolvedLegacyRegistryRow(
      projectDir,
      'feature-unresolved-lock-debt',
    );
    const unresolvedBytes = fs.readFileSync(unresolvedRegistry);
    fs.writeFileSync(path.join(storePath, '.spectre.lock'), JSON.stringify({
      pid: process.pid,
      timestamp: new Date().toISOString(),
      operation: 'held-activity-writer',
    }));

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('compact', projectDir),
      env: { SPECTRE_HOOK_MIGRATION_TIMEOUT_MS: '1000' },
      timeout: 3_000,
    });

    assertRegistryOutput(result, 'feature-lock-free-startup', 'PRIVATE_BODY_FEATURE_LOCK_FREE_STARTUP');
    assert.ok(result.elapsedMs < 800, `SessionStart waited ${result.elapsedMs}ms`);
    assert.match(result.stderr, /migration skipped: reason=LOCK_TIMEOUT/);
    assert.equal(fs.existsSync(path.join(storePath, '.spectre.lock')), true);
    assert.deepEqual(fs.readFileSync(unresolvedRegistry), unresolvedBytes);
  });

  it('fails open when activity is corrupt and preserves its bytes', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    writeRecord(storePath, 'feature-older-source', { mtimeMs: 1_700_000_000_000 });
    writeRecord(storePath, 'feature-newer-source', { mtimeMs: 1_800_000_000_000 });
    const activityPath = path.join(storePath, 'activity.json');
    const corrupt = '{corrupt activity}\n';
    fs.writeFileSync(activityPath, corrupt);

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('startup', projectDir),
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.match(context, /ID: feature-newer-source/);
    assert.match(context, /ID: feature-older-source/);
    assert.match(result.stderr, /KNOWLEDGE_ACTIVITY_CORRUPT/);
    assert.equal(fs.readFileSync(activityPath, 'utf8'), corrupt);
  });

  it('renders in a fixed id order regardless of rank-promoting source newness', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    // Newness order (zulu newest) is the reverse of id order, so a render that
    // followed the ranking would place zulu first.
    writeRecord(storePath, 'feature-alpha', { mtimeMs: 1_700_000_000_000 });
    writeRecord(storePath, 'feature-zulu', { mtimeMs: 1_800_000_000_000 });

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('startup', projectDir),
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.ok(
      context.indexOf('ID: feature-alpha') < context.indexOf('ID: feature-zulu'),
      'rendered entries must be id-ordered so the attachment stays byte-stable',
    );
  });
});

describe('stale knowledge transport cleanup', () => {
  it('removes only the managed knowledge block and old prompt ledgers', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    writeRecord(storePath, 'feature-cleanup-registry');
    const overridePath = path.join(projectDir, 'AGENTS.override.md');
    const knowledgeBlock = [
      START_MARKER,
      'old managed knowledge bytes',
      END_MARKER,
    ].join('\n');
    const original = [
      'USER_PREFIX_BYTES',
      '<!-- spectre-session:start -->',
      'SESSION_BLOCK_BYTES',
      '<!-- spectre-session:end -->',
      'USER_MIDDLE_BYTES',
      knowledgeBlock,
      'USER_SUFFIX_BYTES',
      '',
    ].join('\n');
    fs.writeFileSync(overridePath, original);
    const sessionsPath = path.join(storePath, 'runtime', 'sessions');
    fs.mkdirSync(sessionsPath, { recursive: true });
    fs.writeFileSync(path.join(sessionsPath, 'old-ledger.json'), '{"applied":["feature-old@1"]}\n');
    fs.writeFileSync(path.join(storePath, 'runtime', 'keep.txt'), 'KEEP_RUNTIME_SIBLING\n');

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: sessionInput('clear', projectDir),
    });

    assertRegistryOutput(result, 'feature-cleanup-registry', 'PRIVATE_BODY_FEATURE_CLEANUP_REGISTRY');
    assert.equal(fs.readFileSync(overridePath, 'utf8'), original.replace(knowledgeBlock, ''));
    assert.equal(fs.existsSync(sessionsPath), false);
    assert.equal(
      fs.readFileSync(path.join(storePath, 'runtime', 'keep.txt'), 'utf8'),
      'KEEP_RUNTIME_SIBLING\n',
    );
  });
});

describe('registry overflow recovery', () => {
  it('keeps an omitted sentinel active/searchable/loadable without counting startup exposure', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, 'spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    const baseMtime = Date.parse('2026-07-22T20:00:00.000Z');
    for (let index = 0; index < 70; index += 1) {
      const id = `feature-overflow-${String(index).padStart(2, '0')}`;
      writeRecord(storePath, id, {
        mtimeMs: baseMtime - index * 1_000,
        description: `Use when handling overflow registry fixture ${index}: ${'routing detail '.repeat(10)}`,
        triggers: [`overflow fixture ${index}`, `${id}.md`],
      });
    }
    const sentinelId = 'feature-omitted-sentinel';
    const sentinel = writeRecord(storePath, sentinelId, {
      mtimeMs: baseMtime - 100_000,
      description: 'Use when recovering the unique overflow recovery sentinel.',
      triggers: ['overflow recovery sentinel', 'feature-omitted-sentinel.md'],
      body: '# Omitted sentinel\n\nOMITTED_SENTINEL_FULL_BODY',
    });
    refreshKnowledgeIndex(storePath, { now: () => baseMtime });
    writeKnowledgeActivity(storePath, emptyActivity());
    const indexPath = path.join(storePath, 'index.json');
    const activityPath = path.join(storePath, 'activity.json');
    const indexBefore = statSnapshot(indexPath);
    const activityBefore = statSnapshot(activityPath);

    for (const host of ['claude', 'codex']) {
      const started = runHook({
        cwd: projectDir,
        spectreHome,
        host,
        input: sessionInput('startup', projectDir),
      });
      assert.equal(started.exitCode, 0, started.stderr);
      const context = JSON.parse(started.stdout).hookSpecificOutput.additionalContext;
      assert.match(context, /Omitted active records: [1-9]\d*/);
      assert.equal(context.includes(`ID: ${sentinelId}`), false);
      assert.equal(context.includes('OMITTED_SENTINEL_FULL_BODY'), false);
    }
    assertSnapshotUnchanged(indexPath, indexBefore);
    assertSnapshotUnchanged(activityPath, activityBefore);
    assert.equal(
      JSON.parse(fs.readFileSync(indexPath, 'utf8')).records
        .find(({ id }) => id === sentinelId).status,
      'active',
    );

    const searched = runBundled([
      'search',
      'omitted sentinel',
      '--project-dir',
      projectDir,
      '--json',
    ], { cwd: projectDir, spectreHome });
    assert.equal(searched.status, 0, searched.stderr);
    assert.deepEqual(
      JSON.parse(searched.stdout).results.map(({ id }) => id),
      [sentinelId],
    );
    const loaded = runBundled([
      'load',
      sentinelId,
      '--project-dir',
      projectDir,
      '--json',
    ], { cwd: projectDir, spectreHome });
    assert.equal(loaded.status, 0, loaded.stderr);
    const loadedResult = JSON.parse(loaded.stdout);
    assert.equal(loadedResult.content, sentinel.content);
    assert.equal(loadedResult.status, 'active');
    assert.equal(loadedResult.activity.successfulLoads, 1);
  });
});

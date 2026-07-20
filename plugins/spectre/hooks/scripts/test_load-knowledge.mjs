#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  filterAppliedKnowledge,
  markKnowledgeApplied,
} from './knowledge/matcher.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'load-knowledge.mjs');
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

function createManifest(projectDir) {
  const manifestPath = path.join(projectDir, '.spectre', 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, '{"version":1}\n');
}

function runHook({
  cwd,
  spectreHome,
  host = 'claude',
  input,
  env = {},
}) {
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
    timeout: 10_000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function legacySkill(projectDir, id = 'feature-legacy') {
  const skillDir = path.join(projectDir, '.claude', 'skills', id);
  const registryPath = path.join(
    projectDir,
    '.claude',
    'skills',
    'spectre-recall',
    'references',
    'registry.toon',
  );
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${id}`,
      'description: Legacy registry guidance.',
      '---',
      '# Secret legacy record',
      '',
      'LEGACY_RECORD_BODY_MUST_NOT_APPEAR_AT_STARTUP',
    ].join('\n'),
  );
  fs.writeFileSync(
    registryPath,
    `${id}|feature|legacy trigger|Legacy registry guidance.\n`,
  );
  return { skillDir, registryPath };
}

function match(id = 'feature-auth', version = 1) {
  return { id, version };
}

describe('capability-only SessionStart', () => {
  it('writes constant search/learn guidance and migrates without exposing records', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, '.spectre-home');
    createManifest(projectDir);
    const legacy = legacySkill(projectDir);
    fs.writeFileSync(
      path.join(projectDir, 'AGENTS.override.md'),
      [
        'User-owned override.',
        '',
        START_MARKER,
        'feature-old|feature|old trigger|Old registry body',
        '{{REGISTRY}}',
        END_MARKER,
        '',
      ].join('\n'),
    );

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: {
        hook_event_name: 'SessionStart',
        source: 'startup',
        session_id: 'startup-session',
        cwd: projectDir,
      },
    });

    assert.equal(result.exitCode, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(output.systemMessage, /knowledge.*automatically/i);
    assert.match(output.systemMessage, /spectre knowledge search "<query>"/);
    assert.match(output.systemMessage, /\/spectre:learn/);
    const override = fs.readFileSync(
      path.join(projectDir, 'AGENTS.override.md'),
      'utf8',
    );
    assert.match(override, /User-owned override/);
    assert.match(override, /knowledge.*automatically/i);
    assert.match(override, /spectre knowledge search "<query>"/);
    assert.match(override, /\/spectre:learn/);
    assert.doesNotMatch(override, /\{\{REGISTRY\}\}/);
    assert.doesNotMatch(override, /feature-old\|/);
    assert.doesNotMatch(override, /LEGACY_RECORD_BODY/);
    assert.equal(fs.existsSync(legacy.skillDir), false);

    const resolved = await resolveProjectStore(projectDir, {
      spectreHome,
      readOnly: true,
      gitRunner() {
        throw new Error('fixture is intentionally non-Git');
      },
    });
    assert.equal(
      fs.existsSync(path.join(
        resolved.storePath,
        'knowledge',
        'feature-legacy',
        'SKILL.md',
      )),
      true,
    );
  });

  it('fails open for malformed or wrong events and creates no absent store', (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, '.spectre-home');
    createManifest(projectDir);
    const overridePath = path.join(projectDir, 'AGENTS.override.md');
    fs.writeFileSync(overridePath, 'User-owned override.\n');

    for (const input of [
      '{not-json',
      JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        source: 'startup',
        cwd: projectDir,
      }),
      JSON.stringify({
        hook_event_name: 'SessionStart',
        source: 'resume',
        cwd: projectDir,
      }),
    ]) {
      const result = runHook({ cwd: projectDir, spectreHome, input });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
    }
    assert.equal(fs.readFileSync(overridePath, 'utf8'), 'User-owned override.\n');
    assert.equal(fs.existsSync(spectreHome), false);
  });

  it('uses the host-specific learn command in capability guidance', (t) => {
    for (const [host, learnCommand] of [
      ['claude', '/spectre:learn'],
      ['codex', 'spectre-learn'],
    ]) {
      const projectDir = makeTmp(t);
      const spectreHome = path.join(projectDir, '.spectre-home');
      createManifest(projectDir);

      const result = runHook({
        cwd: projectDir,
        spectreHome,
        host,
        input: {
          hook_event_name: 'SessionStart',
          source: 'startup',
          session_id: `${host}-guidance`,
          cwd: projectDir,
        },
      });

      assert.equal(result.exitCode, 0);
      assert.match(JSON.parse(result.stdout).systemMessage, new RegExp(learnCommand));
      const override = fs.readFileSync(
        path.join(projectDir, 'AGENTS.override.md'),
        'utf8',
      );
      assert.match(override, new RegExp(learnCommand));
      if (host === 'codex') {
        assert.doesNotMatch(result.stdout, /\/spectre:learn/);
        assert.doesNotMatch(override, /\/spectre:learn/);
      }
    }
  });

  it('skips a held migration lock and still emits capability guidance', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, '.spectre-home');
    createManifest(projectDir);
    legacySkill(projectDir);
    const storePath = await createStore(projectDir, spectreHome);
    const lockPath = path.join(storePath, '.spectre.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        timestamp: new Date().toISOString(),
        operation: 'held-by-test',
      }),
    );

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: {
        hook_event_name: 'SessionStart',
        source: 'clear',
        session_id: 'locked-session',
        cwd: projectDir,
      },
      env: { SPECTRE_HOOK_MIGRATION_TIMEOUT_MS: '25' },
    });

    assert.equal(result.exitCode, 0);
    assert.match(JSON.parse(result.stdout).systemMessage, /automatically/i);
    assert.equal(
      fs.existsSync(path.join(storePath, 'knowledge', 'feature-legacy')),
      false,
    );
    assert.equal(fs.existsSync(lockPath), true);
    assert.equal(
      result.stderr,
      'spectre SessionStart migration skipped: reason=LOCK_TIMEOUT\n',
    );
  });
});

describe('SessionStart ledger reset', () => {
  for (const source of ['startup', 'clear', 'compact']) {
    it(`clears the addressed ${source} session`, async (t) => {
      const projectDir = makeTmp(t);
      const spectreHome = path.join(projectDir, '.spectre-home');
      const storePath = await createStore(projectDir, spectreHome);
      createManifest(projectDir);
      const record = match(`feature-${source}`);
      markKnowledgeApplied({
        storePath,
        host: 'claude',
        sessionId: `${source}-session`,
        record,
      });
      assert.deepEqual(filterAppliedKnowledge({
        storePath,
        host: 'claude',
        sessionId: `${source}-session`,
        matches: [record],
      }), []);

      const result = runHook({
        cwd: projectDir,
        spectreHome,
        input: {
          hook_event_name: 'SessionStart',
          source,
          session_id: `${source}-session`,
          cwd: projectDir,
        },
      });

      assert.equal(result.exitCode, 0);
      assert.deepEqual(filterAppliedKnowledge({
        storePath,
        host: 'claude',
        sessionId: `${source}-session`,
        matches: [record],
      }), [record]);
    });
  }

  it('clears every project ledger when session_id is absent', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, '.spectre-home');
    const storePath = await createStore(projectDir, spectreHome);
    createManifest(projectDir);
    const claudeRecord = match('feature-claude');
    const codexRecord = match('feature-codex');
    markKnowledgeApplied({
      storePath,
      host: 'claude',
      sessionId: 'claude-session',
      record: claudeRecord,
    });
    markKnowledgeApplied({
      storePath,
      host: 'codex',
      sessionId: 'codex-session',
      record: codexRecord,
    });

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: {
        hook_event_name: 'SessionStart',
        source: 'startup',
        cwd: projectDir,
      },
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(filterAppliedKnowledge({
      storePath,
      host: 'claude',
      sessionId: 'claude-session',
      matches: [claudeRecord],
    }), [claudeRecord]);
    assert.deepEqual(filterAppliedKnowledge({
      storePath,
      host: 'codex',
      sessionId: 'codex-session',
      matches: [codexRecord],
    }), [codexRecord]);
  });
});

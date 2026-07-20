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
} from './knowledge/matcher.mjs';
import { refreshKnowledgeIndex } from './knowledge/records.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'user-prompt-submit.mjs');
const HOOKS_PATH = path.join(SCRIPT_DIR, '..', 'hooks.json');
const APPLY_SKILL_PATH = path.join(
  SCRIPT_DIR,
  '..',
  '..',
  'skills',
  'spectre-apply',
  'SKILL.md',
);

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-user-prompt-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

function skillContent({
  id = 'feature-auth-flow',
  description = 'Use the established authentication flow.',
  trigger = 'auth flow',
  body = 'AUTH_FLOW_PRIMARY_SENTINEL\nFollow the established authentication flow.',
  version = 1,
} = {}) {
  return [
    '---',
    `name: ${id}`,
    `description: ${description}`,
    'metadata:',
    '  spectre-category: "feature"',
    `  spectre-triggers: '${JSON.stringify([trigger])}'`,
    '  spectre-status: "active"',
    `  spectre-version: "${version}"`,
    '---',
    `# ${id}`,
    '',
    body,
  ].join('\n');
}

async function seedStore(projectDir, spectreHome, records = [{}]) {
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome,
    gitRunner() {
      throw new Error('fixture is intentionally non-Git');
    },
  });
  for (const record of records) {
    const id = record.id || 'feature-auth-flow';
    const recordDir = path.join(resolved.storePath, 'knowledge', id);
    fs.mkdirSync(recordDir, { recursive: true });
    fs.writeFileSync(path.join(recordDir, 'SKILL.md'), skillContent(record));
  }
  refreshKnowledgeIndex(resolved.storePath);
  return resolved.storePath;
}

function runHook({
  cwd,
  spectreHome,
  host = 'claude',
  input,
}) {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--host', host], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: cwd,
      SPECTRE_HOME: spectreHome,
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

describe('UserPromptSubmit process adapter', () => {
  it('emits equivalent primary context and notice for Claude and Codex', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, '.spectre-home');
    await seedStore(projectDir, spectreHome);
    const baseInput = {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Please use the auth flow for this change.',
      cwd: projectDir,
    };

    const claude = runHook({
      cwd: projectDir,
      spectreHome,
      host: 'claude',
      input: { ...baseInput, session_id: 'claude-session' },
    });
    const codex = runHook({
      cwd: projectDir,
      spectreHome,
      host: 'codex',
      input: { ...baseInput, session_id: 'codex-session' },
    });

    assert.equal(claude.exitCode, 0);
    assert.equal(codex.exitCode, 0);
    const claudeOutput = JSON.parse(claude.stdout);
    const codexOutput = JSON.parse(codex.stdout);
    assert.deepEqual(codexOutput, claudeOutput);
    assert.equal(
      claudeOutput.systemMessage,
      'spectre: applied feature-auth-flow; 0 also matching',
    );
    assert.equal(
      claudeOutput.hookSpecificOutput.hookEventName,
      'UserPromptSubmit',
    );
    assert.match(
      claudeOutput.hookSpecificOutput.additionalContext,
      /AUTH_FLOW_PRIMARY_SENTINEL/,
    );
  });

  it('dedupes repeats and fails open for absent, invalid, or malformed inputs', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, '.spectre-home');
    await seedStore(projectDir, spectreHome);
    const matchingInput = {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Use the auth flow.',
      session_id: 'repeat-session',
      cwd: projectDir,
    };

    assert.notEqual(runHook({
      cwd: projectDir,
      spectreHome,
      input: matchingInput,
    }).stdout, '');
    assert.equal(runHook({
      cwd: projectDir,
      spectreHome,
      input: matchingInput,
    }).stdout, '');

    const silentInputs = [
      { ...matchingInput, session_id: 'no-match', prompt: 'No declared trigger.' },
      { ...matchingInput, session_id: 'wrong-event', hook_event_name: 'SessionStart' },
      { ...matchingInput, session_id: 'missing-prompt', prompt: undefined },
    ];
    for (const input of silentInputs) {
      const result = runHook({ cwd: projectDir, spectreHome, input });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, '');
    }
    const malformed = runHook({
      cwd: projectDir,
      spectreHome,
      input: '{not-json',
    });
    assert.equal(malformed.exitCode, 0);
    assert.equal(malformed.stdout, '');
    assert.equal(runHook({
      cwd: projectDir,
      spectreHome,
      host: 'invalid',
      input: matchingInput,
    }).stdout, '');
  });

  it('reads an existing store without creating one and skips malformed records', async (t) => {
    const absentProject = makeTmp(t);
    const absentHome = path.join(absentProject, '.spectre-home');
    const absent = runHook({
      cwd: absentProject,
      spectreHome: absentHome,
      input: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Use the auth flow.',
        session_id: 'absent-store',
        cwd: absentProject,
      },
    });
    assert.equal(absent.exitCode, 0);
    assert.equal(absent.stdout, '');
    assert.equal(fs.existsSync(absentHome), false);

    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, '.spectre-home');
    const storePath = await seedStore(projectDir, spectreHome);
    const malformedDir = path.join(storePath, 'knowledge', 'feature-malformed');
    fs.mkdirSync(malformedDir, { recursive: true });
    fs.writeFileSync(path.join(malformedDir, 'SKILL.md'), 'not frontmatter');
    const valid = runHook({
      cwd: projectDir,
      spectreHome,
      input: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Use the auth flow.',
        session_id: 'malformed-record',
        cwd: projectDir,
      },
    });
    assert.equal(valid.exitCode, 0);
    assert.match(JSON.parse(valid.stdout).systemMessage, /feature-auth-flow/);
  });

  it('fails open on internal store errors without emitting partial context', async (t) => {
    const projectDir = makeTmp(t);
    const spectreHome = path.join(projectDir, '.spectre-home');
    const storePath = await seedStore(projectDir, spectreHome);
    fs.rmSync(path.join(storePath, 'knowledge'), { recursive: true });
    fs.writeFileSync(path.join(storePath, 'knowledge'), 'not a directory');

    const result = runHook({
      cwd: projectDir,
      spectreHome,
      input: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Use the auth flow.',
        session_id: 'internal-error',
        cwd: projectDir,
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  });
});

describe('hook manifest', () => {
  it('registers one matcher-free UserPromptSubmit after the SessionStart chain', () => {
    assert.equal(fs.existsSync(SCRIPT_PATH), true);
    const manifest = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
    assert.deepEqual(Object.keys(manifest.hooks), [
      'SessionStart',
      'UserPromptSubmit',
    ]);
    assert.deepEqual(
      manifest.hooks.SessionStart[0].hooks.map(({ command }) =>
        path.basename(command.split(' ')[1])),
      ['bootstrap.mjs', 'handoff-resume.mjs', 'load-knowledge.mjs'],
    );
    assert.equal(manifest.hooks.UserPromptSubmit.length, 1);
    assert.equal(
      Object.hasOwn(manifest.hooks.UserPromptSubmit[0], 'matcher'),
      false,
    );
    assert.equal(manifest.hooks.UserPromptSubmit[0].hooks.length, 1);
    assert.match(
      manifest.hooks.UserPromptSubmit[0].hooks[0].command,
      /user-prompt-submit\.mjs --host claude$/,
    );
    assert.doesNotMatch(JSON.stringify(manifest), /spectre-apply/);
    assert.equal(
      fs.readFileSync(SCRIPT_PATH, 'utf8').includes('spectre-apply'),
      false,
    );
    assert.equal(
      fs.readFileSync(path.join(SCRIPT_DIR, 'load-knowledge.mjs'), 'utf8')
        .includes('spectre-apply'),
      false,
    );
    assert.equal(
      fs.existsSync(APPLY_SKILL_PATH),
      false,
      'prompt-time resolution replaces the retired apply skill',
    );
  });
});

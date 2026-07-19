import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

function makeProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-codex-test-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: tmp, stdio: 'ignore' });
  return tmp;
}

function makeSessionProject() {
  const tmp = makeProject();
  fs.mkdirSync(path.join(tmp, 'docs', 'tasks', 'main', 'session_logs'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.agents', 'skills', 'spectre-recall', 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'docs', 'tasks', 'main', 'session_logs', '2026-03-09-100000_handoff.json'),
    JSON.stringify({
      version: '1.1',
      branch_name: 'main',
      task_name: 'codex-port-migration',
      progress_update: {
        goal: 'Ship official SessionStart migration',
        summary: 'Switched continuity to a managed AGENTS.override.md block.',
        accomplished: ['Updated hook generation'],
        now: 'Wiring tests for the new SessionStart payload',
        next_steps: ['Run the full test suite'],
        confidence: 'high'
      },
      working_set: {
        key_files: ['src/lib/project.js'],
        active_ids: ['bd-123'],
        recent_commands: ['npm test']
      },
      context: {
        wip_state: 'uncommitted',
        last_commit: 'abc1234'
      }
    }, null, 2)
  );
  fs.writeFileSync(
    path.join(tmp, '.agents', 'skills', 'spectre-recall', 'references', 'registry.toon'),
    [
      '# SPECTRE Knowledge Registry',
      '# Format: skill-name|category|triggers|description',
      '',
      'feature-auth|feature|auth, login|Use when modifying auth flows'
    ].join('\n')
  );
  return tmp;
}

test('SessionStart writes the latest handoff and inlined knowledge to the managed override', async () => {
  const tmp = makeSessionProject();
  const { buildSessionStartOutput } = await import('./lib/project.js');

  const output = buildSessionStartOutput(tmp, { source: 'resume' });
  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');

  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.systemMessage, /injected docs\/tasks\/main\/session_logs\/2026-03-09-100000_handoff\.json/);
  assert.match(output.systemMessage, /1 knowledge skills available/);
  assert.match(overrideContent, /<!-- spectre-session:start -->/);
  assert.match(overrideContent, /official SessionStart migration/);
  assert.match(overrideContent, /Wiring tests for the new SessionStart payload/);
  assert.match(overrideContent, /<!-- spectre-knowledge:start -->/);
  assert.match(overrideContent, /feature-auth\|feature\|auth, login\|Use when modifying auth flows/);
  assert.doesNotMatch(overrideContent, /\{\{REGISTRY\}\}/);
});

test('SessionStart clears stale session state but keeps empty knowledge and user content', async () => {
  const tmp = makeSessionProject();
  fs.rmSync(path.join(tmp, '.agents'), { recursive: true, force: true });
  fs.writeFileSync(
    path.join(tmp, 'AGENTS.override.md'),
    [
      'User content before.',
      '',
      '<!-- spectre-session:start -->',
      'stale session content',
      '<!-- spectre-session:end -->',
      '',
      '<!-- spectre-knowledge:start -->',
      'stale knowledge content',
      '<!-- spectre-knowledge:end -->',
      '',
      'User content after.'
    ].join('\n')
  );
  fs.rmSync(path.join(tmp, 'docs', 'tasks', 'main', 'session_logs'), { recursive: true, force: true });
  const { buildSessionStartOutput } = await import('./lib/project.js');

  const output = buildSessionStartOutput(tmp, { source: 'clear' });
  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');

  assert.equal(output.systemMessage, '🟢 👻 SPECTRE active | 👻 spectre: ready — capture knowledge with /spectre:learn');
  assert.match(overrideContent, /User content before\./);
  assert.match(overrideContent, /User content after\./);
  assert.doesNotMatch(overrideContent, /spectre-session:start/);
  assert.match(overrideContent, /spectre-knowledge:start/);
  assert.match(overrideContent, /No knowledge captured yet/);
  assert.doesNotMatch(overrideContent, /\{\{REGISTRY\}\}/);
});

test('project install creates recall files without managed memory injection', async () => {
  const tmp = makeProject();
  const { installProjectFiles } = await import('./lib/project.js');

  installProjectFiles(tmp, 'project');

  assert.ok(fs.existsSync(path.join(tmp, '.spectre', 'manifest.json')));
  assert.ok(fs.existsSync(path.join(tmp, '.agents', 'skills', 'spectre-recall', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(tmp, '.agents', 'skills', 'spectre-recall', 'references', 'registry.toon')));
  assert.ok(!fs.existsSync(path.join(tmp, 'AGENTS.override.md')));
});

test('project install removes legacy managed override blocks', async () => {
  const tmp = makeProject();
  fs.writeFileSync(
    path.join(tmp, 'AGENTS.override.md'),
    [
      'User content before.',
      '',
      '<!-- spectre-session:start -->',
      'old session content',
      '<!-- spectre-session:end -->',
      '',
      '<!-- spectre-knowledge:start -->',
      'old knowledge content',
      '<!-- spectre-knowledge:end -->',
      '',
      'User content after.'
    ].join('\n')
  );

  const { installProjectFiles } = await import('./lib/project.js');
  installProjectFiles(tmp, 'project');

  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');
  assert.match(overrideContent, /User content before\./);
  assert.match(overrideContent, /User content after\./);
  assert.doesNotMatch(overrideContent, /spectre-session:start/);
  assert.doesNotMatch(overrideContent, /spectre-knowledge:start/);
});

test('project reinstall removes fork-era managed blocks without removing user content', async () => {
  const tmp = makeProject();
  const forkName = ['cas', 'par'].join('');
  fs.writeFileSync(
    path.join(tmp, 'AGENTS.md'),
    [
      'Root user content.',
      '',
      `<!-- ${forkName}-codex:start -->`,
      'stale bridge content',
      `<!-- ${forkName}-codex:end -->`
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(tmp, 'AGENTS.override.md'),
    [
      'User content before.',
      '',
      `<!-- ${forkName}-session:start -->`,
      'stale session content',
      `<!-- ${forkName}-session:end -->`,
      '',
      `<!-- ${forkName}-knowledge:start -->`,
      'stale knowledge content',
      `<!-- ${forkName}-knowledge:end -->`,
      '',
      'User content after.'
    ].join('\n')
  );

  const { installProjectFiles } = await import('./lib/project.js');
  installProjectFiles(tmp, 'project');

  const rootAgentsContent = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');
  assert.match(rootAgentsContent, /Root user content\./);
  assert.doesNotMatch(rootAgentsContent, new RegExp(`${forkName}-codex:start`));
  assert.match(overrideContent, /User content before\./);
  assert.match(overrideContent, /User content after\./);
  assert.doesNotMatch(overrideContent, new RegExp(`${forkName}-(session|knowledge):start`));
});

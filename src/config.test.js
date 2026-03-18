import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

function makeProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-codex-test-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: tmp, stdio: 'ignore' });
  fs.mkdirSync(path.join(tmp, 'docs', 'tasks', 'main', 'session_logs'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.agents', 'skills', 'feature-auth'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.agents', 'skills', 'spectre-recall', 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'docs', 'tasks', 'main', 'session_logs', '2026-03-09-100000_handoff.json'),
    JSON.stringify({
      version: '1.1',
      timestamp: '2026-03-09-100000',
      branch_name: 'main',
      task_name: 'codex-port-migration',
      progress_update: {
        goal: 'Ship official SessionStart migration',
        summary: 'Switched Codex continuity to a managed AGENTS.override.md block with a SessionStart status line.',
        accomplished: ['Updated hook generation', 'Cleaned up legacy bridge files'],
        now: 'Wiring tests for the new SessionStart payload',
        next_steps: ['Update docs', 'Run the full test suite'],
        confidence: 'high',
        constraints: ['Hook output must stay JSON'],
        decisions: ['Use a managed AGENTS.override.md block as the continuity channel'],
        blockers: [],
        open_questions: ['Whether to show systemMessage in the UI'],
        risks: ['Codex hook schema is still experimental']
      },
      working_set: {
        key_files: ['src/lib/install.js', 'src/lib/project.js'],
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
    path.join(tmp, '.agents', 'skills', 'feature-auth', 'SKILL.md'),
    [
      '---',
      'name: feature-auth',
      'description: Use when modifying auth flows.',
      '---',
      '',
      '# Auth Knowledge',
      '',
      'The auth system uses token rotation.'
    ].join('\n')
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

test('buildSessionStartOutput returns official SessionStart payload from the latest handoff', async () => {
  const tmp = makeProject();
  const { buildSessionStartOutput } = await import('./lib/project.js');
  const output = buildSessionStartOutput(tmp, { source: 'resume' });
  const overridePath = path.join(tmp, 'AGENTS.override.md');

  assert.ok(output);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(output.systemMessage, '🟢 👻 SPECTRE active | injected docs/tasks/main/session_logs/2026-03-09-100000_handoff.json | 👻 spectre: 1 knowledge skills available');
  assert.deepEqual(output.hookSpecificOutput, { hookEventName: 'SessionStart' });

  assert.ok(fs.existsSync(overridePath));
  const overrideContent = fs.readFileSync(overridePath, 'utf8');
  assert.match(overrideContent, /<!-- spectre-session:start -->/);
  assert.match(overrideContent, /## SPECTRE Session Context/);
  assert.match(overrideContent, /official SessionStart migration/);
  assert.match(overrideContent, /Wiring tests for the new SessionStart payload/);
  assert.match(overrideContent, /### Spectre Notes/);
  assert.match(overrideContent, /\*\*SessionStart Source\*\*: resume/);
  assert.match(overrideContent, /docs\/tasks\/main\/session_logs\/2026-03-09-100000_handoff\.json/);
  assert.match(overrideContent, /<!-- spectre-session:end -->/);
  assert.match(overrideContent, /<!-- spectre-knowledge:start -->/);
  assert.match(overrideContent, /## SPECTRE Knowledge Context/);
  assert.match(overrideContent, /If ANY entry's triggers or description match your current task, you MUST load the skill FIRST/);
  assert.match(overrideContent, /feature-auth\|feature\|auth, login\|Use when modifying auth flows/);
  assert.match(overrideContent, /<!-- spectre-knowledge:end -->/);
  assert.ok(fs.existsSync(path.join(tmp, '.agents', 'skills', 'spectre-recall', 'SKILL.md')));
});

test('buildSessionStartOutput keeps knowledge active when no handoff exists and removes only the session block', async () => {
  const tmp = makeProject();
  fs.rmSync(path.join(tmp, '.agents'), { recursive: true, force: true });
  fs.writeFileSync(
    path.join(tmp, 'AGENTS.override.md'),
    [
      'User content before.',
      '',
      '<!-- spectre-session:start -->',
      'old spectre content',
      '<!-- spectre-session:end -->',
      '',
      '<!-- spectre-knowledge:start -->',
      'old knowledge content',
      '<!-- spectre-knowledge:end -->',
      '',
      'User content after.'
    ].join('\n')
  );
  const activePath = path.join(tmp, 'docs', 'tasks', 'main', 'session_logs', '2026-03-09-100000_handoff.json');
  const archiveDir = path.join(tmp, 'docs', 'tasks', 'main', 'session_logs', 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(activePath, path.join(archiveDir, '2026-03-09-100000_handoff.json'));

  const { buildSessionStartOutput } = await import('./lib/project.js');
  const output = buildSessionStartOutput(tmp, { source: 'clear' });
  assert.ok(output);
  assert.equal(output.systemMessage, '🟢 👻 SPECTRE active | 👻 spectre: ready — capture knowledge with spectre-learn');
  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');
  assert.match(overrideContent, /User content before\./);
  assert.match(overrideContent, /User content after\./);
  assert.doesNotMatch(overrideContent, /spectre-session:start/);
  assert.match(overrideContent, /spectre-knowledge:start/);
  assert.match(overrideContent, /No knowledge has been captured for this project yet/);
  assert.match(overrideContent, /use `spectre-learn` after completing significant work/);
});

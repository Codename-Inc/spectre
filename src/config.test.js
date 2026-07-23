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

function writeSessionHandoff(sessionDir, fileName, taskName, branchName = 'main') {
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, fileName),
    JSON.stringify({
      version: '1.1',
      branch_name: branchName,
      task_name: taskName,
      progress_update: {
        summary: `${taskName} summary`,
        accomplished: [],
        next_steps: [],
        confidence: 'high'
      },
      context: {
        wip_state: 'clean',
        last_commit: 'abc1234'
      }
    }, null, 2)
  );
}

test('native SessionStart prefers canonical history and preserves feature and handoff bytes through lifecycle operations', async () => {
  const tmp = makeProject();
  const featureSentinel = path.join(tmp, '.spectre', 'features', 'reader-test', 'sentinel.txt');
  const canonicalDir = path.join(tmp, '.spectre', 'handoffs', 'main');
  const handoffSentinel = path.join(canonicalDir, 'sentinel.txt');
  const legacyDir = path.join(tmp, 'docs', 'tasks', 'main', 'session_logs');
  fs.mkdirSync(path.dirname(featureSentinel), { recursive: true });
  fs.writeFileSync(featureSentinel, 'feature sentinel bytes\n');
  fs.mkdirSync(canonicalDir, { recursive: true });
  fs.writeFileSync(handoffSentinel, 'handoff sentinel bytes\n');
  writeSessionHandoff(
    canonicalDir,
    '2026-07-23-100000_handoff.json',
    'Canonical native handoff'
  );
  writeSessionHandoff(
    legacyDir,
    '2026-07-23-120000_handoff.json',
    'Newer legacy handoff'
  );

  const {
    buildSessionStartOutput,
    installProjectFiles,
    uninstallProjectFiles
  } = await import('./lib/project.js');

  installProjectFiles(tmp, 'project');
  installProjectFiles(tmp, 'project');
  const output = buildSessionStartOutput(tmp, { source: 'resume' });
  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');
  uninstallProjectFiles(tmp);

  assert.match(
    output.systemMessage,
    /injected \.spectre\/handoffs\/main\/2026-07-23-100000_handoff\.json/
  );
  assert.match(overrideContent, /Canonical native handoff/);
  assert.doesNotMatch(overrideContent, /Newer legacy handoff/);
  assert.match(overrideContent, /\.spectre\/features\/<feature-name>\//);
  assert.match(overrideContent, /\.spectre\/handoffs\/\{branch-name\}\//);
  assert.match(overrideContent, /docs\/tasks\/\*\*.*legacy compatibility/i);
  assert.equal(fs.readFileSync(featureSentinel, 'utf8'), 'feature sentinel bytes\n');
  assert.equal(fs.readFileSync(handoffSentinel, 'utf8'), 'handoff sentinel bytes\n');
});

test('native SessionStart does not fall back when canonical top-level history is malformed', async () => {
  const tmp = makeProject();
  const canonicalDir = path.join(tmp, '.spectre', 'handoffs', 'main');
  const legacyDir = path.join(tmp, 'docs', 'tasks', 'main', 'session_logs');
  fs.mkdirSync(canonicalDir, { recursive: true });
  fs.writeFileSync(
    path.join(canonicalDir, '2026-07-23-100000_handoff.json'),
    '{ malformed canonical'
  );
  writeSessionHandoff(
    legacyDir,
    '2026-07-23-120000_handoff.json',
    'Legacy must stay hidden'
  );
  fs.writeFileSync(
    path.join(tmp, 'AGENTS.override.md'),
    '<!-- spectre-session:start -->\nstale\n<!-- spectre-session:end -->\nuser bytes\n'
  );

  const { buildSessionStartOutput } = await import('./lib/project.js');
  const output = buildSessionStartOutput(tmp, { source: 'resume' });
  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');

  assert.doesNotMatch(output.systemMessage, /injected/);
  assert.doesNotMatch(overrideContent, /spectre-session:start/);
  assert.match(overrideContent, /user bytes/);
});

test('native SessionStart maps raw slashed, detached, and non-Git branch identities without aliases', async () => {
  const slashed = makeProject();
  execFileSync('git', ['checkout', '-b', 'feature/foo'], { cwd: slashed, stdio: 'ignore' });
  writeSessionHandoff(
    path.join(slashed, '.spectre', 'handoffs', 'feature', 'foo'),
    '2026-07-23-100000_handoff.json',
    'Native raw slash',
    'feature/foo'
  );
  writeSessionHandoff(
    path.join(slashed, '.spectre', 'handoffs', 'feature%2Ffoo'),
    '2026-07-23-120000_handoff.json',
    'Native encoded alias',
    'feature/foo'
  );

  const detached = makeProject();
  fs.writeFileSync(path.join(detached, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: detached, stdio: 'ignore' });
  execFileSync(
    'git',
    ['-c', 'user.email=test@example.test', '-c', 'user.name=Test', 'commit', '-m', 'fixture'],
    { cwd: detached, stdio: 'ignore' }
  );
  execFileSync('git', ['checkout', '--detach'], { cwd: detached, stdio: 'ignore' });
  writeSessionHandoff(
    path.join(detached, '.spectre', 'handoffs', 'HEAD'),
    '2026-07-23-100000_handoff.json',
    'Native detached HEAD',
    'HEAD'
  );

  const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-codex-nongit-test-'));
  writeSessionHandoff(
    path.join(nonGit, '.spectre', 'handoffs', 'unknown'),
    '2026-07-23-100000_handoff.json',
    'Native non-Git unknown',
    'unknown'
  );

  const { buildSessionStartOutput } = await import('./lib/project.js');
  const slashedOutput = buildSessionStartOutput(slashed, { source: 'resume' });
  const detachedOutput = buildSessionStartOutput(detached, { source: 'resume' });
  const nonGitOutput = buildSessionStartOutput(nonGit, { source: 'resume' });

  assert.match(slashedOutput.systemMessage, /\.spectre\/handoffs\/feature\/foo\//);
  assert.doesNotMatch(
    fs.readFileSync(path.join(slashed, 'AGENTS.override.md'), 'utf8'),
    /Native encoded alias/
  );
  assert.match(detachedOutput.systemMessage, /\.spectre\/handoffs\/HEAD\//);
  assert.match(nonGitOutput.systemMessage, /\.spectre\/handoffs\/unknown\//);
});

test('SessionStart writes the latest handoff and capability-only knowledge guidance', async () => {
  const tmp = makeSessionProject();
  const { buildSessionStartOutput } = await import('./lib/project.js');

  const output = buildSessionStartOutput(tmp, { source: 'resume' });
  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');

  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.systemMessage, /injected docs\/tasks\/main\/session_logs\/2026-03-09-100000_handoff\.json/);
  assert.match(output.systemMessage, /knowledge is applied automatically/);
  assert.match(output.systemMessage, /spectre knowledge search "<query>"/);
  assert.match(overrideContent, /<!-- spectre-session:start -->/);
  assert.match(overrideContent, /official SessionStart migration/);
  assert.match(overrideContent, /Wiring tests for the new SessionStart payload/);
  assert.match(overrideContent, /<!-- spectre-knowledge:start -->/);
  assert.doesNotMatch(overrideContent, /feature-auth\|feature\|auth, login/);
  assert.match(overrideContent, /knowledge is applied automatically/i);
  assert.match(overrideContent, /spectre knowledge search "<query>"/);
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

  assert.match(output.systemMessage, /knowledge is applied automatically/);
  assert.match(overrideContent, /User content before\./);
  assert.match(overrideContent, /User content after\./);
  assert.doesNotMatch(overrideContent, /spectre-session:start/);
  assert.match(overrideContent, /spectre-knowledge:start/);
  assert.match(overrideContent, /knowledge is applied automatically/i);
  assert.doesNotMatch(overrideContent, /\{\{REGISTRY\}\}/);
});

test('project install creates no native knowledge files or managed memory injection', async () => {
  const tmp = makeProject();
  const { installProjectFiles } = await import('./lib/project.js');

  installProjectFiles(tmp, 'project');

  assert.ok(fs.existsSync(path.join(tmp, '.spectre', 'manifest.json')));
  assert.ok(!fs.existsSync(path.join(tmp, '.agents', 'skills', 'spectre-recall', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(tmp, '.agents', 'skills', 'spectre-recall', 'references', 'registry.toon')));
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

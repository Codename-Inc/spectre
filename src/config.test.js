import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

function makeProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caspar-codex-test-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: tmp, stdio: 'ignore' });
  return tmp;
}

test('project install creates recall files without managed memory injection', async () => {
  const tmp = makeProject();
  const { installProjectFiles } = await import('./lib/project.js');

  installProjectFiles(tmp, 'project');

  assert.ok(fs.existsSync(path.join(tmp, '.caspar', 'manifest.json')));
  assert.ok(fs.existsSync(path.join(tmp, '.agents', 'skills', 'caspar-recall', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(tmp, '.agents', 'skills', 'caspar-recall', 'references', 'registry.toon')));
  assert.ok(!fs.existsSync(path.join(tmp, 'AGENTS.override.md')));
});

test('project install removes legacy managed override blocks', async () => {
  const tmp = makeProject();
  fs.writeFileSync(
    path.join(tmp, 'AGENTS.override.md'),
    [
      'User content before.',
      '',
      '<!-- caspar-session:start -->',
      'old session content',
      '<!-- caspar-session:end -->',
      '',
      '<!-- caspar-knowledge:start -->',
      'old knowledge content',
      '<!-- caspar-knowledge:end -->',
      '',
      'User content after.'
    ].join('\n')
  );

  const { installProjectFiles } = await import('./lib/project.js');
  installProjectFiles(tmp, 'project');

  const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');
  assert.match(overrideContent, /User content before\./);
  assert.match(overrideContent, /User content after\./);
  assert.doesNotMatch(overrideContent, /caspar-session:start/);
  assert.doesNotMatch(overrideContent, /caspar-knowledge:start/);
});

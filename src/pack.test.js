import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function exec(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function collectFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(root);
  return files;
}

test('packed npm artifact installs Codex assets from generated tree', { concurrency: false }, () => {
  const repoRoot = path.resolve('.');
  const packDir = makeTempDir('spectre-pack-');
  const projectDir = makeTempDir('spectre-pack-install-');

  try {
    const packOutput = exec('npm', ['pack', '--pack-destination', packDir], { cwd: repoRoot }).trim();
    const tarball = path.join(packDir, packOutput.split('\n').at(-1));

    exec('npm', ['init', '-y'], { cwd: projectDir });
    exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: projectDir });
    exec('git', ['init', '-b', 'main'], { cwd: projectDir });

    const env = { ...process.env };
    delete env.CODEX_HOME;

    const unscopedHelp = exec('npx', ['spectre', 'help'], {
      cwd: projectDir,
      env
    });
    assert.match(unscopedHelp, /spectre install codex/);

    exec('npx', ['@codename_inc/spectre', 'install', 'codex', '--scope', 'project', '--project-dir', projectDir], {
      cwd: projectDir,
      env
    });

    const codexHome = path.join(projectDir, '.codex');
    assert.ok(fs.existsSync(path.join(codexHome, 'skills', 'plan', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(codexHome, 'spectre', 'agents', 'dev.toml')));
    assert.ok(fs.existsSync(path.join(codexHome, 'spectre', 'hooks', 'scripts', 'load-knowledge.mjs')));
    assert.ok(!fs.existsSync(path.join(codexHome, 'spectre', 'hooks', 'session-start.mjs')));

    const hooksConfig = JSON.parse(fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf8'));
    assert.ok(hooksConfig.hooks.SessionStart.some(group =>
      Array.isArray(group.hooks) && group.hooks.some(hook => hook.command.includes('spectre/hooks/scripts/load-knowledge.mjs'))
    ));

    const runtimeFiles = collectFiles(path.join(codexHome, 'spectre'));
    for (const filePath of runtimeFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.doesNotMatch(content, /file:\/\//, `${filePath} should not contain package-cache file:// imports`);
      assert.doesNotMatch(content, new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${filePath} should not reference the repo checkout`);
    }
  } finally {
    fs.rmSync(packDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

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
  const packDir = makeTempDir('caspar-pack-');
  const projectDir = makeTempDir('caspar-pack-install-');

  try {
    const packOutput = exec('npm', ['pack', '--pack-destination', packDir], { cwd: repoRoot }).trim();
    const tarball = path.join(packDir, packOutput.split('\n').at(-1));

    exec('npm', ['init', '-y'], { cwd: projectDir });
    exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: projectDir });
    exec('git', ['init', '-b', 'main'], { cwd: projectDir });

    const env = { ...process.env };
    delete env.CODEX_HOME;

    const unscopedHelp = exec('npx', ['caspar', 'help'], {
      cwd: projectDir,
      env
    });
    assert.match(unscopedHelp, /caspar install codex/);

    exec('npx', ['@codename_inc/caspar', 'install', 'codex', '--scope', 'project', '--project-dir', projectDir], {
      cwd: projectDir,
      env
    });

    const codexHome = path.join(projectDir, '.codex');
    assert.ok(fs.existsSync(path.join(codexHome, 'skills', 'caspar-plan', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(codexHome, 'caspar', 'agents', 'dev.toml')));
    assert.ok(!fs.existsSync(path.join(codexHome, 'caspar', 'hooks', 'scripts', 'load-knowledge.mjs')));
    assert.ok(fs.existsSync(path.join(codexHome, 'caspar', 'hooks', 'scripts', 'register_learning.mjs')));
    assert.ok(!fs.existsSync(path.join(codexHome, 'caspar', 'hooks', 'session-start.mjs')));
    assert.ok(!fs.existsSync(path.join(codexHome, 'hooks.json')));

    const runtimeFiles = collectFiles(path.join(codexHome, 'caspar'));
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

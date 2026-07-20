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
  const homeDir = makeTempDir('spectre-pack-home-');
  const spectreHome = path.join(homeDir, '.spectre-isolated');
  const configuredCodexHome = path.join(homeDir, '.codex-isolated');

  try {
    const packOutput = exec('npm', ['pack', '--pack-destination', packDir], { cwd: repoRoot }).trim();
    const tarball = path.join(packDir, packOutput.split('\n').at(-1));

    exec('npm', ['init', '-y'], { cwd: projectDir });
    exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: projectDir });
    exec('git', ['init', '-b', 'main'], { cwd: projectDir });

    const env = {
      ...process.env,
      HOME: homeDir,
      CODEX_HOME: configuredCodexHome,
      SPECTRE_HOME: spectreHome,
    };

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
    const canonicalSkillsDir = path.join(repoRoot, 'plugins', 'spectre', 'skills');
    for (const entry of fs.readdirSync(canonicalSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const canonicalSkill = path.join(canonicalSkillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(canonicalSkill)) continue;
      assert.ok(
        fs.existsSync(path.join(codexHome, 'skills', entry.name, 'SKILL.md')),
        `packed install is missing workflow skill ${entry.name}`,
      );
    }
    assert.ok(!fs.existsSync(path.join(codexHome, 'skills', 'spectre-apply')));
    assert.ok(fs.existsSync(path.join(codexHome, 'spectre', 'agents', 'dev.toml')));
    const canonicalScriptsDir = path.join(repoRoot, 'plugins', 'spectre', 'hooks', 'scripts');
    const canonicalRuntimeFiles = collectFiles(canonicalScriptsDir)
      .filter((filePath) =>
        filePath.endsWith('.mjs') && !path.basename(filePath).startsWith('test_'));
    for (const canonicalRuntimeFile of canonicalRuntimeFiles) {
      const relativePath = path.relative(canonicalScriptsDir, canonicalRuntimeFile);
      assert.ok(
        fs.existsSync(path.join(codexHome, 'spectre', 'hooks', 'scripts', relativePath)),
        `packed install is missing runtime module ${relativePath}`,
      );
    }
    assert.ok(fs.existsSync(path.join(codexHome, 'spectre', 'hooks', 'hooks.json')));
    assert.ok(!fs.existsSync(path.join(codexHome, 'spectre', 'hooks', 'session-start.mjs')));
    const hooksConfig = JSON.parse(fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf8'));
    assert.deepEqual(
      hooksConfig.hooks.SessionStart.flatMap(group => group.hooks)
        .map(hook => path.basename(hook.command.match(/scripts\/([^/'"\s]+\.mjs)/)?.[1] || hook.command)),
      ['bootstrap.mjs', 'handoff-resume.mjs', 'load-knowledge.mjs']
    );
    assert.equal(hooksConfig.hooks.UserPromptSubmit.length, 1);
    assert.match(
      hooksConfig.hooks.UserPromptSubmit[0].hooks[0].command,
      /user-prompt-submit\.mjs' --host codex$/,
    );

    const installedPackage = path.join(
      projectDir,
      'node_modules',
      '@codename_inc',
      'spectre',
    );
    const canonicalPluginBin = path.join(repoRoot, 'plugins', 'spectre', 'bin');
    for (const cliName of fs.readdirSync(canonicalPluginBin)) {
      assert.ok(
        fs.existsSync(path.join(installedPackage, 'plugins', 'spectre', 'bin', cliName)),
        `tarball is missing plugin CLI ${cliName}`,
      );
    }
    const tarballPaths = collectFiles(installedPackage)
      .map((filePath) => path.relative(installedPackage, filePath));
    for (const retiredArtifact of [
      /(?:^|\/)spectre-apply(?:\/|$)/,
      /recall-template\.md$/,
      /registry\.toon$/,
    ]) {
      assert.equal(
        tarballPaths.some((relativePath) => retiredArtifact.test(relativePath)),
        false,
        `tarball contains retired artifact ${retiredArtifact}`,
      );
    }

    const runtimeFiles = collectFiles(path.join(codexHome, 'spectre'));
    for (const filePath of runtimeFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.doesNotMatch(content, /file:\/\//, `${filePath} should not contain package-cache file:// imports`);
      assert.doesNotMatch(content, new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${filePath} should not reference the repo checkout`);
    }
  } finally {
    fs.rmSync(packDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

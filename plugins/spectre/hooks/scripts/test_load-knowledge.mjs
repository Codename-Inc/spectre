#!/usr/bin/env node

/**
 * Tests for load-knowledge.mjs SessionStart hook.
 *
 * Run with: node --test plugins/spectre/hooks/scripts/test_load-knowledge.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.join(__dirname, 'load-knowledge.mjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-lk-'));
}

function createApplySkill(pluginDir) {
  const skillPath = path.join(pluginDir, 'skills', 'apply', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath,
    '---\nname: apply\n---\n\n# Apply Knowledge\n\n' +
    '## How to Find Skills\n\nScan available skills.\n\n' +
    '## Workflow\n\nDo things.\n'
  );
  return skillPath;
}

function createCodexApplySkill(codexHome) {
  const skillPath = path.join(codexHome, 'skills', 'apply', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath,
    '---\nname: apply\n---\n\n# Apply Knowledge\n\n' +
    '## How to Find Skills\n\nScan available skills.\n\n' +
    '## Workflow\n\nDo things.\n'
  );
  return skillPath;
}

function createRegistry(projectDir, entries, subdir) {
  subdir = subdir || 'spectre-recall';
  const registryPath = path.join(
    projectDir, '.claude', 'skills', subdir, 'references', 'registry.toon'
  );
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, entries);
  return registryPath;
}

function createManifest(projectDir) {
  const manifestPath = path.join(projectDir, '.spectre', 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, '{"version":1}\n');
  return manifestPath;
}

function runHook(opts) {
  opts = opts || {};
  const env = Object.assign({}, process.env);
  if (opts.pluginRoot) {
    env.CLAUDE_PLUGIN_ROOT = opts.pluginRoot;
  } else {
    delete env.CLAUDE_PLUGIN_ROOT;
  }
  if (opts.projectDir) {
    env.CLAUDE_PROJECT_DIR = opts.projectDir;
  } else {
    delete env.CLAUDE_PROJECT_DIR;
  }

  try {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
      env,
      cwd: opts.cwd || undefined,
      timeout: 10000,
      encoding: 'utf8'
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', exitCode: err.status };
  }
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('LoadKnowledge - Core behavior', () => {
  it('falls back to script-relative plugin root when no plugin root env is set', () => {
    const tmp = createTmpDir();
    try {
      const result = runHook({ pluginRoot: '', cwd: tmp });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout.trim());
      assert.match(output.systemMessage, /spectre: ready/);
      assert.deepEqual(output.hookSpecificOutput, { hookEventName: 'SessionStart' });
      assert.ok(!fs.existsSync(path.join(tmp, 'AGENTS.override.md')));
    } finally {
      cleanup(tmp);
    }
  });

  it('exits silently when apply skill missing', () => {
    const tmp = createTmpDir();
    try {
      const result = runHook({ pluginRoot: tmp, cwd: tmp });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout.trim(), '');
    } finally {
      cleanup(tmp);
    }
  });

  it('outputs ready message when no registry', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);
    createManifest(tmp);

    try {
      const result = runHook({ pluginRoot: pluginDir, cwd: tmp });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output.systemMessage.includes('ready'));
      assert.ok(output.systemMessage.includes('/spectre:learn'));
      assert.deepEqual(output.hookSpecificOutput, { hookEventName: 'SessionStart' });
      const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');
      assert.match(overrideContent, /<!-- spectre-knowledge:start -->/);
      assert.match(overrideContent, /# Apply Knowledge/);
      assert.doesNotMatch(overrideContent, /additionalContext/);
    } finally {
      cleanup(tmp);
    }
  });

  it('resolves apply skill from Codex home when hooks are under spectre runtime', () => {
    const tmp = createTmpDir();
    const codexHome = path.join(tmp, 'codex-home');
    const runtimeRoot = path.join(codexHome, 'spectre');
    fs.mkdirSync(path.join(runtimeRoot, 'hooks', 'scripts'), { recursive: true });
    createCodexApplySkill(codexHome);

    try {
      const result = runHook({ pluginRoot: runtimeRoot, cwd: tmp });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output.systemMessage.includes('ready'));
      assert.deepEqual(output.hookSpecificOutput, { hookEventName: 'SessionStart' });
      assert.ok(!fs.existsSync(path.join(tmp, 'AGENTS.override.md')));
    } finally {
      cleanup(tmp);
    }
  });

  it('outputs entry count when registry has entries', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);

    const projectDir = path.join(tmp, 'project');
    fs.mkdirSync(projectDir);
    createRegistry(projectDir,
      '# SPECTRE Knowledge Registry\n' +
      '# Format: skill-name|category|triggers|description\n\n' +
      'feature-auth|feature|auth, login|Auth system knowledge\n' +
      'gotcha-db|gotchas|database, query|DB gotchas\n'
    );

    try {
      const result = runHook({
        pluginRoot: pluginDir,
        projectDir: projectDir,
        cwd: tmp
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output.systemMessage.includes('2 knowledge skills'));
      assert.deepEqual(output.hookSpecificOutput, { hookEventName: 'SessionStart' });
      const overrideContent = fs.readFileSync(path.join(projectDir, 'AGENTS.override.md'), 'utf8');
      assert.match(overrideContent, /# Apply Knowledge/);
      assert.doesNotMatch(overrideContent, /feature-auth\|feature\|auth, login\|Auth system knowledge/);
    } finally {
      cleanup(tmp);
    }
  });

  it('uses CLAUDE_PROJECT_DIR over cwd', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);

    const projectDir = path.join(tmp, 'actual_project');
    fs.mkdirSync(projectDir);
    createRegistry(projectDir, '# Registry\n\nmy-skill|feature|test|Test skill\n');

    const cwdDir = path.join(tmp, 'wrong_dir');
    fs.mkdirSync(cwdDir);

    try {
      const result = runHook({
        pluginRoot: pluginDir,
        projectDir: projectDir,
        cwd: cwdDir
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output.systemMessage.includes('1 knowledge skills'));
    } finally {
      cleanup(tmp);
    }
  });

  it('falls back to cwd when no project dir env', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);

    createRegistry(tmp, '# Registry\n\ncwd-skill|feature|cwd|CWD skill\n');

    try {
      const result = runHook({
        pluginRoot: pluginDir,
        projectDir: '',
        cwd: tmp
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output.systemMessage.includes('1 knowledge skills'));
    } finally {
      cleanup(tmp);
    }
  });

  it('falls back to old registry path', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);

    const projectDir = path.join(tmp, 'project');
    fs.mkdirSync(projectDir);
    createRegistry(projectDir, '# Registry\n\nold-skill|feature|old|Old path skill\n', 'spectre-find');

    try {
      const result = runHook({
        pluginRoot: pluginDir,
        projectDir: projectDir,
        cwd: tmp
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output.systemMessage.includes('1 knowledge skills'));
    } finally {
      cleanup(tmp);
    }
  });

  it('writes spectre-knowledge block into AGENTS.override.md', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);
    createManifest(tmp);

    try {
      const result = runHook({ pluginRoot: pluginDir, cwd: tmp });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.deepEqual(output.hookSpecificOutput, { hookEventName: 'SessionStart' });
      const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');
      assert.match(overrideContent, /<!-- spectre-knowledge:start -->/);
      assert.match(overrideContent, /## SPECTRE Knowledge Context/);
      assert.match(overrideContent, /# Apply Knowledge/);
      assert.match(overrideContent, /<!-- spectre-knowledge:end -->/);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not append to unrelated AGENTS.override.md outside a Spectre project', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);
    fs.writeFileSync(path.join(tmp, 'AGENTS.override.md'), 'User-owned override content.\n');

    try {
      const result = runHook({ pluginRoot: pluginDir, cwd: tmp });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.deepEqual(output.hookSpecificOutput, { hookEventName: 'SessionStart' });
      assert.equal(
        fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8'),
        'User-owned override content.\n'
      );
    } finally {
      cleanup(tmp);
    }
  });

  it('registry content is NOT embedded in context', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);

    createRegistry(tmp, '# Registry\n\nembedded-skill|feature|embed|Embedded skill\n');

    try {
      const result = runHook({
        pluginRoot: pluginDir,
        projectDir: '',
        cwd: tmp
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.deepEqual(output.hookSpecificOutput, { hookEventName: 'SessionStart' });
      const overrideContent = fs.readFileSync(path.join(tmp, 'AGENTS.override.md'), 'utf8');
      assert.ok(!overrideContent.includes('embedded-skill|feature|embed|Embedded skill'),
        'Registry entries should not be embedded in context');
      assert.ok(overrideContent.includes('# Apply Knowledge'),
        'Scaffold content should still be present');
    } finally {
      cleanup(tmp);
    }
  });
});

describe('LoadKnowledge - Count registry entries', () => {
  it('ignores comments and blanks', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);

    createRegistry(tmp,
      '# Comment line\n# Another comment\n\n' +
      'real-skill|feature|test|Real skill\n' +
      '\n# Trailing comment\n'
    );

    try {
      const result = runHook({
        pluginRoot: pluginDir,
        projectDir: '',
        cwd: tmp
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output.systemMessage.includes('1 knowledge skills'));
    } finally {
      cleanup(tmp);
    }
  });
});

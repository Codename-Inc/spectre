#!/usr/bin/env node
'use strict';

/**
 * Tests for load-knowledge.cjs SessionStart hook.
 *
 * Run with: node --test plugins/spectre/hooks/scripts/test_load-knowledge.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, 'load-knowledge.cjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-lk-'));
}

function createApplySkill(pluginDir) {
  const skillPath = path.join(pluginDir, 'skills', 'spectre-apply', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath,
    '---\nname: spectre-apply\n---\n\n# Apply Knowledge\n\n' +
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
  it('exits silently when no plugin root', () => {
    const tmp = createTmpDir();
    try {
      const result = runHook({ pluginRoot: '', cwd: tmp });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout.trim(), '');
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

    try {
      const result = runHook({ pluginRoot: pluginDir, cwd: tmp });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output.systemMessage.includes('ready'));
      assert.ok(output.systemMessage.includes('/spectre:learn'));
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

  it('output contains spectre-knowledge tag', () => {
    const tmp = createTmpDir();
    const pluginDir = path.join(tmp, 'plugin');
    fs.mkdirSync(pluginDir);
    createApplySkill(pluginDir);

    try {
      const result = runHook({ pluginRoot: pluginDir, cwd: tmp });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      const context = output.hookSpecificOutput.additionalContext;
      assert.ok(context.startsWith('<spectre-knowledge>'));
      assert.ok(context.endsWith('</spectre-knowledge>'));
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
      const context = output.hookSpecificOutput.additionalContext;
      assert.ok(!context.includes('embedded-skill|feature|embed|Embedded skill'),
        'Registry entries should not be embedded in context');
      assert.ok(context.includes('# Apply Knowledge'),
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

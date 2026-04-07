#!/usr/bin/env node
'use strict';

/**
 * Tests for register_learning.cjs
 *
 * Run with: node --test plugins/spectre/hooks/scripts/test_register-learning.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, 'register_learning.cjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-rl-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runScript(args, opts) {
  opts = opts || {};
  const env = Object.assign({}, process.env);
  if (opts.pluginRoot) {
    env.CLAUDE_PLUGIN_ROOT = opts.pluginRoot;
  } else {
    delete env.CLAUDE_PLUGIN_ROOT;
  }

  try {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH, ...args], {
      env,
      timeout: 10000,
      encoding: 'utf8'
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status };
  }
}

describe('register_learning', () => {
  it('creates new registry with entry', () => {
    const tmp = createTmpDir();
    try {
      const result = runScript([
        '--project-root', tmp,
        '--skill-name', 'feature-auth',
        '--category', 'feature',
        '--triggers', 'auth, login',
        '--description', 'Use when working on authentication'
      ]);

      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.includes('Registered:'));

      const registryPath = path.join(tmp, '.claude', 'skills', 'spectre-recall', 'references', 'registry.toon');
      assert.ok(fs.existsSync(registryPath));

      const content = fs.readFileSync(registryPath, 'utf8');
      assert.ok(content.includes('# SPECTRE Knowledge Registry'));
      assert.ok(content.includes('feature-auth|feature|auth, login|Use when working on authentication'));
    } finally {
      cleanup(tmp);
    }
  });

  it('updates existing entry by skill name', () => {
    const tmp = createTmpDir();
    try {
      // First registration
      runScript([
        '--project-root', tmp,
        '--skill-name', 'feature-auth',
        '--category', 'feature',
        '--triggers', 'auth',
        '--description', 'Old description'
      ]);

      // Second registration with same skill name
      runScript([
        '--project-root', tmp,
        '--skill-name', 'feature-auth',
        '--category', 'feature',
        '--triggers', 'auth, login, oauth',
        '--description', 'Updated description'
      ]);

      const registryPath = path.join(tmp, '.claude', 'skills', 'spectre-recall', 'references', 'registry.toon');
      const content = fs.readFileSync(registryPath, 'utf8');

      // Should have the updated entry, not the old one
      assert.ok(content.includes('Updated description'));
      assert.ok(!content.includes('Old description'));

      // Should only have one entry for feature-auth
      const entries = content.split('\n').filter(l => l.startsWith('feature-auth|'));
      assert.equal(entries.length, 1);
    } finally {
      cleanup(tmp);
    }
  });

  it('generates recall skill with template', () => {
    const tmp = createTmpDir();
    const pluginRoot = path.join(tmp, 'plugin');

    // Create template
    const templateDir = path.join(pluginRoot, 'skills', 'spectre-learn', 'references');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(
      path.join(templateDir, 'recall-template.md'),
      '# Recall Skill\n\nRegistry:\n{{REGISTRY}}\n\nEnd.\n'
    );

    try {
      runScript([
        '--project-root', tmp,
        '--skill-name', 'feature-test',
        '--category', 'feature',
        '--triggers', 'test',
        '--description', 'Test skill'
      ], { pluginRoot });

      const skillPath = path.join(tmp, '.claude', 'skills', 'spectre-recall', 'SKILL.md');
      assert.ok(fs.existsSync(skillPath));

      const content = fs.readFileSync(skillPath, 'utf8');
      assert.ok(content.includes('# Recall Skill'));
      assert.ok(content.includes('feature-test|feature|test|Test skill'));
    } finally {
      cleanup(tmp);
    }
  });

  it('fails with missing required arguments', () => {
    const result = runScript(['--project-root', '/tmp/fake']);
    assert.notEqual(result.exitCode, 0);
  });
});

describe('register_learning - trigger migration', () => {
  it('injects TRIGGER into single-line description', () => {
    const tmp = createTmpDir();
    try {
      const skillDir = path.join(tmp, '.claude', 'skills', 'feature-auth');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'),
        '---\nname: feature-auth\ndescription: Use when working on authentication\nuser-invocable: false\n---\n\n# Auth Knowledge\n'
      );

      runScript([
        '--project-root', tmp,
        '--skill-name', 'feature-auth',
        '--category', 'feature',
        '--triggers', 'auth, login',
        '--description', 'Use when working on authentication'
      ]);

      const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      assert.ok(content.includes('description: Use when working on authentication TRIGGER when: auth, login'),
        'Should be single-line with description and trigger');
      assert.ok(!content.includes('description: |'), 'Should NOT use block scalar');
      assert.ok(content.includes('# Auth Knowledge'), 'Body should be preserved');
    } finally {
      cleanup(tmp);
    }
  });

  it('injects TRIGGER into block scalar description', () => {
    const tmp = createTmpDir();
    try {
      const skillDir = path.join(tmp, '.claude', 'skills', 'feature-release');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'),
        '---\nname: feature-release\ndescription: |\n  Use when releasing the plugin or bumping versions.\nuser-invocable: true\n---\n\n# Release\n'
      );

      runScript([
        '--project-root', tmp,
        '--skill-name', 'feature-release',
        '--category', 'procedures',
        '--triggers', 'release, version',
        '--description', 'Use when releasing the plugin or bumping versions.'
      ]);

      const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      assert.ok(content.includes('description: Use when releasing the plugin or bumping versions. TRIGGER when: release, version'),
        'Should collapse block scalar to single-line with trigger');
      assert.ok(!content.includes('description: |'), 'Block scalar should be removed');
      assert.ok(content.includes('# Release'), 'Body should be preserved');
    } finally {
      cleanup(tmp);
    }
  });

  it('trigger injection is idempotent', () => {
    const tmp = createTmpDir();
    try {
      const skillDir = path.join(tmp, '.claude', 'skills', 'feature-auth');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'),
        '---\nname: feature-auth\ndescription: Use when working on authentication\nuser-invocable: false\n---\n\n# Auth\n'
      );

      const args = [
        '--project-root', tmp,
        '--skill-name', 'feature-auth',
        '--category', 'feature',
        '--triggers', 'auth, login',
        '--description', 'Use when working on authentication'
      ];

      runScript(args);
      runScript(args);

      const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      const matches = content.match(/TRIGGER when:/g);
      assert.equal(matches.length, 1, 'Should have exactly one TRIGGER line');
    } finally {
      cleanup(tmp);
    }
  });

  it('skips missing skill files gracefully', () => {
    const tmp = createTmpDir();
    try {
      // Register a skill with no SKILL.md on disk
      const result = runScript([
        '--project-root', tmp,
        '--skill-name', 'feature-missing',
        '--category', 'feature',
        '--triggers', 'missing',
        '--description', 'Nonexistent skill'
      ]);

      assert.equal(result.exitCode, 0, 'Should not error on missing skill files');
    } finally {
      cleanup(tmp);
    }
  });

  it('migrates all registry entries on any registration', () => {
    const tmp = createTmpDir();
    try {
      // Create two existing skills without triggers
      for (const name of ['feature-alpha', 'feature-beta']) {
        const dir = path.join(tmp, '.claude', 'skills', name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'),
          `---\nname: ${name}\ndescription: Use when working on ${name}\n---\n\n# ${name}\n`
        );
      }

      // Seed registry with alpha
      const registryDir = path.join(tmp, '.claude', 'skills', 'spectre-recall', 'references');
      fs.mkdirSync(registryDir, { recursive: true });
      fs.writeFileSync(path.join(registryDir, 'registry.toon'),
        '# SPECTRE Knowledge Registry\n# Format: skill-name|category|triggers|description\n\n' +
        'feature-alpha|feature|alpha, first|Use when working on feature-alpha\n' +
        'feature-beta|feature|beta, second|Use when working on feature-beta\n'
      );

      // Register a third skill — should trigger migration of alpha and beta too
      const gammaDir = path.join(tmp, '.claude', 'skills', 'feature-gamma');
      fs.mkdirSync(gammaDir, { recursive: true });
      fs.writeFileSync(path.join(gammaDir, 'SKILL.md'),
        '---\nname: feature-gamma\ndescription: Use when working on gamma\n---\n\n# Gamma\n'
      );

      runScript([
        '--project-root', tmp,
        '--skill-name', 'feature-gamma',
        '--category', 'feature',
        '--triggers', 'gamma, third',
        '--description', 'Use when working on gamma'
      ]);

      // All three should now have triggers
      for (const [name, triggers] of [
        ['feature-alpha', 'alpha, first'],
        ['feature-beta', 'beta, second'],
        ['feature-gamma', 'gamma, third']
      ]) {
        const content = fs.readFileSync(
          path.join(tmp, '.claude', 'skills', name, 'SKILL.md'), 'utf8'
        );
        assert.ok(content.includes(`TRIGGER when: ${triggers}`),
          `${name} should have triggers: ${triggers}`);
      }
    } finally {
      cleanup(tmp);
    }
  });
});

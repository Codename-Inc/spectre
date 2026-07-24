#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { cleanupStalePaths, STALE_PATHS } from './bootstrap.mjs';
import { readStdinWithTimeout, STDIN_TIMEOUT } from './lib.mjs';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-bootstrap-test-'));
}

describe('bootstrap', () => {
  it('imports shared hook helpers through ESM', () => {
    assert.strictEqual(STDIN_TIMEOUT, 2000);
    assert.strictEqual(typeof readStdinWithTimeout, 'function');
  });

  it('STALE_PATHS is a non-empty array', () => {
    assert.ok(Array.isArray(STALE_PATHS));
    assert.ok(STALE_PATHS.length > 0);
  });

  it('removes stale files that exist', () => {
    const tmpDir = createTempDir();
    try {
      // Create a fake stale file
      const scriptsDir = path.join(tmpDir, 'hooks', 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      const staleFile = path.join(scriptsDir, 'capture-todos.py');
      fs.writeFileSync(staleFile, '# old python script');

      const removed = cleanupStalePaths(tmpDir);

      assert.ok(removed >= 1, `Expected at least 1 removal, got ${removed}`);
      assert.ok(!fs.existsSync(staleFile), 'Stale file should be deleted');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('removes stale directories that exist', () => {
    const tmpDir = createTempDir();
    try {
      const staleDirs = [
        'spectre-next-steps',
        'spectre-guide',
        'spectre-evaluate',
        'spectre-architecture_review'
      ].map(name => path.join(tmpDir, 'skills', name));
      for (const staleDir of staleDirs) {
        fs.mkdirSync(staleDir, { recursive: true });
        fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '# old skill');
      }

      const removed = cleanupStalePaths(tmpDir);

      assert.strictEqual(removed, staleDirs.length);
      for (const staleDir of staleDirs) {
        assert.ok(!fs.existsSync(staleDir), `${path.basename(staleDir)} should be deleted`);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns 0 when no stale files exist', () => {
    const tmpDir = createTempDir();
    try {
      const removed = cleanupStalePaths(tmpDir);
      assert.strictEqual(removed, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles mixed: some files exist, some do not', () => {
    const tmpDir = createTempDir();
    try {
      // Only create 2 of the stale files
      const scriptsDir = path.join(tmpDir, 'hooks', 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(scriptsDir, 'handoff-resume.py'), '# old');
      fs.writeFileSync(path.join(scriptsDir, 'load-knowledge.py'), '# old');

      const removed = cleanupStalePaths(tmpDir);

      assert.strictEqual(removed, 2);
      assert.ok(!fs.existsSync(path.join(scriptsDir, 'handoff-resume.py')));
      assert.ok(!fs.existsSync(path.join(scriptsDir, 'load-knowledge.py')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

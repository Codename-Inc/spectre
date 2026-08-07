#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const PLUGIN_ROOT = path.join(REPOSITORY_ROOT, 'plugins', 'spectre');
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
}

describe('retired prompt-time knowledge delivery', () => {
  it('ships only the canonical SessionStart knowledge hook and no prompt runtime', () => {
    const hooks = JSON.parse(read('plugins/spectre/hooks/hooks.json'));
    assert.deepEqual(Object.keys(hooks.hooks), ['SessionStart']);
    assert.equal(
      fs.existsSync(path.join(PLUGIN_ROOT, 'hooks', 'scripts', 'user-prompt-submit.mjs')),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(PLUGIN_ROOT, 'hooks', 'scripts', 'knowledge', 'matcher.mjs')),
      false,
    );
    assert.doesNotMatch(JSON.stringify(hooks), /UserPromptSubmit|user-prompt-submit/);
  });

  it('keeps registry budgeting but removes the registration-time prompt-body gate', () => {
    const registration = read('plugins/spectre/hooks/scripts/knowledge/registration.mjs');
    const registry = read('plugins/spectre/hooks/scripts/knowledge/registry.mjs');
    assert.doesNotMatch(registration, /measurePayload|validatePayloadSafe|KNOWLEDGE_PAYLOAD_UNSAFE/);
    assert.match(registry, /measurePayload/);
    assert.equal(
      fs.existsSync(path.join(PLUGIN_ROOT, 'hooks', 'scripts', 'knowledge', 'payload.mjs')),
      true,
    );
  });
});

describe('retired active recall surface', () => {
  it('removes the canonical skill and expected-skill entry', () => {
    assert.equal(
      fs.existsSync(path.join(PLUGIN_ROOT, 'skills', 'spectre-recall', 'SKILL.md')),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(
        PLUGIN_ROOT,
        'skills',
        'spectre-recall',
        'scripts',
        'search-knowledge.mjs',
      )),
      false,
    );
    const expected = read('.agents/skills/verify-spectre/references/expected-skills.txt')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    assert.equal(expected.includes('spectre-recall'), false);
  });

  it('rewrites retained Codex knowledge commands to the neutral bundled CLI', () => {
    const translators = [
      read('scripts/translators/skills.cjs'),
      read('scripts/translators/hooks.cjs'),
    ].join('\n');
    assert.doesNotMatch(translators, /spectre-recall|skills\/spectre-recall/);
    const skills = require(path.join(REPOSITORY_ROOT, 'scripts', 'translators', 'skills.cjs'));
    const hooks = require(path.join(REPOSITORY_ROOT, 'scripts', 'translators', 'hooks.cjs'));
    for (const command of ['search', 'load', 'register', 'migrate']) {
      const canonical = `spectre knowledge ${command}`;
      assert.match(
        skills.rewriteTextForCodex(canonical),
        new RegExp(`knowledge-cli\\.mjs["']? ${command}`),
      );
      assert.match(
        hooks.rewriteRuntimeScript(canonical),
        new RegExp(`knowledge-cli\\.mjs["']? ${command}`),
      );
    }
  });

  it('updates package and structural verification expectations to the replacement surface', () => {
    const packTest = read('src/pack.test.js');
    const structureGate = read('.agents/skills/verify-spectre/scripts/gate1_structure.mjs');
    assert.match(packTest, /hooks\/scripts\/knowledge-cli\.mjs/);
    assert.doesNotMatch(packTest, /skills\/spectre-recall|user-prompt-submit/);
    assert.match(packTest, /'UserPromptSubmit' in hooksConfig\.hooks, false/);
    assert.match(structureGate, /UserPromptSubmit/);
    assert.match(structureGate, /user-prompt-submit\.mjs/);
    assert.match(structureGate, /spectre-recall/);
  });
});

describe('legacy recall compatibility remains migration-only', () => {
  it('preserves both legacy registry roots and the conservative oversized classification', () => {
    const migration = read('plugins/spectre/hooks/scripts/knowledge/migration.mjs');
    assert.match(migration, /nativeRoot: '\.claude', recallName: 'spectre-recall'/);
    assert.match(migration, /nativeRoot: '\.agents', recallName: 'spectre-recall'/);
    assert.match(
      migration,
      /exceedsPromptBudget\s*&&\s*!normalized\.legacySpectreLearning/,
    );
  });
});

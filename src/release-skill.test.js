import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RELEASE_SKILL = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.agents',
  'skills',
  'release',
  'SKILL.md',
);

test('local release executes and verifies persistent Codex and Claude installs', () => {
  const skill = fs.readFileSync(RELEASE_SKILL, 'utf8');
  const localMode = skill.slice(
    skill.indexOf('## Persistent Local Install Refresh'),
    skill.indexOf('## Public Mode'),
  );

  const requiredInOrder = [
    'codex plugin marketplace list --json',
    'codex plugin marketplace add "$PWD"',
    'codex plugin remove spectre@spectre',
    'codex plugin add spectre@spectre',
    'codex plugin list --json',
    'diff -qr "$PWD/plugins/spectre-codex" "$codex_install_path"',
    'ensure-codex-agents.mjs" --ensure --json',
    'diff -q "$agent" "${CODEX_HOME:-$HOME/.codex}/agents/$(basename "$agent")"',
    'node bin/spectre.js doctor codex --scope user --project-dir "$PWD"',
    'claude plugin marketplace update spectre',
    'claude plugin uninstall spectre@spectre --scope user --keep-data --yes',
    'claude plugin install spectre@spectre --scope user',
    'claude plugin list --json',
    'diff -qr "$PWD/plugins/spectre" "$spectre_install_path"',
  ];
  let previousIndex = -1;
  for (const command of requiredInOrder) {
    const commandIndex = localMode.indexOf(command);
    assert.notEqual(commandIndex, -1, `release skill must include: ${command}`);
    assert.equal(
      commandIndex > previousIndex,
      true,
      `release command must follow prior verification step: ${command}`,
    );
    previousIndex = commandIndex;
  }

  assert.match(
    localMode,
    /These commands are deployment actions, not a handoff for the user to finish\./,
  );
  assert.match(
    localMode,
    /Complete Persistent Local Install Refresh for both Codex and Claude Code\./,
  );
  assert.match(localMode, /exactly one enabled user-scope `spectre@spectre` entry/);
  assert.match(localMode, /installed plugin cache contains the current checkout bytes/);
  assert.match(localMode, /managed-agent comparison/);
  assert.match(localMode, /Codex only upgrades Git marketplaces and reads directory marketplaces directly/);
  assert.doesNotMatch(localMode, /codex plugin marketplace upgrade spectre/);
  assert.match(localMode, /If it is not installed, install it directly/);
  assert.match(localMode, /print the exact Codex and Claude Code commands executed/);
});

test('release command record prints only the Codex install branch that ran', () => {
  const skill = fs.readFileSync(RELEASE_SKILL, 'utf8');
  const finalRecord = skill.slice(skill.indexOf('## Final Command Record'));

  assert.match(finalRecord, /Always print the exact command branch executed/);
  assert.match(finalRecord, /Do not print both the one-time and refresh branches unless both were actually executed/);
  assert.match(finalRecord, /Codex, one-time persistent user-level native plugin install/);
  assert.match(finalRecord, /Codex, refresh an existing persistent user-level install/);
  assert.match(finalRecord, /codex plugin add spectre@spectre/);
  assert.match(finalRecord, /codex plugin remove spectre@spectre/);
  assert.match(finalRecord, /Then restart an existing Codex session/);
});

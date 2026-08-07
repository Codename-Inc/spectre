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
const RELEASE_GATE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.agents',
  'skills',
  'verify-spectre',
  'scripts',
  'gate5_release.mjs',
);

function section(skill, start, end) {
  return skill.slice(skill.indexOf(start), skill.indexOf(end));
}

function assertInOrder(text, expected) {
  let previousIndex = -1;
  for (const value of expected) {
    const valueIndex = text.indexOf(value, previousIndex + 1);
    assert.notEqual(valueIndex, -1, `release skill must include: ${value}`);
    assert.equal(
      valueIndex > previousIndex,
      true,
      `release command must follow its prior step: ${value}`,
    );
    previousIndex = valueIndex;
  }
}

test('release exposes explicit non-publishing local and public activation modes', () => {
  const skill = fs.readFileSync(RELEASE_SKILL, 'utf8');
  const argumentsContract = section(skill, '## Arguments', '## Shared Preflight');
  const activationMode = section(skill, '## Activation Mode', '## Local Mode');

  assert.match(argumentsContract, /^activate local$/m);
  assert.match(argumentsContract, /^activate public$/m);
  assert.match(argumentsContract, /`local` is the backward-compatible alias for `activate local`/);
  assert.match(argumentsContract, /`activate public` switches installed sources but does not publish/);
  assert.match(argumentsContract, /`public <version>` publishes a release/);
  assert.match(activationMode, /Neither activation mode bumps versions, commits, pushes, tags, creates a GitHub release, or publishes npm/);
  assert.match(activationMode, /normalized marketplace source/);
  assert.match(activationMode, /byte-comparison result/);
  assert.match(activationMode, /exact mutation commands actually executed/);
});

test('local activation replaces a conflicting public source and verifies checkout bytes', () => {
  const skill = fs.readFileSync(RELEASE_SKILL, 'utf8');
  const localMode = section(
    skill,
    '## Persistent Local Source Activation',
    '## Persistent Public Source Activation',
  );

  assertInOrder(localMode, [
    'codex plugin marketplace list --json',
    'codex plugin list --json',
    'claude plugin marketplace list --json',
    'claude plugin list --json',
    'codex plugin marketplace add "$PWD"',
  ]);
  assertInOrder(localMode, [
    'codex plugin remove spectre@spectre',
    'codex plugin marketplace remove spectre',
    'codex plugin marketplace add "$PWD"',
  ]);
  assertInOrder(localMode, [
    'claude plugin uninstall spectre@spectre --scope user --keep-data --yes',
    'claude plugin marketplace remove spectre --scope user',
    'claude plugin marketplace add "$PWD" --scope user',
  ]);

  const requiredVerification = [
    'marketplaceSource.sourceType == "local"',
    'source whose real path is `$PWD`',
    'diff -qr "$PWD/plugins/spectre-codex" "$codex_install_path"',
    'ensure-codex-agents.mjs" --ensure --json',
    'diff -q "$agent" "${CODEX_HOME:-$HOME/.codex}/agents/$(basename "$agent")"',
    'node bin/spectre.js doctor codex --scope user --project-dir "$PWD"',
    'claude plugin marketplace update spectre',
    'claude plugin install spectre@spectre --scope user',
    'source == "directory"',
    'no project/local-scope Spectre install',
    'diff -qr "$PWD/plugins/spectre" "$spectre_install_path"',
  ];
  for (const value of requiredVerification) {
    assert.match(localMode, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(
    localMode,
    /These commands are deployment actions, not a handoff for the user to finish\./,
  );
  assert.match(localMode, /exactly one enabled user-scope `spectre@spectre` entry/);
  assert.match(localMode, /installed plugin cache contains the current checkout bytes/);
  assert.match(localMode, /managed-agent comparison/);
  assert.match(localMode, /alternatives, not side-by-side installs/);
  assert.match(localMode, /Codex only upgrades Git marketplaces and reads local marketplaces directly/);
  assert.doesNotMatch(localMode, /codex plugin marketplace upgrade spectre/);
  assert.match(localMode, /If it is not installed, install it directly/);
  assert.doesNotMatch(localMode, /claude plugin marketplace remove spectre\n/);
});

test('public activation replaces a local source and proves the fetched source is active', () => {
  const skill = fs.readFileSync(RELEASE_SKILL, 'utf8');
  const publicActivation = section(
    skill,
    '## Persistent Public Source Activation',
    '## Activation Mode',
  );

  assertInOrder(publicActivation, [
    'codex plugin remove spectre@spectre',
    'codex plugin marketplace remove spectre',
    'codex plugin marketplace add joenandez/spectre',
  ]);
  assertInOrder(publicActivation, [
    'claude plugin uninstall spectre@spectre --scope user --keep-data --yes',
    'claude plugin marketplace remove spectre --scope user',
    'claude plugin marketplace add joenandez/spectre --scope user',
  ]);
  assert.match(publicActivation, /codex plugin marketplace upgrade spectre/);
  assert.match(publicActivation, /claude plugin marketplace update spectre/);
  assert.match(publicActivation, /marketplaceSource\.sourceType == "git"/);
  assert.match(publicActivation, /https:\/\/github\.com\/joenandez\/spectre\.git/);
  assert.match(publicActivation, /source == "github"/);
  assert.match(publicActivation, /repo == "joenandez\/spectre"/);
  assert.match(publicActivation, /\.agents\/plugins\/marketplace\.json/);
  assert.match(publicActivation, /\.claude-plugin\/marketplace\.json/);
  assert.match(publicActivation, /run `diff -qr` between the resolved marketplace plugin root and installed plugin root/);
  assert.match(publicActivation, /run `diff -qr` between the resolved marketplace plugin root and `installPath`/);
  assert.match(publicActivation, /ensure-codex-agents\.mjs --ensure --json/);
  assert.doesNotMatch(publicActivation, /claude plugin marketplace remove spectre\n/);
});

test('release command record prints only the source branch that ran', () => {
  const skill = fs.readFileSync(RELEASE_SKILL, 'utf8');
  const finalRecord = skill.slice(skill.indexOf('## Final Command Record'));

  assert.match(finalRecord, /Always print the exact mutation command branch executed/);
  assert.match(finalRecord, /Do not print templates or branches that did not run/);
  assert.match(finalRecord, /Codex, one-time persistent user-level native plugin install/);
  assert.match(finalRecord, /Codex, refresh an existing persistent user-level install/);
  assert.match(finalRecord, /Codex, switch an existing public source to this checkout/);
  assert.match(finalRecord, /Codex, one-time install from the public marketplace/);
  assert.match(finalRecord, /Codex, switch this checkout or another source to the public marketplace/);
  assert.match(finalRecord, /Claude Code, one-time user-level install from the public marketplace/);
  assert.match(finalRecord, /Claude Code, switch this checkout or another user source to the public marketplace/);
  assert.match(finalRecord, /codex plugin add spectre@spectre/);
  assert.match(finalRecord, /codex plugin remove spectre@spectre/);
  assert.match(finalRecord, /codex plugin marketplace remove spectre/);
  assert.match(finalRecord, /claude plugin marketplace remove spectre --scope user/);
  assert.match(finalRecord, /Then restart an existing Codex session/);
});

test('public release uses GitHub marketplaces without npm publication', () => {
  const skill = fs.readFileSync(RELEASE_SKILL, 'utf8');
  const publicMode = skill.slice(skill.indexOf('## Public Mode'));
  const gate = fs.readFileSync(RELEASE_GATE, 'utf8');

  assert.match(publicMode, /GitHub for the Claude Code and Codex marketplaces/);
  assert.match(publicMode, /gh release create/);
  assert.match(publicMode, /git ls-remote --exit-code origin refs\/tags\/vX\.Y\.Z/);
  assert.match(publicMode, /gh release view vX\.Y\.Z/);
  assert.doesNotMatch(publicMode, /npm (?:login|publish|view|whoami)|npx --yes/);

  assert.match(gate, /run\('gh', \['auth', 'status'\]\)/);
  assert.doesNotMatch(gate, /npm.*(?:whoami|publish|login)/);
});

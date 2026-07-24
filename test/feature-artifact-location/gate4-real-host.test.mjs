import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = join(import.meta.dirname, '..', '..');
const gate4 = readFileSync(
  join(projectRoot, '.claude', 'skills', 'verify-spectre', 'scripts', 'gate4_cli.mjs'),
  'utf8',
);
const scopeSkill = readFileSync(
  join(projectRoot, 'plugins', 'spectre', 'skills', 'spectre-scope', 'SKILL.md'),
  'utf8',
);

test('Gate 4 drives the plugin-hosted creator happy and collision journeys', () => {
  assert.match(gate4, /--plugin-dir[\s\S]*PLUGIN/);
  assert.match(gate4, /feature creator accepts the proposed name without a second naming prompt/);
  assert.match(gate4, /explicit re-scope preserves the existing scope bytes/);
  assert.match(gate4, /occupied proposal remains untouched while a free suffixed root proceeds/);
  assert.match(gate4, /standalone create-plan derives a feature root and writes without a naming gate/);
  assert.match(gate4, /plugin-hosted creator initializes the nested local-state ignore policy/);
  assert.match(gate4, /plugin-hosted creator keeps feature records trackable and local state ignored/);
  assert.match(gate4, /plugin-hosted creator preserves a blanket root ignore byte-for-byte/);
  assert.match(gate4, /plugin-hosted creator warns that blanket-ignored feature records are local-only/);
  assert.match(gate4, /creator-blanket-ignore/);
  assert.match(gate4, /repository_head/);
  assert.match(gate4, /tested_source_hashes/);
});

test('Gate 4 drives renamed-root and legacy-execution safety journeys', () => {
  assert.match(gate4, /nested artifact alone resolves the renamed physical feature root/);
  assert.match(gate4, /touched nested artifact metadata is repaired before the new write/);
  assert.match(gate4, /legacy execution mutates only status fields in the supplied task artifact/);
  assert.match(gate4, /every new feature document is written beneath the confirmed canonical root/);
  assert.match(gate4, /new canonical output records the explicit legacy source/);
  assert.match(gate4, /SPECTRE_GATE4_EVIDENCE_DIR/);
});

test('Gate 4 drives a raw-branch handoff and todo-history journey', () => {
  assert.match(gate4, /plugin-hosted handoff uses the raw nested branch path/);
  assert.match(gate4, /plugin-hosted handoff continues legacy numbering/);
  assert.match(gate4, /plugin-hosted todo snapshots write only to the canonical handoff root/);
  assert.match(gate4, /handoff-execution/);
});

test('scope requires self-location metadata on its first canonical artifact', () => {
  assert.match(
    scopeSkill,
    /concepts\/scope\.md[^\n]*immediately below the title[^\n]*Feature: <feature-name>[^\n]*Feature Root: \.spectre\/features\/<feature-name>/i,
  );
});

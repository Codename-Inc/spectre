import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_SKILL = path.join(
  REPO_ROOT,
  'plugins',
  'spectre',
  'skills',
  'spectre-prototype',
  'SKILL.md',
);
const CODEX_SKILL = path.join(
  REPO_ROOT,
  'plugins',
  'spectre-codex',
  'skills',
  'spectre-prototype',
  'SKILL.md',
);

for (const [runtime, skillPath] of [
  ['canonical', CANONICAL_SKILL],
  ['Codex', CODEX_SKILL],
]) {
  test(`${runtime} prototype skill keeps implementation with the primary agent`, () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    assert.match(skill, /primary-agent-only HTML implementation and validation/);
    assert.match(skill, /\*\*Implement directly \(primary agent only\)\.\*\*/);
    assert.match(
      skill,
      /Subagents may provide findings only; they must not write or edit the prototype\./,
    );
    assert.match(
      skill,
      /The primary agent directly authored and validated the HTML; no subagent created or modified the prototype\./,
    );
    assert.doesNotMatch(skill, /Use `@(?:spectre:)?dev` \(or inline if trivial\)/);
  });
}

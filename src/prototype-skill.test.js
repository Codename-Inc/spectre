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

    assert.match(skill, /The primary owns it; agents provide evidence only\./);
    assert.match(skill, /each returns ≤2,000 tokens in-thread and writes no files/);
    assert.match(skill, /the primary alone creates, edits, and validates the HTML/);
    assert.match(skill, /not even `@spectre(?::|_)dev` modifies it/);
    assert.match(skill, /the primary authored and validated the file/);
    assert.doesNotMatch(skill, /Use `@(?:spectre:)?dev` \(or inline if trivial\)/);
  });

  test(`${runtime} prototype skill uses optional product and design context without a size ceiling`, () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    assert.match(skill, /repo-root `product\.md` when present/);
    assert.match(skill, /`design\.md` or fallback `design\/design\.md`/);
    assert.match(skill, /do not mention missing files/);
    assert.doesNotMatch(skill, /(?:under |<)300KB/);
  });
}

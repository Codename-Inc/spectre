import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const LEARN_PATH = path.join(PLUGIN_ROOT, 'skills', 'spectre-learn', 'SKILL.md');
const RECALL_PATH = path.join(PLUGIN_ROOT, 'skills', 'spectre-recall', 'SKILL.md');
const TEMPLATE_PATH = path.join(
  PLUGIN_ROOT,
  'skills',
  'spectre-learn',
  'references',
  'recall-template.md',
);
const RETIRED_PATTERNS = [
  /\.claude\/skills/,
  /\.agents\/skills/,
  /\bregistry\b/i,
  /\{\{REGISTRY\}\}/,
  /\{\{[^}]+\}\}/,
  /recall-template/,
  /generated recall/i,
  /on-demand Skill/i,
  /inject(?:s|ed|ing)?\s+TRIGGER when:/i,
];

function readSkill(skillPath) {
  return fs.readFileSync(skillPath, 'utf8');
}

function canonicalExample(content) {
  const match = content.match(
    /^\s*<!-- canonical-record:start -->\n\s*```yaml\n([\s\S]*?)\n\s*```\n\s*<!-- canonical-record:end -->/m,
  );
  assert.ok(match, 'learn must contain the marked canonical record example');
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^ {3}/, ''))
    .join('\n');
}

function topLevelFrontmatterKeys(example) {
  const lines = example.split('\n');
  assert.equal(lines[0], '---');
  const closing = lines.indexOf('---', 1);
  assert.ok(closing > 1);
  return lines
    .slice(1, closing)
    .filter((line) => line !== '' && !line.startsWith(' '))
    .map((line) => line.slice(0, line.indexOf(':')));
}

test('spectre-learn stages canonical records and retries both registration budgets', () => {
  const learn = readSkill(LEARN_PATH);

  for (const pattern of RETIRED_PATTERNS) {
    assert.doesNotMatch(learn, pattern);
  }
  assert.match(learn, /spectre knowledge migrate\b/);
  assert.match(learn, /spectre knowledge search\b[\s\S]*--json/);
  assert.match(learn, /spectre knowledge register\b[\s\S]*--record\b[\s\S]*--json/);
  assert.match(learn, /mktemp -d/);
  assert.match(learn, /~\/\.spectre\/projects\//);
  assert.match(learn, /UPDATE > APPEND > CREATE/);
  assert.ok(
    learn.indexOf('spectre knowledge search') < learn.indexOf('UPDATE > APPEND > CREATE'),
    'canonical search must happen before action selection',
  );
  assert.match(learn, /Proposal gate[\s\S]*stop and wait for the user/i);
  assert.match(learn, /9,001/);
  assert.match(learn, /KNOWLEDGE_RECORD_INVALID[\s\S]*revise[\s\S]*retry/i);
  assert.match(learn, /KNOWLEDGE_PAYLOAD_UNSAFE[\s\S]*revise[\s\S]*retry/i);
  assert.match(learn, /references\//);
  assert.match(
    learn,
    /feature · gotchas · patterns · decisions · procedures · integration · performance · testing · ux · strategy/,
  );

  const example = canonicalExample(learn);
  assert.deepEqual(topLevelFrontmatterKeys(example), ['name', 'description', 'metadata']);
  assert.match(example, /^  spectre-category: "feature"$/m);
  assert.match(example, /^  spectre-triggers: '\["trigger phrase","second phrase"\]'$/m);
  assert.match(example, /^  spectre-status: "active"$/m);
  assert.match(example, /^  spectre-version: "1"$/m);
  assert.doesNotMatch(example, /^user-invocable:/m);
  assert.doesNotMatch(example, /^spectre-(?:category|triggers|status|version):/m);
});

test('spectre-recall searches canonical knowledge and reads selected records directly', () => {
  const recall = readSkill(RECALL_PATH);

  for (const pattern of [...RETIRED_PATTERNS, /\bSkill\s*\(/]) {
    assert.doesNotMatch(recall, pattern);
  }
  assert.match(recall, /spectre knowledge search\b[\s\S]*--project-dir\b[\s\S]*--json/);
  assert.match(recall, /\brecordPath\b/);
  assert.match(recall, /read (?:the )?selected[\s\S]*recordPath/i);
  assert.match(recall, /Empty query[\s\S]*grouped by category/i);
  assert.match(recall, /Single match[\s\S]*read/i);
  assert.match(recall, /Multiple matches[\s\S]*ask/i);
  assert.match(recall, /No match[\s\S]*\/spectre:learn/i);
  assert.match(recall, /read-only/i);
});

test('legacy recall template is retired after npm-side readers are removed', () => {
  assert.equal(fs.existsSync(TEMPLATE_PATH), false);
});

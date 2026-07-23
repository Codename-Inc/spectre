import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const projectRoot = join(import.meta.dirname, '..', '..');
const inventoryPath = join(import.meta.dirname, 'legacy-path-allowlist.json');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const legacyPrefixPattern = /docs\/(?:active_)?tasks\//g;

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function scopedFiles() {
  const topLevelDocs = readdirSync(join(projectRoot, 'docs'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(projectRoot, 'docs', entry.name));

  return [
    join(projectRoot, 'README.md'),
    ...topLevelDocs,
    ...collectFiles(join(projectRoot, 'plugins', 'spectre')),
    ...collectFiles(join(projectRoot, 'plugins', 'spectre-codex')),
    ...collectFiles(join(projectRoot, 'src')),
  ];
}

function scanLegacyPrefixes(files) {
  const occurrences = [];
  for (const file of files) {
    const path = relative(projectRoot, file);
    const content = readFileSync(file, 'utf8');
    const repeatedContexts = new Map();
    for (const [lineIndex, context] of content.split('\n').entries()) {
      const matches = [...context.matchAll(legacyPrefixPattern)];
      if (matches.length === 0) continue;

      const contextIndex = (repeatedContexts.get(context) ?? 0) + 1;
      repeatedContexts.set(context, contextIndex);
      const contextHash = createHash('sha256').update(context).digest('hex').slice(0, 12);
      matches.forEach((match, matchIndex) => {
        occurrences.push({
          id: `${contextHash}:${contextIndex}:${matchIndex + 1}`,
          path,
          line: lineIndex + 1,
          column: match.index + 1,
          context,
        });
      });
    }
  }
  return occurrences;
}

function inventoryMismatches(actual, expected) {
  const actualByKey = new Map(actual.map((entry) => [`${entry.path}#${entry.id}`, entry]));
  const expectedByKey = new Map(
    Object.entries(expected).flatMap(([path, entries]) =>
      Object.entries(entries).map(([id, classification]) => [
        `${path}#${id}`,
        { path, id, classification },
      ]),
    ),
  );
  const keys = new Set([...actualByKey.keys(), ...expectedByKey.keys()]);
  return [...keys]
    .sort()
    .flatMap((key) => {
      const found = actualByKey.get(key);
      const allowed = expectedByKey.get(key);
      if (!allowed) {
        return [
          `${found.path}:${found.line}:${found.column}: unclassified ${found.context.trim()}`,
        ];
      }
      if (!found) return [`${allowed.path}#${allowed.id}: allowlist entry is stale`];
      return [];
    });
}

test('legacy path inventory rejects an unclassified occurrence', () => {
  const mismatches = inventoryMismatches(
    [{
      id: 'abc123:1:1',
      path: 'new-active-default.md',
      line: 7,
      column: 3,
      context: '  docs/tasks/new-default',
    }],
    {},
  );
  assert.deepEqual(mismatches, [
    'new-active-default.md:7:3: unclassified docs/tasks/new-default',
  ]);
});

test('legacy path inventory requires separate classifications in a mixed file', () => {
  const actual = [
    { id: 'active:1:1', path: 'mixed.md', line: 1, column: 1, context: 'docs/tasks/active' },
    { id: 'compat:1:1', path: 'mixed.md', line: 2, column: 1, context: 'docs/tasks/legacy' },
  ];
  assert.deepEqual(
    inventoryMismatches(actual, {
      'mixed.md': { 'compat:1:1': 'compatibility_clause' },
    }),
    ['mixed.md:1:1: unclassified docs/tasks/active'],
  );

  const expected = {
    'mixed.md': {
      'active:1:1': 'active_default',
      'compat:1:1': 'compatibility_clause',
    },
  };
  assert.deepEqual(inventoryMismatches(actual, expected), []);
  assert.notEqual(
    expected['mixed.md']['active:1:1'],
    expected['mixed.md']['compat:1:1'],
    'individual occurrences retain independent classifications',
  );
});

test('legacy path inventory classifies every scoped occurrence', (t) => {
  const actual = scanLegacyPrefixes(scopedFiles());
  const mismatches = inventoryMismatches(actual, inventory.occurrences);
  assert.deepEqual(mismatches, []);

  const allowedClassifications = new Set(inventory.classifications);
  for (const [path, entries] of Object.entries(inventory.occurrences)) {
    for (const [id, classification] of Object.entries(entries)) {
      assert.ok(
        allowedClassifications.has(classification),
        `${path}#${id}: unknown classification ${classification}`,
      );
    }
  }

  const scopedText = scopedFiles().map((file) => readFileSync(file, 'utf8')).join('\n');
  for (const [form, literal] of Object.entries(inventory.required_forms)) {
    assert.ok(scopedText.includes(literal), `legacy inventory is missing ${form}: ${literal}`);
  }

  const totals = Object.values(inventory.occurrences)
    .flatMap((entries) => Object.values(entries))
    .reduce((summary, classification) => {
      summary[classification] = (summary[classification] ?? 0) + 1;
      return summary;
    }, {});
  t.diagnostic(`classified legacy prefixes: ${JSON.stringify(totals)}`);
  t.diagnostic(`required forms: ${Object.keys(inventory.required_forms).join(', ')}`);
});

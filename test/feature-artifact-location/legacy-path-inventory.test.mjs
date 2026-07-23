import assert from 'node:assert/strict';
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
  const occurrences = {};
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const count = [...content.matchAll(legacyPrefixPattern)].length;
    if (count > 0) {
      occurrences[relative(projectRoot, file)] = count;
    }
  }
  return occurrences;
}

function inventoryMismatches(actual, expected) {
  const paths = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  return [...paths]
    .sort()
    .flatMap((path) => {
      if (!(path in expected)) return [`${path}: ${actual[path]} unclassified occurrence(s)`];
      if (!(path in actual)) return [`${path}: allowlist entry is stale`];
      if (actual[path] !== expected[path].count) {
        return [`${path}: expected ${expected[path].count}, found ${actual[path]}`];
      }
      return [];
    });
}

test('legacy path inventory rejects an unclassified occurrence', () => {
  const mismatches = inventoryMismatches(
    { 'new-active-default.md': 1 },
    {},
  );
  assert.deepEqual(mismatches, ['new-active-default.md: 1 unclassified occurrence(s)']);
});

test('legacy path inventory classifies every scoped occurrence', (t) => {
  const actual = scanLegacyPrefixes(scopedFiles());
  const mismatches = inventoryMismatches(actual, inventory.occurrences);
  assert.deepEqual(mismatches, []);

  const allowedClassifications = new Set(inventory.classifications);
  for (const [path, entry] of Object.entries(inventory.occurrences)) {
    assert.ok(
      allowedClassifications.has(entry.classification),
      `${path}: unknown classification ${entry.classification}`,
    );
  }

  const scopedText = scopedFiles().map((file) => readFileSync(file, 'utf8')).join('\n');
  for (const [form, literal] of Object.entries(inventory.required_forms)) {
    assert.ok(scopedText.includes(literal), `legacy inventory is missing ${form}: ${literal}`);
  }

  const totals = Object.values(inventory.occurrences).reduce((summary, entry) => {
    summary[entry.classification] = (summary[entry.classification] ?? 0) + entry.count;
    return summary;
  }, {});
  t.diagnostic(`classified legacy prefixes: ${JSON.stringify(totals)}`);
  t.diagnostic(`required forms: ${Object.keys(inventory.required_forms).join(', ')}`);
});

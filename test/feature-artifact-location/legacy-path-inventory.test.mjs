import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkLegacyPathInvariant,
  inventoryMismatches,
} from './legacy-path-invariant.mjs';

const projectRoot = join(import.meta.dirname, '..', '..');
const inventoryPath = join(import.meta.dirname, 'legacy-path-allowlist.json');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));

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
  assert.deepEqual(inventoryMismatches(actual, expected), [
    'mixed.md#active:1:1: forbidden shipped classification active_default',
  ]);
  assert.notEqual(
    expected['mixed.md']['active:1:1'],
    expected['mixed.md']['compat:1:1'],
    'individual occurrences retain independent classifications',
  );
});

test('legacy path invariant accepts explicit compatibility and rejects shipped defaults or stale docs', () => {
  const compatibility = [{
    id: 'compat:1:1',
    path: 'compat.md',
    line: 1,
    column: 1,
    context: 'Explicit legacy compatibility input: docs/tasks/example/specs/plan.md',
  }];
  assert.deepEqual(
    inventoryMismatches(compatibility, {
      'compat.md': { 'compat:1:1': 'compatibility_clause' },
    }),
    [],
  );

  const forbidden = [
    {
      id: 'active:1:1',
      path: 'active.md',
      line: 1,
      column: 1,
      context: 'Write new artifacts to docs/tasks/main/',
    },
    {
      id: 'stale:1:1',
      path: 'README.md',
      line: 1,
      column: 1,
      context: 'Artifacts live at docs/tasks/main/',
    },
  ];
  assert.deepEqual(
    inventoryMismatches(forbidden, {
      'active.md': { 'active:1:1': 'active_default' },
      'README.md': { 'stale:1:1': 'stale_documentation' },
    }),
    [
      'README.md#stale:1:1: forbidden shipped classification stale_documentation',
      'active.md#active:1:1: forbidden shipped classification active_default',
    ],
  );
});

test('legacy path invariant rejects wildcard and file-level exemptions', () => {
  assert.deepEqual(
    inventoryMismatches([], {
      '*.md': { '*': 'fixture' },
      'whole-file.md': 'compatibility_clause',
    }),
    [
      '*.md#*: wildcard or file-level exemption is forbidden',
      'whole-file.md#*: wildcard or file-level exemption is forbidden',
    ],
  );
});

test('legacy path inventory classifies every scoped occurrence', (t) => {
  const result = checkLegacyPathInvariant(projectRoot, inventory);
  const mismatches = result.mismatches;
  assert.deepEqual(mismatches, []);
  t.diagnostic(`classified legacy prefixes: ${JSON.stringify(result.totals)}`);
  t.diagnostic(`required forms: ${Object.keys(inventory.required_forms).join(', ')}`);
});

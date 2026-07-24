#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { measurePayload } from './knowledge/payload.mjs';
import {
  rankKnowledgeEntries,
  renderKnowledgeRegistry,
} from './knowledge/registry.mjs';

const FIXED_NOW = Date.parse('2026-07-22T12:00:00.000Z');

function record(id, options = {}) {
  return {
    id,
    category: options.category || 'feature',
    description: options.description || `Use when working with ${id}.`,
    triggers: options.triggers || [`${id} workflow`],
    status: options.status || 'active',
    version: options.version || 1,
    recordPath: `knowledge/${id}/SKILL.md`,
    sourceFingerprint: `sha256:${id}`,
    sourceSize: 100,
    sourceMtimeMs: options.sourceMtimeMs ?? FIXED_NOW,
  };
}

function activity(records = {}) {
  return {
    schemaVersion: 1,
    records,
    search: { matches: 0, misses: 0, recordMatches: {} },
  };
}

function version(successfulLoads, lastLoadedAt) {
  return { successfulLoads, lastLoadedAt };
}

function frameFor(content) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: content,
    },
  });
}

describe('knowledge registry ranking', () => {
  it('uses zero-history source mtime so new records and direct edits move first', () => {
    const records = [
      record('feature-old', { sourceMtimeMs: FIXED_NOW - 3_000 }),
      record('feature-new', { sourceMtimeMs: FIXED_NOW - 1_000 }),
      record('feature-edited', { sourceMtimeMs: FIXED_NOW }),
      record('feature-inactive', { status: 'archived', sourceMtimeMs: FIXED_NOW + 1_000 }),
    ];

    const ranked = rankKnowledgeEntries({ records, activity: activity() });

    assert.deepEqual(ranked.map(({ id }) => id), [
      'feature-edited',
      'feature-new',
      'feature-old',
    ]);
    assert.deepEqual(
      ranked.map(({ successfulLoads }) => successfulLoads),
      [0, 0, 0],
    );
  });

  it('promotes by the latest successful load and aggregates counts across versions', () => {
    const records = [
      record('feature-history', { version: 3, sourceMtimeMs: FIXED_NOW }),
      record('feature-current', { sourceMtimeMs: FIXED_NOW - 500 }),
    ];
    const usage = activity({
      'feature-history': {
        versions: {
          '1': version(4, '2026-07-22T12:01:00.000Z'),
          '2': version(3, '2026-07-22T12:03:00.000Z'),
          '3': version(2, '2026-07-22T12:02:00.000Z'),
        },
      },
      'feature-current': {
        versions: {
          '1': version(20, '2026-07-22T12:00:30.000Z'),
        },
      },
    });

    const ranked = rankKnowledgeEntries({ records, activity: usage });

    assert.deepEqual(ranked.map(({ id }) => id), ['feature-history', 'feature-current']);
    assert.equal(ranked[0].successfulLoads, 9);
    assert.equal(ranked[0].lastLoadedAt, '2026-07-22T12:03:00.000Z');
    assert.equal(ranked[0].promotionAt, Date.parse('2026-07-22T12:03:00.000Z'));
  });

  it('breaks equal promotion times by aggregate load count, then stable ID', () => {
    const loadedAt = '2026-07-22T12:04:00.000Z';
    const records = [
      record('feature-zulu'),
      record('feature-alpha'),
      record('feature-most'),
    ];
    const usage = activity({
      'feature-zulu': { versions: { '1': version(2, loadedAt) } },
      'feature-alpha': { versions: { '1': version(2, loadedAt) } },
      'feature-most': { versions: { '1': version(3, loadedAt) } },
    });

    const ranked = rankKnowledgeEntries({ records, activity: usage });

    assert.deepEqual(ranked.map(({ id }) => id), [
      'feature-most',
      'feature-alpha',
      'feature-zulu',
    ]);
  });

  it('does not let search diagnostics, input order, or host affect the total order', () => {
    const records = [
      record('feature-c', { sourceMtimeMs: FIXED_NOW - 3 }),
      record('feature-a', { sourceMtimeMs: FIXED_NOW - 1 }),
      record('feature-b', { sourceMtimeMs: FIXED_NOW - 2 }),
    ];
    const usage = activity();
    usage.search = {
      matches: 99,
      misses: 7,
      recordMatches: {
        'feature-c': { count: 99, lastMatchedAt: '2026-07-22T12:05:00.000Z' },
      },
    };

    const forward = rankKnowledgeEntries({ records, activity: usage });
    const reversed = rankKnowledgeEntries({ records: [...records].reverse(), activity: usage });

    assert.deepEqual(forward.map(({ id }) => id), ['feature-a', 'feature-b', 'feature-c']);
    assert.deepEqual(reversed.map(({ id }) => id), forward.map(({ id }) => id));
  });
});

describe('knowledge registry rendering', () => {
  it('injects the complete current apply policy before available knowledge', () => {
    const result = renderKnowledgeRegistry({
      host: 'claude',
      records: [record('feature-learning')],
      activity: activity(),
      projectDir: '/tmp/project',
      cliPath: '/tmp/plugin/knowledge-cli.mjs',
    });

    assert.match(result.content, /captures hard-won knowledge/i);
    assert.match(result.content, /## Before You Work/);
    assert.match(result.content, /subject matches the record/i);
    assert.match(result.content, /Use when.*applies/i);
    assert.match(result.content, /summaries and may omit/i);
    assert.match(result.content, /## Finding Knowledge Not Shown/);
    assert.match(result.content, /## After Loading/);
    assert.match(result.content, /supporting-resource paths are references/i);
    assert.match(result.content, /## After Significant Work/);
    assert.match(result.content, /Do not silently edit knowledge/i);
    assert.match(result.content, /offer to update or capture.*\/spectre:learn/i);
    assert.match(result.content, /## Available Knowledge/);
    assert.ok(
      result.content.indexOf('## Before You Work') <
      result.content.indexOf('### Knowledge record: feature-learning'),
    );
    assert.doesNotMatch(result.content, /complete list|one matching trigger|Skill\(\{name\}\)/i);
  });

  it('instructs the agent not to fabricate or apply knowledge after retrieval failure', () => {
    const result = renderKnowledgeRegistry({
      host: 'codex',
      records: [record('feature-learning')],
      activity: activity(),
      projectDir: '/tmp/project',
      cliPath: '/tmp/plugin/knowledge-cli.mjs',
    });

    assert.match(result.content, /If search or load fails/i);
    assert.match(result.content, /do not claim or fabricate knowledge/i);
    assert.match(result.content, /Apply the knowledge only after a successful verified load/i);
  });

  it('renders metadata-only policy, exact identity, and shell-quoted absolute commands', () => {
    const projectDir = path.resolve('/tmp/Project with spaces/$work');
    const cliPath = path.resolve("/tmp/Plugin's bin/knowledge-cli.mjs");
    const records = [record('feature-learning', {
      version: 8,
      description: 'Use when modifying the Spectre learning registry.',
      triggers: ['/spectre:learn', 'knowledge load <id>'],
    })];

    const result = renderKnowledgeRegistry({
      host: 'claude',
      records,
      activity: activity(),
      projectDir,
      cliPath,
    });

    assert.equal(result.includedCount, 1);
    assert.equal(result.omittedCount, 0);
    assert.match(result.content, /task subject matches the record.*Use when.*applies/i);
    assert.match(result.content, /Activation cues are supporting evidence, not automatic keyword matches/i);
    assert.match(result.content, /Registry exposure and search results are discovery signals only/i);
    assert.match(result.content, /They do not mean the record content has been loaded/i);
    assert.match(result.content, /ID: feature-learning/);
    assert.match(result.content, /Version: 8/);
    assert.match(result.content, /Use when: Use when modifying the Spectre learning registry\./);
    assert.match(result.content, /Activation cues: \/spectre:learn; knowledge load <id>/);
    assert.match(result.content, /Omitted active records: 0/);
    assert.match(result.content, /'\/tmp\/Plugin'\\''s bin\/knowledge-cli\.mjs' search/);
    assert.match(result.content, /'\/tmp\/Plugin'\\''s bin\/knowledge-cli\.mjs' load 'feature-learning'/);
    assert.match(result.content, /--project-dir '\/tmp\/Project with spaces\/\$work'/);
    assert.equal(result.content.includes('sourceFingerprint'), false);
    assert.equal(result.content.includes('recordPath'), false);
    assert.equal(result.content.includes('sourceSize'), false);
    assert.equal(result.content.includes('BODY PREVIEW'), false);
    assert.equal(result.frame, frameFor(result.content));
    assert.deepEqual(result.measurement, measurePayload('claude', result.frame));
  });

  it('selects the longest whole-entry prefix in one shared rank order for each host', () => {
    const records = Array.from({ length: 60 }, (_, index) => record(
      `feature-${String(index).padStart(2, '0')}`,
      {
        sourceMtimeMs: FIXED_NOW - index,
        description: `Use when handling fixture ${index}: ${'careful routing context '.repeat(8)}`,
        triggers: [`fixture ${index} routing`, `feature-${String(index).padStart(2, '0')}.md`],
      },
    ));
    const common = {
      records,
      activity: activity(),
      projectDir: '/tmp/registry fixture',
      cliPath: '/tmp/Spectre Plugin/knowledge-cli.mjs',
    };

    const claude = renderKnowledgeRegistry({ ...common, host: 'claude' });
    const codex = renderKnowledgeRegistry({ ...common, host: 'codex' });

    assert.ok(claude.includedCount > codex.includedCount);
    assert.ok(codex.includedCount > 0);
    assert.ok(claude.omittedCount > 0);
    assert.ok(codex.omittedCount > 0);
    assert.deepEqual(
      claude.includedEntries.map(({ id }) => id),
      records.slice(0, claude.includedCount).map(({ id }) => id),
    );
    assert.deepEqual(
      codex.includedEntries.map(({ id }) => id),
      records.slice(0, codex.includedCount).map(({ id }) => id),
    );
    assert.deepEqual(
      claude.includedEntries.slice(0, codex.includedCount).map(({ id }) => id),
      codex.includedEntries.map(({ id }) => id),
    );
    assert.equal(claude.measurement.ok, true);
    assert.equal(codex.measurement.ok, true);
    assert.ok(claude.frame.length < 10_000);
    assert.equal(measurePayload('codex', codex.frame).ok, true);
    assert.equal((claude.content.match(/^### Knowledge record:/gm) || []).length, claude.includedCount);
    assert.equal((codex.content.match(/^### Knowledge record:/gm) || []).length, codex.includedCount);
    assert.match(claude.content, new RegExp(`Omitted active records: ${claude.omittedCount}`));
    assert.match(codex.content, new RegExp(`Omitted active records: ${codex.omittedCount}`));

    const firstOmitted = records[codex.includedCount];
    assert.ok(firstOmitted);
    assert.equal(codex.content.includes(`ID: ${firstOmitted.id}`), false);
    assert.equal(codex.content.includes(firstOmitted.description), false);

    const nextPrefixFrame = frameFor([
      codex.content,
      '### Knowledge record:',
      `- ID: ${firstOmitted.id}`,
      `- Version: ${firstOmitted.version}`,
      `- Use when: ${firstOmitted.description}`,
      `- Activation cues: ${firstOmitted.triggers.join('; ')}`,
    ].join('\n'));
    assert.equal(measurePayload('codex', nextPrefixFrame).ok, false);
  });

  it('does not emit partial entries, a second registry, or fallback body references', () => {
    const records = [
      record('feature-small', { sourceMtimeMs: FIXED_NOW }),
      record('feature-too-large', {
        sourceMtimeMs: FIXED_NOW - 1,
        description: `Use when ${'dense '.repeat(4_000)}`,
      }),
      record('feature-after-large', { sourceMtimeMs: FIXED_NOW - 2 }),
    ];

    const result = renderKnowledgeRegistry({
      host: 'codex',
      records,
      activity: activity(),
      projectDir: '/tmp/project',
      cliPath: '/tmp/plugin/knowledge-cli.mjs',
    });

    assert.deepEqual(result.includedEntries.map(({ id }) => id), ['feature-small']);
    assert.equal(result.content.includes('feature-too-large'), false);
    assert.equal(result.content.includes('feature-after-large'), false);
    assert.equal((result.content.match(/^## SPECTRE Project Knowledge$/gm) || []).length, 1);
    assert.doesNotMatch(result.content, /preview|fallback file|continued registry|part \d+/i);
  });
});

#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MATCHER_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'matcher.mjs');

async function loadMatcherModule() {
  assert.equal(
    fs.existsSync(MATCHER_MODULE),
    true,
    'matcher module is intentionally missing until the GREEN matcher task',
  );
  return import(pathToFileURL(MATCHER_MODULE).href);
}

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-match-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

function entry(overrides = {}) {
  return {
    id: 'feature-auth',
    description: 'Use the established authentication flow.',
    triggers: ['auth flow'],
    status: 'active',
    version: 1,
    recordPath: 'knowledge/feature-auth/SKILL.md',
    ...overrides,
  };
}

function numericTableRecord(length) {
  const prefix = [
    '---',
    'name: feature-numeric-table',
    'description: Numeric table boundary fixture.',
    'metadata:',
    '  spectre-category: "testing"',
    '  spectre-triggers: \'["numeric table boundary"]\'',
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
    '# Numeric table',
    '',
  ].join('\n');
  const unit = '1234567890123456789012345678901 \n';
  const remaining = length - prefix.length;
  return `${prefix}${unit.repeat(Math.ceil(remaining / unit.length))
    .slice(0, remaining)}`;
}

describe('exact knowledge trigger matching', () => {
  it('normalizes case, punctuation, NFKC, and whitespace but rejects partial boundaries', async () => {
    const { matchKnowledge } = await loadMatcherModule();
    const index = {
      records: [
        entry({
          triggers: ['café auth', 'project skills'],
        }),
        entry({
          id: 'feature-inactive',
          triggers: ['inactive trigger'],
          status: 'archived',
        }),
      ],
    };

    assert.deepEqual(
      matchKnowledge('Please review CAFE\u0301---AUTH and   project\t skills.', index)
        .map(({ id, matchedTrigger }) => ({ id, matchedTrigger })),
      [{ id: 'feature-auth', matchedTrigger: 'project skills' }],
    );
    assert.equal(
      matchKnowledge('Use CAFE\u0301---AUTH.', index)[0].matchedTrigger,
      'café auth',
    );
    assert.equal(
      matchKnowledge('Fix the `café auth`+handling.', index)[0].matchedTrigger,
      'café auth',
    );
    assert.deepEqual(matchKnowledge('scafe authz', index), []);
    assert.deepEqual(matchKnowledge('Use the inactive trigger.', index), []);
  });

  it('ranks overlaps by longest normalized trigger then stable ID without semantic matching', async () => {
    const { matchKnowledge } = await loadMatcherModule();
    const index = {
      records: [
        entry({
          id: 'feature-zeta',
          triggers: ['auth flow', 'secure login'],
        }),
        entry({
          id: 'feature-alpha',
          triggers: ['auth flow'],
        }),
        entry({
          id: 'feature-longest',
          triggers: ['project auth flow'],
        }),
      ],
    };

    assert.deepEqual(
      matchKnowledge('Fix the project auth flow and secure login.', index)
        .map(({ id, matchedTrigger }) => ({ id, matchedTrigger })),
      [
        { id: 'feature-longest', matchedTrigger: 'project auth flow' },
        { id: 'feature-zeta', matchedTrigger: 'secure login' },
        { id: 'feature-alpha', matchedTrigger: 'auth flow' },
      ],
    );
    assert.deepEqual(matchKnowledge('Fix authentication behavior.', index), []);
  });
});

describe('bounded prompt framing', () => {
  it('frames one primary and at most three metadata-only secondary matches', async () => {
    const { buildPromptContext } = await loadMatcherModule();
    const primary = {
      ...entry({ id: 'feature-primary' }),
      content: '---\nname: feature-primary\n---\nPrimary guidance.',
    };
    const secondaryMatches = Array.from({ length: 6 }, (_, index) =>
      entry({
        id: `feature-secondary-${index + 1}`,
        description: `Secondary ${index + 1} guidance. `.repeat(20),
        triggers: [`secondary trigger ${index + 1}`],
        matchedTrigger: `secondary trigger ${index + 1}`,
      }));

    const framed = buildPromptContext({
      host: 'claude',
      primary,
      secondaryMatches,
    });

    assert.equal(framed.ok, true);
    assert.equal(framed.includedSecondary.length, 3);
    assert.equal(framed.omittedCount, 3);
    assert.equal(framed.secondaryMetadata.length <= 750, true);
    for (const match of framed.includedSecondary) {
      assert.match(framed.secondaryMetadata, new RegExp(match.id));
      assert.match(framed.secondaryMetadata, new RegExp(match.matchedTrigger));
      assert.match(framed.secondaryMetadata, /Secondary \d+ guidance/);
      assert.match(
        framed.secondaryMetadata,
        new RegExp(`spectre knowledge search "${match.id}"`),
      );
    }
    assert.match(framed.additionalContext, /Primary guidance/);
    assert.match(framed.additionalContext, /3 additional matches omitted/);
    assert.equal(
      framed.systemMessage,
      'spectre: applied feature-primary; 3 also matching; 3 omitted',
    );
    assert.doesNotMatch(framed.secondaryMetadata, /\b(?:applied|loaded)\b/i);
    assert.doesNotMatch(framed.systemMessage, /feature-secondary/);
  });

  it('rejects a final frame that exceeds the host budget', async () => {
    const { buildPromptContext } = await loadMatcherModule();
    const result = buildPromptContext({
      host: 'claude',
      primary: {
        ...entry({ id: 'feature-oversized' }),
        content: 'x'.repeat(9_000),
      },
      secondaryMatches: [],
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'PAYLOAD_LIMIT');
    assert.equal(result.additionalContext, null);
  });

  it('rejects an unsafe dense alphanumeric primary during the runtime recheck', async () => {
    const { buildPromptContext } = await loadMatcherModule();
    const result = buildPromptContext({
      host: 'codex',
      primary: {
        ...entry({ id: 'feature-dense-runtime' }),
        content: 'Az09By18Cx27Dw36Ev45Fu54Gt63Hs72'
          .repeat(250)
          .slice(0, 8_000),
      },
      secondaryMatches: [],
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'PAYLOAD_LIMIT');
    assert.equal(result.additionalContext, null);
    assert.equal(result.measurement.measured > result.measurement.limit, true);
  });

  it('rejects an unsafe aggregate numeric table during the exact runtime recheck', async () => {
    const { buildPromptContext } = await loadMatcherModule();
    const content = numericTableRecord(8_700);
    const result = buildPromptContext({
      host: 'codex',
      primary: {
        ...entry({ id: 'feature-numeric-table' }),
        content,
      },
      secondaryMatches: [],
    });

    assert.equal(Math.max(...[...content.matchAll(/\d+/g)]
      .map(([run]) => run.length)), 31);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'PAYLOAD_LIMIT');
    assert.equal(result.additionalContext, null);
    assert.equal(result.measurement.measured > result.measurement.limit, true);
  });

  it('keeps a valid primary when secondary metadata would exceed the host budget', async () => {
    const { buildPromptContext } = await loadMatcherModule();
    const primary = {
      ...entry({ id: 'feature-primary-budget' }),
      content: 'Primary budget guidance. '.repeat(356),
    };
    const secondaryMatches = [
      entry({
        id: 'feature-secondary-budget',
        description: 'Secondary metadata should be omitted when it breaks budget.',
        matchedTrigger: 'secondary budget trigger',
      }),
    ];

    const framed = buildPromptContext({
      host: 'claude',
      primary,
      secondaryMatches,
    });

    assert.equal(framed.ok, true);
    assert.match(framed.additionalContext, /Primary budget guidance/);
    assert.equal(framed.includedSecondary.length, 0);
    assert.equal(framed.omittedCount, 1);
    assert.match(framed.secondaryMetadata, /1 additional match omitted/);
    assert.equal(
      framed.systemMessage,
      'spectre: applied feature-primary-budget; 0 also matching; 1 omitted',
    );
  });
});

describe('session knowledge ledger', () => {
  it('skips the same id@version and reapplies a version increment', async (t) => {
    const { filterAppliedKnowledge, markKnowledgeApplied } = await loadMatcherModule();
    const storePath = makeTmp(t);
    const matches = [
      entry({ id: 'feature-alpha', version: 1 }),
      entry({ id: 'feature-beta', version: 2 }),
    ];

    assert.deepEqual(
      filterAppliedKnowledge({
        storePath,
        host: 'codex',
        sessionId: 'session-a',
        matches,
      }).map(({ id }) => id),
      ['feature-alpha', 'feature-beta'],
    );
    markKnowledgeApplied({
      storePath,
      host: 'codex',
      sessionId: 'session-a',
      record: matches[0],
    });
    assert.deepEqual(
      filterAppliedKnowledge({
        storePath,
        host: 'codex',
        sessionId: 'session-a',
        matches,
      }).map(({ id }) => id),
      ['feature-beta'],
    );
    assert.deepEqual(
      filterAppliedKnowledge({
        storePath,
        host: 'codex',
        sessionId: 'session-a',
        matches: [entry({ id: 'feature-alpha', version: 2 })],
      }).map(({ version }) => version),
      [2],
    );

  });

  it('creates no shared ledger when session ID is missing', async (t) => {
    const { filterAppliedKnowledge, markKnowledgeApplied } = await loadMatcherModule();
    const storePath = makeTmp(t);
    const match = entry();

    assert.equal(markKnowledgeApplied({
      storePath,
      host: 'claude',
      sessionId: undefined,
      record: match,
    }), false);
    assert.deepEqual(
      filterAppliedKnowledge({
        storePath,
        host: 'claude',
        sessionId: undefined,
        matches: [match],
      }),
      [match],
    );
    assert.equal(fs.existsSync(path.join(storePath, 'runtime', 'sessions')), false);
  });
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregate, evaluateKnowledge, freeze, judgeCell, normalizeUsage, runCells } from './evaluate-knowledge.mjs';

test('knowledge evaluation freezes twelve hidden-oracle cases and matched host cells', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-evaluation-'));
  const fixtures = path.join(root, 'fixtures'); fs.mkdirSync(fixtures);
  const cases = Array.from({ length: 12 }, (_, index) => ({ id: `case-${index}` }));
  fs.writeFileSync(path.join(fixtures, 'manifest.json'), JSON.stringify({ cases }));
  const oracle = path.join(root, 'oracle.json'); fs.writeFileSync(oracle, JSON.stringify({ 'case-0': 'gold-label' }));
  const output = path.join(root, 'freeze.json');
  const frozen = freeze(fixtures, oracle, output);
  assert.equal(frozen.cells.length, 12 * 3 * 2 * 2);
  assert.deepEqual(frozen.concurrency, { total: 4, perHost: 2 });
  fs.writeFileSync(path.join(fixtures, 'manifest.json'), JSON.stringify({ cases, leaked: 'gold-label' }));
  assert.throws(() => freeze(fixtures, oracle, output), /leaked/);
});

test('usage normalization preserves missing native fields as unknown and aggregates runtime separately', () => {
  assert.deepEqual(normalizeUsage({ input: 4, output: 3 }), { input: 4, cache: 'unknown', output: 3, reasoning: 'unknown' });
  const report = aggregate([{ runtime: { injectedTokens: 3, previewTokens: 4, loadedBodyTokens: 5, redundantTokens: 0, totalTokens: 12 }, judged: { required: true, recalled: true } }]);
  assert.equal(report.runtime.totalTokens.median, 12);
  assert.equal(report.judged.requiredRecall, true);
});

test('freeze binds configuration and candidate content, while missing oracle judgments cannot pass', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-evaluation-freeze-'));
  const fixtures = path.join(root, 'fixtures'); const candidate = path.join(root, 'candidate');
  fs.mkdirSync(fixtures); fs.mkdirSync(candidate);
  fs.writeFileSync(path.join(fixtures, 'manifest.json'), JSON.stringify({ cases: Array.from({ length: 12 }, (_, index) => ({ id: `case-${index}`, task: `Task ${index}` })) }));
  const oracle = path.join(root, 'oracle.json'); fs.writeFileSync(oracle, JSON.stringify(Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`case-${index}`, { requiredPhrases: [`answer-${index}`] }]))));
  const configuration = path.join(root, 'config.json'); fs.writeFileSync(configuration, JSON.stringify({ model: 'test-model', effort: 'medium' }));
  fs.writeFileSync(path.join(candidate, 'plugin.txt'), 'candidate-v1');
  const frozen = freeze(fixtures, oracle, path.join(root, 'freeze.json'), { configurationPath: configuration, candidatePath: candidate });
  assert.match(frozen.hashes.configuration, /^sha256:/);
  assert.match(frozen.hashes.candidate, /^sha256:/);
  const cells = await runCells(frozen, path.join(root, 'cells'), async () => ({ status: 'completed', textFinalAnswers: ['answer-0'], trace: { availability: 'available', events: [] } }));
  assert.equal(cells.cells.find((cell) => cell.caseId === 'case-0').judged.recalled, true);
  assert.equal(cells.cells.find((cell) => cell.caseId === 'case-1').status, 'invalid');
  assert.deepEqual(judgeCell({ caseId: 'case-1' }, { status: 'completed', textFinalAnswers: [] }, null), {
    valid: false, recalled: false, reason: 'oracle judgment is missing',
  });
});

test('runCells honors total and per-host concurrency limits', async () => {
  const cells = [
    { id: 'a', caseId: 'a', host: 'claude' }, { id: 'b', caseId: 'b', host: 'claude' },
    { id: 'c', caseId: 'c', host: 'claude' }, { id: 'd', caseId: 'd', host: 'codex' },
  ];
  let active = 0; let claude = 0; let maximum = 0; let maximumClaude = 0;
  await runCells({ cells, concurrency: { total: 2, perHost: 1 }, oracle: {} }, os.tmpdir(), async (cell) => {
    active += 1; if (cell.host === 'claude') claude += 1;
    maximum = Math.max(maximum, active); maximumClaude = Math.max(maximumClaude, claude);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1; if (cell.host === 'claude') claude -= 1;
    return { status: 'completed', textFinalAnswers: [] };
  });
  assert.equal(maximum, 2);
  assert.equal(maximumClaude, 1);
});

test('deterministic freeze gates native calls', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-evaluation-stage-'));
  const fixtures = path.join(root, 'fixtures'); fs.mkdirSync(fixtures);
  fs.writeFileSync(path.join(fixtures, 'manifest.json'), JSON.stringify({ cases: Array.from({ length: 12 }, (_, index) => ({ id: `case-${index}` })) }));
  const oracle = path.join(root, 'oracle.json'); fs.writeFileSync(oracle, JSON.stringify(Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`case-${index}`, { requiredPhrases: [] }]))));
  const frozen = freeze(fixtures, oracle, path.join(root, 'freeze.json'));
  await assert.rejects(() => evaluateKnowledge(frozen, { fixtureRoot: fixtures }), /allowNative/);
});

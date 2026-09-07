import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregate, evaluateKnowledge, evaluationQualityReport, freeze, judgeCell, normalizeUsage, primaryJudgmentReport, runCells, selectFrozenCells, traceRuntimeFacts } from './evaluate-knowledge.mjs';

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
  assert.deepEqual(normalizeUsage({ input: 4, output: 3 }), { input: 4, cache: 'unknown', cacheWrite: 'unknown', output: 3, reasoning: 'unknown' });
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
  const cells = await runCells(frozen, path.join(root, 'cells'), async () => ({ status: 'completed', textFinalAnswers: ['answer-0'], deliverable: { exists: true, bytes: 1 }, trace: { availability: 'available', events: [] } }));
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

test('native qualification selects only named frozen cells', () => {
  const frozen = { cells: [{ id: 'critical:candidate:claude:1' }, { id: 'critical:candidate:codex:1' }] };
  assert.deepEqual(selectFrozenCells(frozen, ['critical:candidate:codex:1']).cells, [{ id: 'critical:candidate:codex:1' }]);
  assert.throws(() => selectFrozenCells(frozen, ['not-frozen']), /unknown frozen cell/);
});

test('a frozen cell result resumes only when its freeze hash matches', async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-evaluation-resume-'));
  const manifest = {
    hashes: { fixtures: 'fixture-hash', oracle: 'oracle-hash' }, cells: [{ id: 'case:baseline:claude:1', caseId: 'case', host: 'claude' }],
    concurrency: { total: 1, perHost: 1 }, oracle: { case: { requiredPhrases: ['answer'] } },
  };
  let calls = 0;
  const invoke = async () => { calls += 1; return { status: 'completed', textFinalAnswers: ['answer'], deliverable: { exists: true, bytes: 1 } }; };
  await runCells(manifest, output, invoke);
  await runCells(manifest, output, invoke);
  await runCells({ ...manifest, hashes: { fixtures: 'changed', oracle: 'oracle-hash' } }, output, invoke);
  assert.equal(calls, 2);
});

test('manual semantic adjudication remains pending rather than an invalid host run', async () => {
  const result = await runCells({
    cells: [{ id: 'case:candidate:claude:1', caseId: 'case', condition: 'candidate', host: 'claude' }],
    concurrency: { total: 1, perHost: 1 }, oracle: { case: { requiredRecordHashes: [], manualRubric: 'review' } },
  }, fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-evaluation-pending-')), async () => ({
    status: 'completed', deliverablePath: 'artifact.md', deliverable: { exists: true, bytes: 1 },
    toolOperations: [{ name: 'Write', status: 'completed', eventOrdinal: 1, input: { file_path: 'artifact.md' } }], trace: { availability: 'available', events: [] }, bypass: [],
  }));
  assert.equal(result.cells[0].status, 'pending');
});

test('primary judgments bind a reviewed conclusion to the persisted artifact hash', () => {
  const cells = [{ id: 'critical:candidate:claude:1', condition: 'candidate', critical: true, runtime: { deliverable: { hash: 'sha256:artifact' } } }];
  const accepted = primaryJudgmentReport(cells, [{
    cellId: cells[0].id, artifactHash: 'sha256:artifact', artifactEvidence: 'sha256:artifact',
    correct: true, relevant: true, requiredRecallBeforeDecision: true, irrelevantTokens: 0, unnecessaryHistoryLoads: 0, justifiedExpansions: [],
  }]);
  assert.equal(accepted.status, 'reviewed');
  assert.equal(primaryJudgmentReport(cells, [{ ...accepted.reviewed[0], cellId: cells[0].id, artifactHash: 'sha256:wrong', artifactEvidence: 'sha256:wrong' }]).status, 'fail');
});

test('quality report keeps incomplete controls and unreviewed artifacts pending', () => {
  const cells = [{
    id: 'critical:candidate:claude:1', condition: 'candidate', host: 'claude', critical: true,
    runtime: { status: 'completed', trace: { availability: 'available' }, nativeFullCycleUsage: { coverage: 'complete' }, deliverable: { hash: 'sha256:artifact' } },
    judged: { structuralValid: true, recalled: null },
  }];
  const quality = evaluationQualityReport(cells, []);
  assert.equal(quality.status, 'pending');
  assert.equal(quality.observedSamples, 1);
  assert.equal(quality.controls.candidate.nativeFullCycleUsage.known, 1);
  assert.equal(quality.controls.candidate.trace.available, 1);
  assert.equal(quality.controls.baseline.postHocPayloadMetrics.available, 0);
});

test('judging requires an exact successful load and a later persisted decision artifact', () => {
  const recordId = 'payments-dual-settlement';
  const recordHash = `sha256:${createHash('sha256').update(recordId).digest('hex')}`;
  const cell = { caseId: 'case', condition: 'candidate' };
  const oracle = { case: { requiredRecordHashes: [recordHash], manualRubric: 'manual review' } };
  const runtime = {
    status: 'completed', deliverablePath: 'artifacts/case.md', deliverable: { exists: true, bytes: 21 },
    toolOperations: [
      { id: 'load-1', name: 'exec', status: 'completed', eventOrdinal: 4, input: { command: `node knowledge-cli.mjs load ${recordId}` } },
      { id: 'write-1', name: 'Write', status: 'completed', eventOrdinal: 8, input: { file_path: 'artifacts/case.md' } },
    ],
    toolResults: [{ toolUseId: 'load-1', eventOrdinal: 5, content: JSON.stringify({ id: recordId, revisionToken: 'rev-1' }) }],
    trace: { availability: 'available', events: [{ type: 'load', id: recordId, revisionToken: 'rev-1' }] },
    snapshots: { before: { records: [{ id: recordId, revisionToken: 'rev-1' }] } }, bypass: [],
  };
  assert.equal(judgeCell(cell, { ...runtime, deliverable: { exists: false, bytes: null } }, oracle).recalled, false);
  assert.equal(judgeCell(cell, { ...runtime, toolOperations: [runtime.toolOperations[0]] }, oracle).recalled, false);
  const pending = judgeCell(cell, runtime, oracle);
  assert.deepEqual(pending, { valid: false, recalled: null, reason: 'manual semantic adjudication pending', structuralValid: true, manualRubric: 'manual review' });
  const quoted = judgeCell(cell, {
    ...runtime,
    toolOperations: [
      { ...runtime.toolOperations[0], input: { command: `CLI='/fixture/knowledge-cli.mjs'; "$CLI" load '${recordId}'` } }, runtime.toolOperations[1],
    ],
  }, oracle);
  assert.equal(quoted.recalled, null);
  assert.equal(judgeCell(cell, { ...runtime, toolOperations: [
    { ...runtime.toolOperations[0], input: { command: `"$CLI" load '${recordId}'` } }, runtime.toolOperations[1],
  ] }, oracle).recalled, false);
  const codexCounterexample = judgeCell(cell, {
    ...runtime,
    toolOperations: [
      { ...runtime.toolOperations[0], name: 'exec', input: { command: `node knowledge-cli.mjs load ${recordId} && rg --files -g '!artifacts/case.md'` } },
      { id: 'change-1', type: 'file_change', name: 'file_change', status: 'completed', eventOrdinal: 8, input: { changes: [{ path: 'artifacts/case.md' }] } },
    ],
  }, oracle);
  assert.equal(codexCounterexample.recalled, null);
  assert.equal(judgeCell(cell, { ...runtime, toolOperations: [
    { ...runtime.toolOperations[0], eventOrdinal: 9 }, runtime.toolOperations[1],
  ], toolResults: [{ ...runtime.toolResults[0], eventOrdinal: 9 }] }, oracle).recalled, false);
  const control = judgeCell({ ...cell, condition: 'no-knowledge' }, {
    ...runtime, toolOperations: [runtime.toolOperations[1]], toolResults: [], trace: { availability: 'unavailable', events: [] },
  }, oracle);
  assert.equal(control.recalled, null);
  assert.equal(judgeCell(cell, runtime, { case: { requiredRecordHashes: [], allowedLoads: 0, manualRubric: 'manual review' } }).recalled, false);
});

test('imported work requires a captured extraction and a fresh reuse without reloading the import', () => {
  const importedId = 'acquisition-deploy-boundary';
  const importedHash = `sha256:${createHash('sha256').update(importedId).digest('hex')}`;
  const extractedId = 'maintained-import-boundary';
  const imported = { id: importedId, revisionToken: 'import-rev' };
  const extracted = { id: extractedId, revisionToken: 'maintained-rev' };
  const runtime = {
    status: 'completed', deliverablePath: 'artifacts/imported-work.md', deliverable: { exists: true, bytes: 24 }, bypass: [],
    toolOperations: [
      { id: 'inspect-import', name: 'exec', status: 'completed', sessionOrdinal: 0, eventOrdinal: 2, input: { command: `node knowledge-cli.mjs inspect ${importedId}` } },
      { id: 'capture-extract', name: 'exec', status: 'completed', sessionOrdinal: 0, eventOrdinal: 4, input: { command: `node knowledge-cli.mjs register ${extractedId}` } },
      { id: 'load-extract', name: 'exec', status: 'completed', sessionOrdinal: 1, eventOrdinal: 2, input: { command: `node knowledge-cli.mjs load ${extractedId}` } },
      { id: 'write-artifact', name: 'Write', status: 'completed', sessionOrdinal: 1, eventOrdinal: 5, input: { file_path: 'artifacts/imported-work.md' } },
    ],
    toolResults: [{ toolUseId: 'inspect-import', sessionOrdinal: 0, eventOrdinal: 3, content: JSON.stringify(imported) }],
    trace: { availability: 'available', events: [
      { type: 'history-read', subtype: 'history-body', id: importedId, revisionToken: 'import-rev', contextHash: 'first' },
      { type: 'capture', id: extractedId, outcome: 'created', contextHash: 'first' },
      { type: 'load', id: extractedId, revisionToken: 'maintained-rev', contextHash: 'fresh' },
    ] },
    sessionSnapshots: [
      { contextHash: 'first', before: { records: [imported] } },
      { contextHash: 'fresh', before: { records: [imported, extracted] } },
    ],
  };
  const oracle = { imported: {
    requiredRecordHashes: [importedHash], requiredReadCommand: 'inspect', importedRecordHashes: [importedHash],
    requiresFreshExtractedReuse: true, manualRubric: 'manual review',
  } };
  assert.equal(judgeCell({ caseId: 'imported', condition: 'candidate' }, runtime, oracle).structuralValid, true);
  const reloadedImport = {
    ...runtime,
    toolOperations: [...runtime.toolOperations, { id: 'reload-import', name: 'exec', status: 'completed', sessionOrdinal: 1, eventOrdinal: 3, input: { command: `node knowledge-cli.mjs load ${importedId}` } }],
  };
  assert.equal(judgeCell({ caseId: 'imported', condition: 'candidate' }, reloadedImport, oracle).reason, 'fresh extracted-import reuse evidence is missing');
});

test('trace metrics distinguish SessionStart, previews, bodies, resources, and redundant same-context loads', () => {
  const facts = traceRuntimeFacts({ availability: 'available', events: [
    { type: 'search', responseTokens: 7, responseBytes: 70 },
    { type: 'history-read', subtype: 'history-preview', responseTokens: 5, responseBytes: 50 },
    { type: 'load', id: 'record-a', revisionToken: 'rev-a', contextHash: 'ctx', loadedTokens: 11, loadedBytes: 110, responseTokens: 99 },
    { type: 'load', id: 'record-a', revisionToken: 'rev-a', contextHash: 'ctx', loadedTokens: 11, loadedBytes: 110, responseTokens: 99 },
    { type: 'resource-read', id: 'record-a', loadedTokens: 3, loadedBytes: 30, responseTokens: 88 },
  ] }, { sessionStartMeasurement: { injectedTokens: 4, injectedBytes: 40 } });
  assert.deepEqual(facts, {
    injectedTokens: 4, injectedBytes: 40, previewTokens: 12, previewBytes: 120,
    loadedBodyTokens: 22, loadedBodyBytes: 220, resourceTokens: 3, resourceBytes: 30,
    redundantTokens: 11, totalTokens: 41, nativePrimaryUsage: null, nativeFullCycleUsage: null,
  });
  const zero = traceRuntimeFacts({ availability: 'available', events: [] }, { sessionStartMeasurement: { injectedTokens: 0, injectedBytes: 0 } });
  assert.equal(zero.previewTokens, 0);
  assert.equal(zero.loadedBodyTokens, 0);
  assert.equal(zero.redundantTokens, 0);
  assert.equal(zero.totalTokens, 0);
});

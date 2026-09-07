import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregate, attachNativeUsage, cohortReport, compactSnapshot, evaluateKnowledge, evaluationActorContext, evaluationQualityReport, freeze, judgeCell, noKnowledgeRuntimeFacts, normalizeUsage, pairedReport, primaryJudgmentReport, promptContract, runCells, selectFrozenCells, thresholdReport, traceRuntimeFacts } from './evaluate-knowledge.mjs';

test('knowledge evaluation freezes twelve hidden-oracle cases and matched host cells', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-evaluation-'));
  const fixtures = path.join(root, 'fixtures'); fs.mkdirSync(fixtures);
  const cases = Array.from({ length: 12 }, (_, index) => ({ id: `case-${index}` }));
  fs.writeFileSync(path.join(fixtures, 'manifest.json'), JSON.stringify({ artifactPath: 'artifacts/decision.md', cases }));
  const oracle = path.join(root, 'oracle.json'); fs.writeFileSync(oracle, JSON.stringify({ 'case-0': 'gold-label' }));
  const output = path.join(root, 'freeze.json');
  const frozen = freeze(fixtures, oracle, output);
  assert.equal(frozen.cells.length, 12 * 3 * 2 * 2);
  assert.ok(frozen.cells.every((cell) => cell.artifactPath === 'artifacts/decision.md' && !cell.artifactPath.includes(cell.caseId)));
  assert.deepEqual(frozen.concurrency, { total: 4, perHost: 2 });
  fs.writeFileSync(path.join(fixtures, 'manifest.json'), JSON.stringify({ artifactPath: 'artifacts/decision.md', cases, leaked: 'gold-label' }));
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
  fs.writeFileSync(path.join(fixtures, 'manifest.json'), JSON.stringify({ artifactPath: 'artifacts/decision.md', cases: Array.from({ length: 12 }, (_, index) => ({ id: `case-${index}`, task: `Task ${index}` })) }));
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
  fs.writeFileSync(path.join(fixtures, 'manifest.json'), JSON.stringify({ artifactPath: 'artifacts/decision.md', cases: Array.from({ length: 12 }, (_, index) => ({ id: `case-${index}` })) }));
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
  await runCells({ ...manifest, cells: [{ ...manifest.cells[0], promptHash: 'changed-prompt' }] }, output, invoke);
  await runCells({ ...manifest, hashes: { fixtures: 'changed', oracle: 'oracle-hash' } }, output, invoke);
  assert.equal(calls, 3);
});

test('a thrown cell is persisted as failed while other frozen cells continue', async () => {
  const result = await runCells({
    cells: [{ id: 'first', caseId: 'case', host: 'claude' }, { id: 'second', caseId: 'case', host: 'codex' }],
    concurrency: { total: 2, perHost: 1 }, oracle: { case: { requiredPhrases: [] } },
  }, fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-evaluation-cell-error-')), async (cell) => {
    if (cell.id === 'first') throw new Error('fixture setup unavailable');
    return { status: 'completed', textFinalAnswers: [], deliverable: { exists: true, bytes: 1 } };
  });
  assert.equal(result.cells.find((cell) => cell.id === 'first').runtime.status, 'launch_failed');
  assert.equal(result.cells.find((cell) => cell.id === 'second').status, 'completed');
});

test('lifecycle prompts use user transport only where the plugin exists', () => {
  const entry = { id: 'lifecycle-identity', longitudinalSteps: [
    'Start a fresh session. As the user-requested workflow command, run {EXECUTE_COMMAND} --orchestrated --finalization-owner parent --review-profile final-only for the staged feature. Do work.',
    'Learn the work.',
    'Start a fresh session. As the user-requested workflow command, run {SHIP_COMMAND}: refresh the work.',
  ] };
  assert.match(promptContract(entry, 'artifacts/decision.md', 'claude', 'candidate')[0], /^\/spectre:spectre-execute /);
  assert.match(promptContract(entry, 'artifacts/decision.md', 'codex', 'candidate')[2], /^spectre-ship\n/);
  assert.match(promptContract(entry, 'artifacts/decision.md', 'claude', 'candidate')[0], /--finalization-owner parent/);
  assert.doesNotMatch(promptContract(entry, 'artifacts/decision.md', 'claude', 'no-knowledge')[2], /spectre:|spectre-ship/);
});

test('native actor and context inputs are opaque to fixture labels', () => {
  const values = evaluationActorContext({ caseId: 'critical-old-constraint', host: 'claude', condition: 'candidate', repeat: 1 }, 2);
  assert.match(values.actorId, /^evaluation-[a-f0-9]+$/);
  assert.match(values.contextId, /^evaluation-[a-f0-9]+$/);
  assert.doesNotMatch(`${values.actorId}:${values.contextId}`, /critical|constraint|candidate|claude/);
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
  assert.equal(primaryJudgmentReport(cells, [{ ...accepted.reviewed[0], cellId: cells[0].id, artifactHash: 'sha256:wrong', artifactEvidence: 'sha256:wrong' }]).status, 'invalid');
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

test('a proven no-knowledge isolation reports zero knowledge delivery without zeroing native task usage', () => {
  const result = noKnowledgeRuntimeFacts({ usage: { primary: { input: 8 }, fullCycle: { coverage: 'complete', total: { input: 8, output: 3 } }, sessionStartMeasurement: { availability: 'none' } } }, true);
  assert.deepEqual({
    injectedTokens: result.injectedTokens, previewTokens: result.previewTokens, loadedBodyTokens: result.loadedBodyTokens,
    resourceTokens: result.resourceTokens, redundantTokens: result.redundantTokens, totalTokens: result.totalTokens,
  }, { injectedTokens: 0, previewTokens: 0, loadedBodyTokens: 0, resourceTokens: 0, redundantTokens: 0, totalTokens: 0 });
  assert.deepEqual(result.nativeFullCycleUsage, { coverage: 'complete', total: { input: 8, output: 3 } });
  assert.equal(noKnowledgeRuntimeFacts({}, false).loadedBodyTokens, null);
});

test('post-hoc baseline facts retain native usage reported by the host', () => {
  const usage = { primary: { input: 10 }, fullCycle: { coverage: 'complete', total: { input: 10, output: 2 } } };
  assert.deepEqual(attachNativeUsage({ loadedBodyTokens: 7, nativePrimaryUsage: null, nativeFullCycleUsage: null }, { usage }), {
    loadedBodyTokens: 7, nativePrimaryUsage: usage.primary, nativeFullCycleUsage: usage.fullCycle,
  });
});

test('thresholds use hash-bound manual outcomes, bounded trace metrics, and quality-gated benefit pairs', () => {
  const usage = { coverage: 'complete', total: { input: 10, cache: 0, cacheWrite: 0, output: 5, reasoning: null } };
  const runtime = (condition, hash) => ({
    nativeFullCycleUsage: usage, deliverable: { hash }, loadedBodyTokens: condition === 'candidate' ? 100 : 0,
    redundantTokens: 0, sessionStartMeasurement: condition === 'no-knowledge' ? { availability: 'none' } : { availability: 'available' },
    usage: { sessions: [{ sessionStartMeasurement: { availability: 'available', injectedTokens: 200 } }] },
    trace: condition === 'candidate' ? { availability: 'available', events: [
      { type: 'search', responseTokens: 300 }, { type: 'load', loadedTokens: 100 },
    ] } : { availability: 'unavailable', events: [] },
  });
  const cells = ['baseline', 'candidate', 'no-knowledge'].map((condition) => ({
    id: `case:${condition}:claude:1`, caseId: 'case', condition, host: 'claude', repeat: 1, cohort: 'chat', critical: condition === 'candidate',
    runtime: runtime(condition, `sha256:${condition}`), judged: { structuralValid: true, recalled: null },
  }));
  cells[1].runtime.trace.events.push({ type: 'history-read', subtype: 'history-body', loadedTokens: 10 });
  const judgments = cells.map((cell) => ({ cellId: cell.id, artifactHash: cell.runtime.deliverable.hash, artifactEvidence: cell.runtime.deliverable.hash,
    correct: true, relevant: true, requiredRecallBeforeDecision: true, irrelevantTokens: cell.condition === 'candidate' ? 4 : 0, unnecessaryHistoryLoads: 0 }));
  const oracle = { case: { requiredRecordHashes: ['sha256:record'] } };
  const paired = pairedReport(cells, oracle, judgments);
  const report = thresholdReport(cells, paired, oracle, judgments);
  assert.equal(report.requiredRecall, 'pass');
  assert.equal(report.efficiency.startupTokens.status, 'pass');
  assert.equal(report.efficiency.searchPreviewTokens.status, 'pass');
  assert.equal(report.efficiency.routineIrrelevantLoadedBodyRate, .04);
  assert.equal(report.efficiency.criticalHistoryLoads, 0);
  assert.equal(report.pairedEfficiency.qualityEligiblePairs, 1);
  assert.equal(report.correctnessVsBothControls.status, 'pass');
  assert.equal(report.status, 'pending');
});

test('paired reporting flags a regression against either control and never selects cheap failed pairs', () => {
  const usage = { coverage: 'complete', total: { input: 10, cache: 0, cacheWrite: 0, output: 1, reasoning: null } };
  const cells = ['baseline', 'candidate', 'no-knowledge'].map((condition) => ({
    id: `case:${condition}:claude:1`, caseId: 'case', condition, host: 'claude', repeat: 1, cohort: 'workflow', critical: false,
    runtime: { deliverable: { hash: `sha256:${condition}` }, nativeFullCycleUsage: usage, loadedBodyTokens: 1, redundantTokens: 0,
      usage: { sessions: [{ sessionStartMeasurement: { availability: 'available', injectedTokens: 1 } }] },
      trace: condition === 'candidate' ? { availability: 'available', events: [] } : { availability: 'unavailable', events: [] } },
    judged: { structuralValid: true, recalled: null },
  }));
  const judgments = cells.map((cell) => ({ cellId: cell.id, artifactHash: cell.runtime.deliverable.hash, artifactEvidence: cell.runtime.deliverable.hash,
    correct: cell.condition !== 'candidate', relevant: true, requiredRecallBeforeDecision: true, irrelevantTokens: 0, unnecessaryHistoryLoads: 0 }));
  const oracle = { case: { requiresCapture: true } };
  const paired = pairedReport(cells, oracle, judgments);
  const report = thresholdReport(cells, paired, oracle, judgments);
  assert.equal(paired[0].correctnessVsBothControls, 'regression');
  assert.equal(report.correctnessVsBothControls.status, 'fail');
  assert.equal(report.pairedEfficiency.failedQualityPairs, 1);
  assert.equal(report.pairedEfficiency.hypothesis, 'unknown');
  const improvedJudgments = judgments.map((judgment) => ({ ...judgment, correct: judgment.cellId.includes(':candidate:') || judgment.cellId.includes(':baseline:') }));
  const improvedPairs = pairedReport(cells, oracle, improvedJudgments);
  assert.equal(primaryJudgmentReport(cells, improvedJudgments).status, 'reviewed');
  assert.equal(improvedPairs[0].qualityGate, true);
  assert.equal(improvedPairs[0].correctnessVsBothControls, 'no-regression');
  const incomplete = thresholdReport(cells, paired, oracle, judgments.map((judgment) => ({ ...judgment, irrelevantTokens: undefined })));
  assert.equal(incomplete.efficiency.routineIrrelevantLoadedBodyRate, 'unknown');
});

test('cohorts retain measured retrieval totals alongside native full-cycle dimensions', () => {
  const cells = [10, 20].map((injectedTokens, index) => ({
    id: `case:candidate:claude:${index + 1}`, caseId: 'case', condition: 'candidate', host: 'claude', cohort: 'chat', status: 'pending',
    runtime: {
      sessions: [{ status: 'completed' }], textFinalAnswers: ['answer'], snapshots: { after: { history: [] } },
      injectedTokens, previewTokens: injectedTokens + 1, loadedBodyTokens: injectedTokens + 2, redundantTokens: 0, totalTokens: injectedTokens + 3,
      nativeFullCycleUsage: { coverage: 'complete', total: { input: 1, cache: 2, cacheWrite: 3, output: 4, reasoning: null } },
    }, judged: { structuralValid: true, recalled: null },
  }));
  const cohort = cohortReport(cells)['candidate:claude:chat'];
  assert.equal(cohort.injectedTokens.median, 10);
  assert.equal(cohort.previewTokens.p95, 21);
  assert.equal(cohort.redundantTokens.median, 0);
  assert.equal(cohort.totalTokens.median, 13);
  assert.equal(cohort.nativePrimaryPlusWorkerTokens.total.median, 10);
});

test('longitudinal snapshots retain captured records and history after an unchanged fresh session', () => {
  const original = { records: [{ id: 'retry-ceiling-evidence', revisionToken: 'source' }], history: [], workRecords: [] };
  const captured = { records: [...original.records, { id: 'retry-ceiling', revisionToken: 'v1' }], history: [{ id: 'retry-ceiling', revisionToken: 'v1' }], workRecords: [] };
  const firstAfter = compactSnapshot(captured, ['retry-ceiling-evidence'], original);
  const laterAfter = compactSnapshot(captured, ['retry-ceiling-evidence', ...firstAfter.records.map((record) => record.id)], captured);
  assert.deepEqual(firstAfter.records.map((record) => record.id), ['retry-ceiling-evidence', 'retry-ceiling']);
  assert.deepEqual(laterAfter.records.map((record) => record.id), ['retry-ceiling-evidence', 'retry-ceiling']);
  assert.deepEqual(laterAfter.history.map((entry) => entry.id), ['retry-ceiling']);
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
  const baselineInspect = judgeCell({ ...cell, condition: 'baseline' }, {
    ...runtime, toolOperations: [
      { ...runtime.toolOperations[0], input: { command: `node knowledge-cli.mjs load ${recordId}` } }, runtime.toolOperations[1],
    ], trace: { availability: 'unavailable', events: [] },
  }, { case: { ...oracle.case, requiredReadCommand: 'inspect' } });
  assert.equal(baselineInspect.structuralValid, true);
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

test('unarmed lifecycle registration fault becomes cell evidence instead of a lost run', () => {
  const result = judgeCell({ caseId: 'lifecycle', condition: 'candidate' }, {
    status: 'completed', deliverablePath: 'artifacts/decision.md', deliverable: { exists: true, bytes: 1 }, bypass: [],
    toolOperations: [{ name: 'Write', status: 'completed', eventOrdinal: 1, input: { file_path: 'artifacts/decision.md' } }],
    trace: { availability: 'available', events: [] }, lifecycleEvidence: { registrationFault: 'not-armed', error: 'ENOENT' },
  }, { lifecycle: { requiredRecordHashes: [], requiredStates: ['save-failure'] } });
  assert.equal(result.reason, 'lifecycle registration-fault setup was unavailable');
});

test('lifecycle requires Execute capture before a later explicit work summary', () => {
  const runtime = {
    status: 'completed', deliverablePath: 'artifacts/decision.md', deliverable: { exists: true, bytes: 1 }, bypass: [],
    toolOperations: [{ name: 'Write', status: 'completed', sessionOrdinal: 1, eventOrdinal: 2, input: { file_path: 'artifacts/decision.md' } }],
    trace: { availability: 'available', events: [{ type: 'capture', contextHash: 'execute', outcome: 'created' }] },
    sessionSnapshots: [{ contextHash: 'execute' }],
  };
  const oracle = { lifecycle: { requiredRecordHashes: [], requiresExecuteAutoCapture: true } };
  assert.equal(judgeCell({ caseId: 'lifecycle', condition: 'candidate' }, runtime, oracle).valid, true);
  assert.equal(judgeCell({ caseId: 'lifecycle', condition: 'candidate' }, {
    ...runtime, toolOperations: [{ name: 'Learn', sessionOrdinal: 0, eventOrdinal: 1, input: {} }, ...runtime.toolOperations],
  }, oracle).reason, 'automatic Execute capture evidence is missing');
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

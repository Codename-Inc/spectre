import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildKnowledgeEvaluationReport } from './knowledge-evaluation-report.mjs';
test('report keeps missing manual or native evidence pending', () => {
  const cell = { id:'a', host:'claude', condition:'candidate', cohort:'knowledge-benefit', critical:true, runtime:{totalTokens:10}, trace:{requiredBeforeDecision:true,historyLoads:0,redundantLoads:0} };
  const report = buildKnowledgeEvaluationReport({ cells:[cell] });
  assert.equal(report.quality.status, 'pending');
  assert.equal(report.runtime['claude:candidate:knowledge-benefit'].previewTokens.median, 'unknown');
  assert.equal(report.paired.efficiency, 'failed-hypothesis');
});

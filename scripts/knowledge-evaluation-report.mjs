const metrics = ['injectedTokens', 'previewTokens', 'loadedBodyTokens', 'redundantTokens', 'totalTokens'];
const percentile = (values, p) => { const sorted = values.filter(Number.isFinite).sort((a,b) => a-b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : 'unknown'; };
const summary = values => ({ known: values.filter(Number.isFinite).length, missing: values.filter(value => !Number.isFinite(value)).length, median: percentile(values, .5), p95: percentile(values, .95) });

/** Pure report: unknown telemetry or missing primary adjudication remains pending. */
export function buildKnowledgeEvaluationReport({ cells = [], oracle = {}, primaryJudgments = [] } = {}) {
  const judgment = new Map(primaryJudgments.map(item => [item.cellId, item]));
  const groups = {};
  for (const cell of cells) {
    const key = [cell.host, cell.condition, cell.cohort || 'chat'].join(':');
    const bucket = groups[key] ||= [];
    bucket.push(cell);
  }
  const runtime = Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, Object.fromEntries(metrics.map(metric => [metric, summary(group.map(cell => cell.runtime?.[metric]))]))]));
  const candidateCritical = cells.filter(cell => cell.condition === 'candidate' && cell.critical);
  const manual = candidateCritical.map(cell => judgment.get(cell.id));
  const pending = manual.some(value => !value?.artifactEvidence || value.correct !== true || value.relevant !== true);
  const criticalTraceFailure = candidateCritical.some(cell => cell.trace?.historyLoads > 0 || cell.trace?.redundantLoads > 0 || cell.trace?.requiredBeforeDecision !== true);
  const routine = cells.filter(cell => cell.condition === 'candidate' && !cell.critical);
  const routineBody = routine.reduce((sum, cell) => sum + (Number.isFinite(cell.runtime?.loadedBodyTokens) ? cell.runtime.loadedBodyTokens : 0), 0);
  const irrelevant = routine.reduce((sum, cell) => sum + (judgment.get(cell.id)?.irrelevantTokens ?? 0), 0);
  const relevance = routine.length && routineBody ? irrelevant / routineBody <= .05 : 'unknown';
  const quality = { status: pending || relevance === 'unknown' ? 'pending' : !criticalTraceFailure && relevance ? 'pass' : 'fail', criticalRecallBeforeDecision: pending ? 'unknown' : !criticalTraceFailure, routineIrrelevantTokenRatio: routineBody ? irrelevant / routineBody : 'unknown', pendingReason: pending ? 'primary artifact-backed correctness/relevance judgment is missing or negative' : null };
  const benefit = cells.filter(cell => cell.cohort === 'knowledge-benefit');
  const median = condition => percentile(benefit.filter(cell => cell.condition === condition).map(cell => cell.runtime?.totalTokens), .5);
  const paired = { candidateMedian: median('candidate'), baselineMedian: median('baseline'), noKnowledgeMedian: median('no-knowledge'), efficiency: quality.status === 'pass' && Number.isFinite(median('candidate')) && Number.isFinite(median('baseline')) && median('candidate') < median('baseline') ? 'supported' : 'failed-hypothesis', candidateMinusNoKnowledge: Number.isFinite(median('candidate')) && Number.isFinite(median('no-knowledge')) ? median('candidate') - median('no-knowledge') : 'unknown' };
  return { runtime, quality, paired, samples: { total: cells.length, groups: Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, group.length])) } };
}

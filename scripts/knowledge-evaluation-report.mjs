const cohorts = new Set(['chat', 'workflow', 'history', 'longitudinal']);
const numbers = values => values.filter(Number.isFinite).sort((a, b) => a - b);
const percentile = (values, p) => { const known = numbers(values); return known.length ? known[Math.min(known.length - 1, Math.ceil(known.length * p) - 1)] : 'unknown'; };
const stats = values => ({ known: numbers(values).length, missing: values.length - numbers(values).length, median: percentile(values, .5), p95: percentile(values, .95) });

function events(cell) { return cell.runtime?.trace?.events; }
function traceFacts(cell) {
  const list = events(cell);
  if (!Array.isArray(list)) return null;
  return { history: list.filter(event => event.type === 'history-read').length, redundant: list.filter(event => event.type === 'load' && event.redundant === true).length, caps: list.every(event => (event.type !== 'session-start' || event.responseTokens <= 300) && (event.type !== 'preview' || event.responseTokens <= 500) && (event.type !== 'load' || event.allowanceTokens === undefined || event.allowanceTokens <= 1500 || event.expansion === true)) };
}

/** Missing telemetry, trace, or artifact-backed adjudication remains pending; it can never pass. */
export function buildKnowledgeEvaluationReport({ cells = [], oracle = {}, primaryJudgments = [] } = {}) {
  const manual = new Map(primaryJudgments.map(value => [value.cellId, value]));
  const grouped = {};
  for (const cell of cells) {
    const cohort = cohorts.has(cell.cohort) ? cell.cohort : 'unknown';
    (grouped[`${cell.host}:${cell.condition}:${cohort}`] ||= []).push(cell);
  }
  const runtime = Object.fromEntries(Object.entries(grouped).map(([key, group]) => [key, {
    injected: stats(group.map(c => c.runtime?.injectedTokens)), preview: stats(group.map(c => c.runtime?.previewTokens)), body: stats(group.map(c => c.runtime?.loadedBodyTokens)), redundant: stats(group.map(c => c.runtime?.redundantTokens)), nativeFullCycle: stats(group.map(c => c.runtime?.nativeFullCycleUsage?.coverage === 'complete' ? c.runtime.nativeFullCycleUsage.total : undefined)),
  }]));
  const candidate = cells.filter(c => c.condition === 'candidate');
  const critical = candidate.filter(c => c.critical);
  const required = critical.map(c => ({ cell: c, oracle: oracle[c.caseId] || {}, judgment: manual.get(c.id), trace: traceFacts(c) }));
  const incomplete = required.some(({ judgment, trace }) => !judgment?.artifactEvidence || judgment.correct === undefined || judgment.relevant === undefined || trace === null);
  const criticalFailure = required.some(({ judgment, trace, oracle: rule }) => judgment?.correct === false || judgment?.relevant === false || trace?.redundant > 0 || (rule.allowedHistoryLoads === 0 && trace?.history > 0) || trace?.caps === false);
  const routine = candidate.filter(c => !c.critical && Number.isFinite(c.runtime?.loadedBodyTokens));
  const routineJudged = routine.map(c => manual.get(c.id));
  const relevanceUnknown = routineJudged.some(j => !Number.isFinite(j?.irrelevantTokens));
  const body = routine.reduce((sum, c) => sum + c.runtime.loadedBodyTokens, 0);
  const irrelevant = relevanceUnknown ? 'unknown' : routineJudged.reduce((sum, j) => sum + j.irrelevantTokens, 0);
  const quality = { status: incomplete || relevanceUnknown ? 'pending' : criticalFailure || (body > 0 && irrelevant / body > .05) ? 'fail' : 'pass', criticalRecallBeforeDecision: incomplete ? 'unknown' : !criticalFailure, routineIrrelevantTokenRatio: irrelevant === 'unknown' ? 'unknown' : body === 0 ? 0 : irrelevant / body };
  const pairs = new Map();
  for (const cell of cells) {
    const key = `${cell.caseId}:${cell.host}:${cell.repeat}`;
    (pairs.get(key) || pairs.set(key, []).get(key)).push(cell);
  }
  const deltas = [...pairs.values()].flatMap(group => {
    const a = group.find(c => c.condition === 'candidate')?.runtime?.nativeFullCycleUsage;
    const b = group.find(c => c.condition === 'baseline')?.runtime?.nativeFullCycleUsage;
    return a?.coverage === 'complete' && b?.coverage === 'complete' && Number.isFinite(a.total) && Number.isFinite(b.total) ? [a.total - b.total] : [];
  });
  return { runtime, quality, paired: { pairs: deltas.length, medianDelta: percentile(deltas, .5), efficiency: quality.status === 'pass' && deltas.length && percentile(deltas, .5) < 0 ? 'supported' : 'failed-hypothesis' }, samples: { total: cells.length, instability: cells.length ? Object.values(grouped).filter(group => group.length < 2).length : 'unknown' } };
}

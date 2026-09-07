#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { invokeKnowledgeHost } from './knowledge-evaluation-hosts.mjs';
import { blockKnowledgeRegistration, snapshotKnowledgeCell, stageKnowledgeCell as stagePreparedKnowledgeCell } from './knowledge-evaluation-staging.mjs';
import { detectTraceBypass, readEvaluationTrace } from '../plugins/spectre/hooks/scripts/knowledge/evaluation-trace.mjs';

const BASELINE = '1cd1f035a253e9d7ef5086693ab9f1d0b11d360b';
const CONDITIONS = ['no-knowledge', 'baseline', 'candidate'];
const HOSTS = ['claude', 'codex'];
const ACCEPTANCE_THRESHOLDS = Object.freeze({
  requiredRecall: 1,
  unnecessaryHistoryLoads: 0,
  redundantSameContextLoads: 0,
  routineIrrelevantLoadedBodyRate: 0.05,
});

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function filesHash(root) {
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push([path.relative(root, target), hash(fs.readFileSync(target))]);
    }
  };
  visit(root);
  return hash(JSON.stringify(files.sort(([left], [right]) => left.localeCompare(right))));
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function usage() {
  return 'Usage: evaluate-knowledge.mjs freeze --fixtures <dir> --oracle <file> --output <file> [--config <file> --candidate <dir>]\n       evaluate-knowledge.mjs run --freeze <file> --fixtures <dir> --config <file> --baseline-plugin <dir> --candidate-plugin <dir> --output <dir> --report <file> --allow-native\n';
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

function freeze(fixtures, oracle, output, options = {}) {
  const manifest = readJson(path.join(fixtures, 'manifest.json'));
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== 12) throw new Error('fixture manifest must contain exactly 12 cases');
  const fixtureBytes = fs.readFileSync(path.join(fixtures, 'manifest.json'));
  const oracleBytes = fs.readFileSync(oracle);
  for (const value of strings(readJson(oracle))) {
    if (value && fixtureBytes.includes(value)) throw new Error('gold oracle value leaked into agent-readable fixture');
  }
  const configurationPath = options.configurationPath ? path.resolve(options.configurationPath) : null;
  const candidatePath = options.candidatePath ? path.resolve(options.candidatePath) : null;
  if (configurationPath && !fs.statSync(configurationPath).isFile()) throw new Error('configurationPath must identify a file');
  if (candidatePath && !fs.statSync(candidatePath).isDirectory()) throw new Error('candidatePath must identify a directory');
  const cells = manifest.cases.flatMap(entry => CONDITIONS.flatMap(condition =>
    HOSTS.flatMap(host => [1, 2].map(repeat => ({
      id: `${entry.id}:${condition}:${host}:${repeat}`,
      caseId: entry.id,
      condition,
      host,
      repeat,
      longitudinal: Boolean(entry.longitudinal),
      cohort: entry.longitudinal ? 'longitudinal' : entry.cohort ?? 'workflow',
      critical: entry.critical === true,
    })))
  ));
  const result = {
    schemaVersion: 2, baseline: BASELINE, fixtureHash: hash(fixtureBytes), oracleHash: hash(oracleBytes),
    hashes: {
      fixtures: filesHash(fixtures), oracle: hash(oracleBytes),
      configuration: configurationPath ? hash(fs.readFileSync(configurationPath)) : null,
      candidate: candidatePath ? filesHash(candidatePath) : null,
    },
    fixtureRoot: path.resolve(fixtures), oraclePath: path.resolve(oracle), configurationPath, candidatePath, cells,
    concurrency: { total: 4, perHost: 2 }, freshStores: true, longitudinalSequential: true,
    usage: 'unknown-until-native-host-reports',
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function normalizeUsage(raw = {}) {
  const pick = key => Number.isFinite(raw[key]) ? raw[key] : 'unknown';
  return { input: pick('input'), cache: pick('cache'), cacheWrite: pick('cacheWrite'), output: pick('output'), reasoning: pick('reasoning') };
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 'unknown';
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export function aggregate(cells = []) {
  const required = cells.filter(cell => cell.judged != null);
  const metric = name => cells.map(cell => cell.runtime?.[name]);
  const summary = values => ({ known: values.filter(Number.isFinite).length, missing: values.filter(value => !Number.isFinite(value)).length, median: percentile(values, .5), p95: percentile(values, .95) });
  return {
    runtime: Object.fromEntries(['injectedTokens', 'previewTokens', 'loadedBodyTokens', 'redundantTokens', 'totalTokens'].map(name => [name, summary(metric(name))])),
    judged: {
      requiredRecall: required.some(cell => cell.judged?.recalled === false) ? false
        : required.length > 0 && required.every(cell => cell.judged?.recalled === true) ? true : 'unknown',
      irrelevantLoadedTokens: cells.some(cell => !Number.isFinite(cell.judged?.irrelevantLoadedTokens)) ? 'unknown' : cells.reduce((sum, cell) => sum + cell.judged.irrelevantLoadedTokens, 0),
    },
    samples: cells.length,
  };
}

export function judgeCell(cell, runtime, oracle) {
  const expected = oracle?.[cell.caseId];
  if (!expected) return { valid: false, recalled: false, reason: 'oracle judgment is missing' };
  if (cell.condition === 'candidate' && runtime?.trace?.availability === 'unavailable') return { valid: false, recalled: false, reason: 'candidate evaluation trace is unavailable' };
  if (runtime?.status !== 'completed') return { valid: false, recalled: false, reason: `host status is ${runtime?.status ?? 'missing'}` };
  if (runtime?.bypass?.length > 0) return { valid: false, recalled: false, reason: 'direct knowledge-store bypass detected' };
  if (runtime?.deliverable?.exists !== true) return { valid: false, recalled: false, reason: 'decision artifact was not persisted' };
  if (Array.isArray(expected.requiredRecordHashes)) {
    const expectedHashes = new Set(expected.requiredRecordHashes);
    const loadOperations = (runtime.toolOperations ?? []).filter((operation) => {
      const command = operation?.input?.command ?? '';
      return /knowledge-cli\.mjs\s+load\s+([a-z0-9]+(?:-[a-z0-9]+)*)\b/.test(command) &&
        [...command.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g)].some((match) => expectedHashes.has(hash(match[0]))) &&
        (operation.status === null || operation.status === 'completed');
    });
    const matchedResults = (runtime.toolResults ?? []).filter((result) =>
      loadOperations.some((operation) => operation.id !== null && operation.id === result.toolUseId) &&
      typeof result.content === 'string' && [...result.content.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g)]
        .some((match) => expectedHashes.has(hash(match[0])))
    );
    const artifactWrite = (runtime.toolOperations ?? []).find((operation) =>
      (operation.name === 'Write' || operation.name === 'exec') &&
      JSON.stringify(operation.input ?? '').includes(runtime.deliverablePath) &&
      (operation.status === null || operation.status === 'completed')
    );
    const orderedLoad = matchedResults.some((result) =>
      Number.isInteger(result.eventOrdinal) &&
      Number.isInteger(artifactWrite?.eventOrdinal) && result.eventOrdinal < artifactWrite.eventOrdinal
    );
    const stagedRevisions = new Map((runtime.snapshots?.before?.records ?? []).map((record) => [record.id, record.revisionToken]));
    const tracedLoad = runtime.trace?.events?.some((event) =>
      event.type === 'load' && expectedHashes.has(hash(event.id ?? '')) && event.revisionToken === stagedRevisions.get(event.id)
    );
    if (expectedHashes.size > 0 && (!orderedLoad || (cell.condition === 'candidate' && !tracedLoad))) {
      return { valid: false, recalled: false, reason: 'native load-before-artifact evidence is missing' };
    }
    if (expected.requiresCapture === true && cell.condition === 'candidate' && !runtime.trace?.events?.some((event) => event.type === 'capture')) {
      return { valid: false, recalled: false, reason: 'capture trace evidence is missing' };
    }
    const captureOperations = (runtime.toolOperations ?? []).filter((operation) =>
      operation.name === 'Learn' || /knowledge-cli\.mjs\s+(?:capture|learn)\b/.test(operation?.input?.command ?? '')
    );
    if (expected.requiresCapture === true && captureOperations.some((operation) => operation.actorRole === 'worker')) {
      return { valid: false, recalled: false, reason: 'worker-owned knowledge capture is not primary evidence' };
    }
    const ghCommands = runtime.workflowEvidence?.ghCommands ?? [];
    if (Number.isInteger(expected.minimumPrCreates) && ghCommands.filter((command) => /^pr create\b/.test(command)).length < expected.minimumPrCreates) {
      return { valid: false, recalled: false, reason: 'direct PR fallback evidence is missing' };
    }
    if (expected.requiresSameWorkId === true) {
      const workRecords = runtime.snapshots?.after?.workRecords ?? [];
      if (workRecords.length !== 1 || !workRecords[0].id || !workRecords[0].revisionToken ||
        !workRecords[0].execution || !workRecords[0].verification || !workRecords[0].pullRequest) {
        return { valid: false, recalled: false, reason: 'same work identity evidence is missing' };
      }
    }
    if (expected.requiresPrView === true && !ghCommands.some((command) => /^pr view\b/.test(command))) {
      return { valid: false, recalled: false, reason: 'repeat/noop PR evidence is missing' };
    }
    return expected.manualRubric
      ? { valid: false, recalled: null, reason: 'manual semantic adjudication pending', structuralValid: true, manualRubric: expected.manualRubric }
      : { valid: true, recalled: true, reason: null };
  }
  const answer = (runtime.textFinalAnswers ?? []).join('\n').toLocaleLowerCase();
  const required = Array.isArray(expected.requiredPhrases) ? expected.requiredPhrases : [];
  const missing = required.filter(phrase => !answer.includes(String(phrase).toLocaleLowerCase()));
  if (missing.length > 0) return { valid: false, recalled: false, reason: 'required oracle phrase was not found' };
  return { valid: true, recalled: true, reason: null };
}

export async function runCells(freezeManifest, outputDir, invoke) {
  const oracle = freezeManifest.oraclePath ? readJson(freezeManifest.oraclePath) : freezeManifest.oracle;
  fs.mkdirSync(outputDir, { recursive: true });
  const results = [];
  const pending = [...freezeManifest.cells];
  const activeByHost = new Map(HOSTS.map(host => [host, 0]));
  const total = freezeManifest.concurrency?.total ?? 4;
  const perHost = freezeManifest.concurrency?.perHost ?? 2;
  const next = async () => {
    for (;;) {
      const index = pending.findIndex(cell => activeByHost.get(cell.host) < perHost);
      if (index === -1) return;
      const cell = pending.splice(index, 1)[0];
      activeByHost.set(cell.host, activeByHost.get(cell.host) + 1);
      try {
        const cellDir = fs.mkdtempSync(path.join(outputDir, `${cell.host}-${cell.condition}-`));
        const runtime = await invoke({ ...cell, cellDir });
        const judged = judgeCell(cell, runtime, oracle);
        results.push({
          ...cell,
          status: runtime?.status === 'completed' && judged.valid ? 'completed' : runtime?.status === 'completed' ? 'invalid' : runtime?.status ?? 'invalid',
          runtime: {
            ...runtime,
            usage: { ...(runtime?.usage ?? {}), primary: normalizeUsage(runtime?.usage?.primary ?? runtime?.usage) },
          },
          judged,
        });
      } finally {
        activeByHost.set(cell.host, activeByHost.get(cell.host) - 1);
      }
    }
  };
  await Promise.all(Array.from({ length: total }, next));
  results.sort((left, right) => left.id.localeCompare(right.id));
  return { schemaVersion: 2, baseline: BASELINE, cells: results, aggregate: aggregate(results) };
}

function cohortReport(cells) {
  const cohorts = {};
  for (const cell of cells) {
    const key = `${cell.condition}:${cell.host}:${cell.cohort ?? 'workflow'}`;
    const cohort = cohorts[key] ?? {
      samples: 0, completed: 0, invalid: 0, recalled: 0, manualPending: 0,
      sessions: [], messages: [], workflowOperations: [], historyEntries: [], loadedBodyTokens: [],
      nativeInput: [], nativeCache: [], nativeCacheWrite: [], nativeOutput: [], nativeReasoning: [], nativeTotal: [],
    };
    cohort.samples += 1;
    if (cell.status === 'completed') cohort.completed += 1;
    if (cell.status === 'invalid') cohort.invalid += 1;
    if (cell.judged?.recalled === true) cohort.recalled += 1;
    if (cell.judged?.structuralValid === true) cohort.manualPending += 1;
    cohort.sessions.push(cell.runtime?.sessions?.length ?? 1);
    cohort.messages.push(cell.runtime?.textFinalAnswers?.length ?? 0);
    cohort.workflowOperations.push((cell.runtime?.toolOperations ?? []).filter((operation) => ['Skill', 'Task', 'Plan', 'Execute', 'Ship', 'CreatePR'].includes(operation.name)).length);
    cohort.historyEntries.push(cell.runtime?.snapshots?.after?.history?.length ?? null);
    cohort.loadedBodyTokens.push(cell.runtime?.loadedBodyTokens ?? null);
    const native = cell.runtime?.nativeFullCycleUsage?.coverage === 'complete'
      ? cell.runtime.nativeFullCycleUsage.total : null;
    cohort.nativeInput.push(native?.input ?? null);
    cohort.nativeCache.push(native?.cache ?? null);
    cohort.nativeCacheWrite.push(native?.cacheWrite ?? null);
    cohort.nativeOutput.push(native?.output ?? null);
    cohort.nativeReasoning.push(native?.reasoning ?? null);
    cohort.nativeTotal.push(nativeUsageTokenTotal(cell.host, native));
    cohorts[key] = cohort;
  }
  return Object.fromEntries(Object.entries(cohorts).map(([key, cohort]) => [key, {
    ...cohort,
    sessions: metricSummary(cohort.sessions),
    messages: metricSummary(cohort.messages),
    workflowOperations: metricSummary(cohort.workflowOperations),
    historyEntries: metricSummary(cohort.historyEntries),
    loadedBodyTokens: metricSummary(cohort.loadedBodyTokens),
    nativePrimaryPlusWorkerTokens: {
      input: metricSummary(cohort.nativeInput), cache: metricSummary(cohort.nativeCache), cacheWrite: metricSummary(cohort.nativeCacheWrite),
      output: metricSummary(cohort.nativeOutput), reasoning: metricSummary(cohort.nativeReasoning), total: metricSummary(cohort.nativeTotal),
    },
  }]));
}

function metricSummary(values) {
  return { known: values.filter(Number.isFinite).length, missing: values.filter((value) => !Number.isFinite(value)).length, median: percentile(values, .5), p95: percentile(values, .95) };
}

function nativeUsageTokenTotal(host, value) {
  if (!value || !Number.isFinite(value.input) || !Number.isFinite(value.output)) return null;
  // Claude modelUsage separates ordinary and cache input; Codex input already includes its cache dimensions.
  if (host === 'codex') return value.input + value.output;
  return Number.isFinite(value.cache) && Number.isFinite(value.cacheWrite)
    ? value.input + value.cache + value.cacheWrite + value.output : null;
}

function pairedReport(cells) {
  const grouped = new Map();
  for (const cell of cells) {
    const key = `${cell.caseId}:${cell.host}:${cell.repeat}`;
    const group = grouped.get(key) ?? {};
    group[cell.condition] = cell;
    grouped.set(key, group);
  }
  return [...grouped.entries()].map(([id, group]) => ({
    id,
    baseline: group.baseline?.judged?.recalled ?? null,
    candidate: group.candidate?.judged?.recalled ?? null,
    noKnowledge: group['no-knowledge']?.judged?.recalled ?? null,
    comparable: Boolean(group.baseline && group.candidate && group['no-knowledge']),
    loadedBodyTokenDelta: Number.isFinite(group.candidate?.runtime?.loadedBodyTokens) && Number.isFinite(group.baseline?.runtime?.loadedBodyTokens)
      ? group.candidate.runtime.loadedBodyTokens - group.baseline.runtime.loadedBodyTokens : null,
    nativeFullCycleTokenDelta: pairedDelta(group.candidate, group.baseline),
    noKnowledgeNativeOverhead: pairedDelta(group.candidate, group['no-knowledge']),
    baselineNativeOverhead: pairedDelta(group.baseline, group['no-knowledge']),
    candidateVsNoKnowledge: group.candidate?.judged?.recalled === true && group['no-knowledge']?.judged?.recalled === false,
  }));
}

function pairedDelta(left, right) {
  const leftUsage = left?.runtime?.nativeFullCycleUsage;
  const rightUsage = right?.runtime?.nativeFullCycleUsage;
  if (leftUsage?.coverage !== 'complete' || rightUsage?.coverage !== 'complete') return null;
  const leftValue = nativeUsageTokenTotal(left?.host, leftUsage.total);
  const rightValue = nativeUsageTokenTotal(right?.host, rightUsage.total);
  return Number.isFinite(leftValue) && Number.isFinite(rightValue) ? leftValue - rightValue : null;
}

function thresholdReport(cells, paired) {
  const required = cells.filter((cell) => cell.critical === true);
  const requiredRecall = required.length > 0 && required.every((cell) => cell.judged?.recalled === true)
    ? 'pass' : required.some((cell) => cell.judged?.recalled === false) ? 'fail' : 'unknown';
  const pairedCosts = paired.map((pair) => pair.nativeFullCycleTokenDelta).filter(Number.isFinite);
  return {
    thresholds: ACCEPTANCE_THRESHOLDS,
    requiredRecall,
    pairedEfficiency: pairedCosts.length > 0
      ? { medianDelta: percentile(pairedCosts, .5), hypothesis: percentile(pairedCosts, .5) < 0 ? 'supported-pending-correctness' : 'not-supported' }
      : { medianDelta: 'unknown', hypothesis: 'unknown' },
    note: 'Semantic correctness and relevance remain pending manual adjudication; unknown telemetry cannot satisfy a threshold.',
  };
}

function readArtifact(projectDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectDir, 'evaluation-result.json'), 'utf8'));
    return Array.isArray(parsed?.recordIds) && Array.isArray(parsed?.actions) ? parsed : null;
  } catch {
    return null;
  }
}

function deliverableEvidence(projectDir, deliverablePath) {
  try {
    const stat = fs.statSync(path.join(projectDir, deliverablePath));
    return { exists: stat.isFile(), bytes: stat.isFile() ? stat.size : null };
  } catch {
    return { exists: false, bytes: null };
  }
}

function workflowEvidence(staged) {
  try {
    return { ghCommands: fs.readFileSync(staged.ghLogPath, 'utf8').split(/\r?\n/).filter(Boolean) };
  } catch {
    return { ghCommands: [] };
  }
}

function configureLifecycleMock(staged, fixtureCase) {
  if (fixtureCase.id !== 'lifecycle-identity') return;
  const mockBin = staged.environment?.PATH?.split(path.delimiter)[0];
  if (!mockBin) throw new Error('lifecycle fixture is missing its local gh mock');
  fs.writeFileSync(path.join(mockBin, 'gh'), [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "$SPECTRE_EVALUATION_GH_LOG"',
    'if [ "$1 $2" = "pr create" ]; then echo "https://example.invalid/evaluation/pr/1"; exit 0; fi',
    'echo "{}"',
  ].join('\n'));
  fs.chmodSync(path.join(mockBin, 'gh'), 0o755);
}

function hostConfiguration(configuration, host) {
  const selected = configuration?.hosts?.[host] ?? configuration;
  if (typeof selected?.model !== 'string' || typeof selected?.effort !== 'string') {
    throw new Error(`configuration must provide model and effort for ${host}`);
  }
  return selected;
}

function mergeHostRuns(runs) {
  const completed = runs.every((run) => run.status === 'completed');
  return {
    ...runs.at(-1),
    status: completed ? 'completed' : runs.find((run) => run.status !== 'completed').status,
    usage: {
      primary: runs.at(-1)?.usage?.primary ?? null,
      workers: runs.at(-1)?.usage?.workers ?? null,
      fullCycle: nativeFullCycleUsage(runs),
      sessions: runs.map((run) => run.usage ?? null),
    },
    toolOperations: runs.flatMap((run, sessionOrdinal) =>
      (run.toolOperations ?? []).map((operation) => ({ ...operation, sessionOrdinal }))
    ),
    toolResults: runs.flatMap((run, sessionOrdinal) =>
      (run.toolResults ?? []).map((result) => ({ ...result, sessionOrdinal }))
    ),
    textFinalAnswers: runs.flatMap((run) => run.textFinalAnswers ?? []),
    sessions: runs.map((run) => ({ status: run.status, exit: run.exit ?? null })),
  };
}

function nativeFullCycleUsage(runs) {
  const sources = runs.map((run) => run.usage?.fullCycle?.total ?? run.usage?.primary).filter(Boolean);
  if (sources.length !== runs.length) return null;
  const total = {};
  for (const field of ['input', 'cache', 'cacheWrite', 'output', 'reasoning']) {
    total[field] = sources.every((value) => Number.isFinite(value[field]))
      ? sources.reduce((sum, value) => sum + value[field], 0) : null;
  }
  return {
    source: runs.every((run) => run.usage?.fullCycle?.total) ? 'inclusive-model-totals' : 'primary-turn-totals',
    coverage: runs.every((run) => run.usage?.fullCycle?.total) ? 'complete' : 'unknown',
    sessions: runs.length,
    total,
  };
}

function traceWithOperationCrosscheck(trace, toolOperations) {
  if (trace.availability !== 'available') return trace;
  const expected = new Map();
  const expect = (type) => expected.set(type, (expected.get(type) ?? 0) + 1);
  for (const operation of toolOperations ?? []) {
    const command = operation?.input?.command;
    if (typeof command !== 'string') continue;
    if (/knowledge-cli\.mjs\s+search\b/.test(command)) expect('search');
    if (/knowledge-cli\.mjs\s+load\b/.test(command)) expect('load');
    if (/knowledge-cli\.mjs\s+resource\b/.test(command)) expect('resource-read');
    if (/knowledge-cli\.mjs\s+(?:capture|learn)\b/.test(command)) expect('capture');
  }
  const missing = [...expected].flatMap(([type, count]) =>
    Array.from({ length: Math.max(0, count - trace.events.filter((event) => event.type === type).length) }, () => type)
  );
  return missing.length === 0
    ? trace
    : { availability: 'unavailable', reason: `trace lacks native ${missing.join(', ')} event evidence`, events: trace.events };
}

export function traceRuntimeFacts(trace, hostResult = {}) {
  const events = trace.availability === 'available' ? trace.events : [];
  const sum = (selected, field) => {
    if (trace.availability !== 'available') return null;
    if (selected.length === 0) return 0;
    return selected.every((event) => Number.isFinite(event[field]))
      ? selected.reduce((total, event) => total + event[field], 0) : null;
  };
  const previews = events.filter((event) => event.type === 'search' || event.subtype === 'history-preview');
  const bodies = events.filter((event) => event.type === 'load' || event.subtype === 'history-body');
  const resources = events.filter((event) => event.type === 'resource-read');
  const duplicates = bodies.filter((event, index) => bodies.some((prior, priorIndex) =>
    priorIndex < index && prior.id === event.id && prior.revisionToken === event.revisionToken && prior.contextHash === event.contextHash
  ));
  const injectedTokens = Number.isFinite(hostResult.sessionStartMeasurement?.injectedTokens)
    ? hostResult.sessionStartMeasurement.injectedTokens : null;
  const previewTokens = sum(previews, 'responseTokens');
  const loadedBodyTokens = sum(bodies, 'loadedTokens');
  const resourceTokens = sum(resources, 'loadedTokens');
  const totalTokens = [injectedTokens, previewTokens, loadedBodyTokens, resourceTokens].every(Number.isFinite)
    ? injectedTokens + previewTokens + loadedBodyTokens + resourceTokens : null;
  return {
    injectedTokens,
    injectedBytes: Number.isFinite(hostResult.sessionStartMeasurement?.injectedBytes) ? hostResult.sessionStartMeasurement.injectedBytes : null,
    previewTokens,
    previewBytes: sum(previews, 'responseBytes'),
    loadedBodyTokens,
    loadedBodyBytes: sum(bodies, 'loadedBytes'),
    resourceTokens,
    resourceBytes: sum(resources, 'loadedBytes'),
    redundantTokens: sum(duplicates, 'loadedTokens'),
    totalTokens,
    nativePrimaryUsage: hostResult.usage?.primary ?? null,
    nativeFullCycleUsage: hostResult.usage?.fullCycle ?? null,
  };
}

function assertFrozenInputs(freezeManifest) {
  const fixtures = freezeManifest.fixtureRoot;
  if (freezeManifest.hashes.fixtures !== filesHash(fixtures)) throw new Error('fixture content changed after freeze');
  if (freezeManifest.hashes.oracle !== hash(fs.readFileSync(freezeManifest.oraclePath))) throw new Error('oracle content changed after freeze');
  if (freezeManifest.configurationPath && freezeManifest.hashes.configuration !== hash(fs.readFileSync(freezeManifest.configurationPath))) throw new Error('configuration changed after freeze');
  if (freezeManifest.candidatePath && freezeManifest.hashes.candidate !== filesHash(freezeManifest.candidatePath)) throw new Error('candidate content changed after freeze');
}

/** Run the frozen native evaluation only after the deterministic hash gate succeeds. */
export async function evaluateKnowledge(freezeManifest, options = {}) {
  assertFrozenInputs(freezeManifest);
  if (options.allowNative !== true) throw new Error('native host calls require allowNative after the deterministic freeze gate');
  const fixtureManifest = readJson(path.join(options.fixtureRoot, 'manifest.json'));
  const cases = new Map(fixtureManifest.cases.map((entry) => [entry.id, entry]));
  const rawLogRoot = path.resolve(options.rawLogRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-evaluation-logs-')));
  const invoke = options.invokeHost ?? invokeKnowledgeHost;
  const result = await runCells(freezeManifest, options.outputDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-evaluation-results-')), async (cell) => {
    const staged = await stagePreparedKnowledgeCell(cell, cases.get(cell.caseId), {
      repositoryRoot: options.repositoryRoot ?? process.cwd(),
      temporaryRoot: options.temporaryRoot,
      baselineRef: freezeManifest.baseline,
      baselinePluginRoot: options.baselinePluginRoot,
      candidatePluginRoot: options.candidatePluginRoot,
      candidatePluginRoots: options.candidatePluginRoots,
    });
    try {
      const fixtureCase = cases.get(cell.caseId);
      configureLifecycleMock(staged, fixtureCase);
      const hostSettings = hostConfiguration(options.configuration, cell.host);
      const snapshotBefore = snapshotKnowledgeCell(staged);
      const deliverablePath = path.join('artifacts', `${cell.caseId}.md`);
      const prompts = fixtureCase.longitudinalSteps ?? [[
        fixtureCase.task,
          fixtureCase.workflow ?? 'Use the installed Spectre workflow to complete the task.',
          `Write the decision artifact to ${deliverablePath}, then write evaluation-result.json with recordIds and actions arrays describing the evidence you used.`,
      ].join('\n')];
      const runs = [];
      let registrationFault = null;
      try {
        for (const [sessionOrdinal, prompt] of prompts.entries()) {
          runs.push(await invoke({
          host: cell.host, model: hostSettings.model, effort: hostSettings.effort,
          prompt,
          preparedFixture: staged, rawLogDirectory: path.join(rawLogRoot, cell.id, `session-${sessionOrdinal + 1}`),
          environment: {
            ...staged.environment,
            ...(staged.tracePath ? { SPECTRE_KNOWLEDGE_EVALUATION_TRACE: staged.tracePath } : {}),
            SPECTRE_KNOWLEDGE_EVALUATION_ACTOR_ID: `${cell.id}:session:${sessionOrdinal + 1}`,
            SPECTRE_KNOWLEDGE_EVALUATION_CONTEXT_ID: `${cell.caseId}:${cell.condition}:${cell.repeat}`,
          },
          limits: options.limits,
          }));
          if (fixtureCase.id === 'lifecycle-identity' && sessionOrdinal === 0) registrationFault = blockKnowledgeRegistration(staged);
        }
      } finally {
        registrationFault?.restore();
      }
      const hostResult = mergeHostRuns(runs);
      const snapshotAfter = snapshotKnowledgeCell(staged);
      const trace = !staged.tracePath || hostResult.traceUnavailable === true
        ? { availability: 'unavailable', reason: 'host reported trace collection unavailable', events: [] }
        : traceWithOperationCrosscheck(readEvaluationTrace(staged.tracePath), hostResult.toolOperations);
      return {
        ...hostResult,
        deliverablePath,
        deliverable: deliverableEvidence(staged.projectDir, deliverablePath),
        snapshots: { before: snapshotBefore, after: snapshotAfter },
        sessionStartMeasurement: staged.sessionStartMeasurement ?? null,
        artifact: readArtifact(staged.projectDir),
        workflowEvidence: workflowEvidence(staged),
        trace,
        ...traceRuntimeFacts(trace, { ...hostResult, sessionStartMeasurement: staged.sessionStartMeasurement }),
        bypass: [
          ...detectTraceBypass(hostResult.toolOperations, { knownPaths: staged.knownPaths, workingDir: staged.projectDir }),
          ...trace.events.filter((event) => event.type === 'bypass'),
        ],
      };
    } finally {
      fs.rmSync(staged.root, { recursive: true, force: true });
    }
  });
  const paired = pairedReport(result.cells);
  const report = {
    ...result, freeze: { hashes: freezeManifest.hashes, baseline: freezeManifest.baseline },
    cohorts: cohortReport(result.cells), paired, thresholds: thresholdReport(result.cells, paired),
  };
  if (options.reportPath) fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [, , command] = process.argv;
  const fixtures = argument(process.argv, '--fixtures');
  const output = argument(process.argv, '--output');
  if (command === 'freeze') {
    const oracle = argument(process.argv, '--oracle');
    if (!fixtures || !oracle || !output) throw new Error(usage());
    process.stdout.write(`${JSON.stringify(freeze(path.resolve(fixtures), path.resolve(oracle), path.resolve(output), {
      configurationPath: argument(process.argv, '--config'), candidatePath: argument(process.argv, '--candidate'),
    }))}\n`);
  } else if (command === 'run') {
    const freezePath = argument(process.argv, '--freeze');
    const configurationPath = argument(process.argv, '--config');
    const baselinePluginRoot = argument(process.argv, '--baseline-plugin');
    const candidatePluginRoot = argument(process.argv, '--candidate-plugin');
    const reportPath = argument(process.argv, '--report');
    if (!freezePath || !fixtures || !configurationPath || !baselinePluginRoot || !candidatePluginRoot || !output || !reportPath || !process.argv.includes('--allow-native')) throw new Error(usage());
    const report = await evaluateKnowledge(readJson(path.resolve(freezePath)), {
      allowNative: true, fixtureRoot: path.resolve(fixtures), outputDir: path.resolve(output), reportPath: path.resolve(reportPath),
      configuration: readJson(path.resolve(configurationPath)), baselinePluginRoot: path.resolve(baselinePluginRoot), candidatePluginRoot: path.resolve(candidatePluginRoot),
      rawLogRoot: argument(process.argv, '--raw-logs') ?? undefined,
    });
    process.stdout.write(`${JSON.stringify({ status: 'completed', report: path.resolve(reportPath), samples: report.cells.length })}\n`);
  } else {
    throw new Error(usage());
  }
}

export { BASELINE, CONDITIONS, HOSTS, freeze };

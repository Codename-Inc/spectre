#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { invokeKnowledgeHost } from './knowledge-evaluation-hosts.mjs';
import { blockKnowledgeRegistration, readSessionStartMeasurement, snapshotKnowledgeCell, stageKnowledgeCell as stagePreparedKnowledgeCell } from './knowledge-evaluation-staging.mjs';
import { detectTraceBypass, readEvaluationTrace } from '../plugins/spectre/hooks/scripts/knowledge/evaluation-trace.mjs';

const BASELINE = '1cd1f035a253e9d7ef5086693ab9f1d0b11d360b';
const CONDITIONS = ['no-knowledge', 'baseline', 'candidate'];
const HOSTS = ['claude', 'codex'];
const NATIVE_PIPELINE_INPUTS = [
  new URL('./knowledge-evaluation-hosts.mjs', import.meta.url),
  new URL('./knowledge-evaluation-staging.mjs', import.meta.url),
  new URL('./knowledge-host-probe-hook.mjs', import.meta.url),
  new URL('./verify-knowledge-hosts.mjs', import.meta.url),
  new URL('../plugins/spectre/hooks/scripts/knowledge/evaluation-trace.mjs', import.meta.url),
];
const ACCEPTANCE_THRESHOLDS = Object.freeze({
  requiredRecall: 1,
  unnecessaryHistoryLoads: 0,
  redundantSameContextLoads: 0,
  routineIrrelevantLoadedBodyRate: 0.05,
});

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function nativePipelineInputsHash() {
  return hash(JSON.stringify(NATIVE_PIPELINE_INPUTS.map((url) => [url.pathname, hash(fs.readFileSync(url))])));
}

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

function goldStrings(value, key = null) {
  if (typeof value === 'string') {
    const structural = new Set(['requiredRecordHashes', 'requiredStates', 'requiredReadCommand', 'allowedLoads', 'allowedHistoryLoads', 'requiredBeforeDecision', 'requiresCapture', 'requiresSameWorkId', 'minimumPrCreates', 'forbiddenLegacyExposure']);
    return structural.has(key) ? [] : [value];
  }
  if (Array.isArray(value)) return value.flatMap((entry) => goldStrings(entry, key));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([entryKey, entry]) => goldStrings(entry, entryKey));
  return [];
}

function usage() {
  return 'Usage: evaluate-knowledge.mjs freeze --fixtures <dir> --oracle <file> --output <file> [--config <file> --candidate <dir>]\n       evaluate-knowledge.mjs run --freeze <file> --fixtures <dir> --config <file> --baseline-plugin <dir> (--candidate-plugin <plugins-dir> | --candidate-claude-plugin <dir> --candidate-codex-plugin <dir>) --output <dir> --report <file> --allow-native [--cell <frozen-cell-id>]\n';
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

function argumentsNamed(argv, name) {
  return argv.flatMap((value, index) => value === name && typeof argv[index + 1] === 'string' ? [argv[index + 1]] : []);
}

export function selectFrozenCells(freezeManifest, cellIds = []) {
  if (!Array.isArray(cellIds) || cellIds.length === 0) return freezeManifest;
  const selected = freezeManifest.cells.filter((cell) => cellIds.includes(cell.id));
  if (selected.length !== cellIds.length) {
    const found = new Set(selected.map((cell) => cell.id));
    throw new Error(`unknown frozen cell: ${cellIds.find((id) => !found.has(id))}`);
  }
  return { ...freezeManifest, cells: selected };
}

function freeze(fixtures, oracle, output, options = {}) {
  const manifest = readJson(path.join(fixtures, 'manifest.json'));
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== 12) throw new Error('fixture manifest must contain exactly 12 cases');
  const fixtureBytes = fs.readFileSync(path.join(fixtures, 'manifest.json'));
  const oracleBytes = fs.readFileSync(oracle);
  for (const value of goldStrings(readJson(oracle))) {
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
      nativePipelineInputs: nativePipelineInputsHash(),
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

function eventPrecedes(left, right) {
  if (!Number.isInteger(left?.eventOrdinal) || !Number.isInteger(right?.eventOrdinal)) return false;
  const leftSession = left.sessionOrdinal ?? 0;
  const rightSession = right.sessionOrdinal ?? 0;
  return leftSession < rightSession || (leftSession === rightSession && left.eventOrdinal < right.eventOrdinal);
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
    const readCommand = expected.requiredReadCommand === 'inspect' ? 'inspect' : 'load';
    const loadOperations = (runtime.toolOperations ?? []).filter((operation) => {
      const command = operation?.input?.command ?? '';
      return new RegExp(`knowledge-cli\\.mjs\\s+${readCommand}\\s+['\"]?([a-z0-9]+(?:-[a-z0-9]+)*)`).test(command) &&
        [...command.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g)].some((match) => expectedHashes.has(hash(match[0]))) &&
        (operation.status === null || operation.status === 'completed');
    });
    const matchedResults = (runtime.toolResults ?? []).flatMap((result) =>
      loadOperations.filter((operation) => operation.id !== null && operation.id === result.toolUseId &&
        (operation.sessionOrdinal ?? 0) === (result.sessionOrdinal ?? 0)).flatMap((operation) =>
        result.isError !== true && typeof result.content === 'string' && [...result.content.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g)]
          .some((match) => expectedHashes.has(hash(match[0]))) ? [{ operation, result }] : []
      )
    );
    const artifactWrite = (runtime.toolOperations ?? []).find((operation) =>
      (operation.name === 'Write' || operation.name === 'exec' || operation.type === 'file_change') &&
      JSON.stringify(operation.input ?? '').includes(runtime.deliverablePath) &&
      (operation.status === null || operation.status === 'completed')
    );
    if (!artifactWrite) return { valid: false, recalled: false, reason: 'native decision-artifact write evidence is missing' };
    const orderedLoad = matchedResults.some(({ result }) =>
      eventPrecedes(result, artifactWrite)
    );
    const tracedLoad = matchedResults.some(({ operation }) => {
      const session = runtime.sessionSnapshots?.[operation.sessionOrdinal ?? 0];
      const stagedRevisions = new Map((session?.before?.records ?? runtime.snapshots?.before?.records ?? []).map((record) => [record.id, record.revisionToken]));
      return runtime.trace?.events?.some((event) =>
        (readCommand === 'inspect' ? event.type === 'history-read' && event.subtype === 'history-body' : event.type === 'load') &&
        expectedHashes.has(hash(event.id ?? '')) && event.revisionToken === stagedRevisions.get(event.id) &&
        (!session?.contextHash || event.contextHash === session.contextHash)
      );
    });
    if (cell.condition !== 'no-knowledge' && expectedHashes.size > 0 && (!orderedLoad || (cell.condition === 'candidate' && !tracedLoad))) {
      return { valid: false, recalled: false, reason: 'native load-before-artifact evidence is missing' };
    }
    if (expected.requiresCapture === true && cell.condition === 'candidate' && !runtime.trace?.events?.some((event) => event.type === 'capture')) {
      return { valid: false, recalled: false, reason: 'capture trace evidence is missing' };
    }
    const captureOperations = (runtime.toolOperations ?? []).filter((operation) =>
      operation.name === 'Learn' || /knowledge-cli\.mjs\s+(?:register|capture|learn)\b/.test(operation?.input?.command ?? '')
    );
    if (expected.requiresCapture === true && captureOperations.some((operation) => operation.actorRole === 'worker')) {
      return { valid: false, recalled: false, reason: 'worker-owned knowledge capture is not primary evidence' };
    }
    const ghCommands = runtime.workflowEvidence?.ghCommands ?? [];
    if (cell.condition === 'candidate' && Number.isInteger(expected.minimumPrCreates) && ghCommands.filter((command) => /^pr create\b/.test(command)).length < expected.minimumPrCreates) {
      return { valid: false, recalled: false, reason: 'direct PR fallback evidence is missing' };
    }
    if (cell.condition === 'candidate' && expected.requiresSameWorkId === true) {
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
  const freezeKey = freezeManifest.hashes ? hash(JSON.stringify({
    fixtures: freezeManifest.hashes.fixtures,
    configuration: freezeManifest.hashes.configuration,
    candidate: freezeManifest.hashes.candidate,
    nativePipelineInputs: freezeManifest.hashes.nativePipelineInputs,
    baseline: freezeManifest.baseline,
  })) : null;
  const cacheDirectory = path.join(outputDir, '.knowledge-evaluation-cells');
  if (freezeKey) fs.mkdirSync(cacheDirectory, { recursive: true });
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
        const cachePath = freezeKey ? path.join(cacheDirectory, `${hash(cell.id).slice('sha256:'.length)}.json`) : null;
        if (cachePath && fs.existsSync(cachePath)) {
          try {
            const cached = readJson(cachePath);
            if (cached.freezeKey === freezeKey && cached.cell?.id === cell.id) {
              const judged = judgeCell(cell, cached.cell.runtime, oracle);
              results.push({
                ...cached.cell,
                status: cached.cell.runtime?.status === 'completed' && judged.valid ? 'completed'
                  : cached.cell.runtime?.status === 'completed' ? 'invalid' : cached.cell.runtime?.status ?? 'invalid',
                judged,
              });
              continue;
            }
          } catch {
            // A partial cell artifact is never reused.
          }
        }
        const cellDir = fs.mkdtempSync(path.join(outputDir, `${cell.host}-${cell.condition}-`));
        const runtime = await invoke({ ...cell, cellDir });
        const judged = judgeCell(cell, runtime, oracle);
        const result = {
          ...cell,
          status: runtime?.status === 'completed' && judged.valid ? 'completed' : runtime?.status === 'completed' ? 'invalid' : runtime?.status ?? 'invalid',
          runtime: {
            ...runtime,
            usage: { ...(runtime?.usage ?? {}), primary: normalizeUsage(runtime?.usage?.primary ?? runtime?.usage) },
          },
          judged,
        };
        if (cachePath) {
          const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
          fs.writeFileSync(temporary, `${JSON.stringify({ freezeKey, cell: result }, null, 2)}\n`);
          fs.renameSync(temporary, cachePath);
        }
        results.push(result);
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
    const target = path.join(projectDir, deliverablePath);
    const stat = fs.statSync(target);
    if (!stat.isFile()) return { exists: false, bytes: null, hash: null, content: null, truncated: false };
    const content = fs.readFileSync(target, 'utf8');
    const limit = 64 * 1024;
    return {
      exists: true, bytes: stat.size, hash: hash(content),
      content: content.slice(0, limit), truncated: Buffer.byteLength(content, 'utf8') > limit,
    };
  } catch {
    return { exists: false, bytes: null, hash: null, content: null, truncated: false };
  }
}

function changedProjectEvidence(projectDir) {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: projectDir, encoding: 'utf8' });
  if (result.status !== 0) return { availability: 'unavailable', changed: [] };
  const changed = result.stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const relative = line.slice(3).trim();
    if (!relative || path.isAbsolute(relative) || relative.includes('..')) return [];
    const target = path.join(projectDir, relative);
    try {
      const content = fs.readFileSync(target, 'utf8');
      const limit = 16 * 1024;
      return [{ path: relative, hash: hash(content), content: content.slice(0, limit), truncated: Buffer.byteLength(content, 'utf8') > limit }];
    } catch {
      return [{ path: relative, hash: null, content: null, truncated: false }];
    }
  });
  return { availability: 'available', changed };
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

function candidatePluginRoots(options = {}) {
  if (options.candidatePluginRoots) return options.candidatePluginRoots;
  const root = options.candidatePluginRoot;
  if (!root) return undefined;
  const claude = path.join(root, 'spectre');
  const codex = path.join(root, 'spectre-codex');
  if (!fs.existsSync(claude) || !fs.existsSync(codex)) {
    throw new Error('candidate plugin root must contain both spectre and spectre-codex; pass host-specific roots otherwise');
  }
  return { claude, codex };
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
      sessionStartMeasurement: sessionStartMeasurement(runs),
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

function sessionStartMeasurement(runs) {
  const measurements = runs.map((run) => run.sessionStartMeasurement).filter(Boolean);
  if (measurements.length !== runs.length) return { availability: 'unavailable', injectedTokens: null, injectedBytes: null };
  if (measurements.every((measurement) => measurement.availability === 'none')) return { availability: 'none', injectedTokens: 0, injectedBytes: 0 };
  if (!measurements.every((measurement) => measurement.availability === 'available' && Number.isFinite(measurement.injectedTokens) && Number.isFinite(measurement.injectedBytes))) {
    return { availability: 'unavailable', injectedTokens: null, injectedBytes: null };
  }
  return {
    availability: 'available',
    injectedTokens: measurements.reduce((total, measurement) => total + measurement.injectedTokens, 0),
    injectedBytes: measurements.reduce((total, measurement) => total + measurement.injectedBytes, 0),
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
  if (freezeManifest.hashes.nativePipelineInputs && freezeManifest.hashes.nativePipelineInputs !== nativePipelineInputsHash()) throw new Error('native pipeline input changed after freeze');
}

/** Run the frozen native evaluation only after the deterministic hash gate succeeds. */
export async function evaluateKnowledge(freezeManifest, options = {}) {
  assertFrozenInputs(freezeManifest);
  if (options.allowNative !== true) throw new Error('native host calls require allowNative after the deterministic freeze gate');
  const fixtureManifest = readJson(path.join(options.fixtureRoot, 'manifest.json'));
  const cases = new Map(fixtureManifest.cases.map((entry) => [entry.id, entry]));
  const rawLogRoot = path.resolve(options.rawLogRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-evaluation-logs-')));
  const invoke = options.invokeHost ?? invokeKnowledgeHost;
  const selectedFreeze = selectFrozenCells(freezeManifest, options.cellIds);
  const result = await runCells(selectedFreeze, options.outputDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-evaluation-results-')), async (cell) => {
    const staged = await stagePreparedKnowledgeCell(cell, cases.get(cell.caseId), {
      repositoryRoot: options.repositoryRoot ?? process.cwd(),
      temporaryRoot: options.temporaryRoot,
      baselineRef: freezeManifest.baseline,
      baselinePluginRoot: options.baselinePluginRoot,
      candidatePluginRoots: candidatePluginRoots(options),
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
      ].join('\n')];
      const preparedPrompts = prompts.map((prompt, index) => index === prompts.length - 1
        ? `${prompt}\nWrite the decision artifact to ${deliverablePath}, then write evaluation-result.json with recordIds and actions arrays describing the evidence you used.`
        : prompt);
      const runs = [];
      const sessionSnapshots = [];
      let registrationFault = null;
      try {
        for (const [sessionOrdinal, prompt] of preparedPrompts.entries()) {
          const contextId = `${cell.caseId}:${cell.condition}:${cell.repeat}:session:${sessionOrdinal + 1}`;
          const beforeSession = snapshotKnowledgeCell(staged);
          const run = await invoke({
          host: cell.host, model: hostSettings.model, effort: hostSettings.effort,
          prompt,
          preparedFixture: staged, rawLogDirectory: path.join(rawLogRoot, cell.id, `session-${sessionOrdinal + 1}`),
          environment: {
            ...staged.environment,
            ...(staged.tracePath ? { SPECTRE_KNOWLEDGE_EVALUATION_TRACE: staged.tracePath } : {}),
            SPECTRE_KNOWLEDGE_EVALUATION_ACTOR_ID: `${cell.id}:session:${sessionOrdinal + 1}`,
            SPECTRE_KNOWLEDGE_EVALUATION_CONTEXT_ID: contextId,
          },
          limits: options.limits,
          });
          runs.push({ ...run, sessionStartMeasurement: readSessionStartMeasurement(staged) });
          sessionSnapshots.push({ before: beforeSession, after: snapshotKnowledgeCell(staged), contextHash: hash(contextId) });
          if (fixtureCase.id === 'lifecycle-identity' && cell.condition !== 'no-knowledge' && sessionOrdinal === 1 && runs.at(-1)?.status === 'completed') {
            registrationFault = blockKnowledgeRegistration(staged);
          }
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
        projectEvidence: changedProjectEvidence(staged.projectDir),
        snapshots: { before: snapshotBefore, after: snapshotAfter },
        sessionSnapshots,
        sessionStartMeasurement: hostResult.usage.sessionStartMeasurement,
        artifact: readArtifact(staged.projectDir),
        workflowEvidence: workflowEvidence(staged),
        trace,
        ...traceRuntimeFacts(trace, { ...hostResult, sessionStartMeasurement: hostResult.usage.sessionStartMeasurement }),
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
    const candidateClaudePluginRoot = argument(process.argv, '--candidate-claude-plugin');
    const candidateCodexPluginRoot = argument(process.argv, '--candidate-codex-plugin');
    const reportPath = argument(process.argv, '--report');
    if (!freezePath || !fixtures || !configurationPath || !baselinePluginRoot || (!candidatePluginRoot && !(candidateClaudePluginRoot && candidateCodexPluginRoot)) || !output || !reportPath || !process.argv.includes('--allow-native')) throw new Error(usage());
    const report = await evaluateKnowledge(readJson(path.resolve(freezePath)), {
      allowNative: true, fixtureRoot: path.resolve(fixtures), outputDir: path.resolve(output), reportPath: path.resolve(reportPath),
      configuration: readJson(path.resolve(configurationPath)), baselinePluginRoot: path.resolve(baselinePluginRoot),
      ...(candidatePluginRoot ? { candidatePluginRoot: path.resolve(candidatePluginRoot) } : { candidatePluginRoots: { claude: path.resolve(candidateClaudePluginRoot), codex: path.resolve(candidateCodexPluginRoot) } }),
      rawLogRoot: argument(process.argv, '--raw-logs') ?? undefined, cellIds: argumentsNamed(process.argv, '--cell'),
    });
    process.stdout.write(`${JSON.stringify({ status: 'completed', report: path.resolve(reportPath), samples: report.cells.length })}\n`);
  } else {
    throw new Error(usage());
  }
}

export { BASELINE, CONDITIONS, HOSTS, freeze };

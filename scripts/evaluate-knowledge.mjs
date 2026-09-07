#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { invokeKnowledgeHost } from './knowledge-evaluation-hosts.mjs';
import { detectTraceBypass, readEvaluationTrace } from '../plugins/spectre/hooks/scripts/knowledge/evaluation-trace.mjs';
import { refreshKnowledgeIndex } from '../plugins/spectre/hooks/scripts/knowledge/records.mjs';
import { resolveProjectStore } from '../plugins/spectre/hooks/scripts/knowledge/store.mjs';

const BASELINE = '1cd1f035a253e9d7ef5086693ab9f1d0b11d360b';
const CONDITIONS = ['no-knowledge', 'baseline', 'candidate'];
const HOSTS = ['claude', 'codex'];

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
  return { input: pick('input'), cache: pick('cache'), output: pick('output'), reasoning: pick('reasoning') };
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 'unknown';
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export function aggregate(cells = []) {
  const required = cells.filter(cell => cell.judged?.required === true);
  const metric = name => cells.map(cell => cell.runtime?.[name]);
  const summary = values => ({ known: values.filter(Number.isFinite).length, missing: values.filter(value => !Number.isFinite(value)).length, median: percentile(values, .5), p95: percentile(values, .95) });
  return {
    runtime: Object.fromEntries(['injectedTokens', 'previewTokens', 'loadedBodyTokens', 'redundantTokens', 'totalTokens'].map(name => [name, summary(metric(name))])),
    judged: { requiredRecall: required.length === 0 || required.some(cell => cell.judged?.recalled !== true) ? 'unknown' : true, irrelevantLoadedTokens: cells.some(cell => !Number.isFinite(cell.judged?.irrelevantLoadedTokens)) ? 'unknown' : cells.reduce((sum, cell) => sum + cell.judged.irrelevantLoadedTokens, 0) },
    samples: cells.length,
  };
}

export function judgeCell(cell, runtime, oracle) {
  const expected = oracle?.[cell.caseId];
  if (!expected) return { valid: false, recalled: false, reason: 'oracle judgment is missing' };
  if (runtime?.trace?.availability === 'unavailable') return { valid: false, recalled: false, reason: 'evaluation trace is unavailable' };
  if (runtime?.status !== 'completed') return { valid: false, recalled: false, reason: `host status is ${runtime?.status ?? 'missing'}` };
  if (Array.isArray(expected.requiredRecordHashes)) {
    const actual = new Set((runtime.artifact?.recordIds ?? []).map((id) => hash(id)));
    if (!expected.requiredRecordHashes.every((value) => actual.has(value))) {
      return { valid: false, recalled: false, reason: 'structured artifact lacks required record evidence' };
    }
    if (expected.requiresCapture === true && !runtime.trace.events.some((event) => event.type === 'capture')) {
      return { valid: false, recalled: false, reason: 'capture trace evidence is missing' };
    }
    return { valid: true, recalled: true, reason: null, manualRubric: expected.manualRubric ?? null };
  }
  const answer = (runtime.textFinalAnswers ?? []).join('\n').toLocaleLowerCase();
  const required = Array.isArray(expected.requiredPhrases) ? expected.requiredPhrases : [];
  const missing = required.filter(phrase => !answer.includes(String(phrase).toLocaleLowerCase()));
  if (missing.length > 0) return { valid: false, recalled: false, reason: 'required oracle phrase was not found' };
  if (runtime.bypass?.length > 0) return { valid: false, recalled: false, reason: 'direct knowledge-store bypass detected' };
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
          runtime: { ...runtime, usage: normalizeUsage(runtime?.usage?.primary ?? runtime?.usage) },
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

function recordContent(record) {
  return {
    schemaVersion: 1,
    id: record.id,
    kind: 'knowledge',
    title: record.id,
    summary: record.content,
    tags: [record.id],
    applicability: { scope: 'project' },
    provenance: { origin: 'evaluation-fixture', capturedAt: '2026-09-06T00:00:00.000Z' },
    relatedRecordIds: [],
    category: 'evaluation',
    useWhen: record.id,
    content: record.content,
    evidence: 'Synthetic evaluator fixture.',
    status: 'active',
  };
}

function recordsFor(cell, fixtureCase) {
  if (cell.condition === 'no-knowledge') return [];
  return fixtureCase.initialFacts ?? [];
}

/** Create a fresh project, store, and plugin copy for one evaluator cell. */
export async function stageKnowledgeCell(cell, fixtureCase, options) {
  const root = fs.mkdtempSync(path.join(options.temporaryRoot ?? os.tmpdir(), 'spectre-knowledge-evaluation-cell-'));
  const projectDir = path.join(root, 'project');
  const storeDir = path.join(root, 'spectre-home');
  const pluginDir = path.join(root, 'plugin');
  const hostHome = path.join(root, cell.host === 'codex' ? 'codex-home' : 'claude-home');
  const pluginSource = cell.condition === 'baseline'
    ? options.baselinePluginRoot
    : options.candidatePluginRoot;
  if (!pluginSource || !path.isAbsolute(pluginSource)) throw new Error('an absolute plugin root is required for each evaluator condition');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(storeDir, { recursive: true });
  fs.mkdirSync(hostHome, { recursive: true });
  fs.cpSync(pluginSource, pluginDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'TASK.md'), `${fixtureCase.task}\n`);
  const resolved = await resolveProjectStore(projectDir, { spectreHome: storeDir });
  const knownPaths = [];
  for (const record of recordsFor(cell, fixtureCase)) {
    const directory = path.join(resolved.storePath, 'knowledge', record.id);
    const recordPath = path.join(directory, 'record.json');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(recordPath, `${JSON.stringify(recordContent(record), null, 2)}\n`);
    knownPaths.push(recordPath);
  }
  refreshKnowledgeIndex(resolved.storePath);
  const tracePath = path.join(root, 'trace.jsonl');
  return {
    root, projectDir, storeDir, pluginDir, freshStore: true, knownPaths, tracePath,
    ...(cell.host === 'codex' ? { codexHome: hostHome } : { claudeHome: hostHome }),
  };
}

function cohortReport(cells) {
  const cohorts = {};
  for (const cell of cells) {
    const key = `${cell.condition}:${cell.host}`;
    const cohort = cohorts[key] ?? { samples: 0, completed: 0, invalid: 0, recalled: 0 };
    cohort.samples += 1;
    if (cell.status === 'completed') cohort.completed += 1;
    if (cell.status === 'invalid') cohort.invalid += 1;
    if (cell.judged?.recalled === true) cohort.recalled += 1;
    cohorts[key] = cohort;
  }
  return cohorts;
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
  }));
}

function readArtifact(projectDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectDir, 'evaluation-result.json'), 'utf8'));
    return Array.isArray(parsed?.recordIds) && Array.isArray(parsed?.actions) ? parsed : null;
  } catch {
    return null;
  }
}

function mergeHostRuns(runs) {
  const completed = runs.every((run) => run.status === 'completed');
  return {
    ...runs.at(-1),
    status: completed ? 'completed' : runs.find((run) => run.status !== 'completed').status,
    usage: { primary: null, workers: null, sessions: runs.map((run) => run.usage ?? null) },
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

function traceWithOperationCrosscheck(trace, toolOperations) {
  if (trace.availability !== 'available') return trace;
  const expected = new Set();
  for (const operation of toolOperations ?? []) {
    const command = operation?.input?.command;
    if (typeof command !== 'string') continue;
    if (/knowledge-cli\.mjs\s+search\b/.test(command)) expected.add('search');
    if (/knowledge-cli\.mjs\s+load\b/.test(command)) expected.add('load');
    if (/knowledge-cli\.mjs\s+resource\b/.test(command)) expected.add('resource-read');
    if (/knowledge-cli\.mjs\s+(?:capture|learn)\b/.test(command)) expected.add('capture');
  }
  const emitted = new Set(trace.events.map((event) => event.type));
  const missing = [...expected].filter((type) => !emitted.has(type));
  return missing.length === 0
    ? trace
    : { availability: 'unavailable', reason: `trace lacks native ${missing.join(', ')} event evidence`, events: trace.events };
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
    const staged = await stageKnowledgeCell(cell, cases.get(cell.caseId), options);
    try {
      const fixtureCase = cases.get(cell.caseId);
      const prompts = fixtureCase.longitudinalSteps ?? [[
        fixtureCase.task,
        fixtureCase.workflow ?? 'Use the installed Spectre workflow to complete the task.',
        'Reply with the decision and write evaluation-result.json with recordIds and actions arrays describing the evidence you used.',
      ].join('\n')];
      const runs = [];
      for (const [sessionOrdinal, prompt] of prompts.entries()) {
        runs.push(await invoke({
          host: cell.host, model: options.configuration?.model, effort: options.configuration?.effort,
          prompt,
          preparedFixture: staged, rawLogDirectory: path.join(rawLogRoot, cell.id, `session-${sessionOrdinal + 1}`),
          environment: { ...staged.environment, SPECTRE_KNOWLEDGE_EVALUATION_TRACE: staged.tracePath },
          limits: options.limits,
        }));
      }
      const hostResult = mergeHostRuns(runs);
      const trace = hostResult.traceUnavailable === true
        ? { availability: 'unavailable', reason: 'host reported trace collection unavailable', events: [] }
        : traceWithOperationCrosscheck(readEvaluationTrace(staged.tracePath), hostResult.toolOperations);
      return {
        ...hostResult,
        artifact: readArtifact(staged.projectDir),
        trace,
        bypass: [
          ...detectTraceBypass(hostResult.toolOperations, { knownPaths: staged.knownPaths }),
          ...trace.events.filter((event) => event.type === 'bypass'),
        ],
      };
    } finally {
      fs.rmSync(staged.root, { recursive: true, force: true });
    }
  });
  const report = { ...result, freeze: { hashes: freezeManifest.hashes, baseline: freezeManifest.baseline }, cohorts: cohortReport(result.cells), paired: pairedReport(result.cells) };
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

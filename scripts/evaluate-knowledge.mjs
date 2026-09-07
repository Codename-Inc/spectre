#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASELINE = '1cd1f035a253e9d7ef5086693ab9f1d0b11d360b';
const CONDITIONS = ['no-knowledge', 'baseline', 'candidate'];
const HOSTS = ['claude', 'codex'];

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function usage() {
  return 'Usage: evaluate-knowledge.mjs freeze --fixtures <dir> --oracle <file> --output <file>\n';
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

function freeze(fixtures, oracle, output) {
  const manifest = readJson(path.join(fixtures, 'manifest.json'));
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== 12) throw new Error('fixture manifest must contain exactly 12 cases');
  const fixtureBytes = fs.readFileSync(path.join(fixtures, 'manifest.json'));
  const oracleBytes = fs.readFileSync(oracle);
  for (const value of Object.values(readJson(oracle))) {
    if (typeof value === 'string' && fixtureBytes.includes(value)) throw new Error('gold oracle value leaked into agent-readable fixture');
  }
  const cells = manifest.cases.flatMap(entry => CONDITIONS.flatMap(condition => HOSTS.flatMap(host => [1, 2].map(repeat => ({ id: `${entry.id}:${condition}:${host}:${repeat}`, condition, host, repeat, longitudinal: Boolean(entry.longitudinal) })))));
  const result = { schemaVersion: 1, baseline: BASELINE, fixtureHash: hash(fixtureBytes), oracleHash: hash(oracleBytes), cells, concurrency: { total: 4, perHost: 2 }, freshStores: true, longitudinalSequential: true, usage: 'unknown-until-native-host-reports' };
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
  const metric = name => cells.map(cell => cell.runtime?.[name]).filter(Number.isFinite);
  return {
    runtime: Object.fromEntries(['injectedTokens', 'previewTokens', 'loadedBodyTokens', 'redundantTokens', 'totalTokens'].map(name => [name, { median: percentile(metric(name), .5), p95: percentile(metric(name), .95) }])),
    judged: { requiredRecall: cells.filter(cell => cell.judged?.required).every(cell => cell.judged.recalled === true), irrelevantLoadedTokens: cells.reduce((sum, cell) => sum + (cell.judged?.irrelevantLoadedTokens || 0), 0) },
    samples: cells.length,
  };
}

export async function runCells(freezeManifest, outputDir, invoke) {
  const results = [];
  for (const cell of freezeManifest.cells) {
    const cellDir = fs.mkdtempSync(path.join(outputDir, `${cell.host}-${cell.condition}-`));
    const runtime = await invoke({ ...cell, cellDir });
    results.push({ ...cell, runtime: { ...runtime, usage: normalizeUsage(runtime?.usage) } });
  }
  return { schemaVersion: 1, baseline: BASELINE, cells: results, aggregate: aggregate(results) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [, , command] = process.argv;
  if (command !== 'freeze') throw new Error(usage());
  const fixtures = argument(process.argv, '--fixtures'); const oracle = argument(process.argv, '--oracle'); const output = argument(process.argv, '--output');
  if (!fixtures || !oracle || !output) throw new Error(usage());
  process.stdout.write(`${JSON.stringify(freeze(path.resolve(fixtures), path.resolve(oracle), path.resolve(output)))}\n`);
}

export { BASELINE, CONDITIONS, HOSTS, freeze };

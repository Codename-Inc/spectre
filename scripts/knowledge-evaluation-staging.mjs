import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerCanonicalKnowledge } from '../plugins/spectre/hooks/scripts/knowledge/registration.mjs';
import { refreshKnowledgeIndex } from '../plugins/spectre/hooks/scripts/knowledge/records.mjs';
import { resolveProjectStore } from '../plugins/spectre/hooks/scripts/knowledge/store.mjs';
import { ensureTags } from '../plugins/spectre/hooks/scripts/knowledge/tags.mjs';

export const BASELINE_REF = '1cd1f035a253e9d7ef5086693ab9f1d0b11d360b';

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    result: (() => { try { return JSON.parse(result.stdout); } catch { return null; } })(),
  };
}

function requireDirectory(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || !fs.statSync(value).isDirectory()) {
    throw new Error(`${label} must be an absolute existing directory`);
  }
  return value;
}

function hostPluginSource(repositoryRoot, host, options) {
  const configured = options.candidatePluginRoots?.[host] ?? options.candidatePluginRoot;
  return requireDirectory(configured ?? path.join(repositoryRoot, host === 'codex' ? 'plugins/spectre-codex' : 'plugins/spectre'), 'candidate plugin root');
}

function archiveBaselinePlugin(repositoryRoot, host, destination, baselineRef) {
  const archivePath = host === 'codex' ? 'plugins/spectre-codex' : 'plugins/spectre';
  const archive = spawnSync('git', ['archive', '--format=tar', baselineRef, archivePath], {
    cwd: repositoryRoot, encoding: null,
  });
  if (archive.status !== 0) throw new Error(`Could not archive baseline ${baselineRef}: ${archive.stderr?.toString('utf8') || ''}`);
  const extractionRoot = path.join(path.dirname(destination), 'baseline-archive');
  fs.mkdirSync(extractionRoot, { recursive: true });
  const extracted = spawnSync('tar', ['-x', '-C', extractionRoot], { input: archive.stdout, encoding: 'utf8' });
  if (extracted.status !== 0) throw new Error(`Could not extract baseline ${baselineRef}: ${extracted.stderr || ''}`);
  const source = path.join(extractionRoot, archivePath);
  fs.cpSync(source, destination, { recursive: true });
  return { baselineRef, sourceHash: hash(archive.stdout) };
}

function initializeRepository(projectDir, fixtureCase) {
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'TASK.md'), `${fixtureCase.task}\n`);
  fs.writeFileSync(path.join(projectDir, 'EVIDENCE.md'), `${fixtureCase.workflow || 'Use the supplied facts.'}\n`);
  const commands = [
    ['init'], ['config', 'user.email', 'evaluation@example.invalid'], ['config', 'user.name', 'Knowledge Evaluation'],
    ['add', 'TASK.md', 'EVIDENCE.md'], ['commit', '-m', 'evaluation fixture'],
  ];
  for (const args of commands) {
    const result = run('git', args, { cwd: projectDir });
    if (result.status !== 0) throw new Error(`Could not initialize isolated fixture repository: ${result.stderr}`);
  }
}

function candidateRecord(fact) {
  if (fact.record) return fact.record;
  return {
    schemaVersion: 1, id: fact.id, kind: 'knowledge', title: fact.id,
    summary: fact.content, tags: ['evaluation'], applicability: fact.applicability || { scope: 'project' },
    provenance: { origin: 'captured', capturedAt: '2026-09-06T00:00:00.000Z' }, relatedRecordIds: [],
    category: fact.category || 'pattern', useWhen: `${fact.id}: ${fact.content}`,
    content: fact.content, evidence: 'Frozen evaluation fixture.', status: fact.status || 'active',
  };
}

function baselineSkill(fact) {
  const description = String(fact.content).replaceAll('"', '\\"');
  const triggers = JSON.stringify([fact.id]).replaceAll('"', '\\"');
  return [
    '---', `name: ${fact.id}`, `description: "${description}"`, 'metadata:',
    '  spectre-category: patterns', `  spectre-triggers: "${triggers}"`,
    `  spectre-status: ${fact.status || 'active'}`, '  spectre-version: "1"', '---', '', fact.content, '',
  ].join('\n');
}

async function seedCandidate(projectDir, storeDir, facts) {
  const resolved = await resolveProjectStore(projectDir, { spectreHome: storeDir });
  await ensureTags({ projectDir, spectreHome: storeDir, tags: [{ id: 'evaluation', description: 'Frozen evaluation fixture.', aliases: ['eval'] }] });
  const knownPaths = [];
  for (const fact of facts) {
    const record = candidateRecord(fact);
    const proposal = path.join(path.dirname(storeDir), 'proposals', record.id);
    fs.mkdirSync(proposal, { recursive: true });
    fs.writeFileSync(path.join(proposal, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
    const result = await registerCanonicalKnowledge({ projectDir, spectreHome: storeDir, recordPath: proposal });
    if (result.status !== 'created' && result.status !== 'noop') throw new Error(`Could not seed candidate record ${record.id}`);
    knownPaths.push(path.join(resolved.storePath, 'knowledge', record.id, 'record.json'));
  }
  refreshKnowledgeIndex(resolved.storePath);
  return { storePath: resolved.storePath, knownPaths };
}

async function seedBaseline(projectDir, storeDir, facts) {
  const resolved = await resolveProjectStore(projectDir, { spectreHome: storeDir });
  const knownPaths = [];
  for (const fact of facts) {
    const directory = path.join(resolved.storePath, 'knowledge', fact.id);
    fs.mkdirSync(directory, { recursive: true });
    const skillPath = path.join(directory, 'SKILL.md');
    fs.writeFileSync(skillPath, baselineSkill(fact));
    knownPaths.push(skillPath);
  }
  return { storePath: resolved.storePath, knownPaths };
}

function writeCodexNativeConfig(codexHome, projectDir, pluginDir) {
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), [
    '[features]', 'hooks = true', '', `[projects.${JSON.stringify(projectDir)}]`, 'trust_level = "trusted"', '',
  ].join('\n'));
  fs.copyFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), path.join(codexHome, 'hooks.json'));
}

function writeGhMock(root) {
  const bin = path.join(root, 'bin');
  const ghLogPath = path.join(root, 'gh.log');
  fs.mkdirSync(bin, { recursive: true });
  const executable = path.join(bin, 'gh');
  fs.writeFileSync(executable, ['#!/bin/sh', 'printf "%s\\n" "$*" >> "$SPECTRE_EVALUATION_GH_LOG"', 'echo "{}"'].join('\n'));
  fs.chmodSync(executable, 0o755);
  return { ghLogPath, environment: { PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`, SPECTRE_EVALUATION_GH_LOG: ghLogPath } };
}

function probeCli(cliPath, projectDir, storeDir, fact) {
  const environment = { ...process.env, SPECTRE_HOME: storeDir };
  const search = run(process.execPath, [cliPath, 'search', fact.id, '--project-dir', projectDir, '--json'], { cwd: projectDir, env: environment });
  const load = run(process.execPath, [cliPath, 'load', fact.id, '--project-dir', projectDir, '--json'], { cwd: projectDir, env: environment });
  return { search, load };
}

/** Stage one condition in a fresh isolated repository without invoking a native model host. */
export async function stageKnowledgeCell(cell, fixtureCase, options = {}) {
  if (!['candidate', 'baseline', 'no-knowledge'].includes(cell?.condition)) throw new Error('condition must be candidate, baseline, or no-knowledge');
  if (!['claude', 'codex'].includes(cell?.host)) throw new Error('host must be claude or codex');
  const repositoryRoot = requireDirectory(options.repositoryRoot || process.cwd(), 'repository root');
  const root = fs.mkdtempSync(path.join(options.temporaryRoot || os.tmpdir(), 'spectre-knowledge-evaluation-cell-'));
  const projectDir = path.join(root, 'project');
  const facts = fixtureCase.initialFacts || [];
  initializeRepository(projectDir, fixtureCase);
  const gh = writeGhMock(root);
  const hostHome = path.join(root, cell.host === 'codex' ? 'codex-home' : 'claude-home');

  if (cell.condition === 'no-knowledge') {
    return {
      root, projectDir, storeDir: null, pluginDir: null, runtimePath: null, cliPath: null, noKnowledge: true,
      freshStore: true, knownPaths: [], tracePath: null, ghLogPath: gh.ghLogPath, environment: gh.environment,
      ...(cell.host === 'codex' ? { codexHome: hostHome } : { claudeHome: hostHome }),
      provenance: { condition: 'no-knowledge' }, probe: null,
    };
  }

  const storeDir = path.join(root, 'spectre-home');
  const pluginDir = path.join(root, 'plugin');
  let provenance;
  if (cell.condition === 'baseline') {
    provenance = archiveBaselinePlugin(repositoryRoot, cell.host, pluginDir, options.baselineRef || BASELINE_REF);
  } else {
    const source = hostPluginSource(repositoryRoot, cell.host, options);
    fs.cpSync(source, pluginDir, { recursive: true });
    provenance = { candidateSource: source, sourceHash: hash(fs.readFileSync(path.join(pluginDir, 'hooks', 'scripts', 'knowledge-cli.mjs'))) };
  }
  const seeded = cell.condition === 'baseline'
    ? await seedBaseline(projectDir, storeDir, facts)
    : await seedCandidate(projectDir, storeDir, facts);
  if (cell.host === 'codex') writeCodexNativeConfig(hostHome, projectDir, pluginDir);
  else fs.mkdirSync(hostHome, { recursive: true });
  const cliPath = path.join(pluginDir, 'hooks', 'scripts', 'knowledge-cli.mjs');
  const probe = facts.length > 0 ? probeCli(cliPath, projectDir, storeDir, facts[0]) : null;
  if (probe && (probe.search.status !== 0 || probe.load.status !== 0)) throw new Error(`Staged ${cell.condition} CLI probe failed: ${probe.search.stderr || probe.load.stderr}`);
  return {
    root, projectDir, storeDir, pluginDir, runtimePath: path.join(pluginDir, 'hooks', 'scripts', 'load-knowledge.mjs'), cliPath,
    freshStore: true, knownPaths: seeded.knownPaths, tracePath: cell.condition === 'candidate' ? path.join(root, 'trace.jsonl') : null,
    ghLogPath: gh.ghLogPath, environment: { ...gh.environment, ...(cell.condition === 'candidate' ? { SPECTRE_KNOWLEDGE_EVALUATION_TRACE: path.join(root, 'trace.jsonl') } : {}) },
    ...(cell.host === 'codex' ? { codexHome: hostHome } : { claudeHome: hostHome }),
    provenance: { condition: cell.condition, ...provenance }, probe,
  };
}

/** Snapshot staged record and history files before an evaluator removes its isolated cell. */
export function snapshotKnowledgeCell(staged) {
  if (!staged?.storeDir || !fs.existsSync(staged.storeDir)) return { records: [], history: [] };
  const store = fs.readdirSync(path.join(staged.storeDir, 'projects'), { withFileTypes: true });
  const paths = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name === 'record.json' || entry.name === 'SKILL.md') paths.push(target);
    }
  };
  for (const entry of store) if (entry.isDirectory()) walk(path.join(staged.storeDir, 'projects', entry.name));
  return { records: paths.filter(value => value.includes(`${path.sep}knowledge${path.sep}`)), history: paths.filter(value => value.includes(`${path.sep}knowledge-history${path.sep}`)) };
}

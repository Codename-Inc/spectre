import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readKnowledgeActivity } from './activity.mjs';
import { refreshKnowledgeIndex } from './records.mjs';
import { renderKnowledgeRegistry } from './registry.mjs';
import { resolveProjectStore } from './store.mjs';

const HOSTS = new Set(['claude', 'codex']);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const BUNDLED_CLI_PATH = path.resolve(SCRIPT_DIR, '..', 'knowledge-cli.mjs');

function zeroKnowledgeActivity() {
  return {
    schemaVersion: 1,
    records: {},
    search: { matches: 0, misses: 0, recordMatches: {} },
  };
}

function recordIdentity({ id, version }) {
  return { id, version };
}

function emptyPreview({ host, projectDir, storePath = null, warnings = [] }) {
  return {
    host,
    projectDir,
    storePath,
    injected: false,
    payload: null,
    measurement: null,
    includedCount: 0,
    omittedCount: 0,
    includedRecords: [],
    omittedRecords: [],
    warnings,
  };
}

export async function previewKnowledgeRegistry(options) {
  const host = options?.host ?? 'claude';
  if (!HOSTS.has(host)) throw new RangeError(`Unsupported registry host: ${host}`);
  const projectDir = path.resolve(options.projectDir);
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    readOnly: true,
  });
  if (!resolved.storePath) return emptyPreview({ host, projectDir });

  const { index } = refreshKnowledgeIndex(resolved.storePath, { persist: false });
  if (index.records.length === 0) {
    return emptyPreview({ host, projectDir, storePath: resolved.storePath });
  }

  const warnings = [];
  let activity;
  try {
    activity = readKnowledgeActivity(resolved.storePath);
  } catch (error) {
    warnings.push({
      code: error.code || 'KNOWLEDGE_ACTIVITY_UNAVAILABLE',
      message: error.message,
    });
    activity = zeroKnowledgeActivity();
  }

  const registry = renderKnowledgeRegistry({
    host,
    records: index.records,
    activity,
    projectDir,
    cliPath: options.cliPath || BUNDLED_CLI_PATH,
  });
  return {
    host,
    projectDir,
    storePath: resolved.storePath,
    injected: true,
    payload: JSON.parse(registry.frame),
    measurement: registry.measurement,
    includedCount: registry.includedCount,
    omittedCount: registry.omittedCount,
    includedRecords: registry.includedEntries.map(recordIdentity),
    omittedRecords: registry.rankedEntries
      .slice(registry.includedCount)
      .map(recordIdentity),
    warnings,
  };
}

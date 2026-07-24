#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { migrateLegacyKnowledge } from './knowledge/migration.mjs';
import {
  BUNDLED_CLI_PATH,
  previewKnowledgeRegistry,
} from './knowledge/preview.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const HOSTS = new Set(['claude', 'codex']);
// `resume` is deliberately absent: a resumed transcript already replays the
// registry injected at startup, so re-emitting it only duplicates context.
// This gate is independent of the hooks.json matcher so a stale installed
// hook configuration cannot reintroduce the duplicate.
const SESSION_SOURCES = new Set(['startup', 'clear', 'compact']);
const START_MARKER = '<!-- spectre-knowledge:start -->';
const END_MARKER = '<!-- spectre-knowledge:end -->';

function parseHost(argv) {
  const index = argv.indexOf('--host');
  if (index === -1) return 'claude';
  const host = argv[index + 1];
  return HOSTS.has(host) ? host : null;
}

function readHookInput() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input;
}

function projectDirectory(input) {
  if (typeof input.cwd === 'string' && input.cwd !== '') {
    return path.resolve(input.cwd);
  }
  if (
    typeof process.env.CLAUDE_PROJECT_DIR === 'string'
    && process.env.CLAUDE_PROJECT_DIR !== ''
  ) {
    return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  }
  return process.cwd();
}

function managedBlockPattern() {
  return new RegExp(
    `${START_MARKER}[\\s\\S]*?${END_MARKER}`,
    'g',
  );
}

function removeManagedKnowledgeTransport(projectDir, storePath) {
  const overridePath = path.join(projectDir, 'AGENTS.override.md');
  try {
    const current = fs.readFileSync(overridePath, 'utf8');
    const updated = current.replace(managedBlockPattern(), '');
    if (updated !== current) fs.writeFileSync(overridePath, updated);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (storePath) {
    fs.rmSync(path.join(storePath, 'runtime', 'sessions'), {
      recursive: true,
      force: true,
    });
  }
}

async function runMigration(projectDir) {
  try {
    const migration = await migrateLegacyKnowledge({
      projectDir,
      spectreHome: process.env.SPECTRE_HOME,
      failOpenOnLockTimeout: true,
      lockOptions: { timeoutMs: 0 },
    });
    if (migration.skipped === 'LOCK_TIMEOUT') {
      process.stderr.write(
        'spectre SessionStart migration skipped: reason=LOCK_TIMEOUT\n',
      );
    }
  } catch (error) {
    process.stderr.write(
      `spectre SessionStart migration skipped: ${error.message}\n`,
    );
  }
}

async function runSessionStart(input, host) {
  if (
    input?.hook_event_name !== 'SessionStart'
    || !SESSION_SOURCES.has(input.source)
  ) {
    return null;
  }

  const projectDir = projectDirectory(input);
  await runMigration(projectDir);
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: process.env.SPECTRE_HOME,
    readOnly: true,
  });
  removeManagedKnowledgeTransport(projectDir, resolved.storePath);
  if (!resolved.storePath) return null;

  const preview = await previewKnowledgeRegistry({
    host,
    projectDir,
    spectreHome: process.env.SPECTRE_HOME,
    cliPath: BUNDLED_CLI_PATH,
  });
  for (const warning of preview.warnings) {
    process.stderr.write(
      `spectre SessionStart activity ignored: ${warning.code}: ${warning.message}\n`,
    );
  }
  return preview.payload;
}

async function main() {
  const host = parseHost(process.argv.slice(2));
  if (!host) return;
  const input = readHookInput();
  const output = await runSessionStart(input, host);
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`spectre SessionStart hook skipped: ${error.message}\n`);
}

export {
  BUNDLED_CLI_PATH,
  projectDirectory,
  removeManagedKnowledgeTransport,
  runSessionStart,
};

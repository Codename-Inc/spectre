#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { clearAppliedKnowledge } from './knowledge/matcher.mjs';
import { migrateLegacyKnowledge } from './knowledge/migration.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const HOSTS = new Set(['claude', 'codex']);
const SESSION_SOURCES = new Set(['startup', 'clear', 'compact']);
const START_MARKER = '<!-- spectre-knowledge:start -->';
const END_MARKER = '<!-- spectre-knowledge:end -->';
const CAPABILITY_NOTICE =
  'spectre: relevant active project knowledge is applied automatically; ' +
  'search with `spectre knowledge search "<query>"`; capture durable knowledge ' +
  'with `/spectre:learn`.';
const CAPABILITY_BODY = [
  '## SPECTRE Project Knowledge',
  '',
  'Relevant active project knowledge is applied automatically when a prompt matches.',
  'Use `spectre knowledge search "<query>"` for explicit lexical discovery.',
  'Use `/spectre:learn` to capture durable project knowledge.',
].join('\n');

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
    typeof process.env.CLAUDE_PROJECT_DIR === 'string' &&
    process.env.CLAUDE_PROJECT_DIR !== ''
  ) {
    return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  }
  return process.cwd();
}

function managedBlockPattern() {
  return new RegExp(
    `\\n?${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`,
    'm',
  );
}

function writeCapabilityBlock(projectDir) {
  const overridePath = path.join(projectDir, 'AGENTS.override.md');
  const current = fs.existsSync(overridePath)
    ? fs.readFileSync(overridePath, 'utf8')
    : '';
  const block = `${START_MARKER}\n${CAPABILITY_BODY}\n${END_MARKER}`;
  const pattern = managedBlockPattern();
  const updated = pattern.test(current)
    ? current.replace(pattern, `\n${block}\n`)
    : current.trim()
      ? `${current.trimEnd()}\n\n${block}\n`
      : `${block}\n`;
  fs.writeFileSync(
    overridePath,
    `${updated.replace(/\n{3,}/g, '\n\n').trim()}\n`,
  );
}

function hasProjectSurface(projectDir, storePath) {
  if (storePath) return true;
  if (fs.existsSync(path.join(projectDir, '.spectre', 'manifest.json'))) {
    return true;
  }
  try {
    const override = fs.readFileSync(
      path.join(projectDir, 'AGENTS.override.md'),
      'utf8',
    );
    return override.includes(START_MARKER) ||
      override.includes('<!-- spectre-session:start -->');
  } catch {
    return false;
  }
}

function migrationTimeout() {
  const configured = Number(process.env.SPECTRE_HOOK_MIGRATION_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 5_000;
}

async function runSessionStart(input, host) {
  if (
    input?.hook_event_name !== 'SessionStart' ||
    !SESSION_SOURCES.has(input.source)
  ) {
    return null;
  }
  const projectDir = projectDirectory(input);
  await migrateLegacyKnowledge({
    projectDir,
    spectreHome: process.env.SPECTRE_HOME,
    failOpenOnLockTimeout: true,
    lockOptions: { timeoutMs: migrationTimeout() },
  });
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: process.env.SPECTRE_HOME,
    readOnly: true,
  });
  if (resolved.storePath) {
    clearAppliedKnowledge({
      storePath: resolved.storePath,
      host,
      sessionId: input.session_id,
    });
  }
  if (hasProjectSurface(projectDir, resolved.storePath)) {
    writeCapabilityBlock(projectDir);
  }
  return {
    systemMessage: CAPABILITY_NOTICE,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
    },
  };
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
  CAPABILITY_BODY,
  CAPABILITY_NOTICE,
  hasProjectSurface,
  projectDirectory,
  runSessionStart,
  writeCapabilityBlock,
};

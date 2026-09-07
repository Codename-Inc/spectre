#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveKnowledgeProjectDir } from './knowledge/cli-arguments.mjs';
import { inspectKnowledgeRevision, listKnowledgeHistory } from './knowledge/history.mjs';
import { formatKnowledgeLoadHuman, loadKnowledgeById, serializeKnowledgeLoadError } from './knowledge/loader.mjs';
import { migrateLegacyKnowledge } from './knowledge/migration.mjs';
import { previewKnowledgeRegistry } from './knowledge/preview.mjs';
import { registerCanonicalKnowledge, serializeKnowledgeError } from './knowledge/registration.mjs';
import { formatKnowledgeSearchHuman, formatKnowledgeSearchWarningsHuman, searchKnowledge } from './knowledge/search.mjs';
import { applyTagOperationFile, searchTags, serializeTagError } from './knowledge/tags.mjs';
import { resolveWorkIdentity } from './knowledge/work.mjs';

const __filename = fileURLToPath(import.meta.url);

export function parseArgs(argv) {
  const positional = [];
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const next = argv[index + 1];
    const parsed = !next || next.startsWith('--') ? true : next;
    if (parsed !== true) index += 1;
    values.set(value, [...(values.get(value) || []), parsed]);
  }
  return {
    positional,
    flags: {
      get(name) { return values.get(name)?.at(-1); },
      getAll(name) { return [...(values.get(name) || [])]; },
      has(name) { return values.has(name); },
    },
  };
}

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function lockOptions(flags) {
  const timeout = flags.get('--lock-timeout-ms');
  return timeout ? { timeoutMs: Number(timeout), retryDelayMs: 5 } : undefined;
}

function projectDir(flags) {
  return resolveKnowledgeProjectDir(flags.get('--project-dir') || flags.get('--project-root'));
}

function numericFlag(flags, name) {
  const value = flags.get(name);
  return value === undefined ? undefined : Number(value);
}

function usage() {
  return [
    'Usage:',
    '  knowledge-cli.mjs search [query] [--tag <tag>] [--path <path>] [--work-id <id>] [--run-id <id>] --project-dir <path> [--json]',
    '  knowledge-cli.mjs tags search [query] --project-dir <path> [--json]',
    '  knowledge-cli.mjs tags apply --input <json> --project-dir <path> [--json]',
    '  knowledge-cli.mjs load <id> [--work-id <id>] [--run-id <id>] [--allowance-tokens <n>] [--inspect-historical] --project-dir <path> [--json]',
    '  knowledge-cli.mjs history <id> --project-dir <path> [--json]',
    '  knowledge-cli.mjs inspect <id> --revision <token> --project-dir <path> [--json]',
    '  knowledge-cli.mjs work resolve [--work-id <id>] [--source-run-id <id>] [--pull-request-id <id>] --project-dir <path> [--json]',
    '  knowledge-cli.mjs registry [--host claude|codex] --project-dir <path> [--json]',
    '  knowledge-cli.mjs register --record <path> [--expected-revision <token>] --project-dir <path> [--json]',
    '  knowledge-cli.mjs migrate --project-dir <path> [--json]',
    '',
  ].join('\n');
}

function writeResult(result, flags, human) {
  if (flags.has('--json')) process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stdout.write(human ? human(result) : `${JSON.stringify(result)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parseArgs(argv);
  const [command, subcommand] = positional;
  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(usage());
    return;
  }
  if (command === 'search') {
    const query = positional.slice(1).join(' ');
    try {
      const result = await searchKnowledge({
        projectDir: projectDir(flags), query, tags: flags.getAll('--tag'), paths: flags.getAll('--path'),
        workId: flags.get('--work-id'), runId: flags.get('--run-id'), kind: flags.get('--kind'),
        limit: numericFlag(flags, '--limit'), cursor: flags.get('--cursor'),
      });
      const output = { ok: true, query, ...result };
      if (flags.has('--json')) process.stdout.write(`${JSON.stringify(output)}\n`);
      else { process.stdout.write(formatKnowledgeSearchHuman(result, query)); process.stderr.write(formatKnowledgeSearchWarningsHuman(result.warnings)); }
    } catch (error) { throw codedError('KNOWLEDGE_SEARCH_FAILED', error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (command === 'tags') {
    try {
      const result = subcommand === 'search'
        ? await searchTags({ projectDir: projectDir(flags), query: positional.slice(2).join(' '), limit: numericFlag(flags, '--limit'), cursor: flags.get('--cursor') })
        : subcommand === 'apply'
          ? await applyTagOperationFile({ projectDir: projectDir(flags), inputPath: flags.get('--input'), lockOptions: lockOptions(flags) })
          : null;
      if (!result) throw codedError('UNKNOWN_TAG_COMMAND', `Unknown tags command "${subcommand || ''}".`);
      writeResult(result, flags);
    } catch (error) { const payload = serializeTagError(error); throw codedError(payload.code, payload.message); }
    return;
  }
  if (command === 'load') {
    try {
      const result = await loadKnowledgeById({
        projectDir: projectDir(flags), id: subcommand, lockOptions: lockOptions(flags),
        workId: flags.get('--work-id'), runId: flags.get('--run-id'), allowanceTokens: numericFlag(flags, '--allowance-tokens'),
        inspectHistorical: flags.has('--inspect-historical'),
      });
      if (flags.has('--json')) process.stdout.write(`${JSON.stringify(result)}\n`);
      else process.stdout.write(formatKnowledgeLoadHuman(result));
    } catch (error) { const payload = serializeKnowledgeLoadError(error); throw codedError(payload.code, payload.message); }
    return;
  }
  if (command === 'history' || command === 'inspect') {
    try {
      const result = command === 'history'
        ? await listKnowledgeHistory({ projectDir: projectDir(flags), id: subcommand, cursor: flags.get('--cursor'), lockOptions: lockOptions(flags) })
        : await inspectKnowledgeRevision({ projectDir: projectDir(flags), id: subcommand, revisionToken: flags.get('--revision'), lockOptions: lockOptions(flags) });
      writeResult(result, flags);
    } catch (error) { throw codedError(error?.code || 'KNOWLEDGE_HISTORY_FAILED', error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (command === 'work' && subcommand === 'resolve') {
    try {
      const candidate = flags.get('--candidate') ? JSON.parse(flags.get('--candidate')) : undefined;
      writeResult(await resolveWorkIdentity({ projectDir: projectDir(flags), workId: flags.get('--work-id'), sourceRunId: flags.get('--source-run-id'), pullRequestId: flags.get('--pull-request-id'), candidate, lockOptions: lockOptions(flags) }), flags);
    } catch (error) { throw codedError(error?.code || 'WORK_RESOLUTION_FAILED', error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (command === 'registry') {
    try {
      const result = await previewKnowledgeRegistry({ host: flags.get('--host') || 'claude', projectDir: projectDir(flags) });
      if (flags.has('--json')) process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      else process.stdout.write(result.injected ? `${result.payload.hookSpecificOutput.additionalContext}\n` : 'No SessionStart knowledge payload would be injected.\n');
    } catch (error) { throw codedError('KNOWLEDGE_REGISTRY_FAILED', error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (command === 'register') {
    try {
      const result = await registerCanonicalKnowledge({ projectDir: projectDir(flags), recordPath: flags.get('--record'), expectedRevision: flags.get('--expected-revision'), lockOptions: lockOptions(flags) });
      writeResult(result, flags, (value) => `Registered knowledge record ${value.id}\n`);
    } catch (error) { const payload = serializeKnowledgeError(error); throw codedError(payload.code, payload.message, payload); }
    return;
  }
  if (command === 'migrate') {
    try {
      const report = await migrateLegacyKnowledge({ projectDir: projectDir(flags), lockOptions: lockOptions(flags) });
      writeResult({ ok: true, ...report }, flags, (value) => `Migrated ${value.entries.length} knowledge entries\n`);
    } catch (error) { throw codedError(error?.code || 'KNOWLEDGE_MIGRATION_FAILED', error instanceof Error ? error.message : String(error)); }
    return;
  }
  throw codedError('UNKNOWN_KNOWLEDGE_COMMAND', `Unknown knowledge command "${command}".`);
}

export function writeCliError(error, argv = process.argv.slice(2)) {
  const message = error instanceof Error ? error.message : String(error);
  if (argv.includes('--json') && error?.code) {
    const payload = { ok: false, code: error.code, message };
    for (const field of ['status', 'expectedRevision', 'currentRevision']) {
      if (error[field] !== undefined) payload[field] = error[field];
    }
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }
  else process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename)) {
  main().catch((error) => writeCliError(error));
}

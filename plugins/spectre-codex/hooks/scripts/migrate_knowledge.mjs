#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateLegacyKnowledge } from './knowledge/migration.mjs';

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const args = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') {
      args.json = true;
      continue;
    }
    if (value === '--project-root' || value === '--project-dir') {
      args.projectRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === '--lock-timeout-ms') {
      args.lockTimeoutMs = Number(argv[index + 1]);
      index += 1;
    }
  }
  return args;
}

function serializeError(error) {
  return {
    ok: false,
    code: error?.code || 'KNOWLEDGE_MIGRATION_FAILED',
    message: error instanceof Error ? error.message : String(error),
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  try {
    const report = await migrateLegacyKnowledge({
      projectDir: path.resolve(args.projectRoot || process.cwd()),
      lockOptions: Number.isFinite(args.lockTimeoutMs)
        ? { timeoutMs: args.lockTimeoutMs, retryDelayMs: 5 }
        : undefined,
    });
    const output = { ok: true, ...report };
    if (args.json) {
      process.stdout.write(`${JSON.stringify(output)}\n`);
    } else {
      process.stdout.write(`Migrated ${report.entries.length} knowledge entries\n`);
    }
  } catch (error) {
    const payload = serializeError(error);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    } else {
      process.stderr.write(`${payload.message}\n`);
    }
    process.exitCode = 1;
  }
}

export { main, parseArgs };

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename)) {
  main();
}

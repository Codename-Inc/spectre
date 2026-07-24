#!/usr/bin/env node

import { resolveKnowledgeProjectDir } from './knowledge/cli-arguments.mjs';
import {
  formatKnowledgeLoadHuman,
  loadKnowledgeById,
  serializeKnowledgeLoadError,
} from './knowledge/loader.mjs';
import {
  formatKnowledgeSearchHuman,
  formatKnowledgeSearchWarningsHuman,
  searchKnowledge,
} from './knowledge/search.mjs';
import { previewKnowledgeRegistry } from './knowledge/preview.mjs';
import { main as migrateKnowledge } from './migrate_knowledge.mjs';
import { main as registerKnowledge } from './register_learning.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        flags.set(value, true);
      } else {
        flags.set(value, next);
        index += 1;
      }
    } else {
      positional.push(value);
    }
  }
  return { positional, flags };
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function usage() {
  return [
    'Usage:',
    '  knowledge-cli.mjs search [query] --project-dir <path> [--json]',
    '  knowledge-cli.mjs load <id> --project-dir <path> [--json]',
    '  knowledge-cli.mjs registry [--host claude|codex] --project-dir <path> [--json]',
    '  knowledge-cli.mjs register --record <path> --project-dir <path> [--json]',
    '  knowledge-cli.mjs migrate --project-dir <path> [--json]',
    '',
  ].join('\n');
}

export async function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [command] = positional;
  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(usage());
    return;
  }
  if (command === 'search') {
    const query = positional.slice(1).join(' ');
    let result;
    try {
      result = await searchKnowledge({
        projectDir: resolveKnowledgeProjectDir(flags.get('--project-dir')),
        query,
      });
    } catch (error) {
      throw codedError(
        'KNOWLEDGE_SEARCH_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (flags.get('--json')) {
      process.stdout.write(`${JSON.stringify({ ok: true, query, ...result })}\n`);
    } else {
      process.stdout.write(formatKnowledgeSearchHuman(result, query));
      process.stderr.write(formatKnowledgeSearchWarningsHuman(result.warnings));
    }
    return;
  }

  if (command === 'load') {
    try {
      const result = await loadKnowledgeById({
        projectDir: resolveKnowledgeProjectDir(flags.get('--project-dir')),
        id: positional[1],
        lockOptions: flags.get('--lock-timeout-ms')
          ? { timeoutMs: Number(flags.get('--lock-timeout-ms')), retryDelayMs: 5 }
          : undefined,
      });
      if (flags.get('--json')) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } else {
        process.stdout.write(formatKnowledgeLoadHuman(result));
      }
    } catch (error) {
      const payload = serializeKnowledgeLoadError(error);
      throw codedError(payload.code, payload.message);
    }
    return;
  }

  if (command === 'registry') {
    let result;
    try {
      result = await previewKnowledgeRegistry({
        host: flags.get('--host') || 'claude',
        projectDir: resolveKnowledgeProjectDir(flags.get('--project-dir')),
      });
    } catch (error) {
      throw codedError(
        'KNOWLEDGE_REGISTRY_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (flags.get('--json')) {
      process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    } else if (result.injected) {
      process.stdout.write(`${result.payload.hookSpecificOutput.additionalContext}\n`);
    } else {
      process.stdout.write('No SessionStart knowledge payload would be injected.\n');
    }
    return;
  }

  if (command === 'register') {
    await registerKnowledge(argv.slice(1));
    return;
  }

  if (command === 'migrate') {
    await migrateKnowledge(argv.slice(1));
    return;
  }

  throw codedError(
    'UNKNOWN_KNOWLEDGE_COMMAND',
    `Unknown knowledge command "${command}".`,
  );
}

main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json') && error?.code) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: error.code, message })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = 1;
});

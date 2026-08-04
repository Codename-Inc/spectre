import path from 'path';
import readline from 'readline/promises';
import fs from 'fs';
import { runDoctor } from './lib/doctor.js';
import { resolveKnowledgeProjectDir } from '../plugins/spectre/hooks/scripts/knowledge/cli-arguments.mjs';
import {
  formatCanonicalKnowledgeLoad,
  formatCanonicalKnowledgeSearch,
  formatCanonicalKnowledgeSearchWarnings,
  loadCanonicalKnowledge,
  migrateCanonicalKnowledge,
  previewCanonicalKnowledgeRegistry,
  registerCanonicalKnowledge,
  searchCanonicalKnowledge,
  serializeCanonicalKnowledgeError,
  serializeCanonicalKnowledgeLoadError
} from './lib/knowledge.js';
import { projectCodexHome } from './lib/paths.js';

class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const positional = [];
  const flags = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        flags.set(value, true);
        continue;
      }
      flags.set(value, next);
      index += 1;
      continue;
    }

    positional.push(value);
  }

  return { positional, flags };
}

function usage() {
  return `Usage:
  spectre install codex
  spectre uninstall codex
  spectre update codex
  spectre doctor codex [--scope user|project] [--project-dir <path>] [--json]
  spectre knowledge search [query] [--project-dir <path>] [--json]
  spectre knowledge load <id> [--project-dir <path>] [--json]
  spectre knowledge registry [--host claude|codex] [--project-dir <path>] [--json]
  spectre knowledge register --record <path> [--project-dir <path>] [--json]
  spectre knowledge migrate [--project-dir <path>] [--json]
`;
}

function codexPluginRequiredMessage(command) {
  const update = [
    'Codex native plugin installation is required for Spectre 6.0.0.',
    '',
    'Fresh install:',
    '  codex plugin marketplace add joenandez/spectre',
    '  codex plugin add spectre@spectre',
    '',
    'Update:',
    '  codex plugin marketplace upgrade spectre',
    '  codex plugin remove spectre@spectre',
    '  codex plugin add spectre@spectre',
    '',
    'Uninstall:',
    '  Run the bundled spectre-uninstall-codex skill first to remove managed agents.',
    '  codex plugin remove spectre@spectre',
  ].join('\n');
  return `${command} codex no longer mutates Codex files.\n${update}`;
}

function resolveProjectDir(flags) {
  const projectDir = flags.get('--project-dir');
  return path.resolve(projectDir || process.cwd());
}

function detectInstalledScope(projectDir) {
  const manifestPath = path.join(projectDir, '.spectre', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.scope === 'project') {
        return 'project';
      }
    } catch {
      // Ignore malformed manifests and fall back to global scope.
    }
  }

  return 'user';
}

async function promptForScope(command, projectDir) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return command === 'install' ? 'project' : detectInstalledScope(projectDir);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = command === 'install'
    ? 'Install scope? [p]roject or [u]ser: '
    : 'Target scope? [p]roject or [u]ser: ';

  try {
    while (true) {
      const answer = (await rl.question(prompt)).trim().toLowerCase();
      if (answer === 'p' || answer === 'project') {
        return 'project';
      }
      if (answer === 'u' || answer === 'user') {
        return 'user';
      }
    }
  } finally {
    rl.close();
  }
}

async function withScopedCodexHome(scope, projectDir, fn) {
  const previous = process.env.CODEX_HOME;
  if (scope === 'project') {
    process.env.CODEX_HOME = projectCodexHome(projectDir);
  } else if (previous == null) {
    delete process.env.CODEX_HOME;
  }

  try {
    return await fn();
  } finally {
    if (previous == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previous;
    }
  }
}

export async function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [command, target] = positional;

  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(usage());
    return;
  }

  if (command === 'knowledge') {
    if (target === 'search') {
      const query = positional.slice(2).join(' ');
      let result;
      try {
        result = await searchCanonicalKnowledge({
          projectDir: resolveKnowledgeProjectDir(flags.get('--project-dir')),
          query
        });
      } catch (error) {
        throw new CliError(
          'KNOWLEDGE_SEARCH_FAILED',
          error instanceof Error ? error.message : String(error)
        );
      }
      if (flags.get('--json')) {
        process.stdout.write(`${JSON.stringify({ ok: true, query, ...result })}\n`);
      } else {
        process.stdout.write(formatCanonicalKnowledgeSearch(result, query));
        process.stderr.write(formatCanonicalKnowledgeSearchWarnings(result.warnings));
      }
      return;
    }

    if (target === 'load') {
      try {
        const result = await loadCanonicalKnowledge({
          projectDir: resolveKnowledgeProjectDir(flags.get('--project-dir')),
          id: positional[2],
          lockOptions: flags.get('--lock-timeout-ms')
            ? { timeoutMs: Number(flags.get('--lock-timeout-ms')), retryDelayMs: 5 }
            : undefined
        });
        if (flags.get('--json')) {
          process.stdout.write(`${JSON.stringify(result)}\n`);
        } else {
          process.stdout.write(formatCanonicalKnowledgeLoad(result));
        }
      } catch (error) {
        const payload = serializeCanonicalKnowledgeLoadError(error);
        throw new CliError(payload.code, payload.message);
      }
      return;
    }

    if (target === 'registry') {
      let result;
      try {
        result = await previewCanonicalKnowledgeRegistry({
          host: flags.get('--host') || 'claude',
          projectDir: resolveKnowledgeProjectDir(flags.get('--project-dir')),
        });
      } catch (error) {
        throw new CliError(
          'KNOWLEDGE_REGISTRY_FAILED',
          error instanceof Error ? error.message : String(error)
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

    if (target === 'register' || target === 'migrate') {
      if (target === 'register') {
        try {
          const result = await registerCanonicalKnowledge({
            projectDir: resolveProjectDir(flags),
            recordPath: flags.get('--record'),
            lockOptions: flags.get('--lock-timeout-ms')
              ? { timeoutMs: Number(flags.get('--lock-timeout-ms')), retryDelayMs: 5 }
              : undefined
          });
          if (flags.get('--json')) {
            process.stdout.write(`${JSON.stringify(result)}\n`);
          } else {
            process.stdout.write(`Registered knowledge record ${result.id}\n`);
          }
        } catch (error) {
          const payload = serializeCanonicalKnowledgeError(error);
          throw new CliError(payload.code, payload.message);
        }
        return;
      }

      try {
        const report = await migrateCanonicalKnowledge({
          projectDir: resolveProjectDir(flags),
          lockOptions: flags.get('--lock-timeout-ms')
            ? { timeoutMs: Number(flags.get('--lock-timeout-ms')), retryDelayMs: 5 }
            : undefined
        });
        if (flags.get('--json')) {
          process.stdout.write(`${JSON.stringify({ ok: true, ...report })}\n`);
        } else {
          process.stdout.write(`Migrated ${report.entries.length} knowledge entries\n`);
        }
      } catch (error) {
        throw new CliError(
          error?.code || 'KNOWLEDGE_MIGRATION_FAILED',
          error instanceof Error ? error.message : String(error)
        );
      }
      return;
    }

    throw new CliError(
      'UNKNOWN_KNOWLEDGE_COMMAND',
      `Unknown knowledge command "${target || ''}".`
    );
  }

  if (target !== 'codex') {
    throw new Error('Only the Codex target is currently implemented.');
  }

  if (command === 'install' || command === 'uninstall' || command === 'update') {
    throw new CliError('CODEX_PLUGIN_REQUIRED', codexPluginRequiredMessage(command));
  }

  const projectDir = resolveProjectDir(flags);
  const scope = flags.get('--scope') || await promptForScope(command, projectDir);

  if (command === 'doctor') {
    await withScopedCodexHome(scope, projectDir, () => runDoctor({
      verifyHooks: Boolean(flags.get('--verify-hooks')),
      json: Boolean(flags.get('--json')),
      projectDir
    }));
    return;
  }

  throw new Error(`Unknown command "${command}".\n${usage()}`);
}

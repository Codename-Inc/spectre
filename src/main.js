import path from 'path';
import readline from 'readline/promises';
import fs from 'fs';
import { runDoctor } from './lib/doctor.js';
import { installCodex, uninstallCodex } from './lib/install.js';
import { projectCodexHome } from './lib/paths.js';

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
  spectre install codex [--scope user|project] [--project-dir <path>]
  spectre uninstall codex [--scope user|project] [--project-dir <path>]
  spectre update codex [--scope user|project] [--project-dir <path>]
  spectre doctor codex [--scope user|project] [--project-dir <path>] [--verify-hooks] [--json]
`;
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

function withScopedCodexHome(scope, projectDir, fn) {
  const previous = process.env.CODEX_HOME;
  if (scope === 'project') {
    process.env.CODEX_HOME = projectCodexHome(projectDir);
  } else if (previous == null) {
    delete process.env.CODEX_HOME;
  }

  try {
    return fn();
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

  if (target !== 'codex') {
    throw new Error('Only the Codex target is currently implemented.');
  }

  const projectDir = resolveProjectDir(flags);
  const scope = flags.get('--scope') || await promptForScope(command, projectDir);

  if (command === 'install') {
    withScopedCodexHome(scope, projectDir, () => installCodex({ scope, projectDir }));
    return;
  }

  if (command === 'uninstall') {
    withScopedCodexHome(scope, projectDir, () => uninstallCodex({ scope, projectDir }));
    return;
  }

  if (command === 'update') {
    withScopedCodexHome(scope, projectDir, () => installCodex({ scope, projectDir }));
    return;
  }

  if (command === 'doctor') {
    withScopedCodexHome(scope, projectDir, () => runDoctor({
      verifyHooks: Boolean(flags.get('--verify-hooks')),
      json: Boolean(flags.get('--json')),
      projectDir
    }));
    return;
  }

  throw new Error(`Unknown command "${command}".\n${usage()}`);
}

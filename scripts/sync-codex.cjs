#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const agents = require('./translators/agents.cjs');
const skills = require('./translators/skills.cjs');
const hooks = require('./translators/hooks.cjs');

const translators = [
  { name: 'agents', module: agents },
  { name: 'skills', module: skills },
  { name: 'hooks', module: hooks },
];

function parseArgs(argv) {
  const options = {
    check: false,
    quiet: false,
  };

  for (const arg of argv) {
    if (arg === '--check') options.check = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/sync-codex.cjs [--check] [--quiet]',
    '',
    '  --check   Generate to a temporary tree and fail if plugins/spectre-codex is stale.',
    '  --quiet   Suppress per-file generation logs.',
  ].join('\n');
}

function log(options, message) {
  if (!options.quiet) process.stdout.write(`${message}\n`);
}

function collectFiles(root) {
  const files = new Map();
  if (!fs.existsSync(root)) return files;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(root, fullPath);
        files.set(relPath, fs.readFileSync(fullPath));
      }
    }
  }

  walk(root);
  return files;
}

function compareTrees(expectedRoot, actualRoot) {
  const expected = collectFiles(expectedRoot);
  const actual = collectFiles(actualRoot);
  const allPaths = Array.from(new Set([...expected.keys(), ...actual.keys()])).sort();
  const diffs = [];

  for (const relPath of allPaths) {
    if (!expected.has(relPath)) {
      diffs.push({ path: relPath, status: 'extra' });
      continue;
    }
    if (!actual.has(relPath)) {
      diffs.push({ path: relPath, status: 'missing' });
      continue;
    }
    if (!expected.get(relPath).equals(actual.get(relPath))) {
      diffs.push({ path: relPath, status: 'changed' });
    }
  }

  return diffs;
}

function summarizeVerification(verificationResults) {
  return verificationResults.filter((result) => !result.ok);
}

function printTranslationResults(options, root, translatorName, results) {
  for (const result of results) {
    if (result.status === 'unchanged') continue;

    const relPath = path.isAbsolute(result.path) ? path.relative(root, result.path) : result.path;
    const suffix = result.reason ? ` (${result.reason})` : '';
    log(options, `${translatorName}: ${result.status} ${relPath}${suffix}`);
  }
}

function runSync({
  repoRoot = path.resolve(__dirname, '..'),
  canonicalRoot = path.join(repoRoot, 'plugins', 'spectre'),
  codexRoot = path.join(repoRoot, 'plugins', 'spectre-codex'),
  check = false,
  quiet = false,
} = {}) {
  const options = { check, quiet };
  const outputRoot = check
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-codex-sync-'))
    : codexRoot;
  const translationResults = [];
  const verificationResults = [];

  try {
    for (const translator of translators) {
      const results = translator.module.translate(canonicalRoot, outputRoot);
      translationResults.push({ translator: translator.name, results });
      printTranslationResults(options, repoRoot, translator.name, results);
    }

    for (const translator of translators) {
      const results = translator.module.verify(outputRoot);
      verificationResults.push({ translator: translator.name, results });
    }

    const failures = summarizeVerification(verificationResults.flatMap((entry) => entry.results));
    if (failures.length > 0) {
      return {
        ok: false,
        code: 1,
        translationResults,
        verificationResults,
        errors: failures.map((failure) => `${failure.path}: ${failure.error}`),
      };
    }

    if (check) {
      const diffs = compareTrees(outputRoot, codexRoot);
      if (diffs.length > 0) {
        return {
          ok: false,
          code: 1,
          translationResults,
          verificationResults,
          diffs,
          errors: diffs.map((diff) => `${diff.status}: ${path.join('plugins/spectre-codex', diff.path)}`),
        };
      }
    }

    log(options, check ? 'codex sync check passed' : 'codex sync complete');
    return {
      ok: true,
      code: 0,
      translationResults,
      verificationResults,
    };
  } finally {
    if (check && fs.existsSync(outputRoot)) {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  }
}

function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exit(2);
  }

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const result = runSync(options);
  if (!result.ok) {
    for (const error of result.errors || []) {
      process.stderr.write(`${error}\n`);
    }
    process.exit(result.code || 1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  compareTrees,
  parseArgs,
  runSync,
};

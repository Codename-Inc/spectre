#!/usr/bin/env node
/**
 * verify-spectre orchestrator.
 *
 *   node .claude/skills/verify-spectre/scripts/verify.mjs [--fast|--full|--release] [--gate N]
 *
 *   --fast     gates 1-2   (structure + tests)     ~seconds, run on every change
 *   --full     gates 1-4   (+ codex + real CLI)    default; run before commit
 *   --release  gates 1-5   (+ release readiness)   run before publishing
 *   --gate N   just that gate
 *
 * Exits nonzero if any gate fails, so it works as a CI step or a pre-push hook.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, run } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const GATES = {
  1: { name: 'structure', script: 'gate1_structure.mjs' },
  2: { name: 'tests', script: null },  // npm test, run inline
  3: { name: 'codex', script: 'gate3_codex.mjs' },
  4: { name: 'real-cli', script: 'gate4_cli.mjs' },
  5: { name: 'release', script: 'gate5_release.mjs' },
};

const argv = process.argv.slice(2);
const only = argv.includes('--gate') ? Number(argv[argv.indexOf('--gate') + 1]) : null;

let selected;
if (only) selected = [only];
else if (argv.includes('--fast')) selected = [1, 2];
else if (argv.includes('--release')) selected = [1, 2, 3, 4, 5];
else selected = [1, 2, 3, 4];

const results = [];

for (const id of selected) {
  const gate = GATES[id];
  if (!gate) {
    process.stderr.write(`unknown gate: ${id}\n`);
    process.exit(2);
  }

  process.stdout.write(`\n─── gate ${id}: ${gate.name} ${'─'.repeat(Math.max(0, 46 - gate.name.length))}\n`);

  let code;
  if (id === 2) {
    // Gate 2 is just the suite. Streaming it live matters — a hanging test is
    // far easier to diagnose when you can see which one it stopped on.
    const test = run('npm', ['test'], { cwd: REPO, timeout: 600000 });
    code = test.code;
    const output = test.stdout + test.stderr;
    const pass = output.match(/^# pass (\d+)/m)?.[1];
    const fail = output.match(/^# fail (\d+)/m)?.[1];
    process.stdout.write(`  ${code === 0 ? 'ok   ' : 'FAIL '} npm test — ${pass ?? '?'} passing, ${fail ?? '?'} failing\n`);
    if (code !== 0) {
      const failures = output.split('\n').filter((l) => /^not ok |^\s+error:/.test(l)).slice(0, 10);
      process.stdout.write(failures.map((l) => `        ${l.trim()}\n`).join(''));
    }
    // A silent drop in test count usually means tests were deleted, not fixed.
    if (pass) process.stdout.write(`  note  test count: ${pass} (compare against the last known-good run)\n`);
    process.stdout.write(`GATE ${code === 0 ? 'PASS' : 'FAIL'}  2 tests\n`);
  } else {
    const result = run('node', [path.join(HERE, gate.script)], { cwd: REPO, timeout: 600000 });
    code = result.code;
    process.stdout.write(result.stdout);
    if (result.stderr.trim()) process.stdout.write(result.stderr);
  }

  results.push({ id, name: gate.name, ok: code === 0 });
}

// --- summary ----------------------------------------------------------------
process.stdout.write(`\n${'═'.repeat(58)}\n`);
const failed = results.filter((r) => !r.ok);

for (const r of results) {
  process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'}  gate ${r.id} — ${r.name}\n`);
}

if (failed.length === 0) {
  process.stdout.write(`\n  ✅ verify-spectre: all ${results.length} gates passed\n\n`);
  process.exit(0);
}

process.stdout.write(`\n  ❌ verify-spectre: ${failed.length} of ${results.length} gates failed — ${failed.map((f) => `gate ${f.id} (${f.name})`).join(', ')}\n`);
process.stdout.write('  Scroll up: each failing check names what was expected and what was found.\n\n');
process.exit(1);

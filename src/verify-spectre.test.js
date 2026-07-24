import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const GATE4 = path.resolve('.claude/skills/verify-spectre/scripts/gate4_cli.mjs');
const VERIFY = path.resolve('.claude/skills/verify-spectre/scripts/verify.mjs');

test('verification reports test counts from the current Node test reporter', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-verify-count-'));
  const fakeNpm = path.join(root, 'npm');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(fakeNpm, [
    '#!/usr/bin/env node',
    "process.stdout.write('ℹ tests 195\\nℹ pass 195\\nℹ fail 0\\n');",
    '',
  ].join('\n'));
  fs.chmodSync(fakeNpm, 0o755);

  const result = spawnSync(process.execPath, [VERIFY, '--gate', '2'], {
    cwd: path.resolve('.'),
    env: { ...process.env, PATH: `${root}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /npm test — 195 passing, 0 failing/);
  assert.match(result.stdout, /note  test count: 195/);
});

test('real CLI verification leaves no knowledge artifacts in the user home', { concurrency: false }, (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-verify-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [GATE4], {
    cwd: path.resolve('.'),
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    fs.existsSync(path.join(home, '.spectre')),
    false,
    'gate 4 leaked disposable project stores into the user-level Spectre home',
  );
});

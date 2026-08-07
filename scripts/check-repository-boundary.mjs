#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `${command} exited ${result.status}`).trim();
    throw new Error(detail);
  }

  return result.stdout;
};

const trackedFiles = new Set(
  run('git', ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean),
);

const privateRepositoryPaths = [
  ['brand/', (path) => path.startsWith('brand/')],
  ['site/', (path) => path.startsWith('site/')],
  ['docs/', (path) => path.startsWith('docs/')],
  ['.spectre/', (path) => path.startsWith('.spectre/')],
  ['.claude/', (path) => path.startsWith('.claude/')],
  ['scratchpad/', (path) => path.startsWith('scratchpad/')],
  ['PRODUCT.md', (path) => path === 'PRODUCT.md'],
  ['DESIGN.md', (path) => path === 'DESIGN.md'],
  ['skills-lock.json', (path) => path === 'skills-lock.json'],
  ['.agents/product-marketing.md', (path) => path === '.agents/product-marketing.md'],
  [
    '.agents/skills/product-marketing/',
    (path) => path.startsWith('.agents/skills/product-marketing/'),
  ],
  [
    '.agents/skills/spectre-workflow-analysis/',
    (path) => path.startsWith('.agents/skills/spectre-workflow-analysis/'),
  ],
  [
    '.agents/skills/spectre-workflow-analysis-workspace/',
    (path) => path.startsWith('.agents/skills/spectre-workflow-analysis-workspace/'),
  ],
  [
    '.agents/skills/spectre-rewrite-skill/resources/spectre-light/',
    (path) => path.startsWith('.agents/skills/spectre-rewrite-skill/resources/spectre-light/'),
  ],
];

const trackedPrivateFiles = [...trackedFiles].filter((path) =>
  privateRepositoryPaths.some(([, matches]) => matches(path)),
);

const packOutput = JSON.parse(
  run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts']),
);
const packedFiles = packOutput[0]?.files?.map(({ path }) => path) ?? [];

const packagedTests = packedFiles.filter((path) =>
  /^src\/.*\.test\.js$/.test(path)
  || path.startsWith('plugins/spectre/hooks/scripts/test_'),
);
const untrackedPackedFiles = packedFiles.filter((path) => !trackedFiles.has(path));
const privatePackedFiles = packedFiles.filter((path) =>
  privateRepositoryPaths.some(([, matches]) => matches(path)),
);

const failures = [];
if (trackedPrivateFiles.length > 0) {
  failures.push(`Studio-only files are tracked:\n  ${trackedPrivateFiles.join('\n  ')}`);
}
if (privatePackedFiles.length > 0) {
  failures.push(`Studio-only files are packaged:\n  ${privatePackedFiles.join('\n  ')}`);
}
if (packagedTests.length > 0) {
  failures.push(`Repository tests are packaged:\n  ${packagedTests.join('\n  ')}`);
}
if (untrackedPackedFiles.length > 0) {
  failures.push(`Untracked files would be packaged:\n  ${untrackedPackedFiles.join('\n  ')}`);
}

if (failures.length > 0) {
  console.error(`Repository boundary check failed.\n\n${failures.join('\n\n')}\n`);
  process.exit(1);
}

console.log(
  `Repository boundary OK: ${trackedFiles.size} tracked files; ${packedFiles.length} packaged files.`,
);

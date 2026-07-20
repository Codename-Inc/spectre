#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'migration.mjs');

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-migration-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

async function loadMigrationModule() {
  assert.equal(
    fs.existsSync(MIGRATION_MODULE),
    true,
    'knowledge/migration.mjs must provide conservative legacy migration',
  );
  return import(pathToFileURL(MIGRATION_MODULE).href);
}

function skillRoot(projectDir, nativeRoot) {
  return path.join(projectDir, nativeRoot, 'skills');
}

function registryPath(projectDir, nativeRoot, recallName = 'spectre-recall') {
  return path.join(
    skillRoot(projectDir, nativeRoot),
    recallName,
    'references',
    'registry.toon',
  );
}

function writeRegistry(projectDir, nativeRoot, rows, recallName = 'spectre-recall') {
  const target = registryPath(projectDir, nativeRoot, recallName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    [
      '# SPECTRE Knowledge Registry',
      '# Format: skill-name|category|triggers|description',
      '',
      ...rows,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(path.dirname(path.dirname(target)), 'SKILL.md'),
    `generated ${nativeRoot}/${recallName}\n`,
  );
  return target;
}

function legacySkillContent(options) {
  const optional = options.optional || [];
  const metadata = options.metadata || [];
  const body = options.body ?? '\n# Legacy body\n\nKeep these bytes exactly.\n';
  return [
    '---',
    `name: ${options.name}`,
    `description: ${options.description ?? `Use when applying ${options.name}`}`,
    ...optional,
    'user-invocable: true',
    ...(metadata.length > 0 ? ['metadata:', ...metadata] : []),
    '---',
  ].join('\n') + body;
}

function writeLegacySkill(
  projectDir,
  nativeRoot,
  id,
  content = legacySkillContent({ name: id }),
  resources = {},
) {
  const recordDir = path.join(skillRoot(projectDir, nativeRoot), id);
  fs.mkdirSync(recordDir, { recursive: true });
  fs.writeFileSync(path.join(recordDir, 'SKILL.md'), content);
  for (const [relativePath, bytes] of Object.entries(resources)) {
    const target = path.join(recordDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return recordDir;
}

function canonicalContent({
  id,
  category,
  triggers,
  description = `Use when applying ${id}`,
  metadata = {},
  body = '\n# Legacy body\n\nKeep these bytes exactly.\n',
}) {
  return [
    '---',
    `name: ${JSON.stringify(id)}`,
    `description: ${JSON.stringify(description)}`,
    'metadata:',
    ...Object.entries(metadata)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`),
    `  spectre-category: ${JSON.stringify(category)}`,
    `  spectre-triggers: ${JSON.stringify(JSON.stringify(triggers))}`,
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
  ].join('\n') + body;
}

function snapshotTree(root) {
  const snapshot = {};
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) {
        snapshot[path.relative(root, entryPath)] = fs.readFileSync(entryPath).toString('base64');
      }
    }
  }
  return snapshot;
}

function resultById(report) {
  return new Map(report.entries.map((entry) => [entry.id, entry]));
}

describe('legacy migration discovery and classification', () => {
  it('discovers all allowlisted roots, normalizes eligible metadata, and deduplicates identical sources without mutation', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });

    const optionalContent = legacySkillContent({
      name: 'feature-claude',
      description: 'Use when applying feature-claude TRIGGER when: claude, hooks',
      optional: [
        'license: MIT',
        'compatibility: Requires Node.js 20',
        'allowed-tools: Bash(git:*) Read',
      ],
      metadata: ['  owner: "platform"'],
      body: '\n# Claude body\r\n\r\nPreserve mixed bytes.\r\n',
    });
    writeLegacySkill(projectDir, '.claude', 'feature-claude', optionalContent, {
      'references/details.bin': Buffer.from([0, 1, 2, 255]),
    });
    const duplicateContent = legacySkillContent({
      name: 'patterns-shared',
      metadata: ['  audience: "maintainers"'],
    });
    writeLegacySkill(projectDir, '.claude', 'patterns-shared', duplicateContent, {
      'references/shared.md': 'same resource\n',
    });
    writeLegacySkill(projectDir, '.agents', 'patterns-shared', duplicateContent, {
      'references/shared.md': 'same resource\n',
    });
    writeLegacySkill(projectDir, '.agents', 'testing-codex');
    writeLegacySkill(projectDir, '.claude', 'gotchas-historical');
    writeLegacySkill(projectDir, '.agents', 'procedures-agent-find');
    writeLegacySkill(projectDir, '.claude', 'unrelated-native-skill');

    writeRegistry(projectDir, '.claude', [
      'feature-claude|feature|claude, hooks, CLAUDE|Use when applying Claude hooks',
      'patterns-shared|patterns|shared, duplicate|Use when applying shared patterns',
    ]);
    writeRegistry(projectDir, '.agents', [
      'patterns-shared|patterns|duplicate, codex|Use when applying shared patterns',
      'testing-codex|testing|codex tests|Use when testing Codex',
    ]);
    writeRegistry(projectDir, '.claude', [
      'gotchas-historical|gotchas|old recall|Use when handling historical recall',
    ], 'spectre-find');
    writeRegistry(projectDir, '.agents', [
      'procedures-agent-find|procedures|agent find|Use when handling agent historical recall',
    ], 'spectre-find');

    const before = snapshotTree(projectDir);
    const { classifyLegacyKnowledge } = await loadMigrationModule();
    const report = classifyLegacyKnowledge({ projectDir, storePath });
    const entries = resultById(report);

    assert.equal(report.schemaVersion, 1);
    assert.equal(entries.get('feature-claude').code, 'MIGRATED');
    assert.equal(entries.get('testing-codex').code, 'MIGRATED');
    assert.equal(entries.get('gotchas-historical').code, 'MIGRATED');
    assert.equal(entries.get('procedures-agent-find').code, 'MIGRATED');
    assert.equal(entries.get('patterns-shared').code, 'DEDUPLICATED');
    assert.deepEqual(
      entries.get('patterns-shared').canonical.triggers,
      ['shared', 'duplicate', 'codex'],
    );
    assert.equal(entries.get('feature-claude').canonical.description, 'Use when applying feature-claude');
    assert.equal(entries.get('feature-claude').canonical.license, 'MIT');
    assert.equal(entries.get('feature-claude').canonical.compatibility, 'Requires Node.js 20');
    assert.equal(entries.get('feature-claude').canonical.allowedTools, 'Bash(git:*) Read');
    assert.equal(entries.get('feature-claude').canonical.metadata.owner, 'platform');
    assert.equal(entries.get('patterns-shared').canonical.metadata.audience, 'maintainers');
    assert.deepEqual(snapshotTree(projectDir), before);
    assert.equal(fs.existsSync(path.join(storePath, 'migration-report.json')), false);
  });

  it('reports every unresolved or existing-target classification and preserves all source bytes', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(storePath, 'knowledge'), { recursive: true });

    writeLegacySkill(
      projectDir,
      '.claude',
      'feature-divergent',
      legacySkillContent({ name: 'feature-divergent', body: '\nClaude bytes\n' }),
    );
    writeLegacySkill(
      projectDir,
      '.agents',
      'feature-divergent',
      legacySkillContent({ name: 'feature-divergent', body: '\nCodex bytes\n' }),
    );
    writeLegacySkill(
      projectDir,
      '.claude',
      'feature-oversized',
      legacySkillContent({ name: 'feature-oversized', body: `\n${'x'.repeat(9_100)}` }),
    );
    writeLegacySkill(
      projectDir,
      '.agents',
      'feature-malformed',
      'not frontmatter\n',
    );
    writeLegacySkill(
      projectDir,
      '.agents',
      'feature-non-string',
      legacySkillContent({
        name: 'feature-non-string',
        metadata: ['  attempts: 3'],
      }),
    );
    writeLegacySkill(projectDir, '.agents', 'feature-conflict');
    writeLegacySkill(projectDir, '.agents', 'feature-already');
    writeRegistry(projectDir, '.claude', [
      'feature-divergent|feature|divergent|Use when sources diverge',
      'feature-oversized|feature|oversized|Use when oversized',
      'feature-missing|feature|missing|Use when source is missing',
    ]);
    writeRegistry(projectDir, '.agents', [
      'feature-divergent|feature|divergent|Use when sources diverge',
      'feature-malformed|feature|malformed|Use when malformed',
      'feature-non-string|feature|metadata|Use when metadata is invalid',
      'feature-conflict|feature|conflict|Use when targets conflict',
      'feature-already|feature|already|Use when already migrated',
    ]);

    const conflictDir = path.join(storePath, 'knowledge', 'feature-conflict');
    fs.mkdirSync(conflictDir, { recursive: true });
    fs.writeFileSync(
      path.join(conflictDir, 'SKILL.md'),
      canonicalContent({
        id: 'feature-conflict',
        category: 'feature',
        triggers: ['other'],
        body: '\nDifferent canonical bytes\n',
      }),
    );
    const alreadyDir = path.join(storePath, 'knowledge', 'feature-already');
    fs.mkdirSync(alreadyDir, { recursive: true });
    fs.writeFileSync(
      path.join(alreadyDir, 'SKILL.md'),
      canonicalContent({
        id: 'feature-already',
        category: 'feature',
        triggers: ['already'],
      }),
    );
    const missingDir = path.join(storePath, 'knowledge', 'feature-missing');
    fs.mkdirSync(missingDir, { recursive: true });
    fs.writeFileSync(
      path.join(missingDir, 'SKILL.md'),
      canonicalContent({
        id: 'feature-missing',
        category: 'feature',
        triggers: ['different'],
      }),
    );

    const before = snapshotTree(projectDir);
    const { classifyLegacyKnowledge } = await loadMigrationModule();
    const report = classifyLegacyKnowledge({ projectDir, storePath });
    const entries = resultById(report);

    assert.deepEqual(
      [...entries.values()].map(({ code }) => code).sort(),
      [
        'ALREADY_MIGRATED',
        'CONFLICT',
        'DIVERGENT',
        'MALFORMED',
        'MALFORMED',
        'OVERSIZED',
        'SOURCE_MISSING',
      ].sort(),
    );
    assert.equal(entries.get('feature-oversized').grandfatheredClaudeNativeDiscovery, true);
    assert.equal(report.grandfatheredClaudeNativeDiscoveryIncomplete, true);
    assert.match(entries.get('feature-conflict').destinationPath, /feature-conflict$/);
    assert.equal(entries.get('feature-already').code, 'ALREADY_MIGRATED');
    assert.equal(entries.get('feature-missing').code, 'SOURCE_MISSING');
    assert.deepEqual(snapshotTree(projectDir), before);
  });
});

describe('legacy migration staged commit and cleanup', () => {
  it('commits compliant records and index before exact cleanup, then reruns byte-stably', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    const body = '\n# Exact body\r\n\r\nDo not normalize these bytes.\r\n';
    const resourceBytes = Buffer.from([0, 10, 13, 255, 42]);
    writeLegacySkill(
      projectDir,
      '.claude',
      'feature-lossless',
      legacySkillContent({
        name: 'feature-lossless',
        optional: ['license: MIT', 'compatibility: Node 20'],
        metadata: ['  owner: "platform"'],
        body,
      }),
      { 'references/raw.bin': resourceBytes },
    );
    const duplicate = legacySkillContent({ name: 'patterns-duplicate' });
    writeLegacySkill(projectDir, '.claude', 'patterns-duplicate', duplicate);
    writeLegacySkill(projectDir, '.agents', 'patterns-duplicate', duplicate);
    writeRegistry(projectDir, '.claude', [
      'feature-lossless|feature|lossless|Use when preserving bytes',
      'patterns-duplicate|patterns|duplicate|Use when deduplicating',
    ]);
    writeRegistry(projectDir, '.agents', [
      'patterns-duplicate|patterns|duplicate|Use when deduplicating',
    ]);

    const { migrateLegacyKnowledge } = await loadMigrationModule();
    assert.equal(
      typeof migrateLegacyKnowledge,
      'function',
      'migration must commit classified records and clean resolved sources',
    );
    const first = await migrateLegacyKnowledge({ projectDir, storePath });
    const reportPath = path.join(storePath, 'migration-report.json');
    const indexPath = path.join(storePath, 'index.json');
    const canonicalPath = path.join(
      storePath,
      'knowledge',
      'feature-lossless',
      'SKILL.md',
    );
    const canonicalBytes = fs.readFileSync(canonicalPath);
    const indexBytes = fs.readFileSync(indexPath);
    const reportBytes = fs.readFileSync(reportPath);

    assert.deepEqual(
      first.entries.map(({ code }) => code).sort(),
      ['DEDUPLICATED', 'MIGRATED'],
    );
    assert.equal(canonicalBytes.toString('utf8').endsWith(body), true);
    assert.match(canonicalBytes.toString('utf8'), /spectre-category: "feature"/);
    assert.match(canonicalBytes.toString('utf8'), /spectre-status: "active"/);
    assert.doesNotMatch(canonicalBytes.toString('utf8'), /user-invocable/);
    assert.deepEqual(
      fs.readFileSync(
        path.join(storePath, 'knowledge', 'feature-lossless', 'references', 'raw.bin'),
      ),
      resourceBytes,
    );
    assert.deepEqual(
      JSON.parse(indexBytes).records.map(({ id }) => id),
      ['feature-lossless', 'patterns-duplicate'],
    );
    assert.equal(fs.existsSync(path.join(projectDir, '.claude', 'skills', 'feature-lossless')), false);
    assert.equal(fs.existsSync(path.join(projectDir, '.agents', 'skills', 'patterns-duplicate')), false);
    assert.equal(fs.existsSync(path.join(projectDir, '.claude', 'skills', 'spectre-recall')), false);
    assert.equal(fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-recall')), false);

    const second = await migrateLegacyKnowledge({ projectDir, storePath });
    assert.deepEqual(second, first);
    assert.deepEqual(fs.readFileSync(canonicalPath), canonicalBytes);
    assert.deepEqual(fs.readFileSync(indexPath), indexBytes);
    assert.deepEqual(fs.readFileSync(reportPath), reportBytes);
  });

  it('migrates eligible rows while preserving unresolved rows, sources, and generated recall', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    writeLegacySkill(projectDir, '.claude', 'feature-eligible');
    writeLegacySkill(projectDir, '.claude', 'feature-unresolved', 'malformed source\n');
    writeLegacySkill(projectDir, '.claude', 'unrelated-workflow');
    const registry = writeRegistry(projectDir, '.claude', [
      'feature-eligible|feature|eligible|Use when eligible',
      'feature-unresolved|feature|unresolved|Use when unresolved',
    ]);
    const unresolvedPath = path.join(
      projectDir,
      '.claude',
      'skills',
      'feature-unresolved',
      'SKILL.md',
    );
    const unrelatedPath = path.join(
      projectDir,
      '.claude',
      'skills',
      'unrelated-workflow',
      'SKILL.md',
    );
    const unresolvedBytes = fs.readFileSync(unresolvedPath);
    const unrelatedBytes = fs.readFileSync(unrelatedPath);

    const { migrateLegacyKnowledge } = await loadMigrationModule();
    assert.equal(
      typeof migrateLegacyKnowledge,
      'function',
      'migration must preserve unresolved rows while committing eligible rows',
    );
    const report = await migrateLegacyKnowledge({ projectDir, storePath });
    const entries = resultById(report);

    assert.equal(entries.get('feature-eligible').code, 'MIGRATED');
    assert.equal(entries.get('feature-unresolved').code, 'MALFORMED');
    assert.equal(
      fs.existsSync(path.join(storePath, 'knowledge', 'feature-eligible', 'SKILL.md')),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(projectDir, '.claude', 'skills', 'feature-eligible')),
      false,
    );
    assert.deepEqual(fs.readFileSync(unresolvedPath), unresolvedBytes);
    assert.deepEqual(fs.readFileSync(unrelatedPath), unrelatedBytes);
    assert.match(fs.readFileSync(registry, 'utf8'), /feature-unresolved\|/);
    assert.doesNotMatch(fs.readFileSync(registry, 'utf8'), /feature-eligible\|/);
    assert.equal(
      fs.existsSync(path.join(projectDir, '.claude', 'skills', 'spectre-recall', 'SKILL.md')),
      true,
    );
  });

  it('does not rewrite an unresolved-only registry or its malformed source', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    const sourceDir = writeLegacySkill(
      projectDir,
      '.claude',
      'feature-only-unresolved',
      'malformed source\r\n',
    );
    const registry = writeRegistry(projectDir, '.claude', [
      'feature-only-unresolved|feature|unresolved|Use when unresolved',
    ]);
    const registryBytes = Buffer.from(
      '# SPECTRE Knowledge Registry\r\n\r\n' +
        'feature-only-unresolved|feature|unresolved|Use when unresolved\r\n',
    );
    fs.writeFileSync(registry, registryBytes);
    const sourceBytes = fs.readFileSync(path.join(sourceDir, 'SKILL.md'));
    const { migrateLegacyKnowledge } = await loadMigrationModule();

    const report = await migrateLegacyKnowledge({ projectDir, storePath });

    assert.equal(report.entries[0].code, 'MALFORMED');
    assert.deepEqual(fs.readFileSync(registry), registryBytes);
    assert.deepEqual(fs.readFileSync(path.join(sourceDir, 'SKILL.md')), sourceBytes);
  });

  it('preserves non-roundtrippable UTF-8 source bytes as malformed', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    const sourceDir = writeLegacySkill(
      projectDir,
      '.claude',
      'feature-invalid-utf8',
    );
    const sourcePath = path.join(sourceDir, 'SKILL.md');
    const sourceBytes = Buffer.concat([
      Buffer.from(legacySkillContent({ name: 'feature-invalid-utf8' })),
      Buffer.from([0xff]),
    ]);
    fs.writeFileSync(sourcePath, sourceBytes);
    const registry = writeRegistry(projectDir, '.claude', [
      'feature-invalid-utf8|feature|invalid bytes|Use when preserving invalid bytes',
    ]);
    const registryBytes = fs.readFileSync(registry);
    const { migrateLegacyKnowledge } = await loadMigrationModule();

    const report = await migrateLegacyKnowledge({ projectDir, storePath });

    assert.equal(report.entries[0].code, 'MALFORMED');
    assert.deepEqual(fs.readFileSync(sourcePath), sourceBytes);
    assert.deepEqual(fs.readFileSync(registry), registryBytes);
    assert.equal(
      fs.existsSync(path.join(projectDir, '.claude', 'skills', 'spectre-recall')),
      true,
    );
  });

  it('preserves malformed registry rows and generated recall beside migrated rows', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    writeLegacySkill(projectDir, '.agents', 'feature-mixed-registry');
    const malformedRow = '|feature|missing identifier and description';
    const registry = writeRegistry(projectDir, '.agents', [
      'feature-mixed-registry|feature|mixed registry|Use when migrating valid rows',
      malformedRow,
    ]);
    const { migrateLegacyKnowledge } = await loadMigrationModule();

    const report = await migrateLegacyKnowledge({ projectDir, storePath });

    assert.equal(
      report.entries.some(({ code }) => code === 'MIGRATED'),
      true,
    );
    assert.equal(
      report.entries.some(({ code }) => code === 'MALFORMED'),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(storePath, 'knowledge', 'feature-mixed-registry')),
      true,
    );
    assert.doesNotMatch(fs.readFileSync(registry, 'utf8'), /feature-mixed-registry\|/);
    assert.match(fs.readFileSync(registry, 'utf8'), /\|feature\|missing identifier and description/);
    assert.equal(
      fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-recall')),
      true,
    );
  });

  it('resolves a readable store only when legacy candidates exist', async (t) => {
    const root = makeTmp(t);
    const projectDir = path.join(root, 'workspace', 'project');
    const emptyProjectDir = path.join(root, 'workspace', 'empty-project');
    const spectreHome = path.join(root, 'spectre-home');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(emptyProjectDir, { recursive: true });
    writeLegacySkill(projectDir, '.agents', 'feature-resolved-store');
    writeRegistry(projectDir, '.agents', [
      'feature-resolved-store|feature|resolved store|Use when resolving stores',
    ]);
    const { migrateLegacyKnowledge } = await loadMigrationModule();
    const noGit = () => {
      throw new Error('Git intentionally unavailable');
    };

    let report;
    let migrationError;
    try {
      report = await migrateLegacyKnowledge({
        projectDir,
        spectreHome,
        gitRunner: noGit,
      });
    } catch (error) {
      migrationError = error;
    }
    assert.equal(migrationError, undefined, 'migration must resolve its canonical store');
    assert.equal(report.entries[0].code, 'MIGRATED');
    assert.equal(
      fs.existsSync(
        path.join(
          spectreHome,
          'projects',
          'workspace',
          'project',
          'knowledge',
          'feature-resolved-store',
          'SKILL.md',
        ),
      ),
      true,
    );

    const beforeEmpty = snapshotTree(spectreHome);
    const empty = await migrateLegacyKnowledge({
      projectDir: emptyProjectDir,
      spectreHome,
      gitRunner: noGit,
    });
    assert.deepEqual(empty.entries, []);
    assert.deepEqual(snapshotTree(spectreHome), beforeEmpty);
  });
});

describe('legacy migration recovery and contention', () => {
  it('resumes exact cleanup after a crash following canonical commit', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    writeLegacySkill(projectDir, '.agents', 'feature-crash-resume');
    const registry = writeRegistry(projectDir, '.agents', [
      'feature-crash-resume|feature|crash resume|Use when resuming migration',
    ]);
    const sourcePath = path.join(
      projectDir,
      '.agents',
      'skills',
      'feature-crash-resume',
    );
    const canonicalPath = path.join(
      storePath,
      'knowledge',
      'feature-crash-resume',
      'SKILL.md',
    );
    const { migrateLegacyKnowledge } = await loadMigrationModule();

    await assert.rejects(
      migrateLegacyKnowledge({
        projectDir,
        storePath,
        afterCanonicalCommit() {
          throw new Error('injected-after-canonical-commit');
        },
      }),
      /injected-after-canonical-commit/,
    );
    assert.equal(fs.existsSync(canonicalPath), true);
    assert.equal(fs.existsSync(path.join(storePath, 'index.json')), true);
    assert.equal(fs.existsSync(sourcePath), true);
    assert.match(fs.readFileSync(registry, 'utf8'), /feature-crash-resume\|/);
    assert.equal(fs.existsSync(path.join(storePath, 'migration-report.json')), false);
    const canonicalBytes = fs.readFileSync(canonicalPath);
    const indexBytes = fs.readFileSync(path.join(storePath, 'index.json'));

    const resumed = await migrateLegacyKnowledge({ projectDir, storePath });
    assert.equal(resumed.entries[0].code, 'ALREADY_MIGRATED');
    assert.equal(fs.existsSync(sourcePath), false);
    assert.equal(
      fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-recall')),
      false,
    );
    assert.deepEqual(fs.readFileSync(canonicalPath), canonicalBytes);
    assert.deepEqual(fs.readFileSync(path.join(storePath, 'index.json')), indexBytes);
  });

  it('resumes cleanup when the committed source was removed before registry cleanup', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    writeLegacySkill(projectDir, '.agents', 'feature-cleanup-resume');
    const registry = writeRegistry(projectDir, '.agents', [
      'feature-cleanup-resume|feature|cleanup resume|Use when resuming cleanup',
    ]);
    const sourcePath = path.join(
      projectDir,
      '.agents',
      'skills',
      'feature-cleanup-resume',
    );
    const unrelatedPath = path.join(
      projectDir,
      '.agents',
      'skills',
      'unrelated-workflow',
      'SKILL.md',
    );
    const unrelatedBytes = Buffer.from([0, 10, 13, 255, 42]);
    fs.mkdirSync(path.dirname(unrelatedPath), { recursive: true });
    fs.writeFileSync(unrelatedPath, unrelatedBytes);
    const canonicalPath = path.join(
      storePath,
      'knowledge',
      'feature-cleanup-resume',
      'SKILL.md',
    );
    const reportPath = path.join(storePath, 'migration-report.json');
    const indexPath = path.join(storePath, 'index.json');
    const { migrateLegacyKnowledge } = await loadMigrationModule();

    await assert.rejects(
      migrateLegacyKnowledge({
        projectDir,
        storePath,
        afterCanonicalCommit() {
          throw new Error('injected-before-cleanup');
        },
      }),
      /injected-before-cleanup/,
    );
    fs.rmSync(sourcePath, { recursive: true, force: true });
    const canonicalBytes = fs.readFileSync(canonicalPath);
    const indexBytes = fs.readFileSync(indexPath);
    assert.match(fs.readFileSync(registry, 'utf8'), /feature-cleanup-resume\|/);

    const resumed = await migrateLegacyKnowledge({ projectDir, storePath });
    assert.equal(resumed.entries[0].code, 'ALREADY_MIGRATED');
    assert.equal(fs.existsSync(sourcePath), false);
    assert.equal(
      fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-recall')),
      false,
    );
    assert.deepEqual(fs.readFileSync(unrelatedPath), unrelatedBytes);
    assert.deepEqual(fs.readFileSync(canonicalPath), canonicalBytes);
    assert.deepEqual(fs.readFileSync(indexPath), indexBytes);
    const reportBytes = fs.readFileSync(reportPath);

    const stable = await migrateLegacyKnowledge({ projectDir, storePath });
    assert.deepEqual(stable, resumed);
    assert.deepEqual(fs.readFileSync(reportPath), reportBytes);
    assert.deepEqual(fs.readFileSync(unrelatedPath), unrelatedBytes);
  });

  it('resumes deduplicated cleanup after one identical source was removed', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    const id = 'patterns-deduplicated-resume';
    const sharedContent = legacySkillContent({
      name: id,
      body: '\n# Shared source\n\nIdentical canonical body.\n',
    });
    const claudeSource = writeLegacySkill(
      projectDir,
      '.claude',
      id,
      sharedContent,
      { 'references/shared.md': 'identical resource\n' },
    );
    const agentsSource = writeLegacySkill(
      projectDir,
      '.agents',
      id,
      sharedContent,
      { 'references/shared.md': 'identical resource\n' },
    );
    const claudeRegistry = writeRegistry(projectDir, '.claude', [
      `${id}|patterns|shared cleanup|Use when resuming shared cleanup`,
    ]);
    const agentsRegistry = writeRegistry(projectDir, '.agents', [
      `${id}|patterns|deduplicated cleanup|Use when resuming deduplicated cleanup`,
    ]);
    const canonicalPath = path.join(storePath, 'knowledge', id, 'SKILL.md');
    const indexPath = path.join(storePath, 'index.json');
    const reportPath = path.join(storePath, 'migration-report.json');
    const { migrateLegacyKnowledge } = await loadMigrationModule();

    await assert.rejects(
      migrateLegacyKnowledge({
        projectDir,
        storePath,
        afterCanonicalCommit() {
          throw new Error('injected-before-deduplicated-cleanup');
        },
      }),
      /injected-before-deduplicated-cleanup/,
    );
    fs.rmSync(claudeSource, { recursive: true, force: true });
    const canonicalBytes = fs.readFileSync(canonicalPath);
    const indexBytes = fs.readFileSync(indexPath);
    assert.match(canonicalBytes.toString('utf8'), /shared cleanup/);
    assert.match(canonicalBytes.toString('utf8'), /deduplicated cleanup/);
    assert.match(fs.readFileSync(claudeRegistry, 'utf8'), new RegExp(`${id}\\|`));
    assert.match(fs.readFileSync(agentsRegistry, 'utf8'), new RegExp(`${id}\\|`));

    const resumed = await migrateLegacyKnowledge({ projectDir, storePath });
    assert.equal(resumed.entries[0].code, 'ALREADY_MIGRATED');
    assert.equal(fs.existsSync(claudeSource), false);
    assert.equal(fs.existsSync(agentsSource), false);
    assert.equal(
      fs.existsSync(path.join(projectDir, '.claude', 'skills', 'spectre-recall')),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-recall')),
      false,
    );
    assert.deepEqual(fs.readFileSync(canonicalPath), canonicalBytes);
    assert.deepEqual(fs.readFileSync(indexPath), indexBytes);
    const reportBytes = fs.readFileSync(reportPath);

    const stable = await migrateLegacyKnowledge({ projectDir, storePath });
    assert.deepEqual(stable, resumed);
    assert.deepEqual(fs.readFileSync(reportPath), reportBytes);
  });

  it('keeps a mismatched partial-source destination unresolved', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(storePath, 'knowledge'), { recursive: true });
    const id = 'patterns-partial-mismatch';
    writeLegacySkill(
      projectDir,
      '.agents',
      id,
      legacySkillContent({
        name: id,
        body: '\n# Remaining source\n\nExpected body.\n',
      }),
    );
    writeRegistry(projectDir, '.claude', [
      `${id}|patterns|first contribution|Use when matching the first source`,
    ]);
    writeRegistry(projectDir, '.agents', [
      `${id}|patterns|second contribution|Use when matching the second source`,
    ]);
    const destinationPath = path.join(storePath, 'knowledge', id);
    fs.mkdirSync(destinationPath, { recursive: true });
    fs.writeFileSync(
      path.join(destinationPath, 'SKILL.md'),
      canonicalContent({
        id,
        category: 'patterns',
        triggers: ['first contribution', 'second contribution'],
        body: '\n# Different destination\n\nDo not resolve this conflict.\n',
      }),
    );
    const before = snapshotTree(projectDir);
    const { classifyLegacyKnowledge } = await loadMigrationModule();

    const report = classifyLegacyKnowledge({ projectDir, storePath });

    assert.equal(report.entries[0].code, 'SOURCE_MISSING');
    assert.deepEqual(snapshotTree(projectDir), before);
  });

  it('fails open on a SessionStart lock timeout without writes, then explicit migration completes', async (t) => {
    const projectDir = path.join(makeTmp(t), 'project');
    const storePath = path.join(makeTmp(t), 'store');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(storePath, { recursive: true });
    writeLegacySkill(projectDir, '.claude', 'feature-lock-timeout');
    writeRegistry(projectDir, '.claude', [
      'feature-lock-timeout|feature|lock timeout|Use when migration lock is held',
    ]);
    const sourcePath = path.join(
      projectDir,
      '.claude',
      'skills',
      'feature-lock-timeout',
      'SKILL.md',
    );
    const sourceBytes = fs.readFileSync(sourcePath);
    const lockPath = path.join(storePath, '.spectre.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        timestamp: new Date().toISOString(),
        operation: 'other-writer',
      }),
    );
    const { migrateLegacyKnowledge } = await loadMigrationModule();

    let skipped;
    let timeoutError;
    try {
      skipped = await migrateLegacyKnowledge({
        projectDir,
        storePath,
        failOpenOnLockTimeout: true,
        lockOptions: { timeoutMs: 20, retryDelayMs: 5 },
      });
    } catch (error) {
      timeoutError = error;
    }
    assert.equal(timeoutError, undefined, 'SessionStart lock contention must fail open');
    assert.equal(skipped.skipped, 'LOCK_TIMEOUT');
    assert.deepEqual(fs.readFileSync(sourcePath), sourceBytes);
    assert.equal(fs.existsSync(path.join(storePath, 'knowledge')), false);
    assert.equal(fs.existsSync(path.join(storePath, 'index.json')), false);
    assert.equal(fs.existsSync(path.join(storePath, 'migration-report.json')), false);

    fs.rmSync(lockPath);
    const completed = await migrateLegacyKnowledge({
      projectDir,
      storePath,
      lockOptions: { timeoutMs: 100, retryDelayMs: 5 },
    });
    assert.equal(completed.entries[0].code, 'MIGRATED');
    assert.equal(
      fs.existsSync(
        path.join(storePath, 'knowledge', 'feature-lock-timeout', 'SKILL.md'),
      ),
      true,
    );
  });
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

import { syncProjectSkillsConfigured } from './lib/config.js';
import { refreshKnowledgeIndex } from '../plugins/spectre/hooks/scripts/knowledge/records.mjs';
import { resolveProjectStore } from '../plugins/spectre/hooks/scripts/knowledge/store.mjs';

const CLI_PATH = path.resolve('bin/spectre.js');

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-install-'));
  const projectDir = path.join(root, 'project');
  const codexHome = path.join(projectDir, '.codex');
  const skillsRoot = path.join(projectDir, '.agents', 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { projectDir, codexHome, skillsRoot };
}

function writeSkill(skillsRoot, id, content = `${id}\n`) {
  const skillPath = path.join(skillsRoot, id, 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, content);
  return skillPath;
}

function configEntry(skillPath, extra = '') {
  return [
    '[[skills.config]]',
    `path = ${JSON.stringify(skillPath)}`,
    'enabled = true',
    extra,
  ].filter(Boolean).join('\n');
}

function legacySkill(id, body = '# Legacy knowledge\n\nPreserve this body.\n') {
  return [
    '---',
    `name: ${id}`,
    `description: Use when applying ${id}`,
    'user-invocable: true',
    '---',
    body,
  ].join('\n');
}

function canonicalSkill(id, trigger = id) {
  return [
    '---',
    `name: ${JSON.stringify(id)}`,
    `description: ${JSON.stringify(`Use when applying ${id}`)}`,
    'metadata:',
    '  spectre-category: "feature"',
    `  spectre-triggers: ${JSON.stringify(JSON.stringify([trigger]))}`,
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
    `# ${id}`,
    '',
    'Canonical user data.',
    '',
  ].join('\n');
}

function seedLegacy(projectDir, id, body) {
  const skillPath = path.join(projectDir, '.agents', 'skills', id, 'SKILL.md');
  const registryPath = path.join(
    projectDir,
    '.agents',
    'skills',
    'spectre-recall',
    'references',
    'registry.toon',
  );
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, legacySkill(id, body));
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const existing = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : '';
  fs.writeFileSync(
    registryPath,
    `${existing}${id}|feature|${id}|Use when applying ${id}\n`,
  );
  fs.writeFileSync(path.join(path.dirname(path.dirname(registryPath)), 'SKILL.md'), 'generated recall\n');
  return skillPath;
}

function runCli(args, env) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: path.resolve('.'),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function findStore(spectreHome) {
  const projectsDir = path.join(spectreHome, 'projects');
  if (!fs.existsSync(projectsDir)) return null;
  const pending = [projectsDir];
  while (pending.length > 0) {
    const current = pending.pop();
    if (fs.existsSync(path.join(current, 'project.json'))) return current;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) pending.push(path.join(current, entry.name));
    }
  }
  return null;
}

test('project skill sync removes only migration-owned and retired recall entries', { concurrency: false }, (t) => {
  const { projectDir, codexHome, skillsRoot } = makeFixture(t);
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  t.after(() => {
    if (previousCodexHome == null) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
  });

  const migratedPath = writeSkill(skillsRoot, 'feature-migrated');
  const unresolvedPath = writeSkill(skillsRoot, 'feature-unresolved');
  const workflowPath = writeSkill(skillsRoot, 'spectre-scope');
  const unrelatedPath = writeSkill(skillsRoot, 'team-owned');
  const recallPath = writeSkill(skillsRoot, 'spectre-recall');
  const outsidePath = path.join(projectDir, 'custom', 'SKILL.md');
  fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
  fs.writeFileSync(outsidePath, 'custom\n');

  const preservedBlocks = [
    configEntry(unresolvedPath, '# unresolved migration debt'),
    configEntry(workflowPath, 'nickname = "scope-workflow"'),
    configEntry(unrelatedPath, 'custom_key = "keep-byte-exact"'),
    configEntry(outsidePath, '# outside project native root'),
  ];
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    [
      '# spectre-codex-managed',
      '',
      configEntry(migratedPath),
      '',
      configEntry(recallPath),
      '',
      ...preservedBlocks.flatMap((block) => [block, '']),
    ].join('\n'),
  );
  fs.rmSync(path.dirname(migratedPath), { recursive: true, force: true });

  syncProjectSkillsConfigured(projectDir, {
    entries: [
      {
        id: 'feature-migrated',
        code: 'MIGRATED',
        sourcePaths: [path.dirname(migratedPath)],
      },
      {
        id: 'feature-unresolved',
        code: 'OVERSIZED',
        sourcePaths: [path.dirname(unresolvedPath)],
      },
    ],
  });

  const updated = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  assert.doesNotMatch(updated, /feature-migrated/);
  assert.doesNotMatch(updated, /spectre-recall/);
  for (const block of preservedBlocks) {
    assert.equal(updated.includes(block), true, `must preserve block:\n${block}`);
  }
});

test('project skill sync preserves a current skill recreated at a historical migrated path', { concurrency: false }, (t) => {
  const { projectDir, codexHome, skillsRoot } = makeFixture(t);
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  t.after(() => {
    if (previousCodexHome == null) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
  });

  const recreatedPath = writeSkill(
    skillsRoot,
    'feature-recreated',
    'current user-owned skill bytes\n',
  );
  const recreatedBlock = configEntry(
    recreatedPath,
    'custom_key = "preserve-current-skill"',
  );
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    `${recreatedBlock}\n`,
  );

  syncProjectSkillsConfigured(projectDir, {
    entries: [{
      id: 'feature-recreated',
      code: 'MIGRATED',
      sourcePaths: [path.dirname(recreatedPath)],
    }],
  });

  const updated = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  assert.equal(updated.includes(recreatedBlock), true);
  assert.equal(fs.readFileSync(recreatedPath, 'utf8'), 'current user-owned skill bytes\n');
});

test('npm knowledge module is a thin adapter to canonical runtime commands', async () => {
  const source = fs.readFileSync(new URL('./lib/knowledge.js', import.meta.url), 'utf8');
  const adapters = await import('./lib/knowledge.js');

  for (const exportName of [
    'searchCanonicalKnowledge',
    'formatCanonicalKnowledgeSearch',
    'previewCanonicalKnowledgeRegistry',
    'registerCanonicalKnowledge',
    'serializeCanonicalKnowledgeError',
    'migrateCanonicalKnowledge',
    'initializeProjectKnowledge',
  ]) {
    assert.equal(typeof adapters[exportName], 'function', `${exportName} adapter missing`);
  }
  for (const retiredAuthority of [
    /\{\{REGISTRY\}\}/,
    /spectre-apply/,
    /recall-template/,
    /generateRecall/i,
    /updateKnowledgeRegistry/i,
    /matchKnowledge/,
    /parseKnowledgeRecord/,
  ]) {
    assert.doesNotMatch(source, retiredAuthority);
  }
});

test('knowledge migrate handles Git and non-Git projects with stable indexes', async (t) => {
  for (const git of [true, false]) {
    const { projectDir } = makeFixture(t);
    const spectreHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-install-home-'));
    t.after(() => fs.rmSync(spectreHome, { recursive: true, force: true }));
    if (git) {
      execFileSync('git', ['init', '-b', 'main'], { cwd: projectDir, stdio: 'ignore' });
    }
    seedLegacy(projectDir, `feature-${git ? 'git' : 'plain'}`);

    const env = { SPECTRE_HOME: spectreHome };
    const migrated = runCli([
      'knowledge',
      'migrate',
      '--project-dir',
      projectDir,
      '--json',
    ], env);
    assert.equal(migrated.status, 0, migrated.stderr);

    const storePath = findStore(spectreHome);
    assert.ok(storePath);
    const before = fs.readFileSync(path.join(storePath, 'index.json'), 'utf8');
    const rerun = runCli([
      'knowledge',
      'migrate',
      '--project-dir',
      projectDir,
      '--json',
    ], env);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.equal(fs.readFileSync(path.join(storePath, 'index.json'), 'utf8'), before);
    assert.equal(fs.existsSync(path.join(projectDir, 'AGENTS.override.md')), false);
  }
});

test('native plugin hard cut preserves unresolved, user-owned, and canonical knowledge state', async (t) => {
  const { projectDir, codexHome, skillsRoot } = makeFixture(t);
  const spectreHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-preserve-home-'));
  t.after(() => {
    for (const target of [spectreHome]) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  const unresolvedPath = seedLegacy(
    projectDir,
    'feature-oversized',
    `# Oversized\n\n${'x'.repeat(9_100)}\n`,
  );
  const unresolvedBytes = fs.readFileSync(unresolvedPath);
  const unrelatedPath = writeSkill(skillsRoot, 'team-owned', 'user-owned skill bytes\n');
  const unrelatedSkillBytes = fs.readFileSync(unrelatedPath);
  fs.mkdirSync(codexHome, { recursive: true });
  const unrelatedConfig = [
    '[user.settings]',
    'keep = "exact"',
    '',
    configEntry(unresolvedPath, '# unresolved migration debt'),
    '',
    configEntry(unrelatedPath, 'custom_key = "preserve"'),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(codexHome, 'config.toml'), unrelatedConfig);
  const unrelatedHooks = {
    custom: 'preserve',
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo user-hook' }] }],
    },
  };
  fs.writeFileSync(path.join(codexHome, 'hooks.json'), `${JSON.stringify(unrelatedHooks, null, 2)}\n`);
  fs.writeFileSync(
    path.join(projectDir, 'AGENTS.override.md'),
    [
      'User-owned override bytes.',
      '',
      '<!-- spectre-knowledge:start -->',
      'retired generated content',
      '<!-- spectre-knowledge:end -->',
      '',
    ].join('\n'),
  );

  const resolved = await resolveProjectStore(projectDir, { spectreHome });
  const canonicalPath = path.join(resolved.storePath, 'knowledge', 'feature-existing', 'SKILL.md');
  fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
  fs.writeFileSync(canonicalPath, canonicalSkill('feature-existing'));
  refreshKnowledgeIndex(resolved.storePath);
  const canonicalBytes = fs.readFileSync(canonicalPath);

  const installAttempt = runCli([
    'install',
    'codex',
    '--scope',
    'project',
    '--project-dir',
    projectDir,
    '--json',
  ], { SPECTRE_HOME: spectreHome });
  assert.notEqual(installAttempt.status, 0);
  assert.equal(JSON.parse(installAttempt.stdout).code, 'CODEX_PLUGIN_REQUIRED');
  assert.deepEqual(fs.readFileSync(unresolvedPath), unresolvedBytes);
  assert.deepEqual(fs.readFileSync(unrelatedPath), unrelatedSkillBytes);
  assert.deepEqual(fs.readFileSync(canonicalPath), canonicalBytes);
  const config = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  assert.equal(config, unrelatedConfig);
  const hooks = JSON.parse(fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf8'));
  assert.equal(hooks.custom, 'preserve');
  assert.deepEqual(hooks.hooks.Stop, unrelatedHooks.hooks.Stop);
  assert.equal(
    fs.readFileSync(path.join(projectDir, 'AGENTS.override.md'), 'utf8'),
    [
      'User-owned override bytes.',
      '',
      '<!-- spectre-knowledge:start -->',
      'retired generated content',
      '<!-- spectre-knowledge:end -->',
      '',
    ].join('\n'),
  );
});

test('retired apply and recall-template assets have no active readers or placeholders', () => {
  const pluginSkills = path.resolve('plugins/spectre/skills');
  assert.equal(
    fs.existsSync(path.join(pluginSkills, 'spectre-apply', 'SKILL.md')),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(
      pluginSkills,
      'spectre-learn',
      'references',
      'recall-template.md',
    )),
    false,
  );

  const npmKnowledgeSources = [
    path.resolve('src/lib/knowledge.js'),
    path.resolve('src/lib/project.js'),
  ].map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
  assert.doesNotMatch(npmKnowledgeSources, /spectre-apply|recall-template|\{\{REGISTRY\}\}/);
  assert.doesNotMatch(
    fs.readFileSync(path.resolve('src/lib/install.js'), 'utf8'),
    /recall-template|\{\{REGISTRY\}\}/,
  );

  for (const entry of fs.readdirSync(pluginSkills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(pluginSkills, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    assert.doesNotMatch(
      fs.readFileSync(skillPath, 'utf8'),
      /\{\{REGISTRY\}\}/,
      `${entry.name} contains a retired registry placeholder`,
    );
  }
});

test('active documentation describes metadata registry, neutral search, and exact load', () => {
  for (const skillRoot of ['.claude', '.agents']) {
    const guidance = fs.readFileSync(
      path.resolve(skillRoot, 'skills', 'verify-spectre', 'SKILL.md'),
      'utf8',
    );
    assert.match(guidance, /Metadata-only registry delivery/);
    assert.match(guidance, /task-subject and use-condition alignment/);
    assert.match(guidance, /activation cue alone is insufficient/);
    assert.match(guidance, /neutral lexical search/);
    assert.match(guidance, /verified exact-ID load/);
    assert.match(guidance, /recordDirectory/);
    assert.match(guidance, /resources/);
    assert.match(guidance, /registry exposure is a delivery diagnostic/);
    assert.match(guidance, /search match\/miss is discovery evidence/);
    assert.match(guidance, /sole registry-rank signal/);
    assert.doesNotMatch(guidance, /UserPromptSubmit|capability-only SessionStart|spectre-recall/);
  }
  assert.match(
    fs.readFileSync(path.resolve('.agents/skills/verify-spectre/SKILL.md'), 'utf8'),
    /Codex-facing skill/,
  );

  const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
  const capabilityPath = path.resolve('docs/codex-capability-matrix.md');
  const capability = fs.readFileSync(capabilityPath, 'utf8');
  const activeDocs = `${readme}\n${capability}`;
  assert.equal(fs.existsSync(capabilityPath), true);
  assert.match(readme, /\.\/docs\/codex-capability-matrix\.md/);
  for (const text of [readme, capability]) {
    assert.match(text, /\/plugin marketplace add Codename-Inc\/spectre/);
    assert.match(text, /\/plugin install spectre@codename/);
    assert.match(text, /codex plugin marketplace add Codename-Inc\/spectre/);
    assert.match(text, /codex plugin add spectre@spectre/);
  }
  assert.match(activeDocs, /SessionStart/);
  assert.match(activeDocs, /activation cue alone is insufficient/i);
  assert.match(activeDocs, /spectre knowledge search/);
  assert.match(activeDocs, /spectre knowledge load/);
  assert.match(activeDocs, /spectre knowledge registry/);
  assert.match(activeDocs, /recordDirectory/);
  assert.match(activeDocs, /resources/);
  assert.doesNotMatch(activeDocs, /spectre-recall|UserPromptSubmit/);

  const manifestSource = fs.readFileSync(
    path.resolve('scripts/translators/manifest.cjs'),
    'utf8',
  );
  assert.match(manifestSource, /size-bounded SessionStart knowledge registry/);
  assert.match(manifestSource, /neutral exact-ID search\/load/);
});

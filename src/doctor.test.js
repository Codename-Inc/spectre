import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { refreshKnowledgeIndex } from '../plugins/spectre/hooks/scripts/knowledge/records.mjs';
import { resolveProjectStore } from '../plugins/spectre/hooks/scripts/knowledge/store.mjs';

const CLI_PATH = path.resolve('bin/spectre.js');

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-doctor-'));
  const projectDir = path.join(root, 'project');
  const codexHome = path.join(projectDir, '.codex');
  const spectreHome = path.join(root, 'spectre-home');
  fs.mkdirSync(projectDir, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, projectDir, codexHome, spectreHome };
}

function runCli(args, fixture) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      CODEX_HOME: fixture.codexHome,
      SPECTRE_HOME: fixture.spectreHome,
    },
    encoding: 'utf8',
  });
}

function doctorJson(fixture) {
  const result = runCli([
    'doctor',
    'codex',
    '--scope',
    'project',
    '--project-dir',
    fixture.projectDir,
    '--json',
  ], fixture);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function writeResolver(fixture, {
  hooksEnabled = true,
  promptHook = true,
  adapter = true,
  trusted = true,
} = {}) {
  fs.mkdirSync(fixture.codexHome, { recursive: true });
  fs.writeFileSync(
    path.join(fixture.codexHome, 'config.toml'),
    [
      '[features]',
      `hooks = ${hooksEnabled}`,
      '',
      ...(trusted
        ? [
            `[projects.${JSON.stringify(fixture.projectDir)}]`,
            'trust_level = "trusted"',
            '',
          ]
        : []),
    ].join('\n'),
  );
  const hooks = {
    hooks: {
      SessionStart: [{
        hooks: [{
          type: 'command',
          command: `node '${path.join(fixture.codexHome, 'spectre', 'hooks', 'scripts', 'load-knowledge.mjs')}'`,
        }],
      }],
      ...(promptHook
        ? {
            UserPromptSubmit: [{
              hooks: [{
                type: 'command',
                command: `node '${path.join(fixture.codexHome, 'spectre', 'hooks', 'scripts', 'user-prompt-submit.mjs')}' --host codex`,
              }],
            }],
          }
        : {}),
    },
  };
  fs.writeFileSync(
    path.join(fixture.codexHome, 'hooks.json'),
    `${JSON.stringify(hooks, null, 2)}\n`,
  );
  if (adapter) {
    const adapterPath = path.join(
      fixture.codexHome,
      'spectre',
      'hooks',
      'scripts',
      'user-prompt-submit.mjs',
    );
    fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
    fs.writeFileSync(adapterPath, '// fixture resolver\n');
  }
}

function canonicalSkill(id) {
  return [
    '---',
    `name: ${JSON.stringify(id)}`,
    `description: ${JSON.stringify(`Use when applying ${id}`)}`,
    'metadata:',
    '  spectre-category: "feature"',
    `  spectre-triggers: ${JSON.stringify(JSON.stringify([id]))}`,
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
    `# ${id}`,
    '',
    'Canonical user data.',
    '',
  ].join('\n');
}

async function createStore(fixture) {
  return resolveProjectStore(fixture.projectDir, {
    spectreHome: fixture.spectreHome,
  });
}

function writeCanonicalRecord(storePath, id, content = canonicalSkill(id)) {
  const skillPath = path.join(storePath, 'knowledge', id, 'SKILL.md');
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

test('doctor reports active, absent, disabled, and untrusted prompt resolver states', { concurrency: false }, async (t) => {
  const active = makeFixture(t);
  writeResolver(active);
  const activeStore = await createStore(active);
  writeCanonicalRecord(activeStore.storePath, 'feature-active');
  refreshKnowledgeIndex(activeStore.storePath);

  const activeDoctor = doctorJson(active);
  assert.equal(activeDoctor.knowledge.resolver.status, 'active');
  assert.equal(activeDoctor.knowledge.resolver.promptHookConfigured, true);
  assert.equal(activeDoctor.knowledge.resolver.adapterPresent, true);
  assert.equal(activeDoctor.knowledge.resolver.projectTrusted, true);
  assert.equal(activeDoctor.knowledge.store.status, 'valid');
  assert.equal(activeDoctor.knowledge.store.index.status, 'valid');
  assert.equal(activeDoctor.knowledge.nativeDiscovery.status, 'complete');

  for (const [expected, resolverOptions] of [
    ['absent', { promptHook: false, adapter: false }],
    ['disabled', { hooksEnabled: false }],
    ['untrusted', { trusted: false }],
  ]) {
    const fixture = makeFixture(t);
    writeResolver(fixture, resolverOptions);
    const doctor = doctorJson(fixture);
    assert.equal(doctor.knowledge.resolver.status, expected);
    assert.equal(doctor.knowledge.store.status, 'absent');
  }

  const disabledWithUnrelatedHookSetting = makeFixture(t);
  writeResolver(disabledWithUnrelatedHookSetting, { hooksEnabled: false });
  fs.appendFileSync(
    path.join(disabledWithUnrelatedHookSetting.codexHome, 'config.toml'),
    '[user.settings]\nhooks = true\n',
  );
  assert.equal(
    doctorJson(disabledWithUnrelatedHookSetting).knowledge.resolver.status,
    'disabled',
  );
});

test('doctor reports malformed indexes and invalid canonical records without repairing the store', { concurrency: false }, async (t) => {
  const fixture = makeFixture(t);
  writeResolver(fixture);
  const resolved = await createStore(fixture);
  const invalidSkillPath = writeCanonicalRecord(
    resolved.storePath,
    'feature-invalid',
    '---\nname: feature-invalid\n---\n# Invalid\n',
  );
  const indexPath = path.join(resolved.storePath, 'index.json');
  fs.writeFileSync(indexPath, '{malformed');
  const indexBytes = fs.readFileSync(indexPath);

  const doctor = doctorJson(fixture);
  assert.equal(doctor.knowledge.store.status, 'invalid');
  assert.equal(doctor.knowledge.store.index.status, 'malformed');
  assert.equal(doctor.knowledge.store.invalidRecords.length, 1);
  assert.equal(doctor.knowledge.store.invalidRecords[0].path, invalidSkillPath);
  assert.match(doctor.knowledge.store.invalidRecords[0].message, /description/);
  assert.deepEqual(fs.readFileSync(indexPath), indexBytes);
});

test('doctor reports migration debt and grandfathered Claude native discovery in JSON and human output', { concurrency: false }, async (t) => {
  const fixture = makeFixture(t);
  writeResolver(fixture);
  const resolved = await createStore(fixture);
  refreshKnowledgeIndex(resolved.storePath);

  const legacyDir = path.join(
    fixture.projectDir,
    '.claude',
    'skills',
    'feature-grandfathered',
  );
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(
    path.join(legacyDir, 'SKILL.md'),
    `---\nname: feature-grandfathered\ndescription: Grandfathered\n---\n${'x'.repeat(9_100)}\n`,
  );
  fs.writeFileSync(
    path.join(resolved.storePath, 'migration-report.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      grandfatheredClaudeNativeDiscoveryIncomplete: true,
      entries: [{
        id: 'feature-grandfathered',
        code: 'OVERSIZED',
        sourcePaths: [legacyDir],
        registryPaths: [],
        destinationPath: path.join(
          resolved.storePath,
          'knowledge',
          'feature-grandfathered',
        ),
        grandfatheredClaudeNativeDiscovery: true,
      }],
    }, null, 2)}\n`,
  );
  const currentRegistryPath = path.join(
    fixture.projectDir,
    '.agents',
    'skills',
    'spectre-recall',
    'references',
    'registry.toon',
  );
  fs.mkdirSync(path.dirname(currentRegistryPath), { recursive: true });
  fs.writeFileSync(
    currentRegistryPath,
    'feature-late-registry|feature|late registry|Added after the report\n',
  );

  const doctor = doctorJson(fixture);
  assert.equal(doctor.knowledge.migration.status, 'debt');
  assert.equal(doctor.knowledge.migration.unresolvedCount, 2);
  assert.deepEqual(
    doctor.knowledge.migration.issues.find(
      ({ code }) => code === 'UNCLASSIFIED_LEGACY',
    ),
    { code: 'UNCLASSIFIED_LEGACY', count: 1 },
  );
  assert.deepEqual(
    doctor.knowledge.nativeDiscovery.grandfatheredClaudeExceptions.map(({ id }) => id),
    ['feature-grandfathered'],
  );
  assert.equal(
    doctor.knowledge.nativeDiscovery.grandfatheredClaudeExceptions[0]
      .nativeDiscoveryEligible,
    true,
  );
  assert.equal(doctor.knowledge.nativeDiscovery.status, 'grandfathered_claude');

  const human = runCli([
    'doctor',
    'codex',
    '--scope',
    'project',
    '--project-dir',
    fixture.projectDir,
  ], fixture);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Migration debt: 2 unresolved/);
  assert.match(
    human.stdout,
    /Native discovery retirement: incomplete \(1 grandfathered Claude exception\)/,
  );
  assert.match(human.stdout, /feature-grandfathered/);
  assert.match(human.stdout, /still eligible for Claude native discovery/);
});

test('uninstall removes only managed runtime integration and preserves canonical, unresolved, and unrelated state', { concurrency: false }, async (t) => {
  const fixture = makeFixture(t);
  const resolved = await createStore(fixture);
  const canonicalPath = writeCanonicalRecord(resolved.storePath, 'feature-canonical');
  refreshKnowledgeIndex(resolved.storePath);
  const canonicalBytes = fs.readFileSync(canonicalPath);

  const unresolvedPath = path.join(
    fixture.projectDir,
    '.agents',
    'skills',
    'feature-unresolved',
    'SKILL.md',
  );
  fs.mkdirSync(path.dirname(unresolvedPath), { recursive: true });
  fs.writeFileSync(
    unresolvedPath,
    `---\nname: feature-unresolved\ndescription: Unresolved\n---\n${'x'.repeat(9_100)}\n`,
  );
  const unresolvedBytes = fs.readFileSync(unresolvedPath);
  const registryPath = path.join(
    fixture.projectDir,
    '.agents',
    'skills',
    'spectre-recall',
    'references',
    'registry.toon',
  );
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(
    registryPath,
    'feature-unresolved|feature|unresolved|Unresolved legacy record\n',
  );
  const registryBytes = fs.readFileSync(registryPath);

  const unrelatedSkillPath = path.join(
    fixture.projectDir,
    '.agents',
    'skills',
    'team-owned',
    'SKILL.md',
  );
  fs.mkdirSync(path.dirname(unrelatedSkillPath), { recursive: true });
  fs.writeFileSync(unrelatedSkillPath, 'team-owned bytes\n');
  const unrelatedSkillBytes = fs.readFileSync(unrelatedSkillPath);

  fs.mkdirSync(fixture.codexHome, { recursive: true });
  const unresolvedConfigEntry = configEntry(
    unresolvedPath,
    '# preserve unresolved native discovery',
  );
  const unrelatedConfigEntry = configEntry(
    unrelatedSkillPath,
    'custom_key = "preserve"',
  );
  fs.writeFileSync(
    path.join(fixture.codexHome, 'config.toml'),
    [
      '# spectre-codex-managed',
      '[features]',
      'hooks = true',
      'skills = true',
      'multi_agent = true',
      '',
      '[agents.spectre_dev]',
      'description = "managed"',
      'config_file = "/managed/dev.toml"',
      '',
      '[user.settings]',
      'keep = "exact"',
      '',
      unresolvedConfigEntry,
      '',
      unrelatedConfigEntry,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fixture.codexHome, 'hooks.json'),
    `${JSON.stringify({
      custom: 'preserve',
      hooks: {
        Stop: [{
          matcher: '*',
          hooks: [{ type: 'command', command: 'echo unrelated-stop' }],
        }],
        UserPromptSubmit: [{
          hooks: [{
            type: 'command',
            command: `node '${path.join(fixture.codexHome, 'spectre', 'hooks', 'scripts', 'user-prompt-submit.mjs')}' --host codex`,
          }],
        }],
      },
    }, null, 2)}\n`,
  );
  fs.mkdirSync(path.join(fixture.codexHome, 'spectre', 'hooks', 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(fixture.codexHome, 'spectre', 'hooks', 'scripts', 'user-prompt-submit.mjs'),
    '// managed runtime\n',
  );
  fs.mkdirSync(path.join(fixture.projectDir, '.spectre'), { recursive: true });
  fs.writeFileSync(
    path.join(fixture.projectDir, '.spectre', 'manifest.json'),
    '{"scope":"project"}\n',
  );

  const uninstalled = runCli([
    'uninstall',
    'codex',
    '--scope',
    'project',
    '--project-dir',
    fixture.projectDir,
  ], fixture);
  assert.equal(uninstalled.status, 0, uninstalled.stderr);

  assert.deepEqual(fs.readFileSync(canonicalPath), canonicalBytes);
  assert.deepEqual(fs.readFileSync(unresolvedPath), unresolvedBytes);
  assert.deepEqual(fs.readFileSync(registryPath), registryBytes);
  assert.deepEqual(fs.readFileSync(unrelatedSkillPath), unrelatedSkillBytes);
  assert.equal(fs.existsSync(path.join(fixture.codexHome, 'spectre')), false);
  assert.equal(
    fs.existsSync(path.join(fixture.projectDir, '.spectre', 'manifest.json')),
    false,
  );

  const config = fs.readFileSync(path.join(fixture.codexHome, 'config.toml'), 'utf8');
  assert.doesNotMatch(config, /# spectre-codex-managed/);
  assert.doesNotMatch(config, /\[agents\.spectre_dev\]/);
  assert.match(config, /\[user\.settings\]\nkeep = "exact"/);
  assert.equal(config.includes(unresolvedConfigEntry), true);
  assert.equal(config.includes(unrelatedConfigEntry), true);

  const hooks = JSON.parse(
    fs.readFileSync(path.join(fixture.codexHome, 'hooks.json'), 'utf8'),
  );
  assert.equal(hooks.custom, 'preserve');
  assert.deepEqual(hooks.hooks.Stop, [{
    matcher: '*',
    hooks: [{ type: 'command', command: 'echo unrelated-stop' }],
  }]);
  assert.equal(hooks.hooks.UserPromptSubmit, undefined);
});

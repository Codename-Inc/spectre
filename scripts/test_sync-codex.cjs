'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const agents = require('./translators/agents.cjs');
const hooks = require('./translators/hooks.cjs');
const skills = require('./translators/skills.cjs');
const { runSync } = require('./sync-codex.cjs');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-sync-test-'));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixture(root) {
  const canonicalRoot = path.join(root, 'plugins', 'spectre');
  const codexRoot = path.join(root, 'plugins', 'spectre-codex');

  writeFile(
    path.join(canonicalRoot, 'agents', 'dev.md'),
    `---
name: dev
description: Implementation specialist.
model: claude-sonnet-4-6
---

Write code carefully.
`,
  );

  writeFile(
    path.join(canonicalRoot, 'skills', 'spectre-plan', 'SKILL.md'),
    `---
name: spectre-plan
description: "\\ud83d\\udc7b | Create: implementation plans."
---

Read .claude/skills/example/SKILL.md, then invoke /spectre:create_tasks.
Load @skill-spectre:spectre-tdd and dispatch @spectre:tester.
`,
  );

  writeFile(
    path.join(canonicalRoot, 'hooks', 'scripts', 'bootstrap.mjs'),
    `#!/usr/bin/env node
process.stdout.write(JSON.stringify({}) + '\\n');
`,
  );

  writeFile(
    path.join(canonicalRoot, 'hooks', 'hooks.json'),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              matcher: 'startup',
              hooks: [
                {
                  type: 'command',
                  command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/bootstrap.mjs',
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  return { canonicalRoot, codexRoot };
}

test('agent translator emits the expected Codex TOML shape', () => {
  const source = `---
name: finder
description: Locate files.
model: claude-haiku-4-5-20251001
---

Find relevant files.
`;

  const toml = agents.buildAgentToml(source, 'finder.md');
  const fields = agents.parseToml(toml);

  assert.deepEqual(Object.keys(fields), [
    'name',
    'description',
    'sandbox_mode',
    'developer_instructions',
  ]);
  assert.equal(fields.name, 'finder');
  assert.equal(fields.description, 'Locate files.');
  assert.equal(fields.model, undefined);
  assert.equal(fields.model_reasoning_effort, undefined);
  assert.equal(fields.sandbox_mode, 'read-only');
  assert.equal(fields.developer_instructions, 'Find relevant files.');
});

test('sync generates agents, rewrites skills, and rewrites hook roots', () => {
  const root = tempRoot();
  try {
    const { canonicalRoot, codexRoot } = createFixture(root);
    const result = runSync({ repoRoot: root, canonicalRoot, codexRoot, quiet: true });

    assert.equal(result.ok, true);

    const agentFields = agents.parseToml(
      fs.readFileSync(path.join(codexRoot, 'agents', 'dev.toml'), 'utf8'),
    );
    assert.equal(agentFields.name, 'dev');
    assert.equal(agentFields.model, undefined);
    assert.equal(agentFields.model_reasoning_effort, undefined);
    assert.equal(agentFields.sandbox_mode, 'workspace-write');

    const skill = fs.readFileSync(
      path.join(codexRoot, 'skills', 'spectre-plan', 'SKILL.md'),
      'utf8',
    );
    const { frontmatter } = skills.parseFrontmatter(skill, 'spectre-plan/SKILL.md');
    assert.equal(frontmatter.description, '👻 | Create: implementation plans.');
    assert.match(skill, /^description: "👻 \| Create: implementation plans\."/m);
    assert.doesNotMatch(skill, /\\ud83d/);
    assert.match(skill, /\.agents\/skills\/example\/SKILL\.md/);
    assert.match(skill, /spectre-create_tasks/);
    assert.match(skill, /Skill\(spectre-tdd\)/);
    assert.match(skill, /@tester/);
    assert.doesNotMatch(skill, /\.claude\/skills\//);
    assert.doesNotMatch(skill, /\/spectre:create_tasks/);
    assert.doesNotMatch(skill, /@skill-spectre:/);
    assert.doesNotMatch(skill, /@spectre:/);

    const hooksConfig = JSON.parse(
      fs.readFileSync(path.join(codexRoot, 'hooks', 'hooks.json'), 'utf8'),
    );
    const command = hooksConfig.hooks.SessionStart[0].hooks[0].command;
    assert.equal(command, 'node ${CODEX_HOME}/spectre/hooks/scripts/bootstrap.mjs');
    assert.equal(
      fs.existsSync(path.join(codexRoot, 'hooks', 'scripts', 'bootstrap.mjs')),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hooks translator rewrites legacy command extensions to Codex mjs paths', () => {
  assert.equal(
    hooks.rewriteHookCommand('node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/load-knowledge.cjs'),
    'node ${CODEX_HOME}/spectre/hooks/scripts/load-knowledge.mjs',
  );
});

test('check mode detects drift and passes after regeneration', () => {
  const root = tempRoot();
  try {
    const { canonicalRoot, codexRoot } = createFixture(root);
    assert.equal(runSync({ repoRoot: root, canonicalRoot, codexRoot, quiet: true }).ok, true);
    assert.equal(
      runSync({ repoRoot: root, canonicalRoot, codexRoot, check: true, quiet: true }).ok,
      true,
    );

    fs.appendFileSync(path.join(codexRoot, 'skills', 'spectre-plan', 'SKILL.md'), '\nstale\n');
    const drift = runSync({ repoRoot: root, canonicalRoot, codexRoot, check: true, quiet: true });
    assert.equal(drift.ok, false);
    assert.match(drift.errors.join('\n'), /changed: plugins\/spectre-codex\/skills\/spectre-plan\/SKILL\.md/);

    assert.equal(runSync({ repoRoot: root, canonicalRoot, codexRoot, quiet: true }).ok, true);
    assert.equal(
      runSync({ repoRoot: root, canonicalRoot, codexRoot, check: true, quiet: true }).ok,
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

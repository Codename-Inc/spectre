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
description: "\\ud83d\\udc7b | Create implementation plans after /spectre:scope."
---

Read .claude/skills/example/SKILL.md, then invoke /spectre:create_tasks.
Load @skill-spectre:spectre-tdd and dispatch @spectre:tester.
`,
  );

  writeFile(
    path.join(canonicalRoot, 'hooks', 'scripts', 'register_learning.mjs'),
    `#!/usr/bin/env node
process.stdout.write(JSON.stringify({}) + '\\n');
`,
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
    assert.equal(frontmatter.description, '👻 | Create implementation plans after spectre-scope.');
    assert.match(skill, /^description: "👻 \| Create implementation plans after spectre-scope\."/m);
    assert.doesNotMatch(skill, /\\ud83d/);
    assert.match(skill, /\.agents\/skills\/example\/SKILL\.md/);
    assert.match(skill, /invoke spectre-create_tasks\./);
    assert.match(skill, /Skill\(spectre-tdd\)/);
    assert.match(skill, /@tester/);
    assert.doesNotMatch(skill, /\.claude\/skills\//);
    assert.doesNotMatch(skill, /\/spectre:create_tasks/);
    assert.doesNotMatch(skill, /@skill-spectre:/);
    assert.doesNotMatch(skill, /@spectre:/);

    assert.equal(
      fs.existsSync(path.join(codexRoot, 'hooks', 'scripts', 'register_learning.mjs')),
      true,
    );
    assert.equal(fs.existsSync(path.join(codexRoot, 'hooks', 'hooks.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hooks translator rewrites legacy command extensions to Codex mjs paths', () => {
  assert.equal(
    hooks.rewriteHookCommand('node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/register_learning.cjs'),
    'node ${CODEX_HOME}/spectre/hooks/scripts/register_learning.mjs',
  );
});

test('hooks translator recursively copies runtime modules and rewrites Codex host arguments', () => {
  const root = tempRoot();
  try {
    const { canonicalRoot, codexRoot } = createFixture(root);
    writeFile(
      path.join(canonicalRoot, 'hooks', 'scripts', 'knowledge', 'records.mjs'),
      'export const schemaVersion = 1;\n',
    );
    writeFile(
      path.join(canonicalRoot, 'hooks', 'hooks.json'),
      `${JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    'node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/user-prompt-submit.mjs --host claude',
                },
              ],
            },
          ],
        },
      }, null, 2)}\n`,
    );
    writeFile(
      path.join(canonicalRoot, 'hooks', 'scripts', 'user-prompt-submit.mjs'),
      'process.stdout.write("{}\\n");\n',
    );

    const result = runSync({ repoRoot: root, canonicalRoot, codexRoot, quiet: true });
    assert.equal(result.ok, true);
    const generatedRecordPath = path.join(
      codexRoot,
      'hooks',
      'scripts',
      'knowledge',
      'records.mjs',
    );
    assert.equal(fs.existsSync(generatedRecordPath), true);
    assert.equal(
      fs.readFileSync(generatedRecordPath, 'utf8'),
      'export const schemaVersion = 1;\n',
    );
    const generatedHooks = JSON.parse(
      fs.readFileSync(path.join(codexRoot, 'hooks', 'hooks.json'), 'utf8'),
    );
    assert.equal(
      generatedHooks.hooks.UserPromptSubmit[0].hooks[0].command,
      'node ${CODEX_HOME}/spectre/hooks/scripts/user-prompt-submit.mjs --host codex',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hooks translator excludes nested tests and removes stale nested runtime files', () => {
  const root = tempRoot();
  try {
    const { canonicalRoot, codexRoot } = createFixture(root);
    writeFile(
      path.join(canonicalRoot, 'hooks', 'scripts', 'knowledge', 'store.mjs'),
      'export const store = true;\n',
    );
    writeFile(
      path.join(canonicalRoot, 'hooks', 'scripts', 'knowledge', 'test_store.mjs'),
      'throw new Error("must not ship");\n',
    );
    writeFile(
      path.join(codexRoot, 'hooks', 'scripts', 'knowledge', 'stale.mjs'),
      'stale\n',
    );

    const result = runSync({ repoRoot: root, canonicalRoot, codexRoot, quiet: true });
    assert.equal(result.ok, true);
    assert.equal(
      fs.existsSync(path.join(codexRoot, 'hooks', 'scripts', 'knowledge', 'store.mjs')),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(codexRoot, 'hooks', 'scripts', 'knowledge', 'test_store.mjs')),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(codexRoot, 'hooks', 'scripts', 'knowledge', 'stale.mjs')),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test('spectre-execute uses lightweight sentinel review before final adversarial review', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const skillPaths = [
    path.join(repoRoot, 'plugins', 'spectre', 'skills', 'spectre-execute', 'SKILL.md'),
    path.join(repoRoot, 'plugins', 'spectre-codex', 'skills', 'spectre-execute', 'SKILL.md'),
  ];

  for (const skillPath of skillPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.match(skill, /Sentinel selector/);
    assert.match(skill, /Lightweight sentinel review/);
    assert.match(skill, /Final adversarial code review \+ validate/);
    assert.match(skill, /sentinel review counts/);
    assert.doesNotMatch(skill, /Dual clean-room review/);
    assert.doesNotMatch(skill, /dispatch two .*reviewer/);
  }
});

const fixedWorkstreamCapPattern =
  /(?:\b(?:at most|up to|no more than|max(?:imum)?(?: of)?|limited to)\s+|<=\s*)(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+workstreams?\b/i;
const planDirectCreateTasksRoutePattern =
  /(?:in )?plan-direct mode,?\s+(?:(?:must|should|shall|may|will|can|needs? to|has to)\s+)?(?:always\s+|first\s+)?(?:stops?|routes?(?: to)?|invokes?|calls?|runs?|uses?|dispatches?|requires?)[^\n]*spectre-create_tasks/i;

test('plan-direct fixed-workstream guard rejects representative cap forms', () => {
  for (const forbiddenContract of [
    'Maximum of 4 workstreams may be dispatched.',
    'At most four workstreams may be dispatched.',
  ]) {
    assert.match(forbiddenContract, fixedWorkstreamCapPattern);
  }

  assert.doesNotMatch('No fixed workstream count is imposed.', fixedWorkstreamCapPattern);
});

test('plan-direct create_tasks guard rejects representative invocation forms', () => {
  for (const forbiddenContract of [
    'Plan-direct mode must invoke spectre-create_tasks before execution.',
    'In plan-direct mode, call spectre-create_tasks before execution.',
  ]) {
    assert.match(forbiddenContract, planDirectCreateTasksRoutePattern);
  }

  assert.doesNotMatch(
    'Plan-direct mode never routes to spectre-create_tasks.',
    planDirectCreateTasksRoutePattern,
  );
});

test('plan-direct execute resolves explicit plans without changing structured defaults', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const execute = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-execute', 'SKILL.md'),
      'utf8',
    ).replaceAll('/spectre:', 'spectre-');
    const structuredMode = execute.indexOf('Structured mode');
    const planDirectMode = execute.indexOf('Plan-direct mode');

    assert.match(
      execute,
      /Structured mode:[^\n]*execute index[^\n]*resolvable `tasks\.json`/i,
    );
    assert.match(execute, /Plan-direct mode:[^\n]*another readable plan document/i);
    assert.ok(structuredMode !== -1);
    assert.ok(planDirectMode > structuredMode);
    assert.match(
      execute,
      /No-argument execution[^\n]*default `docs\/tasks\/\{branch\}\/specs\/execute\.md`/i,
    );
    assert.match(execute, /Plan-direct mode never routes to `spectre-create_tasks`/);
    assert.doesNotMatch(
      execute,
      /Required default artifact:[^\n]*If absent\s*→\s*stop,\s*route to `spectre-create_tasks`/i,
    );
  }
});

test('plan-direct execute preserves source-plan authority without a completeness gate', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const execute = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-execute', 'SKILL.md'),
      'utf8',
    ).replaceAll('/spectre:', 'spectre-');

    assert.match(execute, /The source plan is the sole requirements authority/);
    assert.match(
      execute,
      /begins execution without a plan-quality, approval, completeness, or Spectre-format gate/i,
    );
    assert.match(execute, /never (?:edit|rewrite|repair|approve|reject) the source plan/i);
    assert.doesNotMatch(
      execute,
      /(?:in )?plan-direct mode,?\s+(?:requires?|runs?|routes?)[^\n]*(?:plan completeness|plan approval|plan review|task review)/i,
    );
    assert.doesNotMatch(
      execute,
      planDirectCreateTasksRoutePattern,
    );
  }
});

test('plan-direct execute creates lazy durable execution state before dispatch', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const requiredSections = [
    'Source Plan',
    'Runtime Status',
    'Workstream & Parallelization Map',
    'Active Wave',
    'Wave History',
    'Plan-Backed Adaptations',
    'Final Quality State',
  ];

  for (const rootName of ['spectre', 'spectre-codex']) {
    const execute = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-execute', 'SKILL.md'),
      'utf8',
    );

    assert.match(execute, /`execution_state\.md`/);
    for (const section of requiredSections) {
      assert.match(execute, new RegExp(section));
    }
    assert.match(execute, /before the first dev dispatch/i);
    assert.match(execute, /updates? it after every dispatch\/gate\/adaptation/i);
    assert.match(execute, /one coarse row for every plan-native/i);
    assert.match(execute, /Active Wave[^\n]*only the currently dispatchable bounded assignments/i);
    assert.match(execute, /sha256[^\n]*full source-plan bytes/i);
    assert.match(execute, /recorded byte length/i);
    assert.match(execute, /No fixed workstream count is imposed/);
    assert.doesNotMatch(execute, fixedWorkstreamCapPattern);
    assert.doesNotMatch(
      execute,
      /(?:in )?plan-direct mode,?\s+(?:creates?|generates?|requires?)[^\n]*(?:complete|exhaustive)[^\n]*(?:task graph|subtasks|acceptance criteria)/i,
    );
  }
});

test('plan-direct quality gates use the explicit plan and derivative execution evidence', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const readSkill = (skillName) => fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', skillName, 'SKILL.md'),
      'utf8',
    );
    const execute = readSkill('spectre-execute');
    const codeReview = readSkill('spectre-code_review');
    const validate = readSkill('spectre-validate');
    const proof = readSkill('spectre-proof');
    const testGuide = readSkill('spectre-create_test_guide');

    assert.match(execute, /verbatim source-anchored plan text for the active-wave workstreams/i);
    assert.match(
      execute,
      /source plan plus relevant execution-state evidence instead of `tasks\.json` slices/i,
    );
    assert.match(codeReview, /explicit(?:ly passed)? source-plan path/i);
    assert.match(
      codeReview,
      /explicit(?:ly passed)? source-plan path[^\n]*(?:ahead of|before)[^\n]*`plan\.md`/i,
    );
    assert.match(validate, /explicit arbitrary plan as a requirement source/i);
    assert.match(validate, /plan as authoritative when passed/i);
    assert.match(proof, /explicitly passed source plan[^\n]*acceptance source/i);
    assert.match(testGuide, /explicit(?:ly passed)? source-plan path/i);
    assert.match(
      testGuide,
      /explicit(?:ly passed)? source-plan path[^\n]*(?:ahead of|before)[^\n]*`plan\.md`/i,
    );
  }
});

test('plan-direct goal composition resumes execute before proof from durable state', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const goal = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-goal', 'SKILL.md'),
      'utf8',
    );
    const executeIndex = goal.indexOf('Skill(spectre-execute)');
    const proofIndex = goal.indexOf('Skill(spectre-proof)');

    assert.match(goal, /source plan plus (?:its )?`execution_state\.md`/i);
    assert.match(goal, /resume from durable `execution_state\.md` plus proof state/i);
    assert.match(goal, /invoke `?Skill\(spectre-execute\)`? with the source-plan path/i);
    assert.match(goal, /`?Skill\(spectre-proof\)`? with the same output directory/i);
    assert.match(goal, /require only readable plan\/runtime inputs/i);
    assert.ok(executeIndex !== -1);
    assert.ok(proofIndex > executeIndex);
    assert.doesNotMatch(
      goal,
      /(?:in )?plan-direct mode,?\s+(?:requires?|validates?)[^\n]*(?:complete|approved|reviewed)[^\n]*plan/i,
    );
  }
});

test('review gates pin route-specific opposing models and retain native fallback', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const skillNames = ['spectre-plan_review', 'spectre-task_review', 'spectre-code_review'];
  const routes = {
    'spectre-plan_review': {
      claudeModel: 'opus',
      effort: 'high',
    },
    'spectre-task_review': {
      claudeModel: 'opus',
      effort: 'medium',
    },
    'spectre-code_review': {
      claudeModel: 'fable',
      effort: 'high',
    },
  };

  for (const rootName of ['spectre', 'spectre-codex']) {
    for (const skillName of skillNames) {
      const skillPath = path.join(
        repoRoot,
        'plugins',
        rootName,
        'skills',
        skillName,
        'SKILL.md',
      );
      const skill = fs.readFileSync(skillPath, 'utf8');

      const { claudeModel, effort } = routes[skillName];
      assert.match(skill, new RegExp(`claude -p --model ${claudeModel} --effort ${effort}`));
      assert.match(
        skill,
        new RegExp(
          `codex exec -C "\\$PWD" -m gpt-5\\.6-sol -c 'model_reasoning_effort="${effort}"'`,
        ),
      );
      assert.match(skill, /unavailable opposing runtimes never block completion/i);
      assert.match(skill, /Native fallback/);
      assert.match(skill, /Reviewer Model:/);
      assert.match(skill, /Reviewer Effort:/);
      assert.match(skill, /Invocation Route:/);
      assert.match(skill, new RegExp(`Reviewer Model: ${claudeModel}`));
      assert.match(skill, new RegExp(`Reviewer Effort: ${effort}`));
      assert.match(skill, /Invocation Route: Codex -> Claude Code/);
      assert.match(skill, /Reviewer Model: gpt-5\.6-sol/);
      assert.match(skill, /Invocation Route: Claude Code -> Codex/);

      if (skillName === 'spectre-plan_review') {
        assert.match(skill, /Allow up to 20 minutes for completion/);
        assert.match(skill, /Do not pass launcher timeout or duration guidance to the reviewer/);
        assert.doesNotMatch(skill, /at least 20 minutes/);
      } else if (skillName === 'spectre-task_review') {
        assert.match(skill, /task-review-safety\.mjs` `preflight/);
        assert.match(skill, /task-review-safety\.mjs` `validate-report/);
        assert.match(skill, /one repair attempt/);
        assert.match(skill, /focused post-check/);
        assert.match(skill, /Adversarial mode:.*does not delegate/);
        assert.match(skill, /Allow up to 20 minutes for completion/);
        assert.match(skill, /Do not pass launcher timeout or duration guidance to the reviewer/);
        assert.doesNotMatch(skill, /at least 20 minutes|do not stop early/i);
      }
    }
  }
});

test('code review is adversarial and execute delegates the final review gate', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const codeReviewPath = path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-code_review',
      'SKILL.md',
    );
    const codeReview = fs.readFileSync(codeReviewPath, 'utf8');
    assert.match(codeReview, /Adversarial review of what was just built/);
    assert.match(codeReview, /Correctness/);
    assert.match(codeReview, /Security/);
    assert.match(codeReview, /Performance \/ reliability/);
    assert.match(codeReview, /Overengineering/);
    assert.match(codeReview, /Evidence \/ Reproduction/);
    assert.doesNotMatch(codeReview, /Scores \(0(?:-|\u2013)10\)/);

    const executePath = path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-execute',
      'SKILL.md',
    );
    const execute = fs.readFileSync(executePath, 'utf8');
    assert.match(execute, /Final adversarial code review \+ validate/);
    assert.match(execute, /Skill\(spectre-code_review\)/);
    assert.doesNotMatch(execute, /Dispatch multi-lens clean-room review/);
  }
});

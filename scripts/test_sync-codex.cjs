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
    path.join(root, 'package.json'),
    JSON.stringify({
      name: '@codename_inc/spectre',
      version: '6.0.0',
      description: 'Fixture Spectre package.',
      homepage: 'https://github.com/Codename-Inc/spectre#readme',
      repository: {
        type: 'git',
        url: 'git+https://github.com/Codename-Inc/spectre.git',
      },
      license: 'MIT',
      keywords: ['workflow'],
    }, null, 2),
  );

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
    path.join(canonicalRoot, 'agents', 'tester.md'),
    `---
name: tester
description: Test specialist.
model: claude-sonnet-4-6
---

Write tests carefully.
`,
  );

  writeFile(
    path.join(canonicalRoot, 'skills', 'spectre-plan', 'SKILL.md'),
    `---
name: spectre-plan
description: "\\ud83d\\udc7b | Create implementation plans after /spectre:scope."
---

Read .claude/skills/example/SKILL.md, then invoke /spectre:create_tasks.
Load @skill-spectre:spectre-tdd and dispatch @spectre:tester plus @dev.
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
  assert.equal(fields.name, 'spectre_finder');
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
      fs.readFileSync(path.join(codexRoot, 'agents', 'spectre_dev.toml'), 'utf8'),
    );
    assert.equal(agentFields.name, 'spectre_dev');
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
    assert.match(skill, /@spectre_tester/);
    assert.match(skill, /@spectre_dev/);
    assert.match(skill, /Codex Agent Preflight/);
    assert.doesNotMatch(skill, /\.claude\/skills\//);
    assert.doesNotMatch(skill, /\/spectre:create_tasks/);
    assert.doesNotMatch(skill, /@skill-spectre:/);
    assert.doesNotMatch(skill, /@spectre:/);
    assert.doesNotMatch(skill, /(?<![\w:-])@dev\b/);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(codexRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
    );
    assert.equal(manifest.name, 'spectre');
    assert.equal(manifest.version, '6.0.0');
    assert.equal('skills' in manifest, false);
    assert.equal('agents' in manifest, false);

    assert.equal(
      fs.existsSync(path.join(codexRoot, 'hooks', 'scripts', 'register_learning.mjs')),
      true,
    );
    assert.equal(fs.existsSync(path.join(codexRoot, 'hooks', 'hooks.json')), false);
    const generatedText = Array.from(collectGeneratedText(codexRoot)).join('\n');
    assert.doesNotMatch(generatedText, /spectre knowledge/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sync emits an openai.yaml invocation-policy sidecar only for skills that disable model invocation', () => {
  const root = tempRoot();
  try {
    const { canonicalRoot, codexRoot } = createFixture(root);

    // Skill that opts out of model invocation -> Codex needs the policy sidecar.
    writeFile(
      path.join(canonicalRoot, 'skills', 'spectre-kickoff', 'SKILL.md'),
      `---
name: spectre-kickoff
description: "User-only kickoff workflow."
user-invocable: true
disable-model-invocation: true
---

Kickoff body.
`,
    );

    runSync({ repoRoot: root, canonicalRoot, codexRoot, quiet: true });

    const sidecarPath = path.join(codexRoot, 'skills', 'spectre-kickoff', 'agents', 'openai.yaml');
    assert.equal(fs.existsSync(sidecarPath), true, 'expected sidecar for skill that disables model invocation');
    assert.match(
      fs.readFileSync(sidecarPath, 'utf8'),
      /policy:\s*\n\s*allow_implicit_invocation:\s*false/,
    );

    // Control: the fixture's spectre-plan skill has no flag -> must not get a sidecar.
    assert.equal(
      fs.existsSync(path.join(codexRoot, 'skills', 'spectre-plan', 'agents', 'openai.yaml')),
      false,
      'skill without disable-model-invocation must not get a sidecar',
    );

    // Removing the flag prunes the previously-emitted sidecar on re-sync.
    writeFile(
      path.join(canonicalRoot, 'skills', 'spectre-kickoff', 'SKILL.md'),
      `---
name: spectre-kickoff
description: "User-only kickoff workflow."
user-invocable: true
---

Kickoff body.
`,
    );
    runSync({ repoRoot: root, canonicalRoot, codexRoot, quiet: true });
    assert.equal(fs.existsSync(sidecarPath), false, 'sidecar must be pruned when the flag is removed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function* collectGeneratedText(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* collectGeneratedText(fullPath);
    } else if (entry.isFile()) {
      yield fs.readFileSync(fullPath, 'utf8');
    }
  }
}

test('hooks translator rewrites legacy command extensions to Codex mjs paths', () => {
  assert.equal(
    hooks.rewriteHookCommand('node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/register_learning.cjs'),
    'node ${PLUGIN_ROOT}/hooks/scripts/register_learning.mjs',
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
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    'node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/load-knowledge.mjs --host claude',
                },
              ],
            },
          ],
        },
      }, null, 2)}\n`,
    );
    writeFile(
      path.join(canonicalRoot, 'hooks', 'scripts', 'load-knowledge.mjs'),
      'const command = `spectre knowledge search "${id}"`; process.stdout.write(command);\n',
    );
    const canonicalCli = path.join(canonicalRoot, 'hooks', 'scripts', 'knowledge-cli.mjs');
    writeFile(canonicalCli, '#!/usr/bin/env node\n');
    fs.chmodSync(canonicalCli, 0o755);
    writeFile(
      path.join(codexRoot, 'hooks', 'scripts', 'user-prompt-submit.mjs'),
      'stale prompt runtime\n',
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
      generatedHooks.hooks.SessionStart[0].hooks[0].command,
      'node ${PLUGIN_ROOT}/hooks/scripts/load-knowledge.mjs --host codex',
    );
    assert.match(
      fs.readFileSync(path.join(codexRoot, 'hooks', 'scripts', 'load-knowledge.mjs'), 'utf8'),
      /knowledge-cli\.mjs" search/,
    );
    assert.notEqual(
      fs.statSync(path.join(codexRoot, 'hooks', 'scripts', 'knowledge-cli.mjs')).mode & 0o111,
      0,
    );
    assert.equal(
      fs.existsSync(path.join(codexRoot, 'hooks', 'scripts', 'user-prompt-submit.mjs')),
      false,
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
    assert.match(
      skill,
      /sha256\(requirement anchor \+ primary symbol \+ normalized observable failure\)/,
    );
    assert.match(skill, /Return all evidence-backed CRITICAL\/HIGH findings/);
    assert.match(skill, /fingerprint · attempt · route · result\/disposition/);
    assert.match(
      skill,
      /distinct findings have independent budgets and there is no global sentinel\/fix cap/,
    );
    assert.match(skill, /Attempt 1 uses one focused `@spectre(?::|_)dev` repair/);
    assert.match(skill, /primary revalidates it and owns attempt 2/);
    assert.match(skill, /implement directly or use a clean-context, high-effort opposing runtime/);
    assert.match(skill, /never replay the same prompt, agent, or approach/);
    assert.match(skill, /survives attempt 2[^\n]*promote it to source-backed Adapt work/);
    assert.match(skill, /Growth >25%[^\n]*may trigger Adapt sooner/);
    assert.match(skill, /CRITICAL\/HIGH findings re-enter Reflect\/Adapt as source-backed gap work/);
    assert.match(
      skill,
      /Never request approval solely because of repair count, reviewer count, diff growth, or a recurring finding/,
    );
    assert.doesNotMatch(skill, /Dual clean-room review/);
    assert.doesNotMatch(skill, /dispatch two .*reviewer/);
    assert.doesNotMatch(skill, /<=3 focused fix waves/);
    assert.doesNotMatch(skill, /circuit breaker trips → halt and surface/);
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
      /No-argument execution[^\n]*feature-resolution rule[^\n]*without a naming gate/i,
    );
    assert.match(
      execute,
      /With no explicit work-source path[^\n]*`EXECUTE_INDEX = \{FEATURE_ROOT\}\/specs\/execute\.md`/i,
    );
    assert.doesNotMatch(execute, /default `docs\/tasks\/\{branch\}/i);
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
    assert.match(
      execute,
      /plan-direct mode[^\n]*Skill\(spectre-create_test_guide\)[^\n]*PLAN_SOURCE[^\n]*\{FEATURE_ROOT\}[^\n]*orchestrated/i,
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

test('proof contract requires reviewed user evidence and a bounded repair loop', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skillPath = path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-proof',
      'SKILL.md',
    );
    const skill = fs.readFileSync(skillPath, 'utf8');

    assert.match(skill, /PASS`, `PARTIAL`, `DIAGNOSTIC_ONLY`, or `FAIL/);
    assert.match(skill, /Captured-but-unreviewed media does not count/);
    assert.match(skill, /When assertions and pixels disagree, pixels win/);
    assert.match(skill, /at most three repair attempts/);
    assert.match(skill, /BASE_SHA.*HEAD_SHA.*DIFF_SHA256/);
    assert.match(skill, /git diff --binary --full-index --no-ext-diff --no-color/);
    assert.match(skill, /PR_CANDIDATE_STALE/);
    assert.match(skill, /CANDIDATE_CHANGED/);
    assert.match(skill, /proof\/proof\.json/);
    assert.match(skill, /proof\/proof\.html/);
    assert.doesNotMatch(skill, /subspace-app-harness/i);
  }
});

test('goal prompts preserve the completion contract and require execute then portable proof', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const goalPath = path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-goal',
      'SKILL.md',
    );
    const goal = fs.readFileSync(goalPath, 'utf8');
    const executeIndex = goal.indexOf('Skill(spectre-execute)');
    const proofIndex = goal.indexOf('Skill(spectre-proof)');

    assert.match(goal, /goal-prompts\.md/);
    assert.match(goal, /Portable strict/);
    assert.match(goal, /\*\*Outcome\*\*/);
    assert.match(goal, /\*\*Verification\*\*/);
    assert.match(goal, /\*\*Constraints/);
    assert.match(goal, /\*\*Scope/);
    assert.match(goal, /\*\*Iteration\*\*/);
    assert.match(goal, /\*\*Stop\*\*/);
    assert.ok(executeIndex !== -1);
    assert.ok(proofIndex > executeIndex);
    assert.match(goal, /aggregate `PASS`/);
    assert.match(goal, /transcript/i);
    assert.match(goal, /Structured prompt/);
    assert.match(goal, /Compact prompt/);
    assert.match(goal, /Reaching the cap is not success/);
    assert.doesNotMatch(goal, /execute-only/i);
  }
});

test('plan generates portable strict goal prompts after task artifacts are final', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const planPath = path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-plan',
      'SKILL.md',
    );
    const plan = fs.readFileSync(planPath, 'utf8');
    const light = plan.match(/\*\*LIGHT\*\* → ([^\n]+)/)?.[1] || '';
    const standard = plan.match(/\*\*STANDARD\*\* → ([^\n]+)/)?.[1] || '';
    const comprehensive = plan.match(/\*\*COMPREHENSIVE\*\* → ([^\n]+)/)?.[1] || '';

    assert.ok(light.indexOf('spectre-goal') > light.indexOf('spectre-create_tasks'));
    assert.ok(standard.indexOf('spectre-goal') > standard.indexOf('spectre-create_tasks'));
    assert.ok(
      comprehensive.indexOf('spectre-goal') > comprehensive.indexOf('spectre-task_review'),
    );
    assert.match(plan, /MICRO skips goal-prompt artifacts/);
    assert.match(plan, /goal-prompts\.md/);
    assert.match(plan, /Skill\(spectre-goal\)/);
  }
});

test('workflow handoffs are task-aware, phase-aware, and orchestration-safe', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const readSkill = (rootName, skillName) => fs.readFileSync(
    path.join(repoRoot, 'plugins', rootName, 'skills', skillName, 'SKILL.md'),
    'utf8',
  ).replaceAll('/spectre:', 'spectre-');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const scope = readSkill(rootName, 'spectre-scope');
    const ux = readSkill(rootName, 'spectre-ux');
    const prototype = readSkill(rootName, 'spectre-prototype');
    const plan = readSkill(rootName, 'spectre-plan');
    const createPlan = readSkill(rootName, 'spectre-create_plan');
    const createTasks = readSkill(rootName, 'spectre-create_tasks');
    const execute = readSkill(rootName, 'spectre-execute');
    const validate = readSkill(rootName, 'spectre-validate');
    const proof = readSkill(rootName, 'spectre-proof');
    const clean = readSkill(rootName, 'spectre-clean');
    const shipIt = readSkill(rootName, 'spectre-ship-it');

    const scopeUx = scope.indexOf('journeys, segments, states, copy, or accessibility');
    const scopePrototype = scope.indexOf('interaction/layout/visual validation materially matters');
    const scopeTasks = scope.indexOf('well-understood non-UI work');
    const scopePlan = scope.indexOf('5. Otherwise');
    assert.ok(scopeUx !== -1);
    assert.ok(scopePrototype > scopeUx);
    assert.ok(scopeTasks > scopePrototype);
    assert.ok(scopePlan > scopeTasks);
    assert.match(scope, /Next \(recommended\)/);
    assert.match(scope, /Pause: .*spectre-handoff/);

    assert.match(ux, /Material visual\/interaction assumptions remain/);
    assert.match(ux, /unified tier\/research\/review\/task router/);
    assert.doesNotMatch(ux, /spectre-create_plan.*spectre-create_tasks.*spectre-tdd/);

    for (const mode of ['explore', 'flows-only ux', 'post-ux', 'post-scope', 'standalone']) {
      assert.ok(prototype.includes(`\`${mode}\``));
    }
    assert.match(prototype, /reclassify as `post-scope`/);

    assert.ok(plan.includes('`ux.md` (preferred) or legacy `specs/ux.md`'));
    assert.match(plan, /Next \(recommended\): .*spectre-execute/);
    assert.match(plan, /autonomous execute→proof alternative/);
    assert.match(plan, /spectre-create_tasks.*--orchestrated/);
    assert.match(plan, /spectre-task_review.*--orchestrated/);
    assert.match(plan, /spectre-goal.*--orchestrated/);

    assert.match(createPlan, /Approved LIGHT plan.*spectre-create_tasks/);
    assert.match(createPlan, /Approved STANDARD\/COMPREHENSIVE plan.*spectre-plan_review/);
    assert.match(createTasks, /no adequate UX\/prototype acceptance source/);
    assert.match(createTasks, /--orchestrated.*without user-facing Next Steps/);

    assert.match(execute, /Otherwise → .*spectre-proof/);
    assert.match(execute, /[Pp]roof is explicitly deferred/);
    assert.match(execute, /--orchestrated.*without user-facing Next Steps/);
    assert.match(validate, /Standalone `Complete`.*spectre-proof/);
    assert.match(proof, /Standalone `PASS`.*spectre-ship-it/);
    assert.match(proof, /Never route a non-PASS result to shipping/);

    assert.match(clean, /spectre-prune.*--orchestrated/);
    assert.match(clean, /spectre-test.*--orchestrated/);
    assert.match(clean, /spectre-sweep.*--orchestrated/);
    assert.match(shipIt, /spectre-clean.*--orchestrated/);
    assert.match(shipIt, /spectre-rebase.*--orchestrated/);
    assert.match(shipIt, /spectre-create_pr.*--orchestrated/);
    assert.match(shipIt, /Next \(recommended\): review the PR/);
  }
});

test('workflow documentation matches proof-independent shipping', () => {
  const readme = fs.readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8');

  assert.match(readme, /Each outermost command ends with one task-aware/);
  assert.doesNotMatch(readme, /proof-status reporting/);
  assert.doesNotMatch(readme, /optional proof status/);
  assert.doesNotMatch(readme, /--require-proof/);
});

test('ship-it composes focused skills without a proof prerequisite', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skillPath = path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-ship-it',
      'SKILL.md',
    );
    const skill = fs.readFileSync(skillPath, 'utf8');
    const cleanIndex = skill.indexOf('Skill(spectre-clean)');
    const rebaseIndex = skill.indexOf('Skill(spectre-rebase)');
    const createPrIndex = skill.indexOf('Skill(spectre-create_pr)');

    assert.ok(cleanIndex !== -1);
    assert.ok(rebaseIndex > cleanIndex);
    assert.ok(createPrIndex > rebaseIndex);
    assert.match(skill, /Proof is a separate optional workflow/);
    assert.match(skill, /never a prerequisite/);
    assert.match(skill, /Do not inspect proof artifacts, infer whether proof ran/);
    assert.doesNotMatch(skill, /--require-proof/);
    assert.doesNotMatch(skill, /Skill\(spectre-proof\)/);
    assert.doesNotMatch(skill, /PROOF_JSON/);
  }
});

test('deliver workflows replace quick_dev and ship with scope-aware feature and fix delivery', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skillsRoot = path.join(repoRoot, 'plugins', rootName, 'skills');
    const readSkill = (name) => fs.readFileSync(
      path.join(skillsRoot, name, 'SKILL.md'),
      'utf8',
    );

    assert.equal(fs.existsSync(path.join(skillsRoot, 'spectre-quick_dev')), false);
    assert.equal(fs.existsSync(path.join(skillsRoot, 'spectre-ship')), false);

    const deliver = readSkill('spectre-deliver');
    const aligned = readSkill('spectre-align-and-deliver');
    const scope = readSkill('spectre-scope');
    const fix = readSkill('spectre-fix');
    const fixCore = readSkill('spectre-fix-core');
    const createTasks = readSkill('spectre-create_tasks');
    const codeReview = readSkill('spectre-code_review');
    const validate = readSkill('spectre-validate');
    const createPr = readSkill('spectre-create_pr');
    const shipIt = readSkill('spectre-ship-it');

    for (const skill of [deliver, aligned]) {
      const createTasksIndex = skill.indexOf('Skill(spectre-create_tasks)');
      const executeIndex = skill.indexOf('Skill(spectre-execute)');
      const fixCoreIndex = skill.indexOf('Skill(spectre-fix-core)');
      const cleanIndex = skill.indexOf('Skill(spectre-clean)');
      const rebaseIndex = skill.indexOf('Skill(spectre-rebase)');
      const candidatePinIndex = skill.indexOf('DIFF_SHA256=sha256');
      const finalReviewIndex = skill.lastIndexOf('Skill(spectre-code_review)');
      const finalValidateIndex = skill.lastIndexOf('Skill(spectre-validate)');
      const proofIndex = skill.indexOf('Skill(spectre-proof)');
      const createPrIndex = skill.indexOf('Skill(spectre-create_pr)');

      assert.match(skill, /disable-model-invocation: true/);
      assert.ok(createTasksIndex !== -1);
      assert.ok(executeIndex > createTasksIndex);
      assert.ok(fixCoreIndex !== -1);
      assert.ok(cleanIndex > fixCoreIndex);
      assert.ok(rebaseIndex > cleanIndex);
      assert.ok(candidatePinIndex > rebaseIndex);
      assert.ok(finalReviewIndex > candidatePinIndex);
      assert.ok(finalValidateIndex > finalReviewIndex);
      assert.ok(proofIndex > finalValidateIndex);
      assert.ok(createPrIndex > proofIndex);
      assert.match(skill, /proof aggregate is `PASS` for the exact final candidate tuple/);
      assert.match(skill, /git diff --binary --full-index --no-ext-diff --no-color/);
      assert.match(skill, /collision-safe `QUICK_PLAN_FILE`/);
      assert.match(skill, /Any repair or candidate-affecting mutation restarts this cycle at clean/);
      assert.match(skill, /EXPECTED_BASE_SHA=\{BASE_SHA\}/);
      assert.match(skill, /PR_CANDIDATE_STALE/);
      assert.match(skill, /`--draft`.*`--orchestrated`/s);
      assert.match(skill, /No merge, deploy, release, or public proof publication occurs/);
      assert.match(
        skill,
        /Before any artifact or product write[^\n]*git status --porcelain=v1 --untracked-files=all/,
      );
      assert.match(
        skill,
        /Clean linked worktree:[\s\S]*stay in the current directory[\s\S]*Never create another worktree/,
      );
      assert.match(
        skill,
        /Dirty linked worktree:[\s\S]*create a clean sibling worktree[\s\S]*from committed `HEAD`/,
      );
      assert.match(
        skill,
        /Primary\/local checkout:[\s\S]*create a clean linked worktree[\s\S]*from committed `HEAD`/,
      );
      assert.match(
        skill,
        /Do not stash, reset, commit, copy, or otherwise carry its pre-existing changes/,
      );
      assert.match(skill, /Apply this routing without a confirmation gate/);
      assert.match(skill, /run every child in the selected checkout/);
    }

    assert.doesNotMatch(deliver, /Skill\(spectre-scope\)/);
    assert.match(deliver, /Alignment: inferred/);
    assert.match(aligned, /Skill\(spectre-scope\)/);
    assert.match(aligned, /DELIVERY_ALIGNMENT=one-confirmation/);
    assert.match(aligned, /wait once/i);
    assert.match(aligned, /NEEDS_FULL_SCOPE/);

    assert.match(scope, /DELIVERY_ALIGNMENT=one-confirmation/);
    assert.match(scope, /WAIT exactly once/);
    assert.match(scope, /NEEDS_FULL_SCOPE/);
    assert.match(scope, /Default interactive mode/);
    assert.match(scope, /One-confirmation mode explicitly exempts .* pre-research/);

    assert.match(fix, /disable-model-invocation: true/);
    assert.match(fix, /HoldForApproval/);
    assert.match(fix, /Skill\(spectre-fix-core\)/);
    assert.match(fixCore, /user-invocable: false/);
    assert.match(fixCore, /PARENT_AUTHORIZATION/);
    assert.match(fixCore, /AUTHORIZED_SCOPE_SHA256/);
    assert.match(fixCore, /recomputed SHA-256 equals/);
    assert.match(fixCore, /deliver=inferred.*align-and-deliver=confirmed/);
    assert.match(fixCore, /USER_APPROVED_DIAGNOSIS=true/);
    assert.match(fixCore, /RED-before-GREEN/);

    assert.match(
      createTasks,
      /Default pair:[^\n]*\{FEATURE_ROOT\}\/specs\/execute\.md[^\n]*\{FEATURE_ROOT\}\/specs\/tasks\.json/,
    );
    assert.match(createTasks, /write a scoped pair with the same basename/);
    assert.match(codeReview, /BASE_SHA.*HEAD_SHA.*DIFF_SHA256/);
    assert.match(codeReview, /tuple before dispatch and after report creation/);
    assert.match(validate, /BASE_SHA.*HEAD_SHA.*DIFF_SHA256/);
    assert.match(validate, /tuple in the report/);
    assert.match(createPr, /EXPECTED_BASE_SHA.*EXPECTED_HEAD_SHA.*EXPECTED_DIFF_SHA256/);
    assert.match(createPr, /PR_CANDIDATE_STALE/);
    assert.match(createPr, /performs neither action/);
    assert.match(
      createPr,
      /Only evidence files inside explicit `EVIDENCE_DIRS` may be dirty; any other tracked or untracked change returns `PR_CANDIDATE_STALE`/,
    );

    const pinOpenIndex = createPr.indexOf('**Pin the candidate, then open.**');
    const fetchBeforePinIndex = createPr.indexOf('After the required fetch', pinOpenIndex);
    const verifyBeforePushIndex = createPr.indexOf('verify any expected tuple', fetchBeforePinIndex);
    const pushIndex = createPr.indexOf('git push -u origin', verifyBeforePushIndex);
    const ghCreateIndex = createPr.indexOf('gh pr create --base {PR_BASE}', pushIndex);
    assert.ok(pinOpenIndex !== -1);
    assert.ok(fetchBeforePinIndex > pinOpenIndex);
    assert.ok(verifyBeforePushIndex > fetchBeforePinIndex);
    assert.ok(pushIndex > verifyBeforePushIndex);
    assert.ok(ghCreateIndex > pushIndex);

    assert.match(createPr, /gh pr create --base \{PR_BASE\}/);
    assert.doesNotMatch(createPr, /\(spectre-ship\)/);
    assert.doesNotMatch(shipIt, /\(spectre-ship\)/);
  }

  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  assert.match(readme, /\/spectre:deliver/);
  assert.match(readme, /\/spectre:align-and-deliver/);
  assert.doesNotMatch(readme, /\/spectre:quick_dev/);
  assert.doesNotMatch(readme, /\/spectre:ship(?!-it)/);
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
      claudeModel: 'opus',
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

test('legacy path invariant covers canonical and generated assets after translation', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const inventory = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'test', 'feature-artifact-location', 'legacy-path-allowlist.json'),
      'utf8',
    ),
  );
  const { checkLegacyPathInvariant } = await import(
    '../test/feature-artifact-location/legacy-path-invariant.mjs'
  );
  const result = checkLegacyPathInvariant(repoRoot, inventory);
  const scanned = new Set(result.occurrences.map((occurrence) => occurrence.path));

  assert.ok(
    [...scanned].some((file) => file.startsWith('plugins/spectre/')),
    'canonical plugin occurrences were not scanned',
  );
  assert.ok(
    [...scanned].some((file) => file.startsWith('plugins/spectre-codex/')),
    'generated Codex occurrences were not scanned after translation',
  );
  assert.deepEqual(result.mismatches, []);
});

test('Gate 1 executes the shared occurrence-level legacy path invariant', () => {
  const gate = fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      '.claude',
      'skills',
      'verify-spectre',
      'scripts',
      'gate1_structure.mjs',
    ),
    'utf8',
  );

  assert.match(gate, /legacy-path-invariant\.mjs/);
  assert.match(gate, /checkLegacyPathInvariant/);
  assert.match(gate, /legacy-path-allowlist\.json/);
});

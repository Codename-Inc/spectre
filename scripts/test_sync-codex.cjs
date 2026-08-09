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
      homepage: 'https://github.com/joenandez/spectre#readme',
      repository: {
        type: 'git',
        url: 'git+https://github.com/joenandez/spectre.git',
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
model: claude-sonnet-5-0
---

Write code carefully.
`,
  );
  writeFile(
    path.join(canonicalRoot, 'agents', 'tester.md'),
    `---
name: tester
description: Test specialist.
model: claude-sonnet-5-0
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
Record lifecycle markers with spectre-workflow task start.
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
    'model',
    'model_reasoning_effort',
    'sandbox_mode',
    'developer_instructions',
  ]);
  assert.equal(fields.name, 'spectre_finder');
  assert.equal(fields.description, 'Locate files.');
  assert.equal(fields.model, 'gpt-5.6-terra');
  assert.equal(fields.model_reasoning_effort, 'xhigh');
  assert.equal(fields.sandbox_mode, 'read-only');
  assert.equal(fields.developer_instructions, 'Find relevant files.');
});

test('agent translator maps every supported Claude model to Terra for Codex', () => {
  const cases = [
    ['claude-sonnet-5-0', 'gpt-5.6-terra', 'high'],
    ['claude-opus-5-0', 'gpt-5.6-terra', 'xhigh'],
    ['claude-haiku-4-5-20251001', 'gpt-5.6-terra', 'xhigh'],
  ];

  for (const [claudeModel, codexModel, effort] of cases) {
    const source = `---
name: reviewer
description: Review changes.
model: ${claudeModel}
---

Review carefully.
`;
    const fields = agents.parseToml(agents.buildAgentToml(source, 'reviewer.md'));
    assert.equal(fields.model, codexModel);
    assert.equal(fields.model_reasoning_effort, effort);
  }
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
    assert.equal(agentFields.model, 'gpt-5.6-terra');
    assert.equal(agentFields.model_reasoning_effort, 'high');
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
    assert.match(skill, /node "\$\{PLUGIN_ROOT\}\/hooks\/scripts\/workflow-cli\.mjs" task start/);
    assert.doesNotMatch(skill, /\bspectre-workflow\b/);
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

const readExecuteContract = (repoRoot, rootName) => {
  const skillRoot = path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-execute');
  const referencesRoot = path.join(skillRoot, 'references');
  const references = fs.existsSync(referencesRoot)
    ? fs.readdirSync(referencesRoot)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => fs.readFileSync(path.join(referencesRoot, name), 'utf8'))
    : [];
  return [fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8'), ...references].join('\n');
};

test('spectre-execute preserves affected verification, risk-triggered review routing, and finalization gates', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const contract = readExecuteContract(repoRoot, rootName);
    assert.match(contract, /primary independently runs affected lint\/typecheck\/build/);
    assert.match(contract, /Never run a repository baseline\/root suite/);
    assert.match(contract, /`branch-caused`:[\s\S]*`unrelated`:[\s\S]*`indeterminate`:/);
    assert.match(contract, /Route intermediate review by compounding risk/);
    assert.match(contract, /phase may be reviewed only after all source-owned tasks\/workstreams[\s\S]*`done\|skipped`/);
    assert.match(contract, /completion alone is not a trigger/);
    assert.match(contract, /independently implemented batches converg(?:e|ing) on a shared contract\/consumer/);
    assert.match(contract, /downstream dependency on a changed interface\/state whose defect would compound/);
    assert.match(contract, /auth\/trust, persistence\/migration, concurrency\/order\/retry/);
    assert.match(contract, /concrete wiring\/correctness risk[\s\S]*E2E `Gap\|Adaptation`/);
    assert.match(contract, /Subagent\/wave\/phase completion, agent count, and diff size alone are not triggers/);
    assert.match(contract, /trigger at final completion belongs to `Skill\(spectre-code_review\)`/);
    assert.match(contract, /never run both reviews over the final surface/i);
    assert.match(contract, /Each triggered intermediate or final review runs once/);
    assert.match(contract, /one consolidated root-cause repair pass/);
    assert.match(contract, /Never dispatch a reviewer solely to validate a repair/);
    assert.match(contract, /later risk-triggered intermediate or final review may independently rediscover the issue/);
    assert.match(contract, /there is no global lifetime cap across distinct scheduled reviews/);
    assert.match(contract, /Run only stale or uncovered checks/);
    assert.match(contract, /`IMPLEMENTATION_READY` \+ `ACCEPTANCE_PENDING`/);
    assert.match(contract, /--review-profile final-only/);
    assert.match(contract, /valid only with `--orchestrated --finalization-owner parent`/);
    assert.match(contract, /requires the orchestrating caller to invoke `Skill\(spectre-code_review\)` exactly once/);
    assert.match(contract, /caller owns sequencing, never semantic review/);
    assert.match(contract, /record each verified completed phase as `final-only` without loading review routing or dispatching a reviewer/);
    assert.match(contract, /`FINAL_REVIEW_PENDING`/);
    assert.match(contract, /Skill\(spectre-code_review\)`[^\n]*exactly once, high effort/);
    assert.match(contract, /never (?:rerun or replace|dispatch a reviewer to validate the repair or rerun) the comprehensive review/i);
    assert.match(contract, /Proof is always the last acceptance gate/);
    assert.match(contract, /proof failure gets one behavior-repair pass/);
    assert.doesNotMatch(contract, /focused phase\/boundary review|reopened phases require fresh[\s\S]*phase review/);
    assert.doesNotMatch(contract, /one review per completed phase|send all newly completed phases/);
    assert.doesNotMatch(contract, /Skill\(spectre-create_test_guide\)|Skill\(spectre-validate\)/);
    assert.doesNotMatch(contract, /Dual clean-room review|dispatch two .*reviewer|risk checkpoint/);
    assert.doesNotMatch(contract, /at least 20 minutes/i);
  }
});

test('spectre-code_review is one final high-effort review and keeps launcher timing out of the reviewer prompt', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const skillPaths = [
    path.join(repoRoot, 'plugins', 'spectre', 'skills', 'spectre-code_review', 'SKILL.md'),
    path.join(repoRoot, 'plugins', 'spectre-codex', 'skills', 'spectre-code_review', 'SKILL.md'),
  ];

  for (const skillPath of skillPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.match(skill, /one comprehensive adversarial review/);
    assert.match(skill, /Trigger at the final review boundary/);
    assert.match(skill, /--effort high/);
    assert.match(skill, /Allow up to 20 minutes for completion/);
    assert.match(skill, /Do not pass launcher timeout or duration guidance to the reviewer/);
    assert.match(skill, /no minimum duration/);
    assert.doesNotMatch(skill, /at least 20 minutes|--checkpoint|REVIEW_MODE = checkpoint/i);
    assert.match(skill, /Requirement delivery \/ reachability/);
    assert.match(skill, /Scope \/ dead paths/);
    assert.match(skill, /finding_fingerprint = sha256/);
    assert.match(skill, /invariant_family = sha256/);
    assert.match(skill, /Requirement Delivery Coverage/);
    assert.match(skill, /Scope and Dead-Path Audit/);
    assert.match(skill, /every applicable requirement\/AC has one evidence-backed delivery status/);
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
    const execute = readExecuteContract(repoRoot, rootName).replaceAll('/spectre:', 'spectre-');
    const structuredMode = execute.indexOf('`structured`');
    const planDirectMode = execute.indexOf('`plan-direct`');

    assert.match(
      execute,
      /`structured`:[^\n]*execute index[^\n]*resolvable `tasks\.json`/i,
    );
    assert.match(execute, /`plan-direct`:[^\n]*explicit readable plan/i);
    assert.ok(structuredMode !== -1);
    assert.ok(planDirectMode > structuredMode);
    assert.match(execute, /No path:[^\n]*structured mode at `\{FEATURE_ROOT\}\/specs\/execute\.md`/i);
    assert.doesNotMatch(execute, /default `docs\/tasks\/\{branch\}/i);
    assert.match(execute, /never rewrite, approve, or route it through `spectre-create_tasks`/);
    assert.doesNotMatch(
      execute,
      /Required default artifact:[^\n]*If absent\s*→\s*stop,\s*route to `spectre-create_tasks`/i,
    );
  }
});

test('plan-direct execute preserves source-plan authority without a completeness gate', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const execute = readExecuteContract(repoRoot, rootName).replaceAll('/spectre:', 'spectre-');

    assert.match(execute, /The source plan is the sole requirements authority/);
    assert.match(execute, /Plan-direct starts without a quality\/completeness gate/i);
    assert.match(execute, /Never rewrite it or durably copy its prose/i);
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
    const execute = readExecuteContract(repoRoot, rootName);

    assert.match(execute, /execution_state\.md/);
    for (const section of requiredSections) {
      assert.match(execute, new RegExp(section));
    }
    assert.match(execute, /Before first dispatch, create the complete coarse map/i);
    assert.match(execute, /After every dispatch, gate, review-routing decision, review, or adaptation, update it/i);
    assert.match(execute, /one coarse row per plan-native/i);
    assert.match(execute, /Active Wave[^\n]*only currently dispatchable bounded assignments/i);
    assert.match(execute, /full-byte SHA-256/);
    assert.match(execute, /byte length/);
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
    const execute = readExecuteContract(repoRoot, rootName);
    const codeReview = readSkill('spectre-code_review');
    const validate = readSkill('spectre-validate');
    const proof = readSkill('spectre-prove');

    assert.match(execute, /transient verbatim plan text for only the active workstreams/i);
    assert.match(
      execute,
      /plan-direct passes `PLAN_SOURCE` plus relevant `EXECUTION_STATE` evidence/i,
    );
    assert.match(codeReview, /explicit(?:ly passed)? source-plan path/i);
    assert.match(
      codeReview,
      /explicit(?:ly passed)? source-plan path[^\n]*(?:ahead of|before)[^\n]*`plan\.md`/i,
    );
    assert.match(validate, /explicit arbitrary plan as a requirement source/i);
    assert.match(validate, /plan as authoritative when passed/i);
    assert.match(proof, /explicitly passed source plan[^\n]*acceptance source/i);
    assert.doesNotMatch(execute, /Skill\(spectre-create_test_guide\)/);
  }
});

test('plan-direct goal composition lets execute own proof closure from durable state', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const goal = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-goal', 'SKILL.md'),
      'utf8',
    );
    const executeIndex = goal.indexOf('Skill(spectre-execute)');

    assert.match(goal, /source plan plus (?:its )?`execution_state\.md`/i);
    assert.match(goal, /plan-direct mode from `execution_state\.md`/i);
    assert.match(goal, /invoke `?Skill\(spectre-execute\)`? with the source-plan path/i);
    assert.match(goal, /execute owns single-pass proof invocation plus repair\/reinvoke closure/i);
    assert.match(goal, /require only readable plan\/runtime inputs/i);
    assert.ok(executeIndex !== -1);
    assert.doesNotMatch(goal, /Skill\(spectre-prove\)/);
    assert.doesNotMatch(
      goal,
      /(?:in )?plan-direct mode,?\s+(?:requires?|validates?)[^\n]*(?:complete|approved|reviewed)[^\n]*plan/i,
    );
  }
});

test('prove contract is one reviewed evidence pass without repair or candidate attestation', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    assert.equal(fs.existsSync(path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-proof',
    )), false);
    const skillPath = path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-prove',
      'SKILL.md',
    );
    const skill = fs.readFileSync(skillPath, 'utf8');

    assert.match(skill, /name: "spectre-prove"/);
    assert.match(skill, /# prove/);
    assert.match(skill, /PASS`, `PARTIAL`, `DIAGNOSTIC_ONLY`, or `FAIL/);
    assert.match(skill, /Captured-but-unreviewed media does not count/);
    assert.match(skill, /When assertions and pixels disagree, pixels win/);
    assert.match(skill, /Each invocation is exactly one proof pass/);
    assert.match(skill, /Never modify product\/proof infrastructure/);
    assert.match(skill, /PROOF_RESULT/);
    assert.match(skill, /--profile focused/);
    assert.match(skill, /PROOF_TOOLING_UNAVAILABLE/);
    assert.match(skill, /focused profile records affected rows `PARTIAL`/);
    assert.match(skill, /without research or a user gate/);
    assert.match(skill, /DONE means the pass completed, regardless of aggregate status/);
    assert.match(skill, /proof status alone never gates `(?:\/)?spectre(?::|-)?ship`/);
    assert.doesNotMatch(skill, /Skill\(spectre-tdd\)/);
    assert.doesNotMatch(skill, /@spectre(?::|_)dev/);
    assert.doesNotMatch(skill, /BASE_SHA.*HEAD_SHA.*DIFF_SHA256/);
    assert.doesNotMatch(skill, /PR_CANDIDATE_STALE|CANDIDATE_CHANGED/);
    assert.match(skill, /proof\/proof\.json/);
    assert.match(skill, /proof\/proof\.html/);
    assert.doesNotMatch(skill, /subspace-app-harness/i);
  }
});

test('goal prompts preserve execute-owned proof closure', () => {
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

    assert.match(goal, /goal-prompts\.md/);
    assert.match(goal, /Portable strict/);
    assert.match(goal, /\*\*Outcome\*\*/);
    assert.match(goal, /\*\*Verification\*\*/);
    assert.match(goal, /\*\*Constraints/);
    assert.match(goal, /\*\*Scope/);
    assert.match(goal, /\*\*Iteration\*\*/);
    assert.match(goal, /\*\*Stop\*\*/);
    assert.ok(executeIndex !== -1);
    assert.doesNotMatch(goal, /Skill\(spectre-prove\)/);
    assert.match(goal, /aggregate proof `PASS`/);
    assert.match(goal, /execute DONE explicitly includes aggregate proof `PASS`/);
    assert.match(goal, /transcript/i);
    assert.match(goal, /Structured prompt/);
    assert.match(goal, /Compact prompt/);
    assert.match(goal, /turn cap is a durable checkpoint/);
    assert.match(goal, /resume when the platform permits/);
    assert.doesNotMatch(goal, /stop at the explicit cap/);
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

test('plan surfaces wait-excluded historical guidance with explicit billing semantics', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skillRoot = path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-plan');
    const plan = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const guidance = fs.readFileSync(
      path.join(skillRoot, 'references', 'estimation-guidance.md'),
      'utf8',
    );

    assert.match(plan, /Historical guidance/);
    assert.match(plan, /Execution guidance/);
    assert.match(plan, /never delays or blocks the gate/);
    assert.match(guidance, /Excludes time waiting for your response/);
    assert.match(guidance, /directional \*\*API-equivalent\*\*/);
    assert.match(guidance, /Direct API or per-token billing/);
    assert.match(guidance, /provider\/model/);
    assert.match(guidance, /pricing `as_of` date/);
  }

  assert.ok(!fs.existsSync(
    path.join(repoRoot, '.agents', 'skills', 'spectre-workflow-analysis', 'SKILL.md'),
  ));
  assert.ok(!fs.existsSync(
    path.join(repoRoot, 'plugins', 'spectre', 'skills', 'spectre-workflow-analysis'),
  ));
  assert.ok(!fs.existsSync(
    path.join(repoRoot, 'plugins', 'spectre-codex', 'skills', 'spectre-workflow-analysis'),
  ));
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
    const execute = readExecuteContract(repoRoot, rootName).replaceAll('/spectre:', 'spectre-');
    const validate = readSkill(rootName, 'spectre-validate');
    const proof = readSkill(rootName, 'spectre-prove');
    const clean = readSkill(rootName, 'spectre-clean');
    const ship = readSkill(rootName, 'spectre-ship');

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

    assert.match(execute, /After review dispositions are recorded/);
    assert.match(execute, /Skill\(spectre-prove\)/);
    assert.match(execute, /Proof is always the last acceptance gate/);
    assert.match(execute, /Parent-owned runs[^\n]*without user-facing next steps/i);
    assert.match(validate, /Standalone `Complete`.*spectre-prove/);
    assert.match(proof, /Standalone `PASS`.*spectre-ship/);
    assert.match(proof, /proof status alone never gates .*spectre.*ship/);

    assert.match(clean, /spectre-prune.*--orchestrated/);
    assert.match(clean, /spectre-test.*--orchestrated/);
    assert.match(clean, /spectre-sweep.*--orchestrated/);
    assert.match(ship, /spectre-clean.*--orchestrated/);
    assert.match(ship, /spectre-rebase.*--orchestrated/);
    assert.match(ship, /spectre-create_pr.*--orchestrated/);
    assert.match(ship, /Next \(recommended\): review the PR/);
  }
});

test('workflow documentation matches proof-independent shipping', () => {
  const readme = fs.readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8');
  const shipSection = readme.match(
    /  - `\/spectre:ship`[\s\S]*?(?=\n\n## )/,
  )?.[0];

  assert.match(readme, /every final agent response[^\n]*guides you to what is next/i);
  assert.doesNotMatch(readme, /\/spectre:proof/);
  assert.doesNotMatch(readme, /\/spectre:ship-it/);
  assert.ok(shipSection);
  assert.doesNotMatch(shipSection, /proof-status reporting/);
  assert.doesNotMatch(shipSection, /optional proof status/);
  assert.doesNotMatch(shipSection, /--require-proof/);
});

test('ship composes focused skills without a proof prerequisite', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    assert.equal(fs.existsSync(path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-ship-it',
    )), false);
    const skillPath = path.join(
      repoRoot,
      'plugins',
      rootName,
      'skills',
      'spectre-ship',
      'SKILL.md',
    );
    const skill = fs.readFileSync(skillPath, 'utf8');
    const cleanIndex = skill.indexOf('Skill(spectre-clean)');
    const rebaseIndex = skill.indexOf('Skill(spectre-rebase)');
    const createPrIndex = skill.indexOf('Skill(spectre-create_pr)');

    assert.match(skill, /name: "spectre-ship"/);
    assert.match(skill, /# ship/);
    assert.ok(cleanIndex !== -1);
    assert.ok(rebaseIndex > cleanIndex);
    assert.ok(createPrIndex > rebaseIndex);
    assert.match(skill, /Proof is optional and independent/);
    assert.match(skill, /do not inspect, infer, invoke, or gate on it/);
    assert.doesNotMatch(skill, /--require-proof/);
    assert.doesNotMatch(skill, /Skill\(spectre-prove\)/);
    assert.doesNotMatch(skill, /PROOF_JSON/);
  }
});

test('delegate replaces quick_dev, deliver, and align-and-deliver with compact autonomous delegation', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skillsRoot = path.join(repoRoot, 'plugins', rootName, 'skills');
    const readSkill = (name) => fs.readFileSync(
      path.join(skillsRoot, name, 'SKILL.md'),
      'utf8',
    );

    assert.equal(fs.existsSync(path.join(skillsRoot, 'spectre-quick_dev')), false);
    assert.equal(fs.existsSync(path.join(skillsRoot, 'spectre-ship-it')), false);
    assert.equal(fs.existsSync(path.join(skillsRoot, 'spectre-deliver')), false);
    assert.equal(fs.existsSync(path.join(skillsRoot, 'spectre-align-and-deliver')), false);

    const delegate = readSkill('spectre-delegate');
    const scope = readSkill('spectre-scope');
    const fix = readSkill('spectre-fix');
    const fixCore = readSkill('spectre-fix-core');
    const createTasks = readSkill('spectre-create_tasks');
    const codeReview = readSkill('spectre-code_review');
    const validate = readSkill('spectre-validate');
    const rebase = readSkill('spectre-rebase');
    const createPr = readSkill('spectre-create_pr');
    const ship = readSkill('spectre-ship');
    const clean = readSkill('spectre-clean');
    const testSkill = readSkill('spectre-test');
    const sweep = readSkill('spectre-sweep');

    const executeIndex = delegate.indexOf('Skill(spectre-execute)');
    const fixCoreIndex = delegate.indexOf('Skill(spectre-fix-core)');
    const rebaseIndex = delegate.indexOf('Skill(spectre-rebase)');
    const candidatePinIndex = delegate.indexOf('DIFF_SHA256=sha256');
    const codeReviewIndex = delegate.indexOf('Skill(spectre-code_review)', candidatePinIndex);
    const proofIndex = delegate.indexOf('Skill(spectre-prove)');
    const createPrIndex = delegate.indexOf('Skill(spectre-create_pr)');

    assert.match(delegate, /disable-model-invocation: true/);
    assert.match(delegate, /name: "spectre-delegate"/);
    assert.match(delegate, /# delegate/);
    assert.match(delegate, /Delegate one small, unambiguous feature or reproducible bug fix to Spectre's autonomous/);
    assert.ok(executeIndex !== -1);
    assert.ok(fixCoreIndex !== -1);
    assert.ok(rebaseIndex > fixCoreIndex);
    assert.ok(candidatePinIndex > rebaseIndex);
    assert.ok(codeReviewIndex > candidatePinIndex);
    assert.ok(proofIndex > codeReviewIndex);
    assert.ok(createPrIndex > proofIndex);
    assert.match(delegate, /Mini eligibility/);
    assert.match(delegate, /(?:at most two|≤2) dependency-safe workstreams/);
    assert.match(delegate, /--finalization-owner parent/);
    assert.match(delegate, /--review-profile final-only/);
    assert.match(delegate, /plan-direct mode/);
    assert.match(delegate, /RED.before-GREEN TDD/);
    assert.match(delegate, /`IMPLEMENTATION_READY` \+ `ACCEPTANCE_PENDING`/);
    assert.match(delegate, /`ACCEPTANCE_PENDING` \+ `FINAL_REVIEW_PENDING`/);
    assert.match(delegate, /git diff --check/);
    assert.match(delegate, /--verification-owner parent/);
    assert.match(delegate, /Pin and run the final adversarial review/);
    assert.match(delegate, /Do not invoke review until every implementation workstream\/task is complete and current affected checks exist/);
    assert.match(delegate, /Skill\(spectre-code_review\)` exactly once/);
    assert.match(delegate, /external-first contract owns opposite-runtime selection/);
    assert.match(delegate, /native fallback only with its recorded reason/);
    assert.match(delegate, /reviewer runtime\/model\/effort\/route/);
    assert.doesNotMatch(delegate, /@(?:spectre:|spectre_)?reviewer/);
    assert.match(delegate, /Skill\(spectre-prove\)[\s\S]*--profile focused/);
    assert.match(delegate, /Only after review findings are dispositioned and affected checks are current/);
    assert.match(delegate, /≤1 consolidated repair pass/);
    assert.match(delegate, /≤1 behavior-repair pass/);
    assert.match(delegate, /Never rerun or validate the review/);
    assert.match(delegate, /Never rerun the code review/);
    assert.match(delegate, /rerun affected checks, commit repair residue[\s\S]*rerun affected checks, commit repair residue/);
    assert.match(delegate, /reprove only failed\/impact-linked rows/);
    assert.doesNotMatch(delegate, /review(?:er)? asynchronously|review and prove concurrently/i);
    assert.match(delegate, /CI: pending/);
    assert.match(delegate, /VERIFICATION_SUMMARY/);
    assert.match(delegate, /no root-suite run/);
    assert.match(delegate, /git diff --binary --full-index --no-ext-diff --no-color/);
    assert.match(delegate, /collision-safe `QUICK_PLAN_FILE`/i);
    assert.match(delegate, /EXPECTED_BASE_SHA=\{BASE_SHA\}/);
    assert.match(delegate, /PR_CANDIDATE_STALE/);
    assert.match(delegate, /refresh the tuple and retry without a cap/);
    assert.match(delegate, /`--draft`.*`--orchestrated`/s);
    assert.match(delegate, /Non-green status[\s\S]*does not alone prevent a draft PR/);
    assert.match(delegate, /No root suite, cleanup meta-flow, merge, deploy, release, or public proof publication/);
    assert.doesNotMatch(delegate, /Skill\(spectre-create_tasks\)/);
    assert.doesNotMatch(delegate, /Skill\(spectre-clean\)/);
    assert.doesNotMatch(delegate, /Skill\(spectre-test\)/);
    assert.doesNotMatch(delegate, /Skill\(spectre-sweep\)/);
    assert.doesNotMatch(delegate, /Skill\(spectre-prune\)/);
    assert.doesNotMatch(delegate, /Skill\(spectre-validate\)/);
    assert.doesNotMatch(delegate, /repository-authoritative root suite/);
    assert.match(
      delegate,
      /Before any artifact or product write[^\n]*git status --porcelain=v1 --untracked-files=all/,
    );
    assert.match(delegate, /A clean linked worktree stays in place/);
    assert.match(delegate, /dirty linked worktree or any primary\/local checkout[\s\S]*clean sibling worktree[\s\S]*from committed `HEAD`/);
    assert.match(delegate, /never stash, reset, commit, copy, or carry pre-existing changes/);
    assert.match(delegate, /Route without confirmation/);
    assert.match(delegate, /run every child in the selected checkout/);

    assert.match(rebase, /--verification-owner parent/);
    assert.match(rebase, /REBASE_READY/);
    assert.match(rebase, /verification: PARENT_OWNED/);
    assert.match(rebase, /do not run lint or tests/);
    assert.match(rebase, /plain `--orchestrated` does not transfer ownership/i);
    assert.match(rebase, /not a precondition for PR creation/);
    assert.match(rebase, /never return a blocker solely because verification is red/);

    assert.doesNotMatch(delegate, /Skill\(spectre-scope\)/);
    assert.match(delegate, /Alignment: inferred/);
    assert.doesNotMatch(scope, /DELIVERY_ALIGNMENT=one-confirmation/);
    assert.doesNotMatch(scope, /NEEDS_FULL_SCOPE/);

    assert.match(fix, /disable-model-invocation: true/);
    assert.match(fix, /HoldForApproval/);
    assert.match(fix, /Skill\(spectre-fix-core\)/);
    assert.match(fix, /experience contract first in product language/);
    assert.match(fix, /what users do and observe now, what they will do and observe after repair/);
    assert.match(fix, /preserved invariants, and disclosed collateral changes/);
    assert.match(fix, /USER_APPROVED_FIX_CONTRACT=true/);
    assert.match(fixCore, /user-invocable: false/);
    assert.match(fixCore, /PARENT_AUTHORIZATION/);
    assert.match(fixCore, /AUTHORIZED_SCOPE_SHA256/);
    assert.match(fixCore, /recomputed SHA-256 equals/);
    assert.match(fixCore, /alignment mode is `inferred`/);
    assert.match(fixCore, /PARENT=spectre-delegate/);
    assert.doesNotMatch(fixCore, /spectre-deliver/);
    assert.doesNotMatch(fixCore, /align-and-deliver/);
    assert.match(fixCore, /USER_APPROVED_FIX_CONTRACT=true/);
    assert.doesNotMatch(fixCore, /USER_APPROVED_DIAGNOSIS=true/);
    assert.match(fixCore, /Explore product \+ technical impact/);
    assert.match(fixCore, /dispatch ≥1 independent read-only/);
    assert.match(fixCore, /parallelize separable product journeys or technical boundaries/);
    assert.match(fixCore, /user\/operator-observable outcomes/);
    assert.match(
      fixCore,
      /journey\/surface.*current experience.*expected experience.*technical path\/consumer.*intended-change\|preserved-invariant\|collateral-change\|unresolved/,
    );
    assert.match(fixCore, /new or changed experience-contract row or repair boundary returns to authorization/i);
    assert.match(fixCore, /RED-before-GREEN/);
    assert.match(fixCore, /A red repository-wide baseline never blocks/);
    assert.match(fixCore, /Never escalate for unrelated red checks/);
    assert.doesNotMatch(fixCore, /deterministic checks remain red/);

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
    assert.match(createPr, /VERIFICATION_SUMMARY/);
    assert.match(createPr, /Never turn non-green advisory verification into a claimed pass/);
    assert.match(createPr, /PR_CANDIDATE_STALE/);
    assert.match(createPr, /performs neither action/);
    assert.match(
      createPr,
      /Only evidence files inside explicit `EVIDENCE_DIRS` may be dirty; any other tracked or untracked change returns `PR_CANDIDATE_STALE`/,
    );

    const pinOpenIndex = createPr.indexOf('**Pin the candidate, then open as draft.**');
    const fetchBeforePinIndex = createPr.indexOf('After the required fetch', pinOpenIndex);
    const verifyBeforePushIndex = createPr.indexOf('verify any expected tuple', fetchBeforePinIndex);
    const pushIndex = createPr.indexOf('git push -u origin', verifyBeforePushIndex);
    const ghCreateIndex = createPr.indexOf('gh pr create --base {PR_BASE}', pushIndex);
    assert.ok(pinOpenIndex !== -1);
    assert.ok(fetchBeforePinIndex > pinOpenIndex);
    assert.ok(verifyBeforePushIndex > fetchBeforePinIndex);
    assert.ok(pushIndex > verifyBeforePushIndex);
    assert.ok(ghCreateIndex > pushIndex);

    assert.match(createPr, /gh pr create --base \{PR_BASE\}[^\n]*--draft/);
    assert.match(createPr, /This skill never opens a ready-for-review PR/);
    assert.doesNotMatch(createPr, /--draft` when requested|--draft` if requested/);
    assert.match(ship, /Observe the full suite once/);
    assert.match(ship, /do not duplicate package suites or run a baseline suite/);
    assert.match(ship, /Do not rerun the full suite after repairs/);
    assert.match(ship, /Verification status is evidence, never a stop condition/);
    assert.match(ship, /PR_OPENED/);
    assert.match(ship, /CI: pending/);
    assert.match(ship, /PR_CANDIDATE_STALE/);
    assert.match(ship, /Never escalate solely for test\/lint\/type\/build failures/);
    assert.match(testSkill, /Never run a repository-wide baseline or full suite from this skill/);
    assert.match(testSkill, /Branch-caused → repair\/reverify/);
    assert.match(testSkill, /other findings are routed without stopping/);
    assert.match(sweep, /Never run a repository-wide baseline or full suite/);
    assert.match(sweep, /ordinary lint\/test failures remain in repair flow/);
    assert.match(clean, /Ordinary test\/lint\/build failures never produce it/);
    assert.match(clean, /repairable findings remain with the owning child/);
    assert.doesNotMatch(createPr, /\(spectre-ship\)/);
    assert.doesNotMatch(ship, /\(spectre-ship\)/);
  }

  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  assert.match(readme, /\/spectre:delegate/);
  assert.doesNotMatch(readme, /\/spectre:deliver/);
  assert.doesNotMatch(readme, /\/spectre:align-and-deliver/);
  assert.doesNotMatch(readme, /\/spectre:quick_dev/);
  assert.match(readme, /\/spectre:ship/);
  assert.doesNotMatch(readme, /\/spectre:ship-it/);
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
        assert.match(skill, /one report-only repair attempt/);
        assert.match(skill, /focused post-check/);
        assert.match(skill, /Completed-review hard stop/);
        assert.match(skill, /--review-again/);
        assert.match(skill, /task_review_attempt\.json/);
        assert.match(skill, /MUST NOT run its `impact` operation/);
        assert.match(skill, /Adversarial mode:.*does not delegate/);
        assert.match(skill, /Allow up to 20 minutes for completion/);
        assert.match(skill, /Do not pass launcher timeout or duration guidance to the reviewer/);
        assert.doesNotMatch(skill, /at least 20 minutes|do not stop early/i);
      }
    }
  }
});

test('plan review restores simplification and the Test Opportunity speed budget', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skill = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-plan_review', 'SKILL.md'),
      'utf8',
    );

    assert.match(skill, /Plan-only simplification gate/);
    assert.match(skill, /simplest path that delivers every agreed requirement/);
    assert.match(
      skill,
      /A Test Opportunity is the smallest behavior unit: a function, route, bug fix, or acceptance criterion/,
    );
    assert.match(
      skill,
      /exactly one representative happy-path test and one representative primary-failure test — then stop/,
    );
    assert.match(skill, /Do not manufacture extra opportunities solely from files, layers, tasks/);
    assert.match(skill, /Anti-expansion guardrail/);
    assert.match(skill, /this review is simplification-only/);
    assert.match(skill, /High.*scope-safe over-engineering/);
    assert.match(skill, /No scope-safe deletion found.*valid only with requirement\/necessity traceability/);
    assert.match(skill, /plan\.md` carries the accepted Test Opportunity inventory/);
    assert.doesNotMatch(skill, /dispatch one independent subagent per review lens/i);
    assert.doesNotMatch(skill, /Completed-review hard stop/i);
    assert.doesNotMatch(skill, /--review-again/);
    assert.doesNotMatch(skill, /plan_review_attempt\.json/);
    assert.doesNotMatch(skill, /round_status/);
    assert.doesNotMatch(skill, /--mode adversarial|--mode full/);
  }
});

test('planning artifacts have one primary writer and reviewers only return findings', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const readSkill = (skillName) =>
      fs.readFileSync(
        path.join(repoRoot, 'plugins', rootName, 'skills', skillName, 'SKILL.md'),
        'utf8',
      );
    const plan = readSkill('spectre-plan');
    const createPlan = readSkill('spectre-create_plan');
    const createTasks = readSkill('spectre-create_tasks');
    const planReview = readSkill('spectre-plan_review');
    const taskReview = readSkill('spectre-task_review');
    const codeReview = readSkill('spectre-code_review');

    assert.match(plan, /primary planning agent owns synthesis and directly writes every planning artifact/i);
    assert.match(plan, /Skill invocation loads procedure into that same primary; it does not transfer ownership/i);
    assert.match(plan, /Research agents return evidence only and never write planning artifacts/i);
    assert.doesNotMatch(plan, /never write `plan\.md`, `execute\.md`, or `tasks\.json` content yourself/i);

    assert.match(createPlan, /primary directly writes `plan\.md`/i);
    assert.match(createPlan, /Research agents return evidence only/i);
    assert.match(createPlan, /at every depth, reuse an existing substantive `## Technical Research` section/i);
    assert.match(createPlan, /orchestrated `spectre-plan` call never launches replacement research agents/i);
    assert.match(createTasks, /primary directly writes `execute\.md` and `tasks\.json`/i);
    assert.match(createTasks, /Research agents return evidence only/i);

    assert.match(planReview, /reviewer may write only `REVIEW_REPORT`/i);
    assert.match(planReview, /primary directly edits `plan\.md`/i);
    assert.match(planReview, /never dispatch a subagent or external reviewer to apply findings/i);
    assert.match(planReview, /Mechanical report corrections/i);
    assert.match(planReview, /do not change semantic judgment/i);
    assert.doesNotMatch(planReview, /allowedTools "[^"]*Task/);

    assert.match(taskReview, /primary directly edits `TASKS_JSON` and affected `EXECUTE_INDEX` rows/i);
    assert.match(taskReview, /never dispatch a subagent or external reviewer to apply findings/i);
    assert.match(taskReview, /primary first makes any verified mechanical corrections/i);
    assert.match(taskReview, /do not change semantic judgment/i);
    assert.match(taskReview, /Primary-agent semantic self-review is prohibited/i);

    assert.match(codeReview, /primary directly corrects only verified mechanical defects/i);
    assert.match(codeReview, /do not change semantic judgment/i);
    assert.match(codeReview, /Primary-agent semantic self-review is prohibited/i);
  }
});

test('code review is adversarial and self-finalizing execute delegates the final review gate', () => {
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

    const execute = readExecuteContract(repoRoot, rootName);
    assert.match(execute, /## Finalization/);
    assert.match(execute, /Default owner: `self`/);
    assert.match(execute, /Skill\(spectre-code_review\)/);
    assert.doesNotMatch(execute, /Skill\(spectre-validate\)/);
    assert.doesNotMatch(execute, /Dispatch multi-lens clean-room review/);
  }
});

test('public release invocation requires only release-notes approval', () => {
  const release = fs.readFileSync(
    path.resolve(__dirname, '..', '.agents', 'skills', 'release', 'SKILL.md'),
    'utf8',
  );

  assert.match(release, /valid public invocation authorizes the resolved version bump, commits, local tag creation, pushes, and GitHub release publication/i);
  assert.match(release, /release-notes approval[\s\S]*only user approval gate/i);
  assert.match(release, /Resolve and report `current -> next`; continue without a confirmation gate/);
  assert.match(release, /After changelog approval, create `vX\.Y\.Z` and run/);
  assert.doesNotMatch(release, /confirm `current -> next` with the user/i);
  assert.doesNotMatch(release, /then ask before running/i);
});

'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
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

function repositoryTokenCount(repoRoot, filePath) {
  const output = execFileSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'count-tokens.js'), filePath],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const match = output.match(/^Tokens: ([\d,]+)$/m);
  assert.ok(match, `missing exact token count for ${filePath}`);
  return Number(match[1].replaceAll(',', ''));
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
model: claude-sonnet-5
---

Write code carefully.
`,
  );
  writeFile(
    path.join(canonicalRoot, 'agents', 'tester.md'),
    `---
name: tester
description: Test specialist.
model: claude-sonnet-5
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

test('agent translator replaces Luna with Terra while preserving the Sol reviewer tier', () => {
  const cases = [
    ['claude-sonnet-5', 'gpt-5.6-terra', 'high'],
    ['claude-opus-5', 'gpt-5.6-sol', 'xhigh'],
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
    assert.doesNotMatch(skill, /Codex Agent Preflight|ensure-codex-agents\.mjs|start a new Codex session before dispatching/);
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

test('spectre-code_review is one final falsification-first review with launcher-only timing', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const skillPaths = [
    path.join(repoRoot, 'plugins', 'spectre', 'skills', 'spectre-code_review', 'SKILL.md'),
    path.join(repoRoot, 'plugins', 'spectre-codex', 'skills', 'spectre-code_review', 'SKILL.md'),
  ];

  for (const skillPath of skillPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.match(skill, /final adversarial review/);
    assert.match(skill, /final boundary to falsify correctness, safety, production readiness, and requirement delivery/);
    assert.match(skill, /Try to prove the work wrong, unsafe, unreachable, or unable to meet requirements/);
    assert.match(skill, /Falsify; do not confirm/);
    assert.match(skill, /Actively seek counterexamples, broken invariants, failure paths, false-positive tests, unreachable outcomes/);
    assert.match(skill, /--effort high/);
    assert.match(skill, /20-minute launcher-side poll limit/);
    assert.match(skill, /do not pass duration guidance to the reviewer/i);
    assert.match(skill, /Quiet output is not failure/);
    assert.match(skill, /A usable review ends semantic review/);
    assert.doesNotMatch(skill, /at least 20 minutes|--checkpoint|REVIEW_MODE = checkpoint/i);
    assert.match(skill, /requirement reachability/i);
    assert.match(skill, /scope\/dead paths/i);
    assert.match(skill, /finding_fingerprint\s*=\s*sha256/);
    assert.match(skill, /invariant_family\s*=\s*sha256/);
    assert.match(skill, /Requirement Delivery Coverage/);
    assert.match(skill, /Scope and Dead-Path Audit/);
    assert.match(skill, /every requirement\/AC has one evidence-backed status/);
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
    assert.match(execute, /must carry its seven spine sections/i);
    assert.match(execute, /Legacy unmarked plans start without a quality\/completeness gate/i);
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
    assert.match(
      goal,
      /first action[^\n]*invoke and follow `Skill\(spectre-execute\)`:[^\n]*plan-direct mode passes the source-plan path/i,
    );
    assert.match(goal, /execute owns single-pass proof invocation plus repair\/reinvoke closure/i);
    assert.match(goal, /only readable plan\/runtime inputs/i);
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
    const promptTemplate = goal.match(/```markdown\n([\s\S]*?)\n```/)?.[1] || '';
    const requiredSections = [
      '## Outcome',
      '## Verification',
      '## Constraints (must not)',
      '## Scope',
      '## Iteration',
      '## Stop',
    ];

    assert.match(goal, /goal-prompts\.md/);
    assert.match(goal, /contains exactly one copy-ready goal prompt/);
    assert.match(goal, /no title, preamble, manifest, selection note, rationale, or compact alternative/i);
    assert.ok(promptTemplate.startsWith('/goal '));
    for (const section of requiredSections) {
      assert.match(promptTemplate, new RegExp(`\\n\\n${section.replace(/[()]/g, '\\$&')}\\n\\n`));
    }
    for (let i = 1; i < requiredSections.length; i += 1) {
      assert.ok(promptTemplate.indexOf(requiredSections[i]) > promptTemplate.indexOf(requiredSections[i - 1]));
    }
    assert.ok(executeIndex !== -1);
    assert.match(
      promptTemplate,
      /^\/goal [^\n]*First action: YOU MUST invoke Skill\(spectre-execute\)[^\n]*--orchestrated[^\n]*follow its loaded contract through DONE/i,
    );
    assert.match(promptTemplate, /Do not implement directly or substitute another workflow\./);
    assert.doesNotMatch(goal, /Skill\(spectre-prove\)/);
    assert.match(goal, /aggregate proof `PASS`/);
    assert.match(promptTemplate, /through DONE, including aggregate proof PASS/);
    assert.match(goal, /transcript/i);
    assert.doesNotMatch(goal, /Portable strict|Structured prompt|Compact prompt/);
    assert.match(goal, /cap or visible 40-turn default is a durable checkpoint/);
    assert.match(goal, /resume when the platform permits/);
    assert.doesNotMatch(goal, /stop at the explicit cap/);
    assert.doesNotMatch(goal, /execute-only/i);
  }
});

test('Plan and Execute emit one non-authoritative calibration lifecycle', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const normalize = (value) => value
    .replaceAll('/spectre:', 'spectre-')
    .replace(/node "\$\{PLUGIN_ROOT\}\/hooks\/scripts\/workflow-cli\.mjs"/g, 'spectre-workflow');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const plan = normalize(fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-plan', 'SKILL.md'),
      'utf8',
    ));
    const execute = normalize(readExecuteContract(repoRoot, rootName));
    const executeTelemetry = normalize(fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-execute', 'references', 'telemetry.md'),
      'utf8',
    ));

    const initialRoute = plan.indexOf('Skill(spectre-plan-route)` in `initial` mode');
    const planStart = plan.indexOf('spectre-workflow plan start');
    const observedRoute = plan.indexOf('Skill(spectre-plan-route)` in `observed` mode');
    const reclassified = plan.indexOf('plan.reclassified');
    assert.ok(initialRoute !== -1 && planStart > initialRoute);
    assert.ok(observedRoute > planStart && reclassified > observedRoute);
    for (const eventType of [
      'plan.started',
      'plan.reclassified',
      'plan.review_completed',
      'plan.gate_completed',
      'plan.completed',
    ]) assert.match(plan, new RegExp(eventType.replace('.', '\\.')));
    assert.match(plan, /probe flags|probe_used/);
    assert.match(plan, /review yield/i);
    assert.match(plan, /artifact hashes|artifact_hashes/);
    assert.match(plan, /planning elapsed|planning_elapsed_ms/);
    assert.match(plan, /telemetry failure[^\n]*(?:continue|never blocks|degraded)/i);

    assert.match(execute, /plan\.execution_outcome/);
    assert.match(executeTelemetry, /matching `plan\.completed` event[^\n]*feature root[^\n]*(?:artifact|source) hash/i);
    assert.match(executeTelemetry, /only after authoritative execution status/i);
    assert.match(executeTelemetry, /workstream[^\n]*task[^\n]*wave count/i);
    assert.match(executeTelemetry, /proof[^\n]*review result/i);
    assert.match(executeTelemetry, /planning-surprise codes/i);
    assert.match(executeTelemetry, /verification, review, proof, and completion authority remain unchanged/i);
    assert.match(executeTelemetry, /telemetry failure[^\n]*degraded[^\n]*never blocks/i);
  }
});

test('Plan router keeps one-owner skill orchestration direct after a locator probe', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const fixtureRoot = path.join(
    repoRoot,
    'test',
    'fixtures',
    'plan-router',
    'owner-skill-orchestration',
  );
  const scope = fs.readFileSync(path.join(fixtureRoot, 'scope.md'), 'utf8');
  const observations = fs.readFileSync(path.join(fixtureRoot, 'observations.md'), 'utf8');
  const oracle = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'oracle.json'), 'utf8'));
  const modelVisibleFixture = `${scope}\n${observations}`;

  assert.doesNotMatch(
    modelVisibleFixture,
    /\b(?:XS_DIRECT|S_DIRECT|M_REVIEWED_DIRECT|L_STRUCTURED|XL_REVIEWED_STRUCTURED)\b/,
  );
  assert.deepEqual(
    {
      shape: oracle.shape,
      uncertainty: oracle.uncertainty,
      evidence: oracle.evidence,
      task_graph_risk: oracle.task_graph_risk,
      design_authority_required: oracle.design_authority_required,
      size: oracle.size,
      route: oracle.route,
      probe_count: oracle.probe_count,
    },
    {
      shape: 'DIRECT',
      uncertainty: 'LOW',
      evidence: 'PROBED',
      task_graph_risk: 'LOW',
      design_authority_required: false,
      size: 'S',
      route: 'S_DIRECT',
      probe_count: 1,
    },
  );

  for (const rootName of ['spectre', 'spectre-codex']) {
    const route = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-plan-route', 'SKILL.md'),
      'utf8',
    );
    assert.match(route, /STRUCTURED requires multiple independently implementable workstreams/i);
    assert.match(route, /dependencies.*workflow\/acceptance steps.*pilots are not workstreams/i);
    assert.match(route, /HIGH graph risk requires a credible implementation ordering\/coordination\/rollback failure/i);
    assert.match(route, /workflow gates\/state transitions do not qualify/i);
    assert.match(route, /Honor confirmed Scope assumptions/i);
    assert.match(route, /Missing paths\/evidence permit at most the one probe/i);
    assert.match(route, /only unresolved, approach-changing uncertainty affects size/i);
    assert.match(route, /size and routine placement never create it/i);
    assert.match(route, /Never use.*dependency count.*size authority/i);
  }
});

test('Plan delegates one semantic XS-S-M-L-XL classifier and keeps orchestration authority', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const planPath = path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-plan', 'SKILL.md');
    const routePath = path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-plan-route', 'SKILL.md');
    assert.ok(fs.existsSync(routePath), `${rootName} must contain spectre-plan-route`);
    const plan = fs.readFileSync(planPath, 'utf8');
    const route = fs.readFileSync(routePath, 'utf8');
    const routeCalls = plan.match(/Skill\(spectre-plan-route\)/g) || [];

    assert.match(route, /user-invocable: false/);
    assert.match(route, /plan-routing\/v1/);
    for (const field of [
      'shape', 'uncertainty', 'evidence', 'protected_boundaries', 'task_graph_risk',
      'design_authority_required', 'size', 'route', 'rationale',
    ]) assert.match(route, new RegExp(`\\b${field}\\b`));
    for (const size of ['XS', 'S', 'M', 'L', 'XL']) assert.match(route, new RegExp(`\\b${size}\\b`));
    assert.match(route, /ATOMIC[^\n]*LOW[^\n]*XS/);
    assert.match(route, /ATOMIC[^\n]*LOW[^\n]*changed protected boundary[^\n]*OR[^\n]*DIRECT[^\n]*LOW[^\n]*S/);
    assert.match(route, /ATOMIC\/DIRECT[^\n]*MODERATE\/HIGH[^\n]*M/);
    assert.match(route, /STRUCTURED[^\n]*LOW\/MODERATE[^\n]*L/);
    assert.match(route, /STRUCTURED[^\n]*(?:HIGH uncertainty|HIGH task-graph risk)[^\n]*XL/);
    assert.match(route, /threatened_invariant/);
    assert.match(route, /failure_mode/);
    assert.match(route, /floors size at S/);
    assert.match(route, /never creates structure or HIGH graph risk/);
    assert.match(route, /exactly one bounded probe/);
    assert.match(route, /Honor confirmed Scope assumptions/i);
    assert.match(route, /KEEP\|RERUN_SMALLER\|RERUN_LARGER/);
    assert.match(route, /Never plan, write artifacts, emit telemetry, or present gates/i);

    assert.equal(routeCalls.length, 2);
    assert.doesNotMatch(plan, /ATOMIC[^\n]*LOW[^\n]*XS/);
    assert.doesNotMatch(plan, /≤1-file|≤5 files|Hard-stops:|automatic COMPREHENSIVE/i);
    assert.doesNotMatch(route, /≤1-file|≤5 files|Hard-stops:|automatic COMPREHENSIVE/i);
    assert.match(plan, /immutable canonical scope/i);
    assert.match(plan, /design-authority gate/i);
    assert.match(plan, /final pre-code approval/i);
    assert.match(plan, /every size/i);
    assert.match(plan, /one plan-review pipeline/i);
    assert.match(plan, /XL[^\n]*spectre-task_review[^\n]*--finalize-index[^\n]*validate-pair[^\n]*spectre-goal/);
    assert.match(plan, /goal-prompts\.md/);
    assert.match(plan, /Skill\(spectre-goal\)/);
    assert.match(plan, /Research agents return evidence only/i);
    assert.match(plan, /reviewer write surfaces/i);
    assert.match(plan, /never silently rerun/i);
    assert.match(plan, /final planning artifact step.*after any review/i);
    assert.match(plan, /DONE when/i);

    assert.ok(repositoryTokenCount(repoRoot, planPath) < 2000);
    assert.ok(repositoryTokenCount(repoRoot, routePath) < 2000);
  }
});

test('public guidance and compatibility preserve one adaptive XS-S-M-L-XL route', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const legacyPairs = [
    ['MICRO', 'XS'],
    ['LIGHT', 'S'],
    ['STANDARD-DIRECT', 'M'],
    ['STANDARD', 'L'],
    ['COMPREHENSIVE', 'XL'],
  ];

  assert.match(readme, /All feature work enters through Scope[^\n]*adaptive Plan/i);
  assert.match(readme, /bugs?[^\n]*spectre:fix/i);
  assert.match(readme, /XS[^\n]*S[^\n]*M[^\n]*L[^\n]*XL/);
  assert.match(readme, /durable[^\n]*artifact/i);
  assert.match(readme, /Wait for your explicit approval before any code changes/i);
  assert.doesNotMatch(readme, /unless the feature is a one line ask/i);
  assert.doesNotMatch(readme, /Tiny or Small[^\n]*prefer[^\n]*(?:Claude Code|Codex)[^\n]*plan mode/i);
  assert.doesNotMatch(readme, /for small, unambiguous features[^\n]*spectre:delegate/i);
  assert.doesNotMatch(readme, /for COMPREHENSIVE plans/i);

  for (const rootName of ['spectre', 'spectre-codex']) {
    const root = path.join(repoRoot, 'plugins', rootName);
    const routePath = path.join(root, 'skills', 'spectre-plan-route', 'SKILL.md');
    const route = fs.readFileSync(routePath, 'utf8');
    const decisionTable = route.match(/\| Semantic result \| Size · route \|[\s\S]*?(?=\n\n- )/)?.[0] || '';
    const telemetry = fs.readFileSync(
      path.join(root, 'hooks', 'scripts', 'workflow', 'plan-telemetry.mjs'),
      'utf8',
    );
    const goal = fs.readFileSync(
      path.join(root, 'skills', 'spectre-goal', 'SKILL.md'),
      'utf8',
    );

    assert.match(route, /Resume-only legacy size/i);
    for (const [legacy, canonical] of legacyPairs) {
      assert.match(route, new RegExp(legacy.replace('-', '\\-') + '→' + canonical));
      assert.match(
        telemetry,
        new RegExp("\\['" + legacy.replace('-', '\\-') + "', '" + canonical + "'\\]"),
      );
    }
    assert.doesNotMatch(decisionTable, /MICRO|LIGHT|STANDARD-DIRECT|COMPREHENSIVE/);
    assert.doesNotMatch(telemetry, /ATOMIC\s*\+\s*LOW|STRUCTURED\s*\+\s*HIGH|Semantic result/);
    assert.match(goal, /XL also requires completed task review/i);
    assert.doesNotMatch(goal, /COMPREHENSIVE also requires completed task review/i);
    assert.ok(repositoryTokenCount(repoRoot, routePath) < 2000);
    assert.ok(repositoryTokenCount(
      repoRoot,
      path.join(root, 'skills', 'spectre-plan', 'SKILL.md'),
    ) < 2000);
  }
});

test('plan surfaces time-only planning and implementation estimates', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skillRoot = path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-plan');
    const plan = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const guidance = fs.readFileSync(
      path.join(skillRoot, 'references', 'estimation-guidance.md'),
      'utf8',
    );

    assert.match(plan, /Estimated remaining planning time/);
    assert.match(plan, /Estimated implementation time/);
    assert.doesNotMatch(plan, /Execution guidance/);
    assert.match(plan, /never delays or blocks the gate/);
    assert.doesNotMatch(plan, /Historical guidance/);
    assert.doesNotMatch(plan, /API-equivalent/);
    assert.doesNotMatch(guidance, /API-equivalent|processed tokens|Typical full .* expenditure/);
    assert.match(guidance, /design-authority gate/i);
    assert.match(guidance, /final pre-code approval gate/i);
    assert.match(guidance, /L[\s\S]*STANDARD legacy analog/i);
    assert.match(guidance, /XL[\s\S]*COMPREHENSIVE legacy analog/i);
    assert.match(guidance, /XS, S, and M[\s\S]*no shipped seed analog/i);
    assert.doesNotMatch(guidance, /two STANDARD\/COMPREHENSIVE user gates/i);
    assert.doesNotMatch(guidance, /tier-compatible Plan estimate/i);

    const gate1 = guidance.match(
      /## Gate 1 — Remaining planning time([\s\S]*?)## Gate 2 — Implementation time estimate/,
    )?.[1] || '';
    assert.match(
      gate1,
      /\*\*Estimated remaining planning time: about \{rounded duration or range\}, based on completed plans of similar scope\.\*\*/,
    );
    assert.match(gate1, /excludes time waiting for the user's response/);
    assert.doesNotMatch(gate1, /Historical guidance|confidence|tokens|monetary|billing|unavailable/);

    const gate2 = guidance.match(
      /## Gate 2 — Implementation time estimate([\s\S]*?)## Shipped seed prior/,
    )?.[1] || '';
    assert.match(
      gate2,
      /\*\*Estimated implementation time: about \{rounded duration\}, based on completed projects of similar size\.\*\*/,
    );
    assert.doesNotMatch(gate2, /Execution guidance/);
    assert.doesNotMatch(gate2, /Nearest historical analog/);
    assert.doesNotMatch(gate2, /confidence|tokens|monetary|billing|unavailable/);
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

test('Scope, UX, and prototype make Plan the canonical repository-change handoff', () => {
  const repoRoot = path.resolve(__dirname, '..');
  for (const rootName of ['spectre', 'spectre-codex']) {
    const readSkill = (name) => fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', name, 'SKILL.md'),
      'utf8',
    ).replaceAll('/spectre:', 'spectre-');
    const scope = readSkill('spectre-scope');
    const ux = readSkill('spectre-ux');
    const prototype = readSkill('spectre-prototype');
    assert.match(scope, /confirmed repository-changing work[^\n]*spectre-plan/i);
    assert.doesNotMatch(scope, /well-understood non-UI work[^\n]*spectre-create_tasks/i);
    assert.match(ux, /confirmed repository-changing work[^\n]*spectre-plan/i);
    assert.doesNotMatch(ux, /spectre-create_tasks|spectre-tdd|genuinely MICRO/i);
    assert.match(prototype, /post-scope[^\n]*validated scope[^\n]*spectre-plan/i);
    assert.doesNotMatch(prototype, /post-scope[^\n]*spectre-create_tasks/i);
  }
});

test('create_plan and create_tasks preserve XS/direct routing contracts', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const createPlan = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-create_plan', 'SKILL.md'),
      'utf8',
    ).replaceAll('/spectre:', 'spectre-');
    const createTasks = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-create_tasks', 'SKILL.md'),
      'utf8',
    ).replaceAll('/spectre:', 'spectre-');

    assert.match(createPlan, /--depth \{xs\|light\|standard\|comprehensive\}/);
    assert.match(createTasks, /--depth xs\|light\|standard\|comprehensive/);
    assert.match(createPlan, /`--depth xs`[\s\S]*Execution Mode: direct/i);
    assert.match(createPlan, /`--depth xs`[\s\S]*one coherent change/i);
    assert.match(createPlan, /`--depth xs`[\s\S]*known verification/i);
    assert.match(createPlan, /`--depth xs`[\s\S]*explicit Out-of-Bounds/i);
    assert.match(createPlan, /`--depth xs`[\s\S]*seven spine sections/i);
    assert.match(createPlan, /## Routing Observations/);
    for (const field of [
      'workstream count',
      'independent workstreams',
      'dependency sequencing',
      'shared-contract consumers',
      'staged rollout/migration',
      'new abstraction',
      'unresolved material decision',
      'observed uncertainty',
    ]) assert.match(createPlan, new RegExp(field, 'i'));

    assert.match(createPlan, /observations are consumed only by `spectre-plan-route`/i);
    assert.match(createPlan, /XS structured override[^\n]*spectre-create_tasks --depth xs/i);
    assert.doesNotMatch(createPlan, /Escalate-If[\s\S]*(?:>3 critical files|new abstraction|data migration|public-API change|tier-reassessment recommendation)/i);
    assert.doesNotMatch(createPlan, /(?:automatic|independently)\s+(?:escalates?|classif(?:y|ies)|selects?)[^\n]*(?:XS|S|M|L|XL|light|standard|comprehensive)/i);

    assert.match(createTasks, /execution slicing only/i);
    assert.match(createTasks, /never (?:classifies|derive|derives|selects?) Plan size/i);
    assert.doesNotMatch(createTasks, /Depth:\s*LIGHT\s*=/);
    assert.doesNotMatch(createTasks, /(?:depth|--depth)[^\n]*(?:Plan classification|classif(?:y|ies)|route size)/i);
  }
});

test('Fix persists an approval-gated managed repair plan before mutation', () => {
  const repoRoot = path.resolve(__dirname, '..');
  for (const rootName of ['spectre', 'spectre-codex']) {
    const fix = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-fix', 'SKILL.md'),
      'utf8',
    ).replaceAll('/spectre:', 'spectre-');
    const repairPlanIndex = fix.search(/self-locating compact (?:managed )?repair plan/i);
    const fixApprovalIndex = fix.indexOf('HoldForApproval');
    const fixRepairIndex = fix.indexOf('PHASE=repair');
    assert.ok(repairPlanIndex !== -1);
    assert.ok(repairPlanIndex < fixApprovalIndex);
    assert.ok(fixApprovalIndex < fixRepairIndex);
    assert.match(fix, /repair plan[^\n]*before (?:code )?mutation/i);
    assert.match(fix, /scoped name if one already exists/i);
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
    const execute = readExecuteContract(repoRoot, rootName).replaceAll('/spectre:', 'spectre-');
    const validate = readSkill(rootName, 'spectre-validate');
    const proof = readSkill(rootName, 'spectre-prove');
    const clean = readSkill(rootName, 'spectre-clean');
    const ship = readSkill(rootName, 'spectre-ship');

    const scopeUx = scope.indexOf('journeys, segments, states, copy, or accessibility');
    const scopePrototype = scope.indexOf('interaction/layout/visual validation materially matters');
    const scopePlan = scope.indexOf('confirmed repository-changing work');
    assert.ok(scopeUx !== -1);
    assert.ok(scopePrototype > scopeUx);
    assert.ok(scopePlan > scopePrototype);
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
    assert.match(plan, /copy-ready fenced block as the primary next step/);
    assert.match(plan, /Alternative: spectre-execute — run the reviewed artifacts interactively/);
    assert.match(plan, /spectre-create_tasks.*--orchestrated/);
    assert.match(plan, /spectre-task_review.*--orchestrated/);
    assert.match(plan, /spectre-goal.*--orchestrated/);

    assert.match(createPlan, /Approved `Execution Mode: direct` plan.*spectre-execute/);
    assert.match(createPlan, /Approved LIGHT structured plan.*spectre-create_tasks/);
    assert.match(createPlan, /Approved STANDARD\/COMPREHENSIVE plan.*spectre-plan_review/);
    assert.match(createTasks, /load-bearing user-facing behavior.*without adequate UX\/prototype acceptance evidence/);
    assert.match(createTasks, /--orchestrated.*(?:without|omits) user-facing Next Steps/);

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
    /\*\*\/spectre:ship\*\*[\s\S]*?(?=\n\n## )/,
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

test('feature-root establishment is centralized behind one concise internal skill', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const callers = [
    'spectre-clean',
    'spectre-code_review',
    'spectre-create_plan',
    'spectre-create_tasks',
    'spectre-create_test_guide',
    'spectre-delegate',
    'spectre-execute',
    'spectre-fix',
    'spectre-goal',
    'spectre-kickoff',
    'spectre-plan',
    'spectre-plan_review',
    'spectre-prototype',
    'spectre-prove',
    'spectre-prune',
    'spectre-research',
    'spectre-scope',
    'spectre-ship',
    'spectre-task_review',
    'spectre-test',
    'spectre-ux',
    'spectre-validate',
  ];
  const canonicalResolver = 'Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `@skill-spectre:spectre-feature-root` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.';
  const codexResolver = canonicalResolver.replace(
    '`@skill-spectre:spectre-feature-root`',
    '`Skill(spectre-feature-root)`',
  );

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skillsRoot = path.join(repoRoot, 'plugins', rootName, 'skills');
    const readSkill = (name) => fs.readFileSync(
      path.join(skillsRoot, name, 'SKILL.md'),
      'utf8',
    );
    const helper = readSkill('spectre-feature-root');
    const resolver = rootName === 'spectre' ? canonicalResolver : codexResolver;

    assert.match(helper, /name: "spectre-feature-root"/);
    assert.match(helper, /user-invocable: false/);
    assert.match(helper, /Do NOT invoke for existing roots, orchestrated calls missing a root, or direct user requests/);
    assert.ok(helper.length <= 1900, `feature-root helper exceeds 500 estimated tokens: ${helper.length} chars`);
    assert.match(helper, /first free `\.spectre\/features\/<name>\[-N\]\/`/);
    assert.match(helper, /`schema_version`, `created_at`, `feature`, and repo-relative `feature_root`/);
    assert.match(helper, /`manifest\.json`, `bin\/`, `handoffs\/`, and `!features\/`/);
    assert.match(helper, /Never edit root `\.gitignore`/);
    assert.doesNotMatch(helper, /docs\/tasks/);
    assert.equal(
      fs.existsSync(path.join(skillsRoot, 'spectre-create_tasks', 'references', 'legacy-continuation.example.json')),
      false,
      `${rootName} must not ship the retired legacy continuation fixture`,
    );

    for (const name of callers) {
      const skill = readSkill(name);
      assert.equal(skill.split(resolver).length - 1, 1, `${name} must contain exactly one resolver line`);
      assert.doesNotMatch(skill, /docs\/tasks\/\*\*/);
      assert.doesNotMatch(skill, /Before the first artifact in a new root/);
      assert.doesNotMatch(skill, /Never use branch name, recency, lifecycle state, or directory scanning/);
    }
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
    assert.match(createTasks, /same-basename feature-scoped pairs/);
    assert.match(codeReview, /BASE_SHA.*HEAD_SHA.*DIFF_SHA256/);
    assert.match(codeReview, /candidate tuple[\s\S]*before dispatch and after report creation/i);
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
      if (skillName === 'spectre-plan_review') {
        assert.match(skill, /high effort \(20-minute limit\)/);
        assert.match(skill, /Codex -> Claude Code `opus`/);
        assert.match(skill, /Claude Code -> Codex `gpt-5\.6-sol`/);
        assert.match(skill, /Record stage\/runtime\/model\/effort\/route/);
        assert.match(skill, /native `@spectre(?::|_)reviewer`/);
        assert.doesNotMatch(skill, /at least 20 minutes/);
      } else if (skillName === 'spectre-task_review') {
        assert.match(skill, /pinned medium effort/);
        assert.match(skill, /Codex (?:→|->) Claude(?: Code)? `opus`/);
        assert.match(skill, /Claude(?: Code)? (?:→|->) Codex `gpt-5\.6-sol`/);
        assert.match(skill, /one clean-context `@(?:spectre(?::|_)?)?reviewer`/);
        assert.match(skill, /runtime\/model\/effort\/route/);
      } else {
        assert.match(skill, new RegExp(`claude -p --model ${claudeModel} --effort ${effort}`));
        assert.match(
          skill,
          new RegExp(
            `codex exec -C "\\$PWD" -m gpt-5\\.6-sol -c 'model_reasoning_effort="${effort}"'`,
          ),
        );
        assert.match(skill, /Missing\/non-zero opposing CLI[\s\S]*permits one clean-context `@spectre(?::|_)reviewer`/i);
        assert.match(skill, /Fallback once/);
        assert.match(skill, new RegExp(`Claude Code\\|${claudeModel}\\|${effort}\\|Codex -> Claude Code`));
        assert.match(skill, new RegExp(`Codex\\|gpt-5\\.6-sol\\|${effort}\\|Claude Code -> Codex`));
        assert.match(skill, /native-subagent\|runtime-native\|inherited\|native-fallback/);
      }

      if (skillName === 'spectre-task_review') {
        assert.match(skill, /scripts\/task-review-safety\.mjs/);
        assert.match(skill, /helper's `preflight`/);
        assert.match(skill, /helper `validate-report`/);
        assert.match(skill, /primary may repair mechanical report\/schema metadata/);
        assert.doesNotMatch(skill, /same-route report-only repair/);
        assert.match(skill, /runs `validate-pair`/);
        assert.match(skill, /one semantic review per authorized round/);
        assert.match(skill, /--review-again/);
        assert.match(skill, /task_review_attempt\.json/);
        assert.match(skill, /retired `impact` operation/);
        assert.match(skill, /Adversarial mode reviews the whole graph in one pass/);
        assert.match(skill, /Allow up to 20 minutes; quiet output alone is not failure/);
        assert.match(skill, /guidance, not an exhaustive taxonomy or a limit/);
        assert.match(skill, /without avoidable rework/);
        assert.doesNotMatch(skill, /at least 20 minutes|do not stop early/i);
      }
    }
  }
});

test('plan review establishes correctness before simplification with shared evidence', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skill = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-plan_review', 'SKILL.md'),
      'utf8',
    );

    assert.match(skill, /smallest correct plan/);
    assert.ok(skill.indexOf('2. **Correctness review.**') < skill.indexOf('4. **Simplification review.**'));
    assert.match(skill, /plan_correctness\.md/);
    assert.match(skill, /evidence ledger/i);
    assert.match(skill, /retained constraints/i);
    assert.match(skill, /at most one each: `@spectre(?::|_)finder`.*`@spectre(?::|_)analyst`.*`@spectre(?::|_)patterns`/);
    assert.match(skill, /no second wave/i);
    assert.match(skill, /Correctness review/);
    assert.match(skill, /Simplification review/);
    assert.match(skill, /No broad research\/delegation/);
    assert.match(skill, /Stop on unresolved correctness Blocker\/High/);
    assert.match(skill, /Each meaningful behavior\/contract starts with a representative happy and primary-failure test/);
    assert.match(skill, /distinct requirements, public boundaries, credible regressions, or materially different risks/);
    assert.match(skill, /Exclude duplicate, implementation-detail, and combinatorial coverage/);
    assert.match(skill, /No deletion requires traceability for retained elements/);
    assert.match(skill, /plan\.md` carries accepted tests and executable direct-mode Verification/);
    assert.match(skill, /Run each stage fresh at high effort/);
    assert.match(skill, /Write `plan_correctness\.md` first, then edit `plan\.md`/);
    assert.match(skill, /Write `plan_review\.md` first, then edit `plan\.md`/);
    assert.doesNotMatch(skill, /this review is simplification-only/i);
    assert.doesNotMatch(skill, /Completed-review hard stop/i);
    assert.doesNotMatch(skill, /--review-again/);
    assert.doesNotMatch(skill, /plan_review_attempt\.json/);
    assert.doesNotMatch(skill, /round_status/);
    assert.doesNotMatch(skill, /--mode adversarial|--mode full/);
  }
});

test('TDD uses a risk-proportionate behavioral floor without weakening RED-before-GREEN', () => {
  const repoRoot = path.resolve(__dirname, '..');

  for (const rootName of ['spectre', 'spectre-codex']) {
    const skill = fs.readFileSync(
      path.join(repoRoot, 'plugins', rootName, 'skills', 'spectre-tdd', 'SKILL.md'),
      'utf8',
    );

    assert.match(skill, /smallest externally meaningful behavior or contract/);
    assert.match(skill, /representative happy-path and one primary-failure test/);
    assert.match(skill, /distinct requirement, public\/contract boundary, credible regression, or materially different risk/);
    assert.match(skill, /every new test was observed failing for the expected reason before satisfying implementation/);
    assert.match(skill, /every new observable behavior or nontrivial exported contract is tested/);
    assert.match(skill, /Private helpers are normally covered through observable behavior/);
    assert.doesNotMatch(skill, /exactly one happy-path and one primary-failure test/);
    assert.doesNotMatch(skill, /every new function has a test/);
  }
});

test('planning artifact ownership confines reviewer-authored scope-safe writeback', () => {
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

    assert.match(plan, /primary planning agent owns synthesis, routing, and deterministic finalization/i);
    assert.match(plan, /explicit scope-safe reviewer write surfaces/i);
    assert.match(plan, /Research agents return evidence only and never write planning artifacts/i);
    assert.doesNotMatch(plan, /never write `plan\.md`, `execute\.md`, or `tasks\.json` content yourself/i);

    assert.match(createPlan, /primary directly writes `plan\.md`/i);
    assert.match(createPlan, /Research agents return evidence only/i);
    assert.match(createPlan, /at every depth, reuse an existing substantive `## Technical Research` section/i);
    assert.match(createPlan, /orchestrated `spectre-plan` call never launches replacement research agents/i);
    assert.match(createTasks, /primary directly writes only the selected canonical artifacts/i);
    assert.match(createTasks, /research agents (?:return|supply) evidence only/i);

    assert.match(planReview, /Reviewers write only their report and `plan\.md`/i);
    assert.match(planReview, /Write `plan_correctness\.md` first, then edit `plan\.md`/i);
    assert.match(planReview, /Write `plan_review\.md` first, then edit `plan\.md`/i);
    assert.match(planReview, /addressed edit named/i);
    assert.doesNotMatch(planReview, /primary directly edits `plan\.md`/i);
    assert.match(planReview, /primary may normalize mechanics, never semantics/i);
    assert.match(planReview, /failed schema\/hash\/scope checks/i);
    assert.match(planReview, /normalization never launches fallback/i);
    assert.doesNotMatch(planReview, /allowedTools "[^"]*Task/);

    assert.match(taskReview, /reviewer owns `TASKS_JSON` and `REVIEW_REPORT`/i);
    assert.match(taskReview, /Write all findings before edits/i);
    assert.match(taskReview, /Resulting Task Edit/i);
    assert.match(taskReview, /primary may repair mechanical report\/schema metadata/i);
    assert.match(taskReview, /may not invent findings, reinterpret them, or perform semantic task edits/i);
    assert.doesNotMatch(taskReview, /same-route report-only repair/i);
    assert.doesNotMatch(taskReview, /primary directly edits `TASKS_JSON`/i);

    assert.match(codeReview, /primary may mechanically normalize report-only/i);
    assert.doesNotMatch(codeReview, /same-route report-only repair/i);
    assert.match(codeReview, /Primary semantic self-review is prohibited/i);
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
    assert.match(codeReview, /Try to prove the work wrong/);
    assert.match(codeReview, /Falsify; do not confirm/);
    assert.match(codeReview, /Actively seek counterexamples, broken invariants, failure paths/);
    assert.match(codeReview, /correctness; regression\/integration; security; performance\/reliability/i);
    assert.match(codeReview, /materially avoidable overengineering/);
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

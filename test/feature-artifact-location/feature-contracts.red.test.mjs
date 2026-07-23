import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const projectRoot = join(import.meta.dirname, '..', '..');

const creatorContract = {
  proposal: /propose (?:a )?lowercase kebab-case feature name/i,
  noExtraGate: /never create a separate name-confirmation gate/i,
  existingFeature: /explicitly (?:names|selects) an existing managed feature/i,
};
const creatorTenancyContract = {
  nestedIgnoreCondition:
    /create `?\.spectre\/\.gitignore`? only when it is absent and the parent repository does not already ignore `?\.spectre\/?`?/i,
  nestedIgnorePatterns:
    /ignore patterns for `?manifest\.json`?, `?bin\/`?, and `?handoffs\/`?, while retaining `?!features\/`?/i,
  preserveRootIgnore:
    /never (?:silently )?rewrite (?:an arbitrary )?user root `?\.gitignore`?/i,
  blanketIgnoreWarning:
    /blanket parent `?\.spectre\/?`? ignore.*warn.*local-only/i,
};

const continuationResolutionOrder = [
  ['explicit', /explicit feature (?:directory|root) or feature name/i],
  ['artifact', /supplied artifact beneath (?:a|the) feature (?:directory|root)/i],
  ['conversation', /one unambiguous feature artifact .*current (?:conversation|thread)/i],
];
const noContinuationInference =
  /never use branch name, modification time, lifecycle completeness, or directory scanning/i;

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

function assertFeatureRelativePath(featureRoot, artifactPath, label) {
  assert.equal(artifactPath.startsWith('/'), false, `${label}: must not be absolute`);
  assert.equal(
    artifactPath === '..' || artifactPath.startsWith(`..${sep}`),
    false,
    `${label}: must not escape the feature root`,
  );
  const resolvedRoot = resolve(projectRoot, featureRoot);
  const resolvedArtifact = resolve(resolvedRoot, artifactPath);
  assert.ok(
    resolvedArtifact.startsWith(`${resolvedRoot}${sep}`),
    `${label}: does not resolve beneath ${featureRoot}`,
  );
}

function assertContract(text, contract, file) {
  for (const [clause, pattern] of Object.entries(contract)) {
    assert.ok(pattern.test(text), `${file}: missing ${clause} clause`);
  }
}

function continuationOrderMismatches(text) {
  let previousOffset = -1;
  const mismatches = [];
  for (const [clause, pattern] of continuationResolutionOrder) {
    const match = pattern.exec(text);
    if (!match) {
      mismatches.push(`missing ${clause} clause`);
      continue;
    }
    if (match.index <= previousOffset) {
      mismatches.push(`${clause} clause is out of order`);
    }
    previousOffset = match.index;
  }
  return mismatches;
}

function assertContinuationContract(text, file) {
  assert.deepEqual(
    continuationOrderMismatches(text),
    [],
    `${file}: resolution order must be explicit feature → supplied artifact → current-thread artifact`,
  );
  assert.ok(noContinuationInference.test(text), `${file}: missing noInference clause`);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('contract matcher accepts the complete creator and continuation fixture', () => {
  const fixture = [
    'Propose a lowercase kebab-case feature name.',
    'Never create a separate name-confirmation gate.',
    'When the user explicitly names an existing managed feature, continue it.',
    'Resolve an explicit feature directory or feature name.',
    'Then resolve a supplied artifact beneath the feature root.',
    'Then resolve one unambiguous feature artifact from the current conversation.',
    'Never use branch name, modification time, lifecycle completeness, or directory scanning.',
  ].join('\n');

  assertContract(fixture, creatorContract, 'synthetic creator');
  assertContinuationContract(fixture, 'synthetic continuation');
});

test('ordered continuation matcher rejects a reordered synthetic contract', () => {
  const reordered = [
    'Resolve one unambiguous feature artifact from the current thread.',
    'Then resolve a supplied artifact beneath the feature root.',
    'Finally resolve an explicit feature root or feature name.',
  ].join('\n');

  assert.deepEqual(continuationOrderMismatches(reordered), [
    'artifact clause is out of order',
    'conversation clause is out of order',
  ]);
});

test('creator skills declare no-extra-gate and selected-existing-feature behavior', () => {
  for (const file of [
    'plugins/spectre/skills/spectre-scope/SKILL.md',
    'plugins/spectre/skills/spectre-kickoff/SKILL.md',
    'plugins/spectre-codex/skills/spectre-scope/SKILL.md',
    'plugins/spectre-codex/skills/spectre-kickoff/SKILL.md',
  ]) {
    assertContract(read(file), creatorContract, file);
  }
});

test('creator skills declare the exact tracked/local tenancy contract', () => {
  for (const file of [
    'plugins/spectre/skills/spectre-scope/SKILL.md',
    'plugins/spectre/skills/spectre-kickoff/SKILL.md',
  ]) {
    assertContract(read(file), creatorTenancyContract, file);
  }
});

test('continuation skills declare the three-step resolution order without branch inference', () => {
  for (const file of [
    'plugins/spectre/skills/spectre-plan/SKILL.md',
    'plugins/spectre/skills/spectre-execute/SKILL.md',
    'plugins/spectre-codex/skills/spectre-plan/SKILL.md',
    'plugins/spectre-codex/skills/spectre-execute/SKILL.md',
  ]) {
    const content = read(file);
    assertContinuationContract(content, file);
    assert.doesNotMatch(
      content,
      /OUT_DIR\s*=\s*(?:user-specified|target_dir)[^\n]*docs\/tasks\/\{branch\}/,
      `${file}: still derives the active feature root from the Git branch`,
    );
  }
});

test('planning and UX continuation workflows resolve and propagate one exact feature root', () => {
  for (const file of [
    'plugins/spectre/skills/spectre-create_plan/SKILL.md',
    'plugins/spectre/skills/spectre-create_tasks/SKILL.md',
    'plugins/spectre/skills/spectre-ux/SKILL.md',
    'plugins/spectre/skills/spectre-prototype/SKILL.md',
    'plugins/spectre/skills/spectre-plan_review/SKILL.md',
    'plugins/spectre/skills/spectre-task_review/SKILL.md',
  ]) {
    const content = read(file);
    assertContinuationContract(content, file);
    assert.match(
      content,
      /pass(?:es)? the exact feature root unchanged/i,
      `${file}: missing exact-root propagation`,
    );
    assert.match(
      content,
      /physical feature directory .*authoritative/i,
      `${file}: missing physical-directory authority`,
    );
    assert.match(
      content,
      /repair .*feature(?: name)?\/root metadata .*before (?:continuing|writing|producing)/i,
      `${file}: missing stale metadata repair`,
    );
  }
});

test('planning, task, UX, prototype, and review outputs are self-locating', () => {
  const outputContracts = new Map([
    ['plugins/spectre/skills/spectre-create_plan/SKILL.md', ['plan.md']],
    ['plugins/spectre/skills/spectre-create_tasks/SKILL.md', ['execute.md', 'tasks.json']],
    ['plugins/spectre/skills/spectre-ux/SKILL.md', ['ux.md']],
    ['plugins/spectre/skills/spectre-prototype/SKILL.md', ['HTML']],
    ['plugins/spectre/skills/spectre-plan_review/SKILL.md', ['REVIEW_REPORT']],
    [
      'plugins/spectre/skills/spectre-task_review/SKILL.md',
      ['REVIEW_REPORT', 'PREFLIGHT_JSON', 'REVIEW_STATE', 'IMPACT_JSON'],
    ],
  ]);

  for (const [file, artifacts] of outputContracts) {
    const content = read(file);
    assert.match(content, /Feature: <feature-name>/, `${file}: missing Feature metadata contract`);
    assert.match(
      content,
      /Feature Root: \.spectre\/features\/<feature-name>/,
      `${file}: missing Feature Root metadata contract`,
    );
    for (const artifact of artifacts) {
      assert.match(
        content,
        new RegExp(`${artifact.replace('.', '\\.')}[^\\n]*(?:feature|Feature)`),
        `${file}: ${artifact} does not require self-location metadata`,
      );
    }
  }
});

test('external planning reviewers receive the exact inherited root without branch rederivation', () => {
  for (const file of [
    'plugins/spectre/skills/spectre-plan_review/SKILL.md',
    'plugins/spectre/skills/spectre-task_review/SKILL.md',
  ]) {
    const content = read(file);
    assert.match(
      content,
      /REVIEW_PROMPT[^.\n]*exact feature root/i,
      `${file}: reviewer prompt omits the exact feature root`,
    );
    assert.match(
      content,
      /reviewer .*must not rederive .*branch/i,
      `${file}: reviewer may rederive the root from the branch`,
    );
  }
});

test('tasks JSON fixture carries self-location metadata and resolvable references', () => {
  const file = 'plugins/spectre/skills/spectre-create_tasks/references/tasks.example.json';
  const fixture = JSON.parse(read(file));
  assert.equal(fixture.meta.feature, 'Example Feature', `${file}: missing meta.feature`);
  assert.equal(
    fixture.meta.feature_root,
    '.spectre/features/example-feature',
    `${file}: missing meta.feature_root`,
  );

  assert.deepEqual(
    fixture.meta.requirements_trace.map((trace) => trace.source),
    [
      'specs/plan.md ## Technical Approach',
      'concepts/product-scope.md ## Success Criteria',
    ],
    `${file}: requirements sources must use feature-root-relative artifact paths`,
  );
  for (const [index, trace] of fixture.meta.requirements_trace.entries()) {
    const artifactPath = trace.source.split(' ## ', 1)[0];
    assertFeatureRelativePath(
      fixture.meta.feature_root,
      artifactPath,
      `${file}: requirements_trace[${index}].source`,
    );
  }

  for (const phase of fixture.phases) {
    for (const parent of phase.parents) {
      for (const subtask of parent.subtasks) {
        for (const [index, context] of subtask.context.entries()) {
          assert.match(
            context.path,
            /^plugins\/spectre\//,
            `${file}: ${subtask.id}.context[${index}].path must remain repo-relative`,
          );
        }
      }
    }
  }
});

test('execute fixture is self-locating and resolves every manifest path from its feature root', () => {
  const file = 'plugins/spectre/skills/spectre-create_tasks/references/execute.example.md';
  const content = read(file);
  assert.ok(/^Feature: Example Feature$/m.test(content), `${file}: missing Feature metadata`);
  const featureRoot = content.match(/^Feature Root: (.+)$/m)?.[1];
  assert.equal(featureRoot, '.spectre/features/example-feature', `${file}: missing Feature Root metadata`);

  const manifestPaths = content
    .split('\n')
    .map((line) => line.match(/^- (?:Scope|UX|Prototype|Plan|Research|Tasks JSON): `([^`]+)`$/)?.[1])
    .filter(Boolean);
  assert.equal(manifestPaths.length, 6, `${file}: incomplete artifact manifest`);
  for (const artifactPath of manifestPaths) {
    assertFeatureRelativePath(featureRoot, artifactPath, `${file}: ${artifactPath}`);
  }
});

test('legacy continuation fixture preserves exact source bytes except one allowed status field', () => {
  const file =
    'plugins/spectre/skills/spectre-create_tasks/references/legacy-continuation.example.json';
  assert.match(
    read('plugins/spectre/skills/spectre-create_tasks/SKILL.md'),
    /references\/legacy-continuation\.example\.json/,
    'spectre-create_tasks must name the legacy continuation fixture',
  );
  const fixture = JSON.parse(read(file));
  const legacy = fixture.legacy_source;
  const output = fixture.canonical_output;

  assert.equal(fixture.feature, 'Example Feature', `${file}: missing feature`);
  assert.equal(
    fixture.feature_root,
    '.spectre/features/example-feature',
    `${file}: missing feature_root`,
  );
  assert.match(legacy.path, /^docs\/tasks\/[^/]+\/.+/, `${file}: legacy source is not repo-relative`);
  assert.equal(legacy.allowed_workflow_status_field, 'status');

  const before = JSON.parse(legacy.before_bytes);
  const after = JSON.parse(legacy.after_bytes);
  assert.notEqual(before.status, after.status, `${file}: status fixture did not change`);
  assert.equal(
    legacy.after_bytes.replace(
      `"status": "${after.status}"`,
      `"status": "${before.status}"`,
    ),
    legacy.before_bytes,
    `${file}: legacy bytes changed outside the allowed status field`,
  );

  assert.equal(output.feature, fixture.feature, `${file}: canonical output feature drift`);
  assert.equal(output.feature_root, fixture.feature_root, `${file}: canonical output root drift`);
  assertFeatureRelativePath(fixture.feature_root, output.path, `${file}: canonical_output.path`);
  assert.equal(
    output.source_manifest.legacy_source,
    legacy.path,
    `${file}: canonical output does not record its legacy source`,
  );
  assert.equal(fixture.migration_performed, false, `${file}: fixture must not move or migrate`);
});

test('producer contract treats the physical feature directory as rename authority', () => {
  const file = 'plugins/spectre/skills/spectre-create_tasks/SKILL.md';
  const content = read(file);
  assert.ok(
    /physical feature directory .*authoritative/i.test(content),
    `${file}: missing physical-directory authority`,
  );
  assert.ok(
    /repair .*feature(?: name)?\/root metadata .*before (?:continuing|writing)/i.test(content),
    `${file}: missing rename reconciliation`,
  );
});

test('explicit legacy continuation preserves state but routes new documents to a feature root', () => {
  const file = 'plugins/spectre/skills/spectre-execute/SKILL.md';
  const content = read(file);
  assert.ok(
    /explicit legacy artifact.*readable input/i.test(content),
    `${file}: missing explicit legacy-input clause`,
  );
  assert.ok(
    /existing legacy .*status fields.*in place/i.test(content),
    `${file}: missing legacy status-mutation clause`,
  );
  assert.ok(
    /new canonical documents?.*\.spectre\/features\//i.test(content),
    `${file}: missing canonical-write boundary`,
  );
});

test('post-plan continuation workflows inherit the exact root from a nested execute artifact', () => {
  const files = [
    'plugins/spectre/skills/spectre-execute/SKILL.md',
    'plugins/spectre/skills/spectre-code_review/SKILL.md',
    'plugins/spectre/skills/spectre-validate/SKILL.md',
  ];

  for (const file of files) {
    const content = read(file);
    assertContinuationContract(content, file);
    assert.match(
      content,
      /pass(?:es)? the exact feature root unchanged/i,
      `${file}: missing exact-root propagation`,
    );
    assert.match(
      content,
      /physical feature directory .*authoritative/i,
      `${file}: missing physical-directory authority`,
    );
    assert.match(
      content,
      /repair .*feature(?: name)?\/root metadata .*before (?:continuing|writing|producing)/i,
      `${file}: missing stale metadata repair`,
    );
  }

  const execute = read(files[0]);
  assert.match(
    execute,
    /nested execute artifact .*sole locator.*self-location metadata.*physical enclosing feature directory/i,
    `${files[0]}: nested execute artifact cannot act as the sole root locator`,
  );
  assert.match(
    execute,
    /existing legacy .*status fields.*in place/i,
    `${files[0]}: legacy status updates are not preserved`,
  );

  for (const file of files.slice(1)) {
    const content = read(file);
    assert.match(
      content,
      /new (?:review|validation) document.*confirmed canonical.*\.spectre\/features\//i,
      `${file}: new document is not confined to a confirmed canonical root`,
    );
    assert.match(
      content,
      /record(?:s)? (?:the )?legacy source/i,
      `${file}: new document does not record its legacy source`,
    );
  }

  const outputContracts = new Map([
    [files[0], ['execution_state.md']],
    [files[1], ['REVIEW_REPORT']],
    [files[2], ['VALIDATION_REPORT']],
  ]);
  for (const [file, artifacts] of outputContracts) {
    const content = read(file);
    assert.match(content, /Feature: <feature-name>/, `${file}: missing Feature metadata`);
    assert.match(
      content,
      /Feature Root: \.spectre\/features\/<feature-name>/,
      `${file}: missing Feature Root metadata`,
    );
    assert.match(
      content,
      /passing any produced artifact.*identif(?:y|ies) the feature name and root/i,
      `${file}: produced artifacts are not sufficient continuation inputs`,
    );
    for (const artifact of artifacts) {
      assert.match(
        content,
        new RegExp(`${artifact.replace('.', '\\.')}[^\\n]*(?:feature|Feature)`),
        `${file}: ${artifact} does not require self-location metadata`,
      );
    }
  }
});

test('post-plan continuation workflows forbid branch-derived output roots', () => {
  for (const file of [
    'plugins/spectre/skills/spectre-execute/SKILL.md',
    'plugins/spectre/skills/spectre-code_review/SKILL.md',
    'plugins/spectre/skills/spectre-validate/SKILL.md',
  ]) {
    const content = read(file);
    assert.doesNotMatch(
      content,
      /OUT_DIR\s*=\s*[^\n]*docs\/tasks\/\{branch\}/,
      `${file}: still derives its output root from the Git branch`,
    );
  }
});

test('proof and testing workflows emit self-locating artifacts under one exact feature root', () => {
  const outputContracts = new Map([
    ['plugins/spectre/skills/spectre-proof/SKILL.md', ['proof.json', 'proof.html']],
    ['plugins/spectre/skills/spectre-test/SKILL.md', ['working_set.json']],
    ['plugins/spectre/skills/spectre-create_test_guide/SKILL.md', ['test guide']],
  ]);

  for (const [file, artifacts] of outputContracts) {
    const content = read(file);
    assertContinuationContract(content, file);
    assert.match(
      content,
      /pass(?:es)? the exact feature root unchanged/i,
      `${file}: missing exact-root propagation`,
    );
    assert.match(
      content,
      /Feature: <feature-name>/,
      `${file}: missing Feature metadata contract`,
    );
    assert.match(
      content,
      /Feature Root: \.spectre\/features\/<feature-name>/,
      `${file}: missing Feature Root metadata contract`,
    );
    assert.match(
      content,
      /passing any produced artifact.*identif(?:y|ies) the feature name and root/i,
      `${file}: produced artifacts are not declared sufficient for continuation`,
    );
    for (const artifact of artifacts) {
      assert.match(
        content,
        new RegExp(`${artifact.replace('.', '\\.')}[^\\n]*(?:feature|Feature)`),
        `${file}: ${artifact} does not require self-location metadata`,
      );
    }
  }
});

test('proof and testing workflows forbid branch-derived output roots', () => {
  for (const file of [
    'plugins/spectre/skills/spectre-proof/SKILL.md',
    'plugins/spectre/skills/spectre-test/SKILL.md',
    'plugins/spectre/skills/spectre-create_test_guide/SKILL.md',
  ]) {
    const content = read(file);
    assert.doesNotMatch(
      content,
      /(?:OUT_DIR|FEATURE_ROOT)\s*=\s*[^\n]*docs\/tasks\/\{branch\}/,
      `${file}: still derives its feature root from the Git branch`,
    );
  }
});

test('fresh-repository tenancy keeps features trackable and local state ignored', () => {
  const root = mkdtempSync(join(tmpdir(), 'spectre-tenancy-red-'));
  try {
    git(root, ['init', '-b', 'main']);
    writeFileSync(join(root, '.gitignore'), read('.gitignore'));
    mkdirSync(join(root, '.spectre', 'features', 'example-feature'), { recursive: true });
    mkdirSync(join(root, '.spectre', 'bin'), { recursive: true });
    mkdirSync(join(root, '.spectre', 'handoffs', 'main'), { recursive: true });
    writeFileSync(join(root, '.spectre', 'features', 'example-feature', 'feature.json'), '{}\n');
    writeFileSync(join(root, '.spectre', 'manifest.json'), '{}\n');
    writeFileSync(join(root, '.spectre', 'bin', 'spectre'), '#!/bin/sh\n');
    writeFileSync(join(root, '.spectre', 'handoffs', 'main', 'one_handoff.json'), '{}\n');

    const feature = '.spectre/features/example-feature/feature.json';
    const manifest = '.spectre/manifest.json';
    const launcher = '.spectre/bin/spectre';
    const handoff = '.spectre/handoffs/main/one_handoff.json';
    const ignored = new Set(
      [feature, manifest, launcher, handoff].filter((path) => {
        try {
          git(root, ['check-ignore', '-q', path]);
          return true;
        } catch {
          return false;
        }
      }),
    );

    assert.equal(ignored.has(feature), false, `${feature}: must be trackable by default`);
    assert.equal(ignored.has(manifest), true, `${manifest}: must remain local`);
    assert.equal(ignored.has(launcher), true, `${launcher}: must remain local`);
    assert.equal(ignored.has(handoff), true, `${handoff}: must remain local`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('public documentation labels every legacy path with its compatibility status', () => {
  const docs = readdirSync(join(projectRoot, 'docs'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(projectRoot, 'docs', entry.name));
  const files = [join(projectRoot, 'README.md'), ...docs];
  const unlabeled = files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => /docs\/(?:active_)?tasks\//.test(line))
      .filter(({ line }) => !/\b(?:legacy|compatibility)\b/i.test(line))
      .map(({ line, lineNumber }) =>
        `${relative(projectRoot, file)}:${lineNumber}: ${line.trim()}`,
      ),
  );

  assert.deepEqual(
    unlabeled,
    [],
    `unlabeled active legacy paths:\n${unlabeled.join('\n')}`,
  );
});

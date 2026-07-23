import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync as fsExists,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const projectRoot = join(import.meta.dirname, '..', '..');
const hookPath = join(projectRoot, 'plugins', 'spectre', 'hooks', 'scripts', 'handoff-resume.mjs');

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

function firstBashBlock(relativePath) {
  const match = read(relativePath).match(/```bash\n([\s\S]*?)\n```/);
  assert.ok(match, `${relativePath}: missing executable bash block`);
  return match[1];
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function makeRepo(root, branch) {
  mkdirSync(root, { recursive: true });
  git(root, ['init', '-b', branch]);
  git(root, ['config', 'user.email', 'spectre@example.test']);
  git(root, ['config', 'user.name', 'Spectre Test']);
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'fixture']);
}

function handoff(taskName, branchName) {
  return {
    version: '1.1',
    timestamp: '2026-07-23-120000',
    branch_name: branchName,
    task_name: taskName,
    progress_update: {
      goal: 'Exercise handoff cutover',
      summary: `${taskName} summary`,
      accomplished: [],
      next_steps: [],
      decisions: [],
      blockers: [],
      confidence: 'high',
      risks: [],
    },
    working_set: { key_files: [], active_ids: [], recent_commands: [] },
    context: { last_commit: 'abc1234', wip_state: 'clean' },
  };
}

function writeHandoff(root, relativeDir, filename, data) {
  const directory = join(root, relativeDir);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, filename), `${JSON.stringify(data, null, 2)}\n`);
}

function runClaudeHook(processCwd, projectDir) {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    HOME: join(projectDir, '.test-home'),
    USERPROFILE: join(projectDir, '.test-home'),
  };
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.PLUGIN_ROOT;

  const stdout = execFileSync(process.execPath, [hookPath], {
    cwd: processCwd,
    env,
    encoding: 'utf8',
    input: JSON.stringify({ source: 'compact' }),
    timeout: 10000,
  });
  return JSON.parse(stdout);
}

function runSkillBash(relativePath, cwd) {
  return execFileSync('bash', ['--noprofile', '--norc', '-c', firstBashBlock(relativePath)], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    },
  }).trim();
}

test('Claude SessionStart prefers canonical history over newer legacy history', () => {
  const root = mkdtempSync(join(tmpdir(), 'spectre-handoff-precedence-red-'));
  try {
    makeRepo(root, 'main');
    writeHandoff(
      root,
      '.spectre/handoffs/main',
      '2026-07-23-110000_handoff.json',
      handoff('canonical-history', 'main'),
    );
    writeHandoff(
      root,
      'docs/tasks/main/session_logs',
      '2026-07-23-120000_handoff.json',
      handoff('newer-legacy-history', 'main'),
    );

    const output = runClaudeHook(root, root);
    assert.match(output.systemMessage, /canonical-history/);
    assert.doesNotMatch(output.systemMessage, /newer-legacy-history/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Claude SessionStart resolves canonical history for a slashed branch', () => {
  const root = mkdtempSync(join(tmpdir(), 'spectre-handoff-slash-red-'));
  try {
    makeRepo(root, 'feature/session-path');
    writeHandoff(
      root,
      '.spectre/handoffs/feature/session-path',
      '2026-07-23-120000_handoff.json',
      handoff('slashed-branch-canonical', 'feature/session-path'),
    );

    const output = runClaudeHook(root, root);
    assert.equal(
      typeof output.systemMessage,
      'string',
      'canonical handoff for the slashed branch was not resumed',
    );
    assert.match(output.systemMessage, /slashed-branch-canonical/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('handoff skill maps a raw slashed branch and continues first canonical numbering', () => {
  const root = mkdtempSync(join(tmpdir(), 'spectre-handoff-numbering-'));
  try {
    makeRepo(root, 'feature/foo');
    for (const timestamp of ['100000', '110000', '120000']) {
      writeHandoff(
        root,
        'docs/tasks/feature/foo/session_logs',
        `2026-07-23-${timestamp}_handoff.json`,
        handoff(`legacy-${timestamp}`, 'feature/foo'),
      );
    }

    const context = JSON.parse(
      runSkillBash('plugins/spectre/skills/spectre-handoff/SKILL.md', root),
    );

    assert.equal(context.branch, 'feature/foo');
    assert.equal(context.session_count, 3);
    assert.equal(context.session_number, 4);
    assert.equal(context.history_path, 'docs/tasks/feature/foo/session_logs');
    assert.match(
      context.output_path,
      /^\.spectre\/handoffs\/feature\/foo\/.+_handoff\.json$/,
    );
    assert.equal(context.output_path.includes('%2F'), false);
    assert.equal(context.output_path.includes('feature-foo'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Claude SessionStart looks up the branch in CLAUDE_PROJECT_DIR', () => {
  const root = mkdtempSync(join(tmpdir(), 'spectre-handoff-project-dir-red-'));
  const processRepo = join(root, 'process-repo');
  const projectRepo = join(root, 'project-repo');
  try {
    makeRepo(processRepo, 'wrong-process-branch');
    makeRepo(projectRepo, 'target-project-branch');
    writeHandoff(
      projectRepo,
      'docs/tasks/target-project-branch/session_logs',
      '2026-07-23-120000_handoff.json',
      handoff('project-directory-branch', 'target-project-branch'),
    );

    const output = runClaudeHook(processRepo, projectRepo);
    assert.equal(
      typeof output.systemMessage,
      'string',
      'handoff from the explicit project directory was not resumed',
    );
    assert.match(output.systemMessage, /project-directory-branch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('native SessionStart prefers canonical handoff history', async () => {
  const root = mkdtempSync(join(tmpdir(), 'spectre-native-handoff-red-'));
  try {
    makeRepo(root, 'main');
    writeHandoff(
      root,
      '.spectre/handoffs/main',
      '2026-07-23-120000_handoff.json',
      handoff('native-canonical-history', 'main'),
    );
    const { buildSessionStartOutput } = await import(
      join(projectRoot, 'src', 'lib', 'project.js')
    );

    const output = buildSessionStartOutput(root, { source: 'resume' });
    assert.match(
      output.systemMessage,
      /\.spectre\/handoffs\/main\/2026-07-23-120000_handoff\.json/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('handoff contract continues numbering across the legacy-to-canonical cutover', () => {
  const file = 'plugins/spectre/skills/spectre-handoff/SKILL.md';
  const content = read(file);
  assert.ok(
    /\.spectre\/handoffs\/\{branch(?:-name)?\}\//.test(content),
    `${file}: missing canonical root`,
  );
  assert.ok(
    /session_(?:count|number).*canonical.*legacy.*no canonical history/is.test(content),
    `${file}: missing continued-numbering rule`,
  );
});

test('forget contract archives handoffs and todo history in both roots', () => {
  const file = 'plugins/spectre/skills/spectre-forget/SKILL.md';
  const content = read(file);
  assert.ok(
    /\.spectre\/handoffs\/\{branch(?:-name)?\}\//.test(content),
    `${file}: missing canonical root`,
  );
  assert.ok(
    /docs\/tasks\/\{branch\}\/session_logs\//.test(content),
    `${file}: missing legacy root`,
  );
  assert.ok(/\*_handoff\.json/.test(content), `${file}: missing handoff archive`);
  assert.ok(/\*_todos\.json/.test(content), `${file}: missing todo archive`);
  assert.ok(/todos_history\.json/.test(content), `${file}: missing todo history archive`);
});

test('forget archives both roots and neither SessionStart runtime resurrects history', async () => {
  const root = mkdtempSync(join(tmpdir(), 'spectre-forget-dual-root-'));
  try {
    makeRepo(root, 'main');
    const roots = [
      '.spectre/handoffs/main',
      'docs/tasks/main/session_logs',
    ];

    for (const relativeRoot of roots) {
      const activeRoot = join(root, relativeRoot);
      const archiveRoot = join(activeRoot, 'archive');
      mkdirSync(archiveRoot, { recursive: true });
      writeFileSync(
        join(activeRoot, '2026-07-23-120000_handoff.json'),
        `${JSON.stringify(handoff(`active-${relativeRoot}`, 'main'))}\n`,
      );
      writeFileSync(join(activeRoot, '2026-07-23-120000_todos.json'), '[]\n');
      writeFileSync(join(activeRoot, 'todos_history.json'), '[]\n');
      writeFileSync(
        join(archiveRoot, '2026-07-22-120000_handoff.json'),
        `${JSON.stringify(handoff(`archived-${relativeRoot}`, 'main'))}\n`,
      );
    }

    assert.equal(
      runSkillBash('plugins/spectre/skills/spectre-forget/SKILL.md', root),
      'ARCHIVED:6',
    );

    for (const relativeRoot of roots) {
      const activeRoot = join(root, relativeRoot);
      const archiveRoot = join(activeRoot, 'archive');
      assert.equal(
        readFileSync(join(archiveRoot, '2026-07-23-120000_todos.json'), 'utf8'),
        '[]\n',
      );
      assert.equal(
        readFileSync(join(archiveRoot, 'todos_history.json'), 'utf8'),
        '[]\n',
      );
      assert.equal(
        readFileSync(join(archiveRoot, '2026-07-23-120000_handoff.json'), 'utf8')
          .includes(`active-${relativeRoot}`),
        true,
      );
    }

    assert.deepEqual(runClaudeHook(root, root), {});

    const { buildSessionStartOutput } = await import(
      join(projectRoot, 'src', 'lib', 'project.js')
    );
    const nativeOutput = buildSessionStartOutput(root, { source: 'resume' });
    assert.doesNotMatch(nativeOutput.systemMessage, /injected/);
    assert.equal(
      fsExists(join(root, 'AGENTS.override.md')),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('native SessionStart injects canonical feature and handoff path guidance', async () => {
  const root = mkdtempSync(join(tmpdir(), 'spectre-native-guidance-red-'));
  try {
    makeRepo(root, 'main');
    writeHandoff(
      root,
      'docs/tasks/main/session_logs',
      '2026-07-23-120000_handoff.json',
      handoff('legacy-guidance-fixture', 'main'),
    );
    const { buildSessionStartOutput } = await import(
      join(projectRoot, 'src', 'lib', 'project.js')
    );
    buildSessionStartOutput(root, { source: 'resume' });
    const override = readFileSync(join(root, 'AGENTS.override.md'), 'utf8');

    assert.ok(
      /\.spectre\/features\/<feature-name>\//.test(override),
      'src/lib/project.js: injected guidance omits the canonical feature root',
    );
    assert.ok(
      /\.spectre\/handoffs\/\{branch(?:-name)?\}\//.test(override),
      'src/lib/project.js: injected guidance omits the canonical handoff root',
    );
    assert.ok(
      /docs\/tasks\/\*\*.*legacy (?:read|compatibility)/i.test(override),
      'src/lib/project.js: injected guidance does not label docs/tasks/** as compatibility-only',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

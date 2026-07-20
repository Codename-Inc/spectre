#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const STORE_MODULE = path.join(SCRIPT_DIR, 'knowledge', 'store.mjs');
const PATHS_MODULE = path.join(REPO_ROOT, 'src', 'lib', 'paths.js');

function makeTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-store-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

function makeProject(root, ...segments) {
  const projectDir = path.join(root, ...segments);
  fs.mkdirSync(projectDir, { recursive: true });
  return projectDir;
}

async function loadStoreModule() {
  assert.equal(
    fs.existsSync(STORE_MODULE),
    true,
    'knowledge/store.mjs must provide the canonical identity and transaction implementation',
  );
  return import(pathToFileURL(STORE_MODULE).href);
}

function noGit() {
  throw new Error('git unavailable');
}

function fakeGit(projects) {
  return (args, options) => {
    const project = projects.find(({ root }) => options.cwd.startsWith(fs.realpathSync(root)));
    if (!project) throw new Error('not a git project');
    if (args.join(' ') === 'rev-parse --show-toplevel') return project.repositoryRoot;
    if (args.join(' ') === 'rev-parse --git-common-dir') return project.commonDir;
    throw new Error(`unexpected git invocation: ${args.join(' ')}`);
  };
}

describe('project identity and readable store allocation', () => {
  it('canonicalizes non-Git and symlink roots and falls back on malformed Git', async (t) => {
    const tmp = makeTmp(t);
    const projectDir = makeProject(tmp, 'actual', 'team', 'api');
    const symlinkDir = path.join(tmp, 'api-link');
    fs.symlinkSync(projectDir, symlinkDir, 'dir');
    const { resolveProjectIdentity } = await loadStoreModule();

    const nonGit = resolveProjectIdentity(symlinkDir, { gitRunner: noGit });
    assert.deepEqual(nonGit, { canonicalProjectRoot: fs.realpathSync(projectDir) });

    const malformed = resolveProjectIdentity(projectDir, {
      gitRunner(args) {
        return args.includes('--show-toplevel') ? projectDir : '';
      },
    });
    assert.deepEqual(malformed, { canonicalProjectRoot: fs.realpathSync(projectDir) });
  });

  it('uses Git common-directory identity to converge linked worktrees', async (t) => {
    const tmp = makeTmp(t);
    const spectreHome = path.join(tmp, 'home');
    const repositoryRoot = makeProject(tmp, 'repo', 'main');
    const worktreeRoot = makeProject(tmp, 'repo', 'worktree');
    const commonDir = makeProject(tmp, 'repo', '.git');
    const gitRunner = fakeGit([
      { root: repositoryRoot, repositoryRoot, commonDir },
      { root: worktreeRoot, repositoryRoot: worktreeRoot, commonDir },
    ]);
    const { resolveProjectIdentity, resolveProjectStore } = await loadStoreModule();

    const identity = resolveProjectIdentity(worktreeRoot, { gitRunner });
    assert.deepEqual(identity, {
      canonicalProjectRoot: fs.realpathSync(worktreeRoot),
      gitRepositoryRoot: fs.realpathSync(worktreeRoot),
      gitCommonDir: fs.realpathSync(commonDir),
    });

    const mainStore = await resolveProjectStore(repositoryRoot, { spectreHome, gitRunner });
    const linkedStore = await resolveProjectStore(worktreeRoot, { spectreHome, gitRunner });
    assert.equal(linkedStore.storePath, mainStore.storePath);
    assert.equal(linkedStore.created, false);
  });

  it('resolves real Git common directories relative to nested command cwd', async (t) => {
    const tmp = makeTmp(t);
    const spectreHome = path.join(tmp, 'home');
    const repositoryRoot = makeProject(tmp, 'repo');
    const nestedRoot = makeProject(repositoryRoot, 'a', 'b');
    execFileSync('git', ['init', '-q'], { cwd: repositoryRoot });
    const { resolveProjectIdentity, resolveProjectStore } = await loadStoreModule();

    const repositoryIdentity = resolveProjectIdentity(repositoryRoot);
    const nestedIdentity = resolveProjectIdentity(nestedRoot);
    assert.equal(nestedIdentity.gitCommonDir, repositoryIdentity.gitCommonDir);

    const repositoryStore = await resolveProjectStore(repositoryRoot, { spectreHome });
    const nestedStore = await resolveProjectStore(nestedRoot, { spectreHome });
    assert.equal(nestedStore.storePath, repositoryStore.storePath);
  });

  it('expands readable paths leftward for same-name collisions without opaque IDs', async (t) => {
    const tmp = makeTmp(t);
    const spectreHome = path.join(tmp, 'home');
    const firstProject = makeProject(tmp, 'company-a', 'team', 'api');
    const secondProject = makeProject(tmp, 'company-b', 'team', 'api');
    const { resolveProjectStore } = await loadStoreModule();

    const first = await resolveProjectStore(firstProject, { spectreHome, gitRunner: noGit });
    const second = await resolveProjectStore(secondProject, { spectreHome, gitRunner: noGit });

    assert.equal(first.storePath, path.join(spectreHome, 'projects', 'team', 'api'));
    assert.equal(
      second.storePath,
      path.join(spectreHome, 'projects', 'company-b', 'team', 'api'),
    );
    assert.doesNotMatch(path.relative(path.join(spectreHome, 'projects'), second.storePath), /[a-f0-9]{16}/);
    assert.notEqual(first.storePath, second.storePath);
  });

  it('allocates a new readable store after a non-Git move and preserves the old store', async (t) => {
    const tmp = makeTmp(t);
    const spectreHome = path.join(tmp, 'home');
    const originalProject = makeProject(tmp, 'old-place', 'team', 'api');
    const movedProject = path.join(tmp, 'new-place', 'team', 'api');
    const { resolveProjectStore } = await loadStoreModule();

    const original = await resolveProjectStore(originalProject, {
      spectreHome,
      gitRunner: noGit,
    });
    const originalMetadata = fs.readFileSync(
      path.join(original.storePath, 'project.json'),
      'utf8',
    );
    fs.mkdirSync(path.dirname(movedProject), { recursive: true });
    fs.renameSync(originalProject, movedProject);

    const moved = await resolveProjectStore(movedProject, { spectreHome, gitRunner: noGit });
    assert.notEqual(moved.storePath, original.storePath);
    assert.equal(fs.readFileSync(path.join(original.storePath, 'project.json'), 'utf8'), originalMetadata);
    assert.equal(fs.existsSync(original.storePath), true);
    assert.equal(moved.metadata.canonicalProjectRoot, fs.realpathSync(movedProject));
  });
});

describe('atomic store files', () => {
  it('preserves prior project and index bytes when failure is injected before rename', async (t) => {
    const tmp = makeTmp(t);
    const storePath = makeProject(tmp, 'store');
    const projectPath = path.join(storePath, 'project.json');
    const indexPath = path.join(storePath, 'index.json');
    const priorProject = '{"schemaVersion":1,"canonicalProjectRoot":"/prior"}\n';
    const priorIndex = '{"schemaVersion":1,"records":[]}\n';
    fs.writeFileSync(projectPath, priorProject);
    fs.writeFileSync(indexPath, priorIndex);
    const { atomicWriteJson } = await loadStoreModule();

    for (const [filePath, nextValue] of [
      [projectPath, { schemaVersion: 1, canonicalProjectRoot: '/next' }],
      [indexPath, { schemaVersion: 1, records: [{ id: 'next' }] }],
    ]) {
      assert.throws(
        () =>
          atomicWriteJson(filePath, nextValue, {
            beforeRename() {
              throw new Error('injected-before-rename');
            },
          }),
        /injected-before-rename/,
      );
    }

    assert.equal(fs.readFileSync(projectPath, 'utf8'), priorProject);
    assert.equal(fs.readFileSync(indexPath, 'utf8'), priorIndex);
    assert.deepEqual(
      fs.readdirSync(storePath).sort(),
      ['index.json', 'project.json'],
    );
  });
});

describe('exclusive store locks', () => {
  it('acquires immediately, releases after success, and waits for a current owner', async (t) => {
    const tmp = makeTmp(t);
    const storePath = makeProject(tmp, 'store');
    const { withStoreLock } = await loadStoreModule();
    assert.equal(typeof withStoreLock, 'function');

    const immediate = await withStoreLock(
      storePath,
      'register',
      async () => 'complete',
      { timeoutMs: 200, retryDelayMs: 5 },
    );
    assert.equal(immediate, 'complete');
    assert.equal(fs.existsSync(path.join(storePath, '.spectre.lock')), false);

    const lockPath = path.join(storePath, '.spectre.lock');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString(), operation: 'other' }),
    );
    setTimeout(() => fs.rmSync(lockPath, { force: true }), 25);
    const waited = await withStoreLock(
      storePath,
      'migrate',
      async () => 'after-wait',
      { timeoutMs: 300, retryDelayMs: 5 },
    );
    assert.equal(waited, 'after-wait');
  });

  it('times out behind a live owner without removing that owner lock', async (t) => {
    const tmp = makeTmp(t);
    const storePath = makeProject(tmp, 'store');
    const lockPath = path.join(storePath, '.spectre.lock');
    const owner = {
      pid: process.pid,
      timestamp: new Date().toISOString(),
      operation: 'other',
    };
    fs.writeFileSync(lockPath, JSON.stringify(owner));
    const { withStoreLock } = await loadStoreModule();
    assert.equal(typeof withStoreLock, 'function');

    await assert.rejects(
      withStoreLock(storePath, 'register', async () => {}, {
        timeoutMs: 30,
        retryDelayMs: 5,
      }),
      (error) => error.code === 'LOCK_TIMEOUT',
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')), owner);
  });

  it('recovers dead-PID and timestamp-expired locks exactly once', async (t) => {
    const tmp = makeTmp(t);
    const storePath = makeProject(tmp, 'store');
    const lockPath = path.join(storePath, '.spectre.lock');
    const { withStoreLock } = await loadStoreModule();
    assert.equal(typeof withStoreLock, 'function');

    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999_999, timestamp: new Date().toISOString(), operation: 'dead' }),
    );
    const deadPid = await withStoreLock(storePath, 'register', async () => 'dead-recovered', {
      timeoutMs: 100,
      retryDelayMs: 5,
      isProcessAlive: () => false,
    });
    assert.equal(deadPid, 'dead-recovered');

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        timestamp: new Date(Date.now() - 60_001).toISOString(),
        operation: 'expired',
      }),
    );
    const expired = await withStoreLock(storePath, 'register', async () => 'age-recovered', {
      timeoutMs: 100,
      retryDelayMs: 5,
      isProcessAlive: () => true,
    });
    assert.equal(expired, 'age-recovered');
    assert.equal(fs.existsSync(lockPath), false);
  });
});

describe('read-only resolution and npm path adapters', () => {
  it('does not create a missing store or wait behind a held writer lock', async (t) => {
    const tmp = makeTmp(t);
    const spectreHome = path.join(tmp, 'home');
    const projectDir = makeProject(tmp, 'projects', 'team', 'api');
    const { resolveProjectStore } = await loadStoreModule();

    const missing = await resolveProjectStore(projectDir, {
      spectreHome,
      gitRunner: noGit,
      readOnly: true,
    });
    assert.deepEqual(missing, {
      storePath: null,
      metadata: { canonicalProjectRoot: fs.realpathSync(projectDir) },
      created: false,
    });
    assert.equal(fs.existsSync(path.join(spectreHome, 'projects')), false);

    const created = await resolveProjectStore(projectDir, { spectreHome, gitRunner: noGit });
    fs.writeFileSync(
      path.join(created.storePath, '.spectre.lock'),
      JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString(), operation: 'writer' }),
    );
    const startedAt = Date.now();
    const existing = await resolveProjectStore(projectDir, {
      spectreHome,
      gitRunner: noGit,
      readOnly: true,
    });
    assert.equal(existing.storePath, created.storePath);
    assert.equal(Date.now() - startedAt < 100, true);
  });

  it('derives Spectre-home store, index, report, and session paths without identity logic', async (t) => {
    const tmp = makeTmp(t);
    const previousHome = process.env.SPECTRE_HOME;
    t.after(() => {
      if (previousHome === undefined) delete process.env.SPECTRE_HOME;
      else process.env.SPECTRE_HOME = previousHome;
    });
    process.env.SPECTRE_HOME = path.join(tmp, 'spectre-home');
    const pathsModule = await import(`${pathToFileURL(PATHS_MODULE).href}?test=${Date.now()}`);

    assert.equal(typeof pathsModule.resolveSpectreHome, 'function');
    assert.equal(typeof pathsModule.spectreProjectsDir, 'function');
    assert.equal(typeof pathsModule.knowledgeStorePaths, 'function');
    assert.equal(pathsModule.resolveSpectreHome(), process.env.SPECTRE_HOME);
    assert.equal(
      pathsModule.spectreProjectsDir(),
      path.join(process.env.SPECTRE_HOME, 'projects'),
    );
    const storePath = path.join(process.env.SPECTRE_HOME, 'projects', 'team', 'api');
    assert.deepEqual(pathsModule.knowledgeStorePaths(storePath), {
      storePath,
      projectMetadataPath: path.join(storePath, 'project.json'),
      knowledgeDir: path.join(storePath, 'knowledge'),
      indexPath: path.join(storePath, 'index.json'),
      migrationReportPath: path.join(storePath, 'migration-report.json'),
      runtimeDir: path.join(storePath, 'runtime'),
      sessionsDir: path.join(storePath, 'runtime', 'sessions'),
    });
  });
});

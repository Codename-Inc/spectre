#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { resolveWorkIdentity, resolveOrAllocateWorkIdentity } from './knowledge/work.mjs';

function makeWorkspace(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-knowledge-work-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projectDir = path.join(tmp, 'workspace', 'project');
  const spectreHome = path.join(tmp, 'spectre-home');
  fs.mkdirSync(projectDir, { recursive: true });
  return { projectDir, spectreHome };
}

function options(workspace, associations = {}) {
  return { projectDir: workspace.projectDir, spectreHome: workspace.spectreHome, ...associations };
}

describe('stable work identity', () => {
  it('resolves concurrent captures for one exact source run to one work id', async (t) => {
    const workspace = makeWorkspace(t);
    const results = await Promise.all([
      resolveOrAllocateWorkIdentity(options(workspace, { sourceRunId: 'run_exact-capture' })),
      resolveOrAllocateWorkIdentity(options(workspace, { sourceRunId: 'run_exact-capture' })),
    ]);

    assert.equal(results[0].workId, results[1].workId);
    assert.deepEqual(
      await resolveWorkIdentity(options(workspace, { sourceRunId: 'run_exact-capture' })),
      { status: 'resolved', workId: results[0].workId },
    );
  });

  it('requires identification for conflicting exact associations instead of guessing', async (t) => {
    const workspace = makeWorkspace(t);
    const first = await resolveOrAllocateWorkIdentity(options(workspace, { sourceRunId: 'run_first' }));
    const second = await resolveOrAllocateWorkIdentity(options(workspace, { pullRequestId: 'github:42' }));

    await assert.rejects(
      () => resolveWorkIdentity(options(workspace, {
        sourceRunId: 'run_first',
        pullRequestId: 'github:42',
      })),
      (error) => error.code === 'WORK_IDENTITY_AMBIGUOUS'
        && new Set(error.workIds).size === 2
        && error.workIds.includes(first.workId)
        && error.workIds.includes(second.workId),
    );
  });

  it('keeps later exact candidate associations on an explicitly carried work id', async (t) => {
    const workspace = makeWorkspace(t);
    const created = await resolveOrAllocateWorkIdentity(options(workspace, { sourceRunId: 'run_initial' }));
    const candidate = {
      repository: 'github.com/example/spectre',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      diff: 'sha256:c'.padEnd(71, 'c'),
    };

    const associated = await resolveOrAllocateWorkIdentity(options(workspace, {
      workId: created.workId,
      candidate,
    }));
    assert.equal(associated.workId, created.workId);
    const repeated = await resolveOrAllocateWorkIdentity(options(workspace, { candidate }));
    assert.equal(repeated.workId, created.workId);
    assert.equal(repeated.status, 'noop', 'an unchanged direct PR candidate must not fork work');
    assert.deepEqual(
      await resolveWorkIdentity(options(workspace, { candidate })),
      { status: 'resolved', workId: created.workId },
    );
  });
});

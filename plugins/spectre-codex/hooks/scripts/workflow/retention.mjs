import fs from 'node:fs';
import path from 'node:path';

import {
  atomicWriteJson,
  resolveProjectStore,
  resolveSpectreHome,
  withStoreLock,
} from '../knowledge/store.mjs';
import {
  interruptStoredWorkflowRun,
  recordWorkflowEvents,
  TERMINAL_RUN_STATUSES,
  workflowPaths,
} from './store.mjs';

const DAY_MS = 24 * 60 * 60 * 1_000;
const RAW_RETENTION_MS = 30 * DAY_MS;
const SUMMARY_RETENTION_MS = 90 * DAY_MS;
const ACTIVE_STALE_MS = 7 * DAY_MS;
const RECOVERY_RETENTION_MS = 7 * DAY_MS;
const PROJECT_SIZE_CAP_BYTES = 25 * 1024 * 1024;

function milliseconds(now) {
  const value = typeof now === 'function' ? now() : Date.now();
  return value instanceof Date ? value.getTime() : Number(value);
}

function fileSize(targetPath) {
  let total = 0;
  if (!fs.existsSync(targetPath)) return total;
  const pending = [targetPath];
  while (pending.length > 0) {
    const current = pending.pop();
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isFile()) {
      total += stat.size;
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(current)) pending.push(path.join(current, entry));
  }
  return total;
}

function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function removeOwnedPath(targetPath, root, dryRun, actions, reason) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing cleanup outside workflow root: ${resolvedTarget}`);
  }
  if (!fs.existsSync(resolvedTarget)) return 0;
  const bytes = fileSize(resolvedTarget);
  actions.push({ action: 'remove', path: path.relative(resolvedRoot, resolvedTarget), bytes, reason });
  if (!dryRun) fs.rmSync(resolvedTarget, { recursive: true, force: true });
  return bytes;
}

function listRuns(workflowRoot) {
  const runsDir = path.join(workflowRoot, 'runs');
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('run_'))
    .map((entry) => {
      const runDir = path.join(runsDir, entry.name);
      const statePath = path.join(runDir, 'state.json');
      const summaryPath = path.join(runDir, 'summary.json');
      const eventsPath = path.join(runDir, 'events.jsonl');
      const state = readJsonOrNull(statePath);
      const summary = readJsonOrNull(summaryPath);
      const endedAt = Date.parse(summary?.endedAt || state?.endedAt || '');
      const lastEventAt = Date.parse(state?.lastEventAt || summary?.lastEventAt || '');
      return {
        runId: entry.name,
        runDir,
        statePath,
        summaryPath,
        eventsPath,
        state,
        summary,
        status: summary?.status || state?.status || 'unknown',
        endedAt: Number.isFinite(endedAt) ? endedAt : null,
        lastEventAt: Number.isFinite(lastEventAt) ? lastEventAt : null,
      };
    });
}

async function interruptStaleRuns(projectDir, runs, options) {
  const nowMs = milliseconds(options.now);
  const actions = [];
  for (const run of runs) {
    if (!['active', 'blocked'].includes(run.status) || run.lastEventAt === null) continue;
    if (nowMs - run.lastEventAt < (options.activeStaleMs ?? ACTIVE_STALE_MS)) continue;
    actions.push({ action: 'interrupt', runId: run.runId, reason: 'inactive-retention' });
    if (options.dryRun) continue;
    await recordWorkflowEvents({
      projectDir,
      spectreHome: options.spectreHome,
      runId: run.runId,
      now: options.now,
      idempotencyKey: `retention:interrupt:${run.runId}`,
      events: [{
        type: 'run.interrupted',
        actorId: run.state.primaryActorId,
        payload: { reasonCode: 'inactive-retention' },
      }],
    });
  }
  return actions;
}

async function cleanupStoredWorkflow(storePath, options = {}) {
  const workflowRoot = workflowPaths(storePath).workflowRoot;
  if (!fs.existsSync(workflowRoot)) {
    return { ok: true, skipped: 'NO_WORKFLOW_STORE', actions: [], remainingBytes: 0 };
  }
  const nowMs = milliseconds(options.now);
  const staleActions = [];
  for (const run of listRuns(workflowRoot)) {
    if (!['active', 'blocked'].includes(run.status) || run.lastEventAt === null) continue;
    if (nowMs - run.lastEventAt < (options.activeStaleMs ?? ACTIVE_STALE_MS)) continue;
    staleActions.push({ action: 'interrupt', runId: run.runId, reason: 'inactive-retention' });
    if (!options.dryRun) {
      await interruptStoredWorkflowRun({ storePath, runId: run.runId, now: options.now });
    }
  }
  const result = await withStoreLock(storePath, 'workflow-retention-cleanup', async () =>
    cleanupLocked(workflowRoot, options));
  return { ok: true, ...result, actions: [...staleActions, ...result.actions] };
}

function cleanupLocked(workflowRoot, options = {}) {
  const nowMs = milliseconds(options.now);
  const rawRetentionMs = options.rawRetentionMs ?? RAW_RETENTION_MS;
  const summaryRetentionMs = options.summaryRetentionMs ?? SUMMARY_RETENTION_MS;
  const recoveryRetentionMs = options.recoveryRetentionMs ?? RECOVERY_RETENTION_MS;
  const sizeCapBytes = options.sizeCapBytes ?? PROJECT_SIZE_CAP_BYTES;
  const dryRun = Boolean(options.dryRun);
  const actions = [];
  let projectedBytes = fileSize(workflowRoot);

  const recoveryDir = path.join(workflowRoot, 'recovery');
  if (fs.existsSync(recoveryDir)) {
    for (const entry of fs.readdirSync(recoveryDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filePath = path.join(recoveryDir, entry.name);
      if (nowMs - fs.statSync(filePath).mtimeMs >= recoveryRetentionMs) {
        projectedBytes -= removeOwnedPath(
          filePath,
          workflowRoot,
          dryRun,
          actions,
          'recovery-expired',
        );
      }
    }
  }

  let runs = listRuns(workflowRoot);
  for (const run of runs) {
    if (run.endedAt !== null && nowMs - run.endedAt >= summaryRetentionMs) {
      projectedBytes -= removeOwnedPath(
        run.runDir,
        workflowRoot,
        dryRun,
        actions,
        'summary-expired',
      );
      continue;
    }
    if (
      TERMINAL_RUN_STATUSES.has(run.status)
      && run.endedAt !== null
      && nowMs - run.endedAt >= rawRetentionMs
    ) {
      for (const targetPath of [run.eventsPath, run.statePath]) {
        projectedBytes -= removeOwnedPath(
          targetPath,
          workflowRoot,
          dryRun,
          actions,
          'raw-expired',
        );
      }
    }
  }

  if (projectedBytes > sizeCapBytes) {
    runs = listRuns(workflowRoot)
      .filter((run) => TERMINAL_RUN_STATUSES.has(run.status))
      .sort((left, right) => (left.endedAt || 0) - (right.endedAt || 0));
    for (const run of runs) {
      if (projectedBytes <= sizeCapBytes) break;
      for (const targetPath of [run.eventsPath, run.statePath]) {
        if (projectedBytes <= sizeCapBytes) break;
        projectedBytes -= removeOwnedPath(
          targetPath,
          workflowRoot,
          dryRun,
          actions,
          'project-size-cap-raw',
        );
      }
    }
    for (const run of runs) {
      if (projectedBytes <= sizeCapBytes) break;
      projectedBytes -= removeOwnedPath(
        run.runDir,
        workflowRoot,
        dryRun,
        actions,
        'project-size-cap-summary',
      );
    }
  }

  if (!dryRun) {
    atomicWriteJson(path.join(workflowRoot, 'cleanup.json'), {
      schemaVersion: 1,
      cleanedAt: new Date(nowMs).toISOString(),
      rawRetentionDays: rawRetentionMs / DAY_MS,
      summaryRetentionDays: summaryRetentionMs / DAY_MS,
      sizeCapBytes,
      remainingBytes: Math.max(0, projectedBytes),
    });
  }
  return { actions, remainingBytes: Math.max(0, projectedBytes), sizeCapBytes };
}

export async function cleanupProjectWorkflow(options = {}) {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    readOnly: true,
  });
  if (!resolved.storePath) {
    return { ok: true, skipped: 'NO_PROJECT_STORE', actions: [], remainingBytes: 0 };
  }
  const workflowRoot = workflowPaths(resolved.storePath).workflowRoot;
  if (!fs.existsSync(workflowRoot)) {
    return { ok: true, skipped: 'NO_WORKFLOW_STORE', actions: [], remainingBytes: 0 };
  }

  const staleActions = await interruptStaleRuns(projectDir, listRuns(workflowRoot), options);
  const result = await withStoreLock(resolved.storePath, 'workflow-retention-cleanup', async () =>
    cleanupLocked(workflowRoot, options));
  return { ok: true, ...result, actions: [...staleActions, ...result.actions] };
}

export async function purgeProjectWorkflow(options = {}) {
  if (!options.confirm) throw new Error('Workflow purge requires --yes');
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    readOnly: true,
  });
  if (!resolved.storePath) return { ok: true, removed: false, bytes: 0 };
  const workflowRoot = workflowPaths(resolved.storePath).workflowRoot;
  return withStoreLock(resolved.storePath, 'workflow-purge', async () => {
    const bytes = fileSize(workflowRoot);
    fs.rmSync(workflowRoot, { recursive: true, force: true });
    return { ok: true, removed: bytes > 0, bytes };
  });
}

function projectMetadataPaths(projectsDir) {
  if (!fs.existsSync(projectsDir)) return [];
  const found = [];
  const pending = [projectsDir];
  while (pending.length > 0) {
    const current = pending.pop();
    const metadataPath = path.join(current, 'project.json');
    if (fs.existsSync(metadataPath)) {
      found.push(metadataPath);
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(path.join(current, entry.name));
    }
  }
  return found;
}

function claimDailyCleanup(spectreHome, now) {
  const date = new Date(milliseconds(now)).toISOString().slice(0, 10);
  const markerRoot = path.join(spectreHome, 'state', 'workflow-cleanup');
  fs.mkdirSync(markerRoot, { recursive: true, mode: 0o700 });
  for (const entry of fs.readdirSync(markerRoot)) {
    if (entry !== date) fs.rmSync(path.join(markerRoot, entry), { recursive: true, force: true });
  }
  try {
    const fd = fs.openSync(path.join(markerRoot, date), 'wx', 0o600);
    fs.closeSync(fd);
    return true;
  } catch (error) {
    return error?.code !== 'EEXIST';
  }
}

export async function cleanupAllWorkflowStores(options = {}) {
  const spectreHome = resolveSpectreHome(options.spectreHome);
  if (!options.force && !claimDailyCleanup(spectreHome, options.now)) {
    return { ok: true, skipped: 'ALREADY_RAN_TODAY', projects: [] };
  }
  const projects = [];
  for (const metadataPath of projectMetadataPaths(path.join(spectreHome, 'projects'))) {
    const metadata = readJsonOrNull(metadataPath);
    if (!metadata?.canonicalProjectRoot) continue;
    try {
      const projectDir = metadata.canonicalProjectRoot;
      const storePath = path.dirname(metadataPath);
      projects.push(fs.existsSync(projectDir)
        ? await cleanupProjectWorkflow({ ...options, projectDir, spectreHome })
        : await cleanupStoredWorkflow(storePath, options));
    } catch (error) {
      projects.push({ ok: false, projectDir: metadata.canonicalProjectRoot, error: error.message });
    }
  }
  return { ok: true, projects };
}

export async function maybeCleanupProjectWorkflow(options = {}) {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    readOnly: true,
  });
  if (!resolved.storePath) return { ok: true, skipped: 'NO_PROJECT_STORE' };
  const cleanupPath = path.join(workflowPaths(resolved.storePath).workflowRoot, 'cleanup.json');
  const prior = readJsonOrNull(cleanupPath);
  const nowMs = milliseconds(options.now);
  if (prior?.cleanedAt && nowMs - Date.parse(prior.cleanedAt) < DAY_MS) {
    return { ok: true, skipped: 'ALREADY_RAN_TODAY' };
  }
  return cleanupProjectWorkflow(options);
}

export {
  ACTIVE_STALE_MS,
  DAY_MS,
  PROJECT_SIZE_CAP_BYTES,
  RAW_RETENTION_MS,
  RECOVERY_RETENTION_MS,
  SUMMARY_RETENTION_MS,
};

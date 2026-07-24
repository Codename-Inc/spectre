import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  AGENTS_BRIDGE_END,
  AGENTS_BRIDGE_START,
  KNOWLEDGE_OVERRIDE_END,
  KNOWLEDGE_OVERRIDE_START,
  MANIFEST_VERSION,
  SESSION_OVERRIDE_END,
  SESSION_OVERRIDE_START,
  repoMetadata
} from './constants.js';
import { ensureDir, projectPaths } from './paths.js';

function gitBranch(projectDir) {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    // Fall through to rev-parse for detached HEAD or older setups.
  }

  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return 'unknown';
  }
}

function findLatestHandoffInDir(sessionDir) {
  if (!fs.existsSync(sessionDir)) {
    return null;
  }

  const files = fs.readdirSync(sessionDir)
    .filter(name => name.endsWith('_handoff.json'))
    .map(name => {
      const fullPath = path.join(sessionDir, name);
      return {
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return files[0]?.fullPath ?? null;
}

function findLatestHandoff(projectDir, branchName) {
  const canonicalHandoff = findLatestHandoffInDir(
    path.join(projectDir, '.spectre', 'handoffs', branchName)
  );
  if (canonicalHandoff) {
    return canonicalHandoff;
  }

  return findLatestHandoffInDir(
    path.join(projectDir, 'docs', 'tasks', branchName, 'session_logs')
  );
}

function formatList(items, fallback) {
  const emptyValue = fallback ?? '- None recorded.';
  if (!items || items.length === 0) {
    return emptyValue;
  }

  return items.map(item => `- ${item}`).join('\n');
}

function buildCheckboxTree(tasks) {
  if (!tasks || tasks.length === 0) {
    return 'No tasks found.';
  }

  const byParent = {};
  for (const task of tasks) {
    const parent = task.parent || null;
    if (!byParent[parent]) {
      byParent[parent] = [];
    }
    byParent[parent].push(task);
  }

  function renderTask(task, indent = 0) {
    const lines = [];
    const prefix = '  '.repeat(indent);
    const checkbox = task.completed ? '[x]' : '[ ]';
    const status = task.status || 'open';
    const title = task.title || 'Untitled';
    const taskId = task.id || 'unknown';

    if (task.completed) {
      lines.push(`${prefix}- ${checkbox} ${title} (${taskId}) - COMPLETED`);
    } else {
      const cmd = task.resume_command || `bd update ${taskId} --status in_progress`;
      const statusBadge = status !== 'open' ? `[${status}]` : '';
      lines.push(`${prefix}- ${checkbox} ${title} (${taskId}) ${statusBadge} - \`${cmd}\``);
    }

    const childrenIds = task.children || [];
    if (childrenIds.length > 0) {
      for (const childTask of tasks) {
        if (childrenIds.includes(childTask.id) || childTask.parent === taskId) {
          lines.push(...renderTask(childTask, indent + 1));
        }
      }
    }

    return lines;
  }

  const rootTasks = (byParent[null] || []).concat(byParent.null || []);
  const startTasks = rootTasks.length > 0 ? rootTasks : tasks;
  const lines = [];
  const renderedIds = new Set();

  for (const task of startTasks) {
    if (renderedIds.has(task.id)) {
      continue;
    }

    lines.push(...renderTask(task));
    renderedIds.add(task.id);

    for (const entry of tasks) {
      if (entry.parent === task.id) {
        renderedIds.add(entry.id);
      }
    }
  }

  return lines.join('\n');
}

function buildVisibleResumeNotice(options = {}) {
  const parts = ['🟢 👻 SPECTRE active'];

  if (options.handoffPath) {
    parts.push(`injected ${options.handoffPath}`);
  }

  if (options.knowledgeStatus) {
    parts.push(options.knowledgeStatus);
  }

  return parts.join(' | ');
}

function buildSessionOverrideContent(handoff, options = {}) {
  const branchName = handoff.branch_name || options.branchName || 'unknown';
  const handoffPath = options.handoffPath || 'unknown';
  const source = options.source || 'unknown';
  const taskName = handoff.task_name || branchName;
  const progress = handoff.progress_update || {};
  const summary = progress.summary || 'No summary available.';
  const goal = progress.goal || '';
  const constraints = progress.constraints || [];
  const decisions = progress.decisions || [];
  const accomplished = progress.accomplished || [];
  const now = progress.now || '';
  const nextSteps = progress.next_steps || [];
  const blockers = progress.blockers || [];
  const openQuestions = progress.open_questions || [];
  const confidence = progress.confidence || 'unknown';
  const risks = progress.risks || [];
  const workingSet = handoff.working_set || {};
  const context = handoff.context || {};
  const beads = handoff.beads || {};
  const beadsAvailable = beads.available != null ? beads.available : true;
  const checkboxTree = beadsAvailable && beads.tasks?.length > 0 ? buildCheckboxTree(beads.tasks) : '';
  const sections = [];

  sections.push(`# Session Context: ${taskName}`);
  sections.push(`\n## Last Session Summary\n${summary}`);
  if (goal) sections.push(`\n### Goal\n${goal}`);
  if (constraints.length > 0) sections.push(`\n### Constraints\n${formatList(constraints)}`);
  sections.push(`\n### What We Accomplished\n${formatList(accomplished)}`);
  if (now) sections.push(`\n### Active Work (Resume Here)\n**${now}**`);
  sections.push(`\n### What's Next\n${formatList(nextSteps)}`);
  if (blockers.length > 0) sections.push(`\n### Blockers\n${formatList(blockers)}`);
  if (openQuestions.length > 0) sections.push(`\n### Open Questions\n${formatList(openQuestions)}`);
  if (decisions.length > 0) sections.push(`\n### Decisions Made\n${formatList(decisions)}`);

  const risksSummary = risks.length > 0 ? formatList(risks, '') : 'None identified';
  sections.push(`\n**Confidence**: ${confidence} | **Risks**: ${risksSummary}`);

  const workingSetLines = [];
  if (workingSet.key_files?.length > 0) workingSetLines.push(`- **Key Files**: ${workingSet.key_files.join(', ')}`);
  if (workingSet.active_ids?.length > 0) workingSetLines.push(`- **Active IDs**: ${workingSet.active_ids.join(', ')}`);
  if (workingSet.recent_commands?.length > 0) workingSetLines.push(`- **Recent Commands**: ${workingSet.recent_commands.join(', ')}`);
  if (workingSetLines.length > 0) sections.push(`\n### Working Set\n${workingSetLines.join('\n')}`);

  sections.push(
    '\n### Spectre Notes\n' +
    '- Store feature artifacts under `.spectre/features/<feature-name>/`.\n' +
    '- Store branch handoffs under `.spectre/handoffs/{branch-name}/`.\n' +
    '- Treat `docs/tasks/**` as legacy compatibility only.\n' +
    '- Prefer existing project skills under `.agents/skills/` before rediscovering codebase context.\n' +
    '- Treat `.spectre/manifest.json` as Spectre install metadata.\n' +
    `- **SessionStart Source**: ${source}\n` +
    `- **Snapshot**: ${handoffPath}`
  );
  sections.push(
    '\n---\n\n## Context\n' +
    `- **Branch**: ${branchName}\n` +
    `- **Last Commit**: ${context.last_commit || 'unknown'}\n` +
    `- **WIP State**: ${context.wip_state || 'unknown'}`
  );
  if (beadsAvailable && checkboxTree) sections.push(`\n### Beads Tasks\n${checkboxTree}`);

  return sections.join('');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function managedOverridePattern(startMarker, endMarker) {
  return new RegExp(`\\n?${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`, 'm');
}

function normalizeOverrideFile(content) {
  return content
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function writeManagedOverride(overridePath, startMarker, endMarker, bodyContent) {
  const current = fs.existsSync(overridePath) ? fs.readFileSync(overridePath, 'utf8') : '';
  const pattern = managedOverridePattern(startMarker, endMarker);
  const blockContent = `${startMarker}\n${bodyContent}\n${endMarker}`;
  let updated;

  if (pattern.test(current)) {
    updated = current.replace(pattern, `${blockContent}\n`);
  } else if (current.trim()) {
    updated = `${current.trimEnd()}\n\n${blockContent}\n`;
  } else {
    updated = `${blockContent}\n`;
  }

  const normalized = normalizeOverrideFile(updated);
  ensureDir(path.dirname(overridePath));
  fs.writeFileSync(overridePath, normalized ? `${normalized}\n` : '');
}

function removeManagedOverride(overridePath, startMarker, endMarker) {
  if (!fs.existsSync(overridePath)) {
    return;
  }

  const current = fs.readFileSync(overridePath, 'utf8');
  const updated = normalizeOverrideFile(current.replace(managedOverridePattern(startMarker, endMarker), '\n'));

  if (!updated) {
    fs.unlinkSync(overridePath);
    return;
  }

  fs.writeFileSync(overridePath, `${updated}\n`);
}

export function clearSessionOverride(projectDir) {
  removeManagedOverride(projectPaths(projectDir).overrideAgentsPath, SESSION_OVERRIDE_START, SESSION_OVERRIDE_END);
}

export function syncSessionOverride(projectDir, payload = {}) {
  const branchName = gitBranch(projectDir);
  const latestHandoff = findLatestHandoff(projectDir, branchName);
  if (!latestHandoff) {
    clearSessionOverride(projectDir);
    return null;
  }

  let handoff;
  try {
    handoff = JSON.parse(fs.readFileSync(latestHandoff, 'utf8'));
  } catch {
    clearSessionOverride(projectDir);
    return null;
  }

  const handoffPath = path.relative(projectDir, latestHandoff) || latestHandoff;
  const source = payload.source || 'unknown';
  writeManagedOverride(
    projectPaths(projectDir).overrideAgentsPath,
    SESSION_OVERRIDE_START,
    SESSION_OVERRIDE_END,
    [
      '## SPECTRE Session Context',
      '',
      'This block is managed by SPECTRE and replaced automatically on session start.',
      'Use it as prior working context for this repository session.',
      '',
      buildSessionOverrideContent(handoff, { branchName, handoffPath, source })
    ].join('\n')
  );

  return { handoff, handoffPath, branchName, source };
}

export function clearKnowledgeOverride(projectDir) {
  const overridePath = projectPaths(projectDir).overrideAgentsPath;
  if (!fs.existsSync(overridePath)) return;
  const current = fs.readFileSync(overridePath, 'utf8');
  const updated = current.replace(
    managedOverridePattern(KNOWLEDGE_OVERRIDE_START, KNOWLEDGE_OVERRIDE_END),
    ''
  );
  if (updated.length === 0) {
    fs.unlinkSync(overridePath);
  } else if (updated !== current) {
    fs.writeFileSync(overridePath, updated);
  }
}

export function buildSessionStartOutput(projectDir, payload = {}) {
  clearKnowledgeOverride(projectDir);
  const synced = syncSessionOverride(projectDir, payload);

  return {
    systemMessage: buildVisibleResumeNotice({
      handoffPath: synced?.handoffPath
    }),
    hookSpecificOutput: {
      hookEventName: 'SessionStart'
    }
  };
}

function removeBridge(rootAgentsPath, startMarker = AGENTS_BRIDGE_START, endMarker = AGENTS_BRIDGE_END) {
  if (!fs.existsSync(rootAgentsPath)) {
    return;
  }

  const current = fs.readFileSync(rootAgentsPath, 'utf8');
  const pattern = new RegExp(`\\n?${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`, 'm');
  const updated = current.replace(pattern, '\n').trimEnd();

  if (!updated) {
    fs.unlinkSync(rootAgentsPath);
    return;
  }

  fs.writeFileSync(rootAgentsPath, `${updated}\n`);
}

function legacyRegistryHasRows(skillDir) {
  const registryPath = path.join(skillDir, 'references', 'registry.toon');
  if (!fs.existsSync(registryPath)) return false;
  return fs.readFileSync(registryPath, 'utf8')
    .split(/\r?\n/)
    .some(line => line.trim() && !line.trimStart().startsWith('#'));
}

function cleanupRetiredRecallDirs(projectDir) {
  for (const nativeRoot of ['.agents', '.claude']) {
    for (const skillName of ['spectre-recall', 'spectre-find']) {
      const skillDir = path.join(projectDir, nativeRoot, 'skills', skillName);
      if (fs.existsSync(skillDir) && !legacyRegistryHasRows(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
    }
  }
}

function cleanupLegacyProjectContext(projectDir, options = {}) {
  const paths = projectPaths(projectDir);
  const forkName = ['cas', 'par'].join('');
  removeBridge(paths.rootAgentsPath);
  clearKnowledgeOverride(projectDir);
  removeBridge(
    paths.rootAgentsPath,
    `<!-- ${forkName}-codex:start -->`,
    `<!-- ${forkName}-codex:end -->`
  );
  removeManagedOverride(
    paths.overrideAgentsPath,
    `<!-- ${forkName}-session:start -->`,
    `<!-- ${forkName}-session:end -->`
  );
  removeManagedOverride(
    paths.overrideAgentsPath,
    `<!-- ${forkName}-knowledge:start -->`,
    `<!-- ${forkName}-knowledge:end -->`
  );

  if (fs.existsSync(paths.sessionSkillDir)) {
    fs.rmSync(paths.sessionSkillDir, { recursive: true, force: true });
  }
  cleanupRetiredRecallDirs(projectDir);
  if (options.storePath) {
    const promptSessions = path.join(options.storePath, 'runtime', 'sessions');
    if (fs.existsSync(promptSessions)) {
      fs.rmSync(promptSessions, { recursive: true, force: true });
    }
  }
}

export function installProjectFiles(projectDir, scope, options = {}) {
  const paths = projectPaths(projectDir);
  ensureDir(paths.spectreDir);

  const metadata = repoMetadata();
  const branchName = gitBranch(projectDir);
  const manifest = {
    version: MANIFEST_VERSION,
    scope,
    projectRoot: projectDir,
    branchName,
    spectreVersion: metadata.version,
    codexIntegration: {
      installedAt: new Date().toISOString(),
      hiddenContextInjection: 'session_start_registry',
      fallback: 'none'
    }
  };

  fs.writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  cleanupLegacyProjectContext(projectDir, options);

  const legacyLauncherPath = path.join(paths.projectSpectreBinDir, 'codex');
  if (fs.existsSync(legacyLauncherPath)) {
    fs.unlinkSync(legacyLauncherPath);
  }
  if (fs.existsSync(paths.projectSpectreBinDir) && fs.readdirSync(paths.projectSpectreBinDir).length === 0) {
    fs.rmdirSync(paths.projectSpectreBinDir);
  }
}

export function uninstallProjectFiles(projectDir) {
  const paths = projectPaths(projectDir);
  cleanupLegacyProjectContext(projectDir);
  if (fs.existsSync(paths.manifestPath)) {
    fs.unlinkSync(paths.manifestPath);
  }
  const legacyLauncherPath = path.join(paths.projectSpectreBinDir, 'codex');
  if (fs.existsSync(legacyLauncherPath)) {
    fs.unlinkSync(legacyLauncherPath);
  }
  if (fs.existsSync(paths.projectSpectreBinDir) && fs.readdirSync(paths.projectSpectreBinDir).length === 0) {
    fs.rmdirSync(paths.projectSpectreBinDir);
  }
  if (fs.existsSync(paths.spectreDir) && fs.readdirSync(paths.spectreDir).length === 0) {
    fs.rmdirSync(paths.spectreDir);
  }
}

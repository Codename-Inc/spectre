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
import {
  buildKnowledgeOverrideBody,
  ensureKnowledgeFiles,
  knowledgeStatusMessage,
  readKnowledgeRegistry
} from './knowledge.js';
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

function findLatestHandoff(projectDir, branchName) {
  const sessionDir = path.join(projectDir, 'docs', 'tasks', branchName, 'session_logs');
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

    const taskLines = renderTask(task);
    lines.push(...taskLines);
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
  const keyFiles = workingSet.key_files || [];
  const activeIds = workingSet.active_ids || [];
  const recentCommands = workingSet.recent_commands || [];
  const context = handoff.context || {};
  const beads = handoff.beads || {};
  const beadsAvailable = beads.available != null ? beads.available : true;
  const tasks = beads.tasks || [];
  const checkboxTree = beadsAvailable && tasks.length > 0 ? buildCheckboxTree(tasks) : '';

  const sections = [];
  sections.push(`# Session Context: ${taskName}`);
  sections.push(`\n## Last Session Summary\n${summary}`);

  if (goal) {
    sections.push(`\n### Goal\n${goal}`);
  }

  if (constraints.length > 0) {
    sections.push(`\n### Constraints\n${formatList(constraints, '- None recorded.')}`);
  }

  sections.push(`\n### What We Accomplished\n${formatList(accomplished, '- None recorded.')}`);

  if (now) {
    sections.push(`\n### Active Work (Resume Here)\n**${now}**`);
  }

  sections.push(`\n### What's Next\n${formatList(nextSteps, '- None recorded.')}`);

  if (blockers.length > 0) {
    sections.push(`\n### Blockers\n${formatList(blockers, '- None recorded.')}`);
  }

  if (openQuestions.length > 0) {
    sections.push(`\n### Open Questions\n${formatList(openQuestions, '- None recorded.')}`);
  }

  if (decisions.length > 0) {
    sections.push(`\n### Decisions Made\n${formatList(decisions, '- None recorded.')}`);
  }

  const risksSummary = risks.length > 0 ? formatList(risks, '') : 'None identified';
  sections.push(`\n**Confidence**: ${confidence} | **Risks**: ${risksSummary}`);

  const workingSetLines = [];
  if (keyFiles.length > 0) {
    workingSetLines.push(`- **Key Files**: ${keyFiles.join(', ')}`);
  }
  if (activeIds.length > 0) {
    workingSetLines.push(`- **Active IDs**: ${activeIds.join(', ')}`);
  }
  if (recentCommands.length > 0) {
    workingSetLines.push(`- **Recent Commands**: ${recentCommands.join(', ')}`);
  }
  if (workingSetLines.length > 0) {
    sections.push(`\n### Working Set\n${workingSetLines.join('\n')}`);
  }

  sections.push(
    '\n### Spectre Notes\n' +
    '- Preserve Spectre artifact paths under `docs/tasks/{branch}/...`.\n' +
    '- Prefer existing project skills under `.agents/skills/` before rediscovering codebase context.\n' +
    '- Treat `.spectre/manifest.json` as Spectre install metadata.\n' +
    `- **SessionStart Source**: ${source}\n` +
    `- **Snapshot**: ${handoffPath}`
  );

  sections.push(
    '\n---\n\n' +
    '## Context\n' +
    `- **Branch**: ${branchName}\n` +
    `- **Last Commit**: ${context.last_commit || 'unknown'}\n` +
    `- **WIP State**: ${context.wip_state || 'unknown'}`
  );

  if (beadsAvailable && checkboxTree) {
    sections.push(`\n### Beads Tasks\n${checkboxTree}`);
  }

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
  const overridePath = projectPaths(projectDir).overrideAgentsPath;
  writeManagedOverride(
    overridePath,
    SESSION_OVERRIDE_START,
    SESSION_OVERRIDE_END,
    [
      '## SPECTRE Session Context',
      '',
      'This block is managed by SPECTRE and replaced automatically on session start.',
      'Use it as prior working context for this repository session.',
      '',
      buildSessionOverrideContent(handoff, {
        branchName,
        handoffPath,
        source
      })
    ].join('\n')
  );

  return {
    handoff,
    handoffPath,
    branchName,
    source
  };
}

export function clearKnowledgeOverride(projectDir) {
  removeManagedOverride(projectPaths(projectDir).overrideAgentsPath, KNOWLEDGE_OVERRIDE_START, KNOWLEDGE_OVERRIDE_END);
}

export function syncKnowledgeOverride(projectDir) {
  ensureKnowledgeFiles(projectDir);
  const { overrideAgentsPath, knowledgeRegistryPath } = projectPaths(projectDir);
  const { entryCount } = readKnowledgeRegistry(projectDir);
  writeManagedOverride(
    overrideAgentsPath,
    KNOWLEDGE_OVERRIDE_START,
    KNOWLEDGE_OVERRIDE_END,
    [
      '## SPECTRE Knowledge Context',
      '',
      'This block is managed by SPECTRE and replaced automatically on session start.',
      'Use it before searching or implementing work in this repository.',
      '',
      buildKnowledgeOverrideBody(projectDir)
    ].join('\n')
  );

  return {
    entryCount,
    knowledgeStatus: knowledgeStatusMessage(projectDir),
    registryPath: path.relative(projectDir, knowledgeRegistryPath) || knowledgeRegistryPath
  };
}

export function buildSessionStartOutput(projectDir, payload = {}) {
  const synced = syncSessionOverride(projectDir, payload);
  const knowledge = syncKnowledgeOverride(projectDir);

  return {
    systemMessage: buildVisibleResumeNotice({
      handoffPath: synced?.handoffPath,
      knowledgeStatus: knowledge.knowledgeStatus
    }),
    hookSpecificOutput: {
      hookEventName: 'SessionStart'
    }
  };
}

function removeBridge(rootAgentsPath) {
  if (!fs.existsSync(rootAgentsPath)) {
    return;
  }

  const current = fs.readFileSync(rootAgentsPath, 'utf8');
  const pattern = new RegExp(`\\n?${AGENTS_BRIDGE_START}[\\s\\S]*?${AGENTS_BRIDGE_END}\\n?`, 'm');
  const updated = current.replace(pattern, '\n').trimEnd();

  if (!updated) {
    fs.unlinkSync(rootAgentsPath);
    return;
  }

  fs.writeFileSync(rootAgentsPath, `${updated}\n`);
}

function cleanupLegacyProjectContext(projectDir) {
  const paths = projectPaths(projectDir);
  removeBridge(paths.rootAgentsPath);
  removeManagedOverride(paths.overrideAgentsPath, SESSION_OVERRIDE_START, SESSION_OVERRIDE_END);
  removeManagedOverride(paths.overrideAgentsPath, KNOWLEDGE_OVERRIDE_START, KNOWLEDGE_OVERRIDE_END);

  if (fs.existsSync(paths.sessionSkillDir)) {
    fs.rmSync(paths.sessionSkillDir, { recursive: true, force: true });
  }
}

export function installProjectFiles(projectDir, scope) {
  const paths = projectPaths(projectDir);
  ensureDir(paths.spectreDir);
  ensureDir(paths.projectSkillsDir);

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
      hiddenContextInjection: 'agents_override_managed_block',
      fallback: 'none'
    }
  };

  fs.writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  ensureKnowledgeFiles(projectDir);
  cleanupLegacyProjectContext(projectDir);

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

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
import { ensureKnowledgeFiles } from './knowledge.js';
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
  ensureDir(paths.casparDir);
  ensureDir(paths.projectSkillsDir);

  const metadata = repoMetadata();
  const branchName = gitBranch(projectDir);
  const manifest = {
    version: MANIFEST_VERSION,
    scope,
    projectRoot: projectDir,
    branchName,
    casparVersion: metadata.version,
    codexIntegration: {
      installedAt: new Date().toISOString(),
      hiddenContextInjection: 'none',
      fallback: 'none'
    }
  };

  fs.writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  ensureKnowledgeFiles(projectDir);
  cleanupLegacyProjectContext(projectDir);

  const legacyLauncherPath = path.join(paths.projectCasparBinDir, 'codex');
  if (fs.existsSync(legacyLauncherPath)) {
    fs.unlinkSync(legacyLauncherPath);
  }
  if (fs.existsSync(paths.projectCasparBinDir) && fs.readdirSync(paths.projectCasparBinDir).length === 0) {
    fs.rmdirSync(paths.projectCasparBinDir);
  }
}

export function uninstallProjectFiles(projectDir) {
  const paths = projectPaths(projectDir);
  cleanupLegacyProjectContext(projectDir);
  if (fs.existsSync(paths.manifestPath)) {
    fs.unlinkSync(paths.manifestPath);
  }
  const legacyLauncherPath = path.join(paths.projectCasparBinDir, 'codex');
  if (fs.existsSync(legacyLauncherPath)) {
    fs.unlinkSync(legacyLauncherPath);
  }
  if (fs.existsSync(paths.projectCasparBinDir) && fs.readdirSync(paths.projectCasparBinDir).length === 0) {
    fs.rmdirSync(paths.projectCasparBinDir);
  }
  if (fs.existsSync(paths.casparDir) && fs.readdirSync(paths.casparDir).length === 0) {
    fs.rmdirSync(paths.casparDir);
  }
}

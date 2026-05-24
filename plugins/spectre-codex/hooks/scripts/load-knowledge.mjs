#!/usr/bin/env node

/**
 * load-knowledge.mjs
 *
 * SessionStart hook that refreshes the managed SPECTRE knowledge block in
 * AGENTS.override.md and returns a short visible status line.
 *
 * Reads:
 * - Apply skill from plugin: skills/spectre-apply/SKILL.md
 * - Registry from project: .agents/skills/spectre-recall/references/registry.toon
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
}

function resolvePluginSkillPath(pluginRoot, skillName, ...parts) {
  const candidates = [
    path.join(pluginRoot, 'skills', skillName, ...parts),
    path.join(pluginRoot, '..', 'skills', skillName, ...parts),
  ];
  const legacyBareName = skillName.startsWith('spectre-') ? skillName.slice('spectre-'.length) : null;
  if (legacyBareName) {
    candidates.push(
      path.join(pluginRoot, 'skills', legacyBareName, ...parts),
      path.join(pluginRoot, '..', 'skills', legacyBareName, ...parts)
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function skillBaseDir(projectDir) {
  const agentsDir = path.join(projectDir, '.agents', 'skills');
  if (fs.existsSync(agentsDir)) return agentsDir;
  return path.join(projectDir, '.claude', 'skills');
}

function countRegistryEntries(lines) {
  let count = 0;
  for (const line of lines) {
    if (line.trim() && line.includes('|') && !line.startsWith('#')) {
      count++;
    }
  }
  return count;
}

function stripFrontmatter(content) {
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) {
      return content.slice(end + 3).trim();
    }
  }
  return content;
}

function normalizeOverrideFile(content) {
  return content
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function managedOverridePattern(startMarker, endMarker) {
  return new RegExp(`\\n?${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`, 'm');
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
  fs.writeFileSync(overridePath, normalized ? `${normalized}\n` : '');
}

function hasProjectKnowledgeSurface(projectDir, registryPath) {
  const overridePath = path.join(projectDir, 'AGENTS.override.md');
  const overrideContent = fs.existsSync(overridePath) ? fs.readFileSync(overridePath, 'utf8') : '';
  return fs.existsSync(path.join(projectDir, '.spectre', 'manifest.json'))
    || fs.existsSync(registryPath)
    || overrideContent.includes('<!-- spectre-knowledge:start -->')
    || overrideContent.includes('<!-- spectre-session:start -->');
}

function buildKnowledgeOverrideBody(applyContent) {
  return [
    '## SPECTRE Knowledge Context',
    '',
    'This block is managed by SPECTRE and replaced automatically on session start.',
    'Use it before searching or implementing work in this repository.',
    '',
    applyContent.trim()
  ].join('\n');
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const pluginRoot = getPluginRoot();

  const applySkillPath = resolvePluginSkillPath(pluginRoot, 'spectre-apply', 'SKILL.md');

  if (!fs.existsSync(applySkillPath)) {
    process.exit(0);
  }

  // Paths - check new name first, fall back to old names for migration
  let registryPath = path.join(skillBaseDir(projectDir), 'spectre-recall', 'references', 'registry.toon');
  const oldRegistryPath = path.join(projectDir, '.claude', 'skills', 'spectre-find', 'references', 'registry.toon');

  // Support old "spectre-find" path for projects that haven't migrated
  if (!fs.existsSync(registryPath) && fs.existsSync(oldRegistryPath)) {
    registryPath = oldRegistryPath;
  }

  // Read registry if it exists
  let registryContent = '';
  let entryCount = 0;
  if (fs.existsSync(registryPath)) {
    registryContent = fs.readFileSync(registryPath, 'utf8').trim();
    const lines = registryContent ? registryContent.split('\n') : [];
    entryCount = countRegistryEntries(lines);
  }

  // Read apply skill and strip frontmatter
  let applyContent = fs.readFileSync(applySkillPath, 'utf8');
  applyContent = stripFrontmatter(applyContent);
  applyContent = applyContent
    .replaceAll('.claude/skills/', '.agents/skills/')
    .replace(/\/spectre:([A-Za-z0-9_-]+)/g, (_match, skillName) => {
      return skillName.startsWith('spectre-') ? skillName : `spectre-${skillName}`;
    });

  if (hasProjectKnowledgeSurface(projectDir, registryPath)) {
    writeManagedOverride(
      path.join(projectDir, 'AGENTS.override.md'),
      '<!-- spectre-knowledge:start -->',
      '<!-- spectre-knowledge:end -->',
      buildKnowledgeOverrideBody(applyContent)
    );
  }

  // Visible notice
  let visibleNotice;
  if (entryCount > 0) {
    visibleNotice = `\ud83d\udc7b spectre: ${entryCount} knowledge skills available`;
  } else {
    visibleNotice = '\ud83d\udc7b spectre: ready \u2014 capture knowledge with /spectre:learn';
  }

  const output = {
    systemMessage: visibleNotice,
    hookSpecificOutput: {
      hookEventName: 'SessionStart'
    }
  };

  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
}

export {
  buildKnowledgeOverrideBody,
  countRegistryEntries,
  hasProjectKnowledgeSurface,
  resolvePluginSkillPath,
  stripFrontmatter
};

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename)) {
  main();
}

import fs from 'fs';
import path from 'path';
import { projectPaths, spectrePluginRoot, ensureDir } from './paths.js';

function stripFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return content.trim();
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return content.trim();
  }

  return content.slice(end + 5).trim();
}

function rewriteProjectSkillPaths(content) {
  return content.replaceAll('.claude/skills/', '.agents/skills/');
}

function rewriteCodexCommandRefs(content) {
  return content.replaceAll('/spectre:', 'spectre-');
}

function markUserInvocable(content, value = true) {
  if (!content.startsWith('---\n')) {
    return content;
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return content;
  }

  const frontmatter = content.slice(4, end).trimEnd();
  const body = content.slice(end + 5);
  const nextFrontmatter = frontmatter.includes('\nuser-invocable:')
    ? frontmatter.replace(/\nuser-invocable:\s*(true|false)/, `\nuser-invocable: ${value}`)
    : `${frontmatter}\nuser-invocable: ${value}`;

  return `---\n${nextFrontmatter}\n---\n${body}`;
}

function codexPathConvention(content) {
  return content.replace(
    /Resolution order:[\s\S]*?Do NOT use `git rev-parse --show-toplevel` or any git command to resolve this path\./,
    [
      'Resolution rule:',
      '- Use the current working directory (`$PWD`) as `{{project_root}}`.',
      '',
      'Do NOT use `git rev-parse --show-toplevel` or any git command to resolve this path.'
    ].join('\n')
  );
}

function codexLearnIntro(content) {
  return content.replace(
    "You capture durable project knowledge into Skills that Claude Code loads on-demand.",
    'You capture durable project knowledge into Skills that Codex loads on-demand.'
  );
}

function normalizeSkillMarkdown(content) {
  return content.replace(/\n{3,}/g, '\n\n').trimEnd();
}

function pluginSkillPath(skillName) {
  return path.join(spectrePluginRoot(), 'skills', skillName, 'SKILL.md');
}

function recallTemplatePath() {
  return path.join(spectrePluginRoot(), 'skills', 'spectre-learn', 'references', 'recall-template.md');
}

function pluginSkillContent(skillName) {
  return fs.readFileSync(pluginSkillPath(skillName), 'utf8');
}

export function codexSharedSkillContent(skillName) {
  if (skillName === 'spectre-apply') {
    return `${normalizeSkillMarkdown(rewriteCodexCommandRefs(rewriteProjectSkillPaths(pluginSkillContent(skillName))))}\n`;
  }

  if (skillName === 'spectre-learn') {
    return `${normalizeSkillMarkdown(markUserInvocable(rewriteCodexCommandRefs(codexPathConvention(codexLearnIntro(rewriteProjectSkillPaths(pluginSkillContent(skillName)))))))}\n`;
  }

  return null;
}

export function knowledgeRegistryHeader() {
  return [
    '# SPECTRE Knowledge Registry',
    '# Format: skill-name|category|triggers|description',
    ''
  ].join('\n');
}

export function countKnowledgeEntries(registryContent) {
  const lines = registryContent ? registryContent.split('\n') : [];
  let count = 0;
  for (const line of lines) {
    if (line.trim() && line.includes('|') && !line.startsWith('#')) {
      count += 1;
    }
  }
  return count;
}

export function readKnowledgeRegistry(projectDir) {
  const paths = projectPaths(projectDir);
  const registryContent = fs.existsSync(paths.knowledgeRegistryPath)
    ? fs.readFileSync(paths.knowledgeRegistryPath, 'utf8').trim()
    : '';

  return {
    registryContent,
    entryCount: countKnowledgeEntries(registryContent),
    registryPath: paths.knowledgeRegistryPath
  };
}

export function generateRecallSkillContent(projectDir) {
  const { registryContent } = readKnowledgeRegistry(projectDir);
  const template = fs.readFileSync(recallTemplatePath(), 'utf8');
  return `${markUserInvocable(rewriteCodexCommandRefs(template.replace('{{REGISTRY}}', registryContent.trim())))}\n`;
}

export function ensureKnowledgeFiles(projectDir) {
  const paths = projectPaths(projectDir);
  ensureDir(paths.projectSkillsDir);
  ensureDir(paths.recallReferencesDir);

  if (!fs.existsSync(paths.knowledgeRegistryPath)) {
    fs.writeFileSync(paths.knowledgeRegistryPath, `${knowledgeRegistryHeader()}\n`);
  }

  fs.writeFileSync(paths.recallSkillPath, generateRecallSkillContent(projectDir));
}

export function buildKnowledgeOverrideBody(projectDir) {
  ensureKnowledgeFiles(projectDir);
  const applyContent = stripFrontmatter(
    rewriteCodexCommandRefs(rewriteProjectSkillPaths(pluginSkillContent('spectre-apply')))
  );

  return normalizeSkillMarkdown(applyContent);
}

export function updateKnowledgeRegistry(projectDir, { skillName, category, triggers, description }) {
  ensureKnowledgeFiles(projectDir);
  const paths = projectPaths(projectDir);
  const entry = `${skillName}|${category}|${triggers}|${description}`;
  const entryPrefix = `${skillName}|`;
  const existing = fs.readFileSync(paths.knowledgeRegistryPath, 'utf8').trim();
  const lines = existing ? existing.split('\n') : knowledgeRegistryHeader().split('\n');
  const updatedLines = [];
  let replaced = false;

  for (const line of lines) {
    if (line.startsWith(entryPrefix)) {
      updatedLines.push(entry);
      replaced = true;
    } else {
      updatedLines.push(line);
    }
  }

  if (!replaced) {
    updatedLines.push(entry);
  }

  fs.writeFileSync(paths.knowledgeRegistryPath, `${updatedLines.join('\n').trimEnd()}\n`);
  fs.writeFileSync(paths.recallSkillPath, generateRecallSkillContent(projectDir));
}

export function knowledgeStatusMessage(projectDir) {
  ensureKnowledgeFiles(projectDir);
  const { entryCount } = readKnowledgeRegistry(projectDir);

  if (entryCount === 0) {
    return '👻 spectre: ready — capture knowledge with spectre-learn';
  }

  return `👻 spectre: ${entryCount} knowledge skills available`;
}

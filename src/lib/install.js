import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  codexCommandSkillName,
  listCodexWorkflowCommands,
  listSpectreAgents,
  listSpectreCommands,
  SHARED_SKILLS,
  repoMetadata
} from './constants.js';
import {
  ensureSpectreHooksConfigured,
  removeProjectSkillsConfigured,
  removeSpectreHooksConfigured,
  syncProjectSkillsConfigured
} from './config.js';
import { codexSharedSkillContent } from './knowledge.js';
import { installProjectFiles, uninstallProjectFiles } from './project.js';
import {
  codexPromptsDir,
  codexRuntimeRoot,
  codexSkillsDir,
  ensureDir,
  repoRoot,
  runtimeAgentsDir,
  runtimeHooksDir,
  runtimeSourceAgentsDir,
  runtimeSourceCommandsDir,
  runtimeSourceRoot,
  runtimeToolsDir,
  spectrePluginRoot
} from './paths.js';

function writeFile(targetPath, content, mode) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content);
  if (mode != null) {
    fs.chmodSync(targetPath, mode);
  }
}

function readMarkdown(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function escapeTomlMultilineString(value) {
  return value.replaceAll('"""', '\\"""');
}

function escapeTomlBasicString(value) {
  return JSON.stringify(value);
}

function escapeYamlDoubleQuotedString(value) {
  return JSON.stringify(value);
}

function splitFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return { frontmatter: '', body: content.trim() };
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: '', body: content.trim() };
  }

  return {
    frontmatter: content.slice(4, end).trim(),
    body: content.slice(end + 5).trim()
  };
}

function frontmatterValue(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

function commandLabel(commandName) {
  return `spectre-${commandName}`;
}

function commandSourceLabel(commandName) {
  return `/spectre:${commandName}`;
}

function copySourceAssets() {
  const pluginRoot = spectrePluginRoot();
  ensureDir(runtimeSourceRoot());
  fs.cpSync(path.join(pluginRoot, 'commands'), runtimeSourceCommandsDir(), { recursive: true });
  fs.cpSync(path.join(pluginRoot, 'agents'), runtimeSourceAgentsDir(), { recursive: true });
}

function sharedSkillContent(skillName) {
  const codexSkill = codexSharedSkillContent(skillName);
  if (codexSkill) {
    return codexSkill;
  }

  if (skillName === 'spectre-guide') {
    return `---
name: ${escapeYamlDoubleQuotedString('spectre-guide')}
description: ${escapeYamlDoubleQuotedString('Use when suggesting the next Spectre workflow skill or explaining the Spectre workflow.')}
---

# Spectre Guide

Core path: \`spectre-scope\` -> \`spectre-plan\` -> \`spectre-execute\` -> \`spectre-clean\` -> \`spectre-test\` -> \`spectre-rebase\` -> \`spectre-evaluate\`.

Use \`spectre-handoff\` to save continuity and \`spectre-forget\` to clear it.
`;
  }

  if (skillName === 'spectre-learn') {
    return `---
name: ${escapeYamlDoubleQuotedString('spectre-learn')}
description: ${escapeYamlDoubleQuotedString('Use when capturing durable project knowledge into Codex-native skills.')}
---

# Spectre Learn

Store learned project knowledge under \`.agents/skills/{category}-{slug}/SKILL.md\`.

Each new learning should:
- include YAML frontmatter with \`name\` and \`description\`
- focus on actionable project knowledge
- be updated when behavior changes
`;
  }

  return `---
name: ${escapeYamlDoubleQuotedString('spectre-tdd')}
description: ${escapeYamlDoubleQuotedString("Use when following Spectre's TDD-first execution style.")}
---

# Spectre TDD

Default cycle:
1. Write or identify the failing behavior.
2. Add the smallest test that proves the behavior.
3. Implement the smallest code change that makes the test pass.
4. Refactor only after the test passes.
`;
}

function installSharedSkills() {
  const skillsRoot = codexSkillsDir();
  ensureDir(skillsRoot);
  for (const skillName of SHARED_SKILLS) {
    const skillPath = path.join(skillsRoot, skillName, 'SKILL.md');
    writeFile(skillPath, sharedSkillContent(skillName));
  }
}

function workflowPostStep(commandName, runtimeRoot) {
  const refreshCommand = `node "${path.join(runtimeRoot, 'tools', 'refresh-project-context.mjs')}" --project-root "$PWD"`;
  const syncCommand = `node "${path.join(runtimeRoot, 'tools', 'sync-session-override.mjs')}" --project-root "$PWD" --source handoff`;
  const clearCommand = `node "${path.join(runtimeRoot, 'tools', 'sync-session-override.mjs')}" --project-root "$PWD" --clear`;

  if (commandName === 'learn') {
    return `After creating or updating project skills, run:\n\n\`\`\`bash\n${refreshCommand}\n\`\`\`\n`;
  }

  if (commandName === 'handoff') {
    return `After saving the handoff, run:\n\n\`\`\`bash\n${syncCommand}\n\`\`\`\n`;
  }

  if (commandName === 'forget') {
    return `After clearing session memory, run:\n\n\`\`\`bash\n${clearCommand}\n\`\`\`\n`;
  }

  return 'No extra runtime step is required for this command.\n';
}

function workflowBody(sourceContent) {
  return sourceContent
    .replace(/(?:<|&lt;)ARGUMENTS(?:>|&gt;)\s*\$ARGUMENTS\s*(?:<\/|&lt;\/)ARGUMENTS(?:>|&gt;)/g, 'Treat the current user request as the input for this workflow.')
    .replace(/\$ARGUMENTS/g, 'the current user request')
    .replaceAll('/spectre:', 'spectre-');
}

function workflowSkill(commandName, runtimeRoot) {
  const commandSource = readMarkdown(path.join(runtimeSourceCommandsDir(), `${commandName}.md`)).trim();
  const { frontmatter, body } = splitFrontmatter(commandSource);
  const description = frontmatterValue(frontmatter, 'description') || `Use when running the Spectre ${commandName} workflow.`;

  return `---
name: ${escapeYamlDoubleQuotedString(codexCommandSkillName(commandName))}
description: ${escapeYamlDoubleQuotedString(description)}
user-invocable: true
---

# ${commandLabel(commandName)}

Use when the user explicitly wants the Spectre \`${commandName}\` workflow, or when another Spectre workflow delegates to it.

This is the Codex skill replacement for the deprecated custom prompt ${commandSourceLabel(commandName)}.

## Input Handling

Treat the current user request as the input arguments for this workflow.

## Required setup

1. Read \`AGENTS.md\` if present.
2. Read \`.spectre/manifest.json\` if present.
3. Read project skills under \`.agents/skills/\` when their descriptions match the task.
4. Prefer the installed Spectre subagents when the workflow dispatches specialized roles.

## Codex translation layer

- Treat both \`@spectre:name\` and \`@name\` as the installed Spectre Codex subagent for that role.
- If multi-agent support is available, spawn the relevant subagent(s). If not, execute the same work sequentially yourself and preserve the same artifacts, checks, and completion reports.
- Treat \`Skill(name)\` or skill-tool instructions as: load the named Codex skill from \`.agents/skills/{name}/SKILL.md\` or \`$CODEX_HOME/skills/{name}/SKILL.md\` before continuing.
- Treat nested \`/spectre:other\` references as instructions to execute the installed \`spectre-other\` workflow skill immediately, not as a suggestion to stop and ask the user.
- Ignore Claude plugin, marketplace, model, and tool declarations. Preserve Spectre artifact paths and handoff JSON shapes.

## Canonical workflow

${workflowBody(body)}

## Command-specific post step

${workflowPostStep(commandName, runtimeRoot)}
`;
}

function codexAgentBody(agentName, sourceContent) {
  const { frontmatter, body } = splitFrontmatter(sourceContent);
  const description = frontmatterValue(frontmatter, 'description') || `${agentName} specialist`;
  const instructions = `You are the Codex port of Spectre's \`${agentName}\` subagent.

## Role

${description}

## Operating rules

- Stay inside this role's scope.
- Preserve Spectre file locations and document contracts.
- If the parent command provided task, scope, or handoff docs, read them before acting.
- Return concrete findings or completion output that the parent workflow can consume directly.

## Canonical instructions

${body}`;
  return {
    description,
    content: `name = ${escapeTomlBasicString(agentName)}
description = ${escapeTomlBasicString(description)}
developer_instructions = """
${escapeTomlMultilineString(instructions)}
"""
`
  };
}

function agentNicknames(agentName) {
  return Array.from(new Set([
    agentName,
    `spectre-${agentName}`,
    `spectre ${agentName}`,
    `spectre_${agentName.replace(/-/g, '_')}`
  ]));
}

function installAgentConfigs() {
  const configs = [];
  ensureDir(runtimeAgentsDir());
  for (const entry of fs.readdirSync(runtimeAgentsDir(), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      fs.unlinkSync(path.join(runtimeAgentsDir(), entry.name));
    }
  }
  for (const agentName of listSpectreAgents()) {
    const sourcePath = path.join(runtimeSourceAgentsDir(), `${agentName}.md`);
    const agent = codexAgentBody(agentName, readMarkdown(sourcePath));
    const configFile = path.join(runtimeAgentsDir(), `${agentName}.toml`);
    writeFile(configFile, agent.content);
    configs.push({
      id: agentName.replace(/-/g, '_'),
      name: agentName,
      description: agent.description,
      configFile,
      nicknames: agentNicknames(agentName)
    });
  }
  return configs;
}

function installWorkflowSkills() {
  const runtimeRoot = codexRuntimeRoot();
  const skillsRoot = codexSkillsDir();
  ensureDir(skillsRoot);

  for (const commandName of listCodexWorkflowCommands()) {
    writeFile(
      path.join(skillsRoot, codexCommandSkillName(commandName), 'SKILL.md'),
      workflowSkill(commandName, runtimeRoot)
    );
  }
}

function cleanupLegacyPrompts() {
  if (!fs.existsSync(codexPromptsDir())) {
    return;
  }

  for (const commandName of listSpectreCommands()) {
    for (const fileName of [`spectre:${commandName}.md`, `spectre-${commandName}.md`]) {
      const filePath = path.join(codexPromptsDir(), fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

function sessionStartHook() {
  const projectModuleUrl = pathToFileURL(path.join(repoRoot(), 'src', 'lib', 'project.js')).href;
  return `#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', reject);
  });
}

const input = await readStdin();
let payload = {};
if (input) {
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }
}
const cwd = payload.cwd || process.cwd();
const manifestPath = path.join(cwd, '.spectre', 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  process.exit(0);
}

const { buildSessionStartOutput } = await import(${JSON.stringify(projectModuleUrl)});
const output = buildSessionStartOutput(cwd, payload);
if (!output) {
  process.exit(0);
}

process.stdout.write(JSON.stringify(output) + '\\n');
`;
}

function refreshProjectTool() {
  const configModuleUrl = pathToFileURL(path.join(repoRoot(), 'src', 'lib', 'config.js')).href;
  const projectModuleUrl = pathToFileURL(path.join(repoRoot(), 'src', 'lib', 'project.js')).href;
  return `#!/usr/bin/env node
const projectRootIndex = process.argv.indexOf('--project-root');
if (projectRootIndex === -1 || !process.argv[projectRootIndex + 1]) {
  throw new Error('Missing required --project-root argument');
}

const projectRoot = process.argv[projectRootIndex + 1];
const { syncProjectSkillsConfigured } = await import(${JSON.stringify(configModuleUrl)});
const { syncKnowledgeOverride } = await import(${JSON.stringify(projectModuleUrl)});
syncProjectSkillsConfigured(projectRoot);
syncKnowledgeOverride(projectRoot);
process.stdout.write('Synced Spectre project skills and knowledge context.\\n');
`;
}

function syncSessionOverrideTool() {
  const projectModuleUrl = pathToFileURL(path.join(repoRoot(), 'src', 'lib', 'project.js')).href;
  return `#!/usr/bin/env node
const projectRootIndex = process.argv.indexOf('--project-root');
if (projectRootIndex === -1 || !process.argv[projectRootIndex + 1]) {
  throw new Error('Missing required --project-root argument');
}

const projectRoot = process.argv[projectRootIndex + 1];
const clear = process.argv.includes('--clear');
const sourceIndex = process.argv.indexOf('--source');
const source = sourceIndex === -1 ? 'manual' : (process.argv[sourceIndex + 1] || 'manual');

const { clearSessionOverride, syncKnowledgeOverride, syncSessionOverride } = await import(${JSON.stringify(projectModuleUrl)});

if (clear) {
  clearSessionOverride(projectRoot);
  const knowledge = syncKnowledgeOverride(projectRoot);
  process.stdout.write(\`Cleared SPECTRE session context. Knowledge status: \${knowledge.knowledgeStatus}.\\n\`);
} else {
  const session = syncSessionOverride(projectRoot, { source });
  const knowledge = syncKnowledgeOverride(projectRoot);
  if (session) {
    process.stdout.write(\`Synced SPECTRE context from \${session.handoffPath}. Knowledge status: \${knowledge.knowledgeStatus}.\\n\`);
  } else {
    process.stdout.write(\`No active handoff found; refreshed knowledge context. Knowledge status: \${knowledge.knowledgeStatus}.\\n\`);
  }
}
`;
}

function installRuntimeScripts() {
  const hooksDir = runtimeHooksDir();
  const toolsDir = runtimeToolsDir();
  ensureDir(hooksDir);
  ensureDir(toolsDir);

  for (const stalePath of [
    path.join(hooksDir, 'pre-session-start.mjs'),
    path.join(toolsDir, 'forget-project-context.mjs')
  ]) {
    if (fs.existsSync(stalePath)) {
      fs.unlinkSync(stalePath);
    }
  }

  writeFile(path.join(hooksDir, 'session-start.mjs'), sessionStartHook(), 0o755);
  writeFile(path.join(toolsDir, 'refresh-project-context.mjs'), refreshProjectTool(), 0o755);
  writeFile(path.join(toolsDir, 'sync-session-override.mjs'), syncSessionOverrideTool(), 0o755);
}

export function installCodex({ scope, projectDir }) {
  const runtimeRoot = codexRuntimeRoot();
  ensureDir(runtimeRoot);
  copySourceAssets();
  installRuntimeScripts();
  cleanupLegacyPrompts();
  installSharedSkills();
  installWorkflowSkills();
  const agents = installAgentConfigs();
  ensureSpectreHooksConfigured(runtimeRoot, agents);

  if (scope === 'project') {
    installProjectFiles(projectDir, scope);
    syncProjectSkillsConfigured(projectDir);
  }

  const metadata = repoMetadata();
  process.stdout.write(`Installed Spectre ${metadata.version} for Codex (${scope} scope).\n`);
}

export function uninstallCodex({ scope, projectDir }) {
  const agents = listSpectreAgents().map(agentName => ({
    id: agentName.replace(/-/g, '_')
  }));
  removeSpectreHooksConfigured(codexRuntimeRoot(), agents);
  cleanupLegacyPrompts();

  if (fs.existsSync(codexRuntimeRoot())) {
    fs.rmSync(codexRuntimeRoot(), { recursive: true, force: true });
  }

  for (const skillName of SHARED_SKILLS) {
    const skillDir = path.join(codexSkillsDir(), skillName);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
  }

  for (const commandName of listCodexWorkflowCommands()) {
    const skillDir = path.join(codexSkillsDir(), codexCommandSkillName(commandName));
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
  }

  if (scope === 'project') {
    removeProjectSkillsConfigured(projectDir);
    uninstallProjectFiles(projectDir);
  }

  process.stdout.write(`Uninstalled Spectre for Codex (${scope} scope).\n`);
}

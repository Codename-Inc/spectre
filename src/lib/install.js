import fs from 'fs';
import path from 'path';
import {
  codexCommandSkillName,
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
import { installProjectFiles, uninstallProjectFiles } from './project.js';
import {
  codexPromptsDir,
  codexRuntimeRoot,
  codexSkillsDir,
  ensureDir,
  repoRoot,
  runtimeAgentsDir,
  runtimeHooksDir,
  runtimeToolsDir,
} from './paths.js';

function writeFile(targetPath, content, mode) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content);
  if (mode != null) {
    fs.chmodSync(targetPath, mode);
  }
}

function generatedCodexRoot() {
  return path.join(repoRoot(), 'plugins', 'spectre-codex');
}

function generatedCodexSkillsDir() {
  return path.join(generatedCodexRoot(), 'skills');
}

function generatedCodexAgentsDir() {
  return path.join(generatedCodexRoot(), 'agents');
}

function generatedCodexHooksDir() {
  return path.join(generatedCodexRoot(), 'hooks');
}

function generatedCodexHooksConfigPath() {
  return path.join(generatedCodexHooksDir(), 'hooks.json');
}

function generatedCodexHooksConfig() {
  const hooksPath = generatedCodexHooksConfigPath();
  if (!fs.existsSync(hooksPath)) {
    throw new Error(`Missing generated Codex hooks config: ${hooksPath}. Run npm run sync-codex first.`);
  }

  const parsed = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.hooks) {
    throw new Error(`Malformed generated Codex hooks config: ${hooksPath}`);
  }
  return parsed.hooks;
}

function listGeneratedCodexSkills({ required = false } = {}) {
  const skillsDir = generatedCodexSkillsDir();
  if (!fs.existsSync(skillsDir)) {
    if (required) {
      throw new Error(`Missing generated Codex skills directory: ${skillsDir}. Run npm run sync-codex first.`);
    }
    return [];
  }

  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
    .sort();
}

function managedCodexSkillNames({ requireGenerated = false } = {}) {
  return Array.from(new Set([
    ...SHARED_SKILLS,
    ...listSpectreCommands().map(codexCommandSkillName),
    ...listGeneratedCodexSkills({ required: requireGenerated })
  ])).sort();
}

function replaceDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing generated Codex asset directory: ${sourceDir}. Run npm run sync-codex first.`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  ensureDir(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function installGeneratedCodexSkills() {
  const sourceRoot = generatedCodexSkillsDir();
  const skillsRoot = codexSkillsDir();
  ensureDir(skillsRoot);

  for (const skillName of managedCodexSkillNames({ requireGenerated: true })) {
    const skillDir = path.join(skillsRoot, skillName);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
  }

  for (const skillName of listGeneratedCodexSkills({ required: true })) {
    fs.cpSync(path.join(sourceRoot, skillName), path.join(skillsRoot, skillName), { recursive: true });
  }
}

function agentNicknames(agentName) {
  return Array.from(new Set([
    agentName,
    `spectre-${agentName}`,
    `spectre ${agentName}`,
    `spectre_${agentName.replace(/-/g, '_')}`
  ]));
}

function tomlStringField(content, fieldName) {
  const match = content.match(new RegExp(`^${fieldName}\\s*=\\s*(".*")$`, 'm'));
  return match ? JSON.parse(match[1]) : '';
}

function installAgentConfigs() {
  const configs = [];
  replaceDirectory(generatedCodexAgentsDir(), runtimeAgentsDir());

  for (const entry of fs.readdirSync(runtimeAgentsDir(), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) {
      continue;
    }

    const configFile = path.join(runtimeAgentsDir(), entry.name);
    const content = fs.readFileSync(configFile, 'utf8');
    const agentName = tomlStringField(content, 'name') || path.basename(entry.name, '.toml');
    const description = tomlStringField(content, 'description') || `${agentName} specialist`;
    configs.push({
      id: agentName.replace(/-/g, '_'),
      name: agentName,
      description,
      configFile,
      nicknames: agentNicknames(agentName)
    });
  }
  return configs;
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

function refreshProjectTool() {
  return `#!/usr/bin/env node
process.stderr.write('refresh-project-context is no longer installed as a package-cache wrapper. Run "npx @codename_inc/spectre update codex --scope project --project-dir <path>" to refresh SPECTRE assets.\\n');
process.exit(1);
`;
}

function syncSessionOverrideTool() {
  return `#!/usr/bin/env node
process.stderr.write('sync-session-override is no longer installed as a package-cache wrapper. Session context is refreshed by SPECTRE SessionStart hooks.\\n');
process.exit(1);
`;
}

function installRuntimeScripts() {
  const toolsDir = runtimeToolsDir();
  ensureDir(toolsDir);
  replaceDirectory(generatedCodexHooksDir(), runtimeHooksDir());

  for (const stalePath of [
    path.join(runtimeHooksDir(), 'pre-session-start.mjs'),
    path.join(runtimeHooksDir(), 'session-start.mjs'),
    path.join(toolsDir, 'forget-project-context.mjs')
  ]) {
    if (fs.existsSync(stalePath)) {
      fs.unlinkSync(stalePath);
    }
  }

  writeFile(path.join(toolsDir, 'refresh-project-context.mjs'), refreshProjectTool(), 0o755);
  writeFile(path.join(toolsDir, 'sync-session-override.mjs'), syncSessionOverrideTool(), 0o755);
}

export function installCodex({ scope, projectDir }) {
  const runtimeRoot = codexRuntimeRoot();
  ensureDir(runtimeRoot);
  installRuntimeScripts();
  cleanupLegacyPrompts();
  installGeneratedCodexSkills();
  const agents = installAgentConfigs();
  ensureSpectreHooksConfigured(runtimeRoot, agents, generatedCodexHooksConfig());

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

  for (const skillName of managedCodexSkillNames()) {
    const skillDir = path.join(codexSkillsDir(), skillName);
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

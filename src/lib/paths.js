import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

export function casparPluginRoot() {
  return path.join(repoRoot(), 'plugins', 'caspar');
}

export function resolveCodexHome() {
  const envHome = process.env.CODEX_HOME;
  if (envHome) {
    return envHome;
  }
  return path.join(os.homedir(), '.codex');
}

export function codexConfigPath() {
  return path.join(resolveCodexHome(), 'config.toml');
}

export function codexHooksConfigPath() {
  return path.join(resolveCodexHome(), 'hooks.json');
}

export function codexPromptsDir() {
  return path.join(resolveCodexHome(), 'prompts');
}

export function codexSkillsDir() {
  return path.join(resolveCodexHome(), 'skills');
}

export function codexRuntimeRoot() {
  return path.join(resolveCodexHome(), 'caspar');
}

export function runtimeAgentsDir() {
  return path.join(codexRuntimeRoot(), 'agents');
}

export function runtimeToolsDir() {
  return path.join(codexRuntimeRoot(), 'tools');
}

export function runtimeHooksDir() {
  return path.join(codexRuntimeRoot(), 'hooks');
}

export function projectCodexHome(projectDir) {
  return path.join(projectDir, '.codex');
}

export function projectPaths(projectDir) {
  const projectSkillsDir = path.join(projectDir, '.agents', 'skills');
  const recallSkillDir = path.join(projectSkillsDir, 'caspar-recall');
  const recallReferencesDir = path.join(recallSkillDir, 'references');
  return {
    projectDir,
    projectCodexHome: projectCodexHome(projectDir),
    projectCodexConfigPath: path.join(projectCodexHome(projectDir), 'config.toml'),
    projectCasparBinDir: path.join(projectDir, '.caspar', 'bin'),
    casparDir: path.join(projectDir, '.caspar'),
    manifestPath: path.join(projectDir, '.caspar', 'manifest.json'),
    rootAgentsPath: path.join(projectDir, 'AGENTS.md'),
    overrideAgentsPath: path.join(projectDir, 'AGENTS.override.md'),
    projectSkillsDir,
    recallSkillDir,
    recallSkillPath: path.join(recallSkillDir, 'SKILL.md'),
    recallReferencesDir,
    knowledgeRegistryPath: path.join(recallReferencesDir, 'registry.toon'),
    sessionSkillDir: path.join(projectDir, '.agents', 'skills', 'caspar-session'),
    sessionSkillPath: path.join(projectDir, '.agents', 'skills', 'caspar-session', 'SKILL.md')
  };
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

import fs from 'fs';
import path from 'path';
import { repoRoot, spectrePluginRoot } from './paths.js';

export const MANIFEST_VERSION = 1;
export const MIN_CODEX_VERSION = '0.110.0';
export const MANAGED_CONFIG_MARKER = 'spectre-codex-managed';
export const AGENTS_BRIDGE_START = '<!-- spectre-codex:start -->';
export const AGENTS_BRIDGE_END = '<!-- spectre-codex:end -->';
export const SESSION_OVERRIDE_START = '<!-- spectre-session:start -->';
export const SESSION_OVERRIDE_END = '<!-- spectre-session:end -->';
export const KNOWLEDGE_OVERRIDE_START = '<!-- spectre-knowledge:start -->';
export const KNOWLEDGE_OVERRIDE_END = '<!-- spectre-knowledge:end -->';

export function listSpectreCommands() {
  const commandsDir = path.join(spectrePluginRoot(), 'commands');
  return fs.readdirSync(commandsDir)
    .filter(name => name.endsWith('.md'))
    .map(name => path.basename(name, '.md'))
    .sort();
}

export function codexCommandSkillName(commandName) {
  if (commandName === 'learn') {
    return 'spectre-learn';
  }
  if (commandName === 'recall') {
    return 'spectre-recall';
  }
  return `spectre-${commandName}`;
}

export function listCodexWorkflowCommands() {
  return listSpectreCommands().filter(commandName => !['learn', 'recall'].includes(commandName));
}

export function listSpectreAgents() {
  const agentsDir = path.join(spectrePluginRoot(), 'agents');
  return fs.readdirSync(agentsDir)
    .filter(name => name.endsWith('.md'))
    .map(name => path.basename(name, '.md'))
    .sort();
}

export const SHARED_SKILLS = [
  'spectre-apply',
  'spectre-guide',
  'spectre-learn',
  'spectre-tdd'
];

export function repoMetadata() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot(), 'package.json'), 'utf8')
  );
  return {
    name: packageJson.name,
    version: packageJson.version
  };
}

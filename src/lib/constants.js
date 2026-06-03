import fs from 'fs';
import path from 'path';
import { repoRoot, casparPluginRoot } from './paths.js';

export const MANIFEST_VERSION = 1;
export const MIN_CODEX_VERSION = '0.110.0';
export const MANAGED_CONFIG_MARKER = 'caspar-codex-managed';
export const AGENTS_BRIDGE_START = '<!-- caspar-codex:start -->';
export const AGENTS_BRIDGE_END = '<!-- caspar-codex:end -->';
export const SESSION_OVERRIDE_START = '<!-- caspar-session:start -->';
export const SESSION_OVERRIDE_END = '<!-- caspar-session:end -->';
export const KNOWLEDGE_OVERRIDE_START = '<!-- caspar-knowledge:start -->';
export const KNOWLEDGE_OVERRIDE_END = '<!-- caspar-knowledge:end -->';

export function listCasparSkills() {
  const skillsDir = path.join(casparPluginRoot(), 'skills');
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
    .sort();
}

export function listCasparAgents() {
  const agentsDir = path.join(casparPluginRoot(), 'agents');
  return fs.readdirSync(agentsDir)
    .filter(name => name.endsWith('.md'))
    .map(name => path.basename(name, '.md'))
    .sort();
}

export const SHARED_SKILLS = [
  'caspar-guide',
  'caspar-learn',
  'caspar-tdd'
];

export const WORKFLOW_PROBE_SKILLS = [
  'caspar-scope',
  'caspar-plan',
  'caspar-execute',
  'caspar-clean',
  'caspar-test'
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

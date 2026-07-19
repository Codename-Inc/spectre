import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  listSpectreAgents,
  listSpectreSkills,
  MIN_CODEX_VERSION,
  SHARED_SKILLS,
  WORKFLOW_PROBE_SKILLS
} from './constants.js';
import {
  codexConfigPath,
  codexHooksConfigPath,
  codexRuntimeRoot,
  codexSkillsDir,
  resolveCodexHome
} from './paths.js';

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

export function codexVersion() {
  const output = execFileSync('codex', ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
  if (!versionMatch) {
    throw new Error(`Unable to parse Codex version from "${output}"`);
  }
  return versionMatch[1];
}

function spectreHooksConfigured() {
  const hooksPath = codexHooksConfigPath();
  if (!fs.existsSync(hooksPath)) {
    return { configured: false, error: null };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const configured = Object.values(parsed?.hooks ?? {}).some(groups =>
      Array.isArray(groups) && groups.some(group =>
        Array.isArray(group?.hooks) && group.hooks.some(hook =>
          hook?.type === 'command'
          && typeof hook.command === 'string'
          && (
            hook.command.includes('spectre/hooks/session-start.mjs')
            || hook.command.includes('spectre/hooks/scripts/')
          )
        )
      )
    );

    return { configured, error: null };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function skillPath(skillName) {
  return path.join(codexSkillsDir(), skillName, 'SKILL.md');
}

export function runDoctor({ verifyHooks = false, json = false, projectDir = process.cwd() } = {}) {
  const home = resolveCodexHome();
  const version = codexVersion();
  const hookConfigStatus = spectreHooksConfigured();
  const result = {
    codexHome: home,
    codexVersion: version,
    minVersion: MIN_CODEX_VERSION,
    supported: compareVersions(version, MIN_CODEX_VERSION) >= 0,
    paths: {
      config: codexConfigPath(),
      skills: codexSkillsDir(),
      runtime: codexRuntimeRoot()
    },
    installed: {
      config: fs.existsSync(codexConfigPath()),
      runtimeDir: fs.existsSync(codexRuntimeRoot())
    },
    hooks: {
      verifyRequested: verifyHooks,
      spectreHooksConfigured: false,
      hooksFeatureEnabled: false,
      hiddenContextInjection: 'none',
      hooksConfigPath: codexHooksConfigPath(),
      hooksConfigPresent: fs.existsSync(codexHooksConfigPath())
    },
    capabilities: {
      workflowSkillsInstalled: false,
      exactWorkflowSkillsInstalled: false,
      subagentsInstalled: false,
      multiAgentEnabled: false,
      sharedSkillsInstalled: false
    }
  };

  if (fs.existsSync(codexConfigPath())) {
    const config = fs.readFileSync(codexConfigPath(), 'utf8');
    result.hooks.hooksFeatureEnabled = /^hooks\s*=\s*true\s*$/m.test(config);
    result.hooks.spectreHooksConfigured = hookConfigStatus.configured;
    if (hookConfigStatus.configured) {
      result.hooks.hiddenContextInjection = 'agents_override_managed_block';
    }
    if (hookConfigStatus.error) {
      result.hooks.configError = hookConfigStatus.error;
    }
    if (hookConfigStatus.error) {
      result.hooks.hiddenContextInjection = 'malformed_hooks_json';
    }
    result.capabilities.subagentsInstalled = listSpectreAgents().every(agent => config.includes(`[agents.spectre_${agent.replace(/-/g, '_')}]`));
    result.capabilities.multiAgentEnabled = config.includes('multi_agent = true');
  }

  const expectedSkillFiles = listSpectreSkills().map(name => skillPath(name));
  result.capabilities.workflowSkillsInstalled = WORKFLOW_PROBE_SKILLS
    .some(name => fs.existsSync(skillPath(name)));
  result.capabilities.exactWorkflowSkillsInstalled = expectedSkillFiles.every(filePath => fs.existsSync(filePath));

  result.capabilities.sharedSkillsInstalled = SHARED_SKILLS
    .every(skill => fs.existsSync(skillPath(skill)));

  if (verifyHooks) {
    result.hooks.manualVerification = 'SessionStart hooks are configured; managed context is refreshed when the current workspace has a Spectre knowledge or handoff surface.';
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Codex version: ${result.codexVersion}\n`);
  process.stdout.write(`Codex home: ${result.codexHome}\n`);
  process.stdout.write(`Supported: ${result.supported ? 'yes' : 'no'} (requires >= ${result.minVersion})\n`);
  process.stdout.write(`Config present: ${result.installed.config ? 'yes' : 'no'}\n`);
  process.stdout.write(`Runtime present: ${result.installed.runtimeDir ? 'yes' : 'no'}\n`);
  process.stdout.write(`Spectre hooks configured: ${result.hooks.spectreHooksConfigured ? 'yes' : 'no'}\n`);
  process.stdout.write(`hooks.json present: ${result.hooks.hooksConfigPresent ? 'yes' : 'no'}\n`);
  process.stdout.write(`Hooks feature enabled: ${result.hooks.hooksFeatureEnabled ? 'yes' : 'no'}\n`);
  process.stdout.write(`Hidden context injection: ${result.hooks.hiddenContextInjection}\n`);
  if (result.hooks.configError) {
    process.stdout.write(`Hook config error: ${result.hooks.configError}\n`);
  }
  if (result.hooks.manualVerification) {
    process.stdout.write(`Hook verification: ${result.hooks.manualVerification}\n`);
  }
  process.stdout.write(`Exact Spectre workflow skills installed: ${result.capabilities.exactWorkflowSkillsInstalled ? 'yes' : 'no'}\n`);
  process.stdout.write(`Spectre subagents installed: ${result.capabilities.subagentsInstalled ? 'yes' : 'no'}\n`);
  process.stdout.write(`Multi-agent enabled: ${result.capabilities.multiAgentEnabled ? 'yes' : 'no'}\n`);
}

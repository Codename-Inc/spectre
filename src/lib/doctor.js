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
import {
  parseKnowledgeRecord
} from '../../plugins/spectre/hooks/scripts/knowledge/records.mjs';
import {
  resolveProjectStore
} from '../../plugins/spectre/hooks/scripts/knowledge/store.mjs';

const RESOLVED_MIGRATION_CODES = new Set([
  'MIGRATED',
  'DEDUPLICATED',
  'ALREADY_MIGRATED'
]);

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

function isSpectreHook(hook) {
  return hook?.type === 'command'
    && typeof hook.command === 'string'
    && (
      hook.command.includes('spectre/hooks/session-start.mjs')
      || hook.command.includes('spectre/hooks/scripts/')
    );
}

function spectreHooksConfigured() {
  const hooksPath = codexHooksConfigPath();
  if (!fs.existsSync(hooksPath)) {
    return {
      configured: false,
      promptResolverConfigured: false,
      error: null
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const configured = Object.values(parsed?.hooks ?? {}).some(groups =>
      Array.isArray(groups) && groups.some(group =>
        Array.isArray(group?.hooks) && group.hooks.some(hook =>
          isSpectreHook(hook)
        )
      )
    );
    const promptResolverConfigured = (parsed?.hooks?.UserPromptSubmit ?? [])
      .some(group =>
        Array.isArray(group?.hooks) && group.hooks.some(hook =>
          isSpectreHook(hook)
          && hook.command.includes('user-prompt-submit.mjs')
        )
      );

    return { configured, promptResolverConfigured, error: null };
  } catch (error) {
    return {
      configured: false,
      promptResolverConfigured: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function skillPath(skillName) {
  return path.join(codexSkillsDir(), skillName, 'SKILL.md');
}

function tableBody(config, tableHeader) {
  const lines = config.split(/\r?\n/);
  const headerIndex = lines.findIndex(line => line.trim() === tableHeader);
  if (headerIndex === -1) return '';
  const body = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join('\n');
}

function projectTrusted(config, projectDir) {
  const candidates = new Set([path.resolve(projectDir)]);
  try {
    candidates.add(fs.realpathSync.native(projectDir));
  } catch {
    // The resolved project path remains the trust lookup fallback.
  }
  return [...candidates].some(candidate =>
    /^trust_level\s*=\s*"trusted"\s*$/m.test(
      tableBody(config, `[projects.${JSON.stringify(candidate)}]`)
    )
  );
}

function hooksEnabled(config) {
  return /^hooks\s*=\s*true\s*$/m.test(tableBody(config, '[features]'));
}

function readIndexStatus(indexPath) {
  if (!fs.existsSync(indexPath)) {
    return { status: 'absent', recordCount: 0 };
  }
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (
      !index
      || index.schemaVersion !== 1
      || !Array.isArray(index.records)
    ) {
      return {
        status: 'malformed',
        recordCount: 0,
        error: 'Expected schemaVersion 1 with a records array.'
      };
    }
    return { status: 'valid', recordCount: index.records.length };
  } catch (error) {
    return {
      status: 'malformed',
      recordCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function inspectRecords(storePath) {
  const knowledgeDir = path.join(storePath, 'knowledge');
  const validRecords = [];
  const invalidRecords = [];
  if (!fs.existsSync(knowledgeDir)) {
    return { validRecords, invalidRecords };
  }

  for (const entry of fs.readdirSync(knowledgeDir, { withFileTypes: true })
    .filter(candidate => candidate.isDirectory() && !candidate.isSymbolicLink())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const skillPath = path.join(knowledgeDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    try {
      const parsed = parseKnowledgeRecord(skillPath);
      validRecords.push({
        id: parsed.record.id,
        status: parsed.record.status,
        version: parsed.record.version,
        path: skillPath
      });
    } catch (error) {
      invalidRecords.push({
        path: skillPath,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { validRecords, invalidRecords };
}

function legacyRegistryRows(projectDir) {
  const rows = [];
  for (const nativeRoot of ['.claude', '.agents']) {
    for (const recallName of ['spectre-recall', 'spectre-find']) {
      const registryPath = path.join(
        projectDir,
        nativeRoot,
        'skills',
        recallName,
        'references',
        'registry.toon'
      );
      if (!fs.existsSync(registryPath)) continue;
      rows.push(...fs.readFileSync(registryPath, 'utf8')
        .split(/\r?\n/)
        .filter(line => line.trim() && !line.trimStart().startsWith('#'))
        .map(line => ({
          id: line.split('|')[0]?.trim() || null,
          registryPath
        })));
    }
  }
  return rows;
}

function inspectMigration(projectDir, storePath) {
  const reportPath = storePath
    ? path.join(storePath, 'migration-report.json')
    : null;
  const legacyRows = legacyRegistryRows(projectDir);
  if (!reportPath || !fs.existsSync(reportPath)) {
    return {
      status: legacyRows.length > 0 ? 'debt' : 'complete',
      reportPath,
      unresolvedCount: legacyRows.length,
      issues: legacyRows.length > 0
        ? [{ code: 'UNCLASSIFIED_LEGACY', count: legacyRows.length }]
        : [],
      grandfatheredClaudeExceptions: []
    };
  }

  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (
      !report
      || report.schemaVersion !== 1
      || !Array.isArray(report.entries)
    ) {
      throw new Error('Expected schemaVersion 1 with an entries array.');
    }
    const issues = report.entries.filter(entry =>
      !RESOLVED_MIGRATION_CODES.has(entry?.code)
    );
    const reportedIds = new Set(
      report.entries
        .map(entry => entry?.id)
        .filter(id => typeof id === 'string' && id)
    );
    const unclassifiedLegacyCount = legacyRows.filter(
      row => row.id === null || !reportedIds.has(row.id)
    ).length;
    const grandfatheredClaudeExceptions = issues
      .filter(entry =>
        entry?.code === 'OVERSIZED'
        && entry.grandfatheredClaudeNativeDiscovery === true
        && Array.isArray(entry.sourcePaths)
        && entry.sourcePaths.some(sourcePath =>
          typeof sourcePath === 'string'
          && sourcePath.includes(`${path.sep}.claude${path.sep}`)
        )
      )
      .map(entry => ({
        id: entry.id,
        sourcePaths: entry.sourcePaths,
        nativeDiscoveryEligible: true
      }));
    return {
      status: issues.length > 0 || unclassifiedLegacyCount > 0 ? 'debt' : 'complete',
      reportPath,
      unresolvedCount: issues.length + unclassifiedLegacyCount,
      issues: [
        ...issues.map(entry => ({
          id: entry.id,
          code: entry.code,
          sourcePaths: entry.sourcePaths ?? []
        })),
        ...(unclassifiedLegacyCount > 0
          ? [{ code: 'UNCLASSIFIED_LEGACY', count: unclassifiedLegacyCount }]
          : [])
      ],
      grandfatheredClaudeExceptions
    };
  } catch (error) {
    return {
      status: 'invalid',
      reportPath,
      unresolvedCount: legacyRows.length,
      issues: [],
      grandfatheredClaudeExceptions: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function inspectKnowledge(projectDir, config, hookConfigStatus) {
  const adapterPath = path.join(
    codexRuntimeRoot(),
    'hooks',
    'scripts',
    'user-prompt-submit.mjs'
  );
  const adapterPresent = fs.existsSync(adapterPath);
  const hooksFeatureEnabled = hooksEnabled(config);
  const trusted = projectTrusted(config, projectDir);
  let resolverStatus = 'active';
  if (!hookConfigStatus.promptResolverConfigured || !adapterPresent) {
    resolverStatus = 'absent';
  } else if (!hooksFeatureEnabled) {
    resolverStatus = 'disabled';
  } else if (!trusted) {
    resolverStatus = 'untrusted';
  }

  let resolved;
  try {
    resolved = await resolveProjectStore(projectDir, { readOnly: true });
  } catch (error) {
    return {
      resolver: {
        status: resolverStatus,
        promptHookConfigured: hookConfigStatus.promptResolverConfigured,
        adapterPresent,
        hooksFeatureEnabled,
        projectTrusted: trusted
      },
      store: {
        status: 'invalid',
        path: null,
        index: { status: 'unknown', recordCount: 0 },
        validRecords: [],
        invalidRecords: [],
        error: error instanceof Error ? error.message : String(error)
      },
      migration: {
        status: 'unknown',
        reportPath: null,
        unresolvedCount: 0,
        issues: [],
        grandfatheredClaudeExceptions: []
      },
      nativeDiscovery: {
        status: 'complete',
        grandfatheredClaudeExceptions: []
      }
    };
  }

  if (!resolved.storePath) {
    const migration = inspectMigration(projectDir, null);
    return {
      resolver: {
        status: resolverStatus,
        promptHookConfigured: hookConfigStatus.promptResolverConfigured,
        adapterPresent,
        hooksFeatureEnabled,
        projectTrusted: trusted
      },
      store: {
        status: 'absent',
        path: null,
        index: { status: 'absent', recordCount: 0 },
        validRecords: [],
        invalidRecords: []
      },
      migration,
      nativeDiscovery: {
        status: migration.grandfatheredClaudeExceptions.length > 0
          ? 'grandfathered_claude'
          : 'complete',
        grandfatheredClaudeExceptions:
          migration.grandfatheredClaudeExceptions
      }
    };
  }

  const index = readIndexStatus(path.join(resolved.storePath, 'index.json'));
  const records = inspectRecords(resolved.storePath);
  const migration = inspectMigration(projectDir, resolved.storePath);
  return {
    resolver: {
      status: resolverStatus,
      promptHookConfigured: hookConfigStatus.promptResolverConfigured,
      adapterPresent,
      hooksFeatureEnabled,
      projectTrusted: trusted
    },
    store: {
      status: index.status === 'valid' && records.invalidRecords.length === 0
        ? 'valid'
        : 'invalid',
      path: resolved.storePath,
      index,
      ...records
    },
    migration,
    nativeDiscovery: {
      status: migration.grandfatheredClaudeExceptions.length > 0
        ? 'grandfathered_claude'
        : 'complete',
      grandfatheredClaudeExceptions:
        migration.grandfatheredClaudeExceptions
    }
  };
}

export async function runDoctor({ verifyHooks = false, json = false, projectDir = process.cwd() } = {}) {
  const home = resolveCodexHome();
  const version = codexVersion();
  const hookConfigStatus = spectreHooksConfigured();
  const config = fs.existsSync(codexConfigPath())
    ? fs.readFileSync(codexConfigPath(), 'utf8')
    : '';
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
    },
    knowledge: await inspectKnowledge(projectDir, config, hookConfigStatus)
  };

  if (config) {
    result.hooks.hooksFeatureEnabled = hooksEnabled(config);
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
  process.stdout.write(`Prompt resolver: ${result.knowledge.resolver.status}\n`);
  process.stdout.write(`Knowledge store: ${result.knowledge.store.status}\n`);
  process.stdout.write(`Knowledge index: ${result.knowledge.store.index.status}\n`);
  if (result.knowledge.migration.status === 'debt') {
    process.stdout.write(`Migration debt: ${result.knowledge.migration.unresolvedCount} unresolved\n`);
  } else {
    process.stdout.write(`Migration debt: ${result.knowledge.migration.status}\n`);
  }
  const grandfathered =
    result.knowledge.nativeDiscovery.grandfatheredClaudeExceptions;
  if (result.knowledge.nativeDiscovery.status === 'grandfathered_claude') {
    process.stdout.write(
      `Native discovery retirement: incomplete (${grandfathered.length} grandfathered Claude exception${grandfathered.length === 1 ? '' : 's'})\n`
    );
    for (const exception of grandfathered) {
      process.stdout.write(
        `Grandfathered Claude skill: ${exception.id} (still eligible for Claude native discovery)\n`
      );
    }
  } else {
    process.stdout.write('Native discovery retirement: complete\n');
  }
}

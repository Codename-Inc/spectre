import fs from 'fs';
import path from 'path';
import { MANAGED_CONFIG_MARKER } from './constants.js';
import { codexConfigPath, codexHooksConfigPath, ensureDir, projectPaths } from './paths.js';

function escapeTomlString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tablePattern(tableName) {
  return new RegExp(`(^\\[${escapeRegExp(tableName)}\\]\\n)([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'm');
}

function readConfig() {
  const configPath = codexConfigPath();
  ensureDir(path.dirname(configPath));
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, '');
  }

  let content = fs.readFileSync(configPath, 'utf8');
  if (!content.includes(`# ${MANAGED_CONFIG_MARKER}`)) {
    content = `${content.trimEnd()}\n\n# ${MANAGED_CONFIG_MARKER}\n`.trimStart();
  }

  return { configPath, content };
}

function writeConfig(configPath, content) {
  const normalized = content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trimEnd();

  fs.writeFileSync(configPath, `${normalized}\n`);
}

function ensureTable(content, tableName) {
  if (tablePattern(tableName).test(content)) {
    return content;
  }

  return `${content.trimEnd()}\n\n[${tableName}]\n`;
}

function replaceTable(content, tableName, body) {
  const nextContent = ensureTable(content, tableName);
  const pattern = tablePattern(tableName);
  if (!pattern.test(nextContent)) {
    return `${nextContent.trimEnd()}\n\n[${tableName}]\n${body.trimEnd()}\n`;
  }

  return nextContent.replace(pattern, `[${tableName}]\n${body.trimEnd()}\n`);
}

function removeTable(content, tableName) {
  return content.replace(new RegExp(`\\n*\\[${escapeRegExp(tableName)}\\]\\n[\\s\\S]*?(?=^\\[|(?![\\s\\S]))`, 'm'), '\n');
}

function removeEmptyTable(content, tableName) {
  const pattern = new RegExp(`\\n*\\[${escapeRegExp(tableName)}\\]\\n([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'gm');
  return content.replace(pattern, (match, body) => {
    const stripped = body
      .split('\n')
      .map(line => line.replace(/#.*/, '').trim())
      .filter(Boolean);

    return stripped.length === 0 ? '\n' : match;
  });
}

function removeScalarKey(content, tableName, key) {
  const pattern = tablePattern(tableName);
  const match = content.match(pattern);
  if (!match) {
    return content;
  }

  const body = match[2];
  const keyPattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*\\n?`, 'm');
  if (!keyPattern.test(body)) {
    return content;
  }

  const nextBody = body.replace(keyPattern, '');
  return content.replace(pattern, `${match[1]}${nextBody}`);
}

function removeRootScalarKey(content, key) {
  return content.replace(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*\\n?`, 'm'), '');
}

function upsertRootScalarKey(content, key, valueExpression) {
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*$`, 'm');
  const line = `${key} = ${valueExpression}`;

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const markerPattern = new RegExp(`^# ${escapeRegExp(MANAGED_CONFIG_MARKER)}$`, 'm');
  if (markerPattern.test(content)) {
    return content.replace(markerPattern, `# ${MANAGED_CONFIG_MARKER}\n${line}`);
  }

  return `${line}\n${content.trimStart()}`;
}

function upsertScalarKey(content, tableName, key, valueExpression) {
  const nextContent = ensureTable(content, tableName);
  const pattern = tablePattern(tableName);
  const match = nextContent.match(pattern);
  if (!match) {
    return `${nextContent.trimEnd()}\n\n[${tableName}]\n${key} = ${valueExpression}\n`;
  }

  const body = match[2];
  const keyPattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*$`, 'm');
  const line = `${key} = ${valueExpression}`;
  const nextBody = keyPattern.test(body)
    ? body.replace(keyPattern, line)
    : `${body}${body.endsWith('\n') || body.length === 0 ? '' : '\n'}${line}\n`;

  return nextContent.replace(pattern, `${match[1]}${nextBody}`);
}

function removeEntryFromArrayLine(content, tableName, key, entry) {
  const pattern = tablePattern(tableName);
  const match = content.match(pattern);
  if (!match) {
    return content;
  }

  const body = match[2];
  const keyPattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\\[(.*)\\]\\s*$`, 'm');
  const keyMatch = body.match(keyPattern);
  if (!keyMatch) {
    return content;
  }

  const rawEntries = keyMatch[1].trim();
  const tokens = [];
  let depth = 0;
  let current = '';

  for (const char of rawEntries) {
    if (char === '[' || char === '{') {
      depth += 1;
    } else if (char === ']' || char === '}') {
      depth -= 1;
    }

    if (char === ',' && depth === 0) {
      tokens.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const nextTokens = tokens.filter(token => normalize(token) !== normalize(entry));
  const nextBody = nextTokens.length
    ? body.replace(keyPattern, `${key} = [${nextTokens.join(', ')}]`)
    : body.replace(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\\[.*\\]\\s*\\n?`, 'm'), '');

  return content.replace(pattern, `${match[1]}${nextBody}`);
}

function parseArrayTableEntries(content, tableName) {
  const escaped = escapeRegExp(tableName);
  const pattern = new RegExp(`(^\\[\\[${escaped}\\]\\]\\n)([\\s\\S]*?)(?=^\\[\\[${escaped}\\]\\]\\n|^\\[(?!\\[)|(?![\\s\\S]))`, 'gm');
  const entries = [];

  for (const match of content.matchAll(pattern)) {
    const body = match[2].trimEnd();
    const pathMatch = body.match(/^path\s*=\s*"([^"]+)"/m);
    const enabledMatch = body.match(/^enabled\s*=\s*(true|false)/m);
    entries.push({
      raw: match[0],
      body,
      path: pathMatch ? pathMatch[1] : null,
      enabled: enabledMatch ? enabledMatch[1] === 'true' : null
    });
  }

  return entries;
}

function removeArrayTableEntries(content, tableName) {
  const escaped = escapeRegExp(tableName);
  return content.replace(new RegExp(`\\n*\\[\\[${escaped}\\]\\]\\n[\\s\\S]*?(?=^\\[\\[${escaped}\\]\\]\\n|^\\[(?!\\[)|(?![\\s\\S]))`, 'gm'), '\n');
}

function renderSkillsConfigEntries(entries) {
  if (entries.length === 0) {
    return '';
  }

  return `${entries.map(entry => [
    '[[skills.config]]',
    `path = "${escapeTomlString(entry.path)}"`,
    `enabled = ${entry.enabled ? 'true' : 'false'}`
  ].join('\n')).join('\n\n')}\n`;
}

function removeLegacyProjectSkillTables(content) {
  return content.replace(/\n*\[skills\.config\.spectre_[^\]]+\]\n[\s\S]*?(?=^\[\[skills\.config\]\]\n|^\[(?!\[)|(?![\s\S]))/gm, '\n');
}

function shellQuote(value) {
  return `'${value.replaceAll('\'', `'\\''`)}'`;
}

function readHooksConfig() {
  const hooksPath = codexHooksConfigPath();
  ensureDir(path.dirname(hooksPath));

  if (!fs.existsSync(hooksPath)) {
    return {
      hooksPath,
      config: { hooks: {} }
    };
  }

  const raw = fs.readFileSync(hooksPath, 'utf8').trim();
  if (!raw) {
    return {
      hooksPath,
      config: { hooks: {} }
    };
  }

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Malformed Codex hooks config at ${hooksPath}: expected a JSON object.`);
  }

  const hooks = parsed.hooks;
  if (hooks != null && (typeof hooks !== 'object' || Array.isArray(hooks))) {
    throw new Error(`Malformed Codex hooks config at ${hooksPath}: expected "hooks" to be an object.`);
  }

  return {
    hooksPath,
    config: {
      ...parsed,
      hooks: hooks ?? {}
    }
  };
}

function writeHooksConfig(hooksPath, config) {
  const normalizedHooks = Object.fromEntries(
    Object.entries(config.hooks ?? {}).filter(([, groups]) => Array.isArray(groups) && groups.length > 0)
  );

  if (Object.keys(normalizedHooks).length === 0) {
    if (fs.existsSync(hooksPath)) {
      fs.unlinkSync(hooksPath);
    }
    return;
  }

  const nextConfig = {
    ...config,
    hooks: normalizedHooks
  };

  fs.writeFileSync(hooksPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
}

function spectreSessionStartCommand(runtimeRoot) {
  return `node ${shellQuote(path.join(runtimeRoot, 'hooks', 'session-start.mjs'))}`;
}

function isSpectreSessionStartHook(hook) {
  return hook
    && typeof hook === 'object'
    && hook.type === 'command'
    && typeof hook.command === 'string'
    && hook.command.includes('spectre/hooks/session-start.mjs');
}

function upsertSpectreSessionStartHook(runtimeRoot) {
  const { hooksPath, config } = readHooksConfig();
  const hooks = { ...(config.hooks ?? {}) };
  const groups = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  const nextGroups = [];

  for (const group of groups) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      nextGroups.push(group);
      continue;
    }

    const hookList = Array.isArray(group.hooks) ? group.hooks.filter(hook => !isSpectreSessionStartHook(hook)) : [];
    if (hookList.length > 0) {
      nextGroups.push({
        ...group,
        hooks: hookList
      });
    }
  }

  nextGroups.push({
    hooks: [
      {
        type: 'command',
        command: spectreSessionStartCommand(runtimeRoot),
        statusMessage: 'Spectre: loading session context'
      }
    ]
  });

  hooks.SessionStart = nextGroups;
  writeHooksConfig(hooksPath, {
    ...config,
    hooks
  });
}

function removeSpectreSessionStartHook() {
  const hooksPath = codexHooksConfigPath();
  if (!fs.existsSync(hooksPath)) {
    return false;
  }

  const { config } = readHooksConfig();
  const hooks = { ...(config.hooks ?? {}) };
  const groups = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  let removed = false;
  const nextGroups = [];

  for (const group of groups) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      nextGroups.push(group);
      continue;
    }

    const originalHooks = Array.isArray(group.hooks) ? group.hooks : [];
    const filteredHooks = originalHooks.filter(hook => {
      const shouldRemove = isSpectreSessionStartHook(hook);
      removed ||= shouldRemove;
      return !shouldRemove;
    });

    if (filteredHooks.length > 0) {
      nextGroups.push({
        ...group,
        hooks: filteredHooks
      });
    }
  }

  if (nextGroups.length > 0) {
    hooks.SessionStart = nextGroups;
  } else {
    delete hooks.SessionStart;
  }

  writeHooksConfig(hooksPath, {
    ...config,
    hooks
  });

  return removed;
}

function hasRemainingHookDefinitions() {
  const hooksPath = codexHooksConfigPath();
  if (!fs.existsSync(hooksPath)) {
    return false;
  }

  const { config } = readHooksConfig();
  return Object.values(config.hooks ?? {}).some(groups => Array.isArray(groups) && groups.length > 0);
}

function hasRemainingAgentTables(content) {
  return /^\[agents\.[^\]]+\]$/m.test(content);
}

export function syncProjectSkillsConfigured(projectDir) {
  const { configPath, content: initialContent } = readConfig();
  const paths = projectPaths(projectDir);
  const projectSkillsRoot = path.resolve(paths.projectSkillsDir);
  const existingEntries = parseArrayTableEntries(initialContent, 'skills.config');
  const unrelatedEntries = existingEntries.filter(entry =>
    !(entry.path && path.resolve(entry.path).startsWith(`${projectSkillsRoot}${path.sep}`))
  );
  const projectEntries = [];

  if (fs.existsSync(paths.projectSkillsDir)) {
    for (const entry of fs.readdirSync(paths.projectSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillPath = path.join(paths.projectSkillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        continue;
      }

      projectEntries.push({
        path: skillPath,
        enabled: true
      });
    }
  }

  let content = removeLegacyProjectSkillTables(removeArrayTableEntries(initialContent, 'skills.config')).trimEnd();
  const nextEntries = unrelatedEntries.concat(projectEntries);
  const renderedEntries = renderSkillsConfigEntries(nextEntries).trimEnd();
  if (renderedEntries) {
    content = `${content}\n\n${renderedEntries}`;
  }

  writeConfig(configPath, content);
}

export function removeProjectSkillsConfigured(projectDir) {
  const configPath = codexConfigPath();
  if (!fs.existsSync(configPath)) {
    return;
  }

  const projectSkillsRoot = path.resolve(projectPaths(projectDir).projectSkillsDir);
  const initialContent = fs.readFileSync(configPath, 'utf8');
  const remainingEntries = parseArrayTableEntries(initialContent, 'skills.config').filter(entry =>
    !(entry.path && path.resolve(entry.path).startsWith(`${projectSkillsRoot}${path.sep}`))
  );
  let content = removeLegacyProjectSkillTables(removeArrayTableEntries(initialContent, 'skills.config')).trimEnd();
  const renderedEntries = renderSkillsConfigEntries(remainingEntries).trimEnd();
  if (renderedEntries) {
    content = `${content}\n\n${renderedEntries}`;
  }

  writeConfig(configPath, content);
}

export function ensureSpectreHooksConfigured(runtimeRoot, agents) {
  const { configPath, content: initialContent } = readConfig();
  let content = initialContent;

  const preSessionEntry = `{ command = ["node", "${escapeTomlString(path.join(runtimeRoot, 'hooks', 'pre-session-start.mjs'))}"] }`;

  content = removeScalarKey(content, 'hooks', 'session_start');
  content = removeEntryFromArrayLine(content, 'hooks.blocking', 'pre_session_start', preSessionEntry);
  content = upsertRootScalarKey(content, 'suppress_unstable_features_warning', 'true');
  content = upsertScalarKey(content, 'features', 'codex_hooks', 'true');
  content = upsertScalarKey(content, 'features', 'skills', 'true');
  content = upsertScalarKey(content, 'features', 'multi_agent', 'true');
  content = removeEmptyTable(content, 'hooks');
  content = removeEmptyTable(content, 'hooks.blocking');

  for (const agent of agents) {
    const tableName = `agents.spectre_${agent.id}`;
    const nicknames = agent.nicknames.map(name => `"${escapeTomlString(name)}"`).join(', ');
    content = removeTable(content, tableName);
    content = replaceTable(
      content,
      tableName,
      [
        `description = "${escapeTomlString(agent.description)}"`,
        `config_file = "${escapeTomlString(agent.configFile)}"`,
        `nickname_candidates = [${nicknames}]`
      ].join('\n')
    );
  }

  writeConfig(configPath, content);
  upsertSpectreSessionStartHook(runtimeRoot);
}

export function removeSpectreHooksConfigured(runtimeRoot, agents) {
  const configPath = codexConfigPath();
  if (!fs.existsSync(configPath)) {
    return;
  }

  let content = fs.readFileSync(configPath, 'utf8');
  const preSessionEntry = `{ command = ["node", "${escapeTomlString(path.join(runtimeRoot, 'hooks', 'pre-session-start.mjs'))}"] }`;

  const removedSessionStartHook = removeSpectreSessionStartHook();

  content = removeScalarKey(content, 'hooks', 'session_start');
  content = removeEntryFromArrayLine(content, 'hooks.blocking', 'pre_session_start', preSessionEntry);
  content = removeEmptyTable(content, 'hooks');
  content = removeEmptyTable(content, 'hooks.blocking');

  for (const agent of agents) {
    content = removeTable(content, `agents.spectre_${agent.id}`);
  }

  if (removedSessionStartHook && !hasRemainingHookDefinitions()) {
    content = removeScalarKey(content, 'features', 'codex_hooks');
  }

  if (!hasRemainingAgentTables(content)) {
    content = removeScalarKey(content, 'features', 'multi_agent');
  }

  content = removeEmptyTable(content, 'features');

  writeConfig(configPath, content);
}

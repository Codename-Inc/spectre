'use strict';

const fs = require('fs');
const path = require('path');

const CODEX_PLUGIN_ROOT = '${CODEX_HOME}/spectre';

function writeIfChanged(filePath, content) {
  const existed = fs.existsSync(filePath);
  if (existed) {
    const current = fs.readFileSync(filePath, 'utf8');
    if (current === content) return 'unchanged';
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return existed ? 'updated' : 'created';
}

function listRuntimeMjsFiles(sourceScriptsDir) {
  if (!fs.existsSync(sourceScriptsDir)) return [];

  return fs
    .readdirSync(sourceScriptsDir)
    .filter((fileName) => fileName.endsWith('.mjs') && !fileName.startsWith('test_'))
    .sort();
}

function rewriteHookCommand(command) {
  return command
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, CODEX_PLUGIN_ROOT)
    .replace(/hooks\/scripts\/([^/\s]+)\.cjs/g, 'hooks/scripts/$1.mjs');
}

function translateHooksJson(sourcePath, targetPath) {
  const hooksConfig = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const rewritten = JSON.parse(
    JSON.stringify(hooksConfig, (_key, value) => {
      if (typeof value === 'string') return rewriteHookCommand(value);
      return value;
    }),
  );

  return writeIfChanged(targetPath, `${JSON.stringify(rewritten, null, 2)}\n`);
}

function removeStaleFiles(dir, keep) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...removeStaleFiles(fullPath, keep));
      if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length === 0) {
        fs.rmdirSync(fullPath);
      }
      continue;
    }

    if (entry.isFile() && !keep.has(fullPath)) {
      fs.unlinkSync(fullPath);
      results.push({ path: fullPath, status: 'removed' });
    }
  }

  return results;
}

function translate(canonicalRoot, codexRoot) {
  const sourceHooksPath = path.join(canonicalRoot, 'hooks', 'hooks.json');
  const sourceScriptsDir = path.join(canonicalRoot, 'hooks', 'scripts');
  const targetHooksPath = path.join(codexRoot, 'hooks', 'hooks.json');
  const targetScriptsDir = path.join(codexRoot, 'hooks', 'scripts');
  const mjsFiles = listRuntimeMjsFiles(sourceScriptsDir);
  const results = [];
  const keep = new Set();

  if (mjsFiles.length === 0) {
    return [
      {
        path: sourceScriptsDir,
        status: 'skipped',
        reason: 'No canonical .mjs hook scripts found; hook generation waits for Phase 1 integration.',
      },
    ];
  }

  for (const fileName of mjsFiles) {
    const sourcePath = path.join(sourceScriptsDir, fileName);
    const targetPath = path.join(targetScriptsDir, fileName);
    const status = writeIfChanged(targetPath, fs.readFileSync(sourcePath, 'utf8'));
    keep.add(targetPath);
    results.push({ path: targetPath, sourcePath, status });
  }

  if (fs.existsSync(sourceHooksPath)) {
    const status = translateHooksJson(sourceHooksPath, targetHooksPath);
    keep.add(targetHooksPath);
    results.push({ path: targetHooksPath, sourcePath: sourceHooksPath, status });
  }

  results.push(...removeStaleFiles(path.join(codexRoot, 'hooks'), keep));
  return results;
}

function commandScriptPaths(hooksConfig) {
  const paths = [];
  const hooksByEvent = hooksConfig.hooks || {};

  for (const eventConfig of Object.values(hooksByEvent)) {
    if (!Array.isArray(eventConfig)) continue;

    for (const matcher of eventConfig) {
      for (const hook of matcher.hooks || []) {
        if (hook.type !== 'command' || typeof hook.command !== 'string') continue;

        const match = hook.command.match(/\$\{CODEX_HOME\}\/spectre\/([^\s'"]+)/);
        if (match) paths.push(match[1]);
      }
    }
  }

  return paths;
}

function verify(codexRoot) {
  const hooksPath = path.join(codexRoot, 'hooks', 'hooks.json');
  const results = [];

  if (!fs.existsSync(hooksPath)) {
    return [
      {
        path: hooksPath,
        ok: true,
        skipped: true,
        error: 'Generated hooks are pending canonical .mjs hook scripts.',
      },
    ];
  }

  try {
    const hooksConfig = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const scripts = commandScriptPaths(hooksConfig);

    if (scripts.length === 0) {
      throw new Error('No command hook script paths found');
    }

    for (const scriptPath of scripts) {
      if (scriptPath.endsWith('.cjs')) {
        throw new Error(`Generated hook command still references .cjs: ${scriptPath}`);
      }

      const resolved = path.join(codexRoot, scriptPath.replace(/^hooks\//, 'hooks/'));
      if (!fs.existsSync(resolved)) {
        throw new Error(`Generated hook command references missing script: ${scriptPath}`);
      }
    }

    results.push({ path: hooksPath, ok: true });
  } catch (error) {
    results.push({ path: hooksPath, ok: false, error: error.message });
  }

  return results;
}

module.exports = {
  CODEX_PLUGIN_ROOT,
  commandScriptPaths,
  rewriteHookCommand,
  translate,
  verify,
};

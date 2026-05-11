#!/usr/bin/env node

/**
 * bootstrap.mjs
 *
 * SessionStart hook that removes stale files from older plugin versions.
 *
 * When users update the plugin via marketplace, old files that were deleted
 * from the repo may still linger in their cached copy. This script runs on
 * every session start and cleans them up.
 *
 * To add new files to the cleanup list, append to STALE_PATHS below.
 * Paths are relative to CLAUDE_PLUGIN_ROOT.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStdinWithTimeout } from './lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────────
// Stale paths to remove (relative to CLAUDE_PLUGIN_ROOT)
// ──────────────────────────────────────────────────────────────────

const STALE_PATHS = [
  // Python scripts replaced by JS hook equivalents (v3.x migration)
  'hooks/scripts/capture-todos.py',
  'hooks/scripts/handoff-resume.py',
  'hooks/scripts/load-knowledge.py',
  'hooks/scripts/precompact-warning.py',
  'hooks/scripts/precompact-warning.mjs',
  'hooks/scripts/register_learning.py',
  'hooks/scripts/test_handoff_resume.py',
  'hooks/scripts/test_load_knowledge.py',

  // Old skill directory replaced by spectre-guide
  'skills/spectre-next-steps',
];

// ──────────────────────────────────────────────────────────────────
// Cleanup logic
// ──────────────────────────────────────────────────────────────────

function cleanupStalePaths(pluginRoot) {
  let removed = 0;

  for (const relPath of STALE_PATHS) {
    const fullPath = path.join(pluginRoot, relPath);

    try {
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        removed++;
      } else {
        fs.unlinkSync(fullPath);
        removed++;
      }
    } catch (_) {
      // File doesn't exist or can't be removed — skip silently
    }
  }

  return removed;
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

async function main() {
  // Drain stdin so the hook system doesn't hang
  await readStdinWithTimeout();

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

  const removed = cleanupStalePaths(pluginRoot);

  if (removed > 0) {
    process.stdout.write(JSON.stringify({
      systemMessage: `bootstrap: cleaned ${removed} stale file${removed > 1 ? 's' : ''} from previous plugin version`
    }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({}) + '\n');
  }

  process.exit(0);
}

export { cleanupStalePaths, STALE_PATHS };

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename)) {
  main();
}

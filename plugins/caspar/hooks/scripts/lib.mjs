#!/usr/bin/env node

/**
 * lib.mjs
 *
 * Shared utilities for caspar hook scripts.
 */

import { execSync } from 'node:child_process';

const STDIN_TIMEOUT = 2000; // milliseconds

/**
 * Read stdin with a timeout to avoid blocking indefinitely.
 * @param {number} [timeout=2000] - Timeout in milliseconds
 * @returns {Promise<string|null>} - stdin content or null on timeout
 */
function readStdinWithTimeout(timeout) {
  timeout = timeout != null ? timeout : STDIN_TIMEOUT;

  return new Promise((resolve) => {
    // If stdin is a TTY (no piped data), resolve immediately
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }

    let data = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        process.stdin.removeAllListeners('data');
        process.stdin.removeAllListeners('end');
        process.stdin.removeAllListeners('error');
        try { process.stdin.pause(); } catch (_) {}
        resolve(data || null);
      }
    }, timeout);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(data || null);
      }
    });
    process.stdin.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
    process.stdin.resume();
  });
}

/**
 * Get current git branch name.
 * @param {string} [cwd] - Working directory for git command
 * @returns {string} Branch name or 'unknown'
 */
function getGitBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      timeout: 5000,
      encoding: 'utf8',
      cwd: cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (_) {
    return 'unknown';
  }
}

export { readStdinWithTimeout, getGitBranch, STDIN_TIMEOUT };

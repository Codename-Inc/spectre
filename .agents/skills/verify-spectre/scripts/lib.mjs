/**
 * Shared harness for verify-spectre gates.
 *
 * Every gate is a standalone executable that exits 0 (pass) or 1 (fail) and
 * prints one line per check. Keeping the contract this thin is what lets the
 * orchestrator run gates individually, in any order, or in CI.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, derived from this file's location: .agents/skills/verify-spectre/scripts */
export const REPO = path.resolve(__dirname, '..', '..', '..', '..');

export class Gate {
  constructor(name) {
    this.name = name;
    this.failures = [];
    this.warnings = [];
    this.passed = 0;
  }

  /**
   * Record a check. `why` is only shown on failure and must say what was
   * expected vs. what was found — a failure the reader has to go investigate
   * is barely better than no check at all.
   */
  check(ok, description, why = '') {
    if (ok) {
      this.passed += 1;
      process.stdout.write(`  ok    ${description}\n`);
    } else {
      this.failures.push({ description, why });
      process.stdout.write(`  FAIL  ${description}${why ? `\n        ${why}` : ''}\n`);
    }
    return ok;
  }

  /**
   * A condition worth surfacing that shouldn't fail the build — typically a
   * one-time migration concern rather than a durable invariant. Warnings that
   * can fail the gate get ignored; warnings that can't, get read.
   */
  warn(ok, description, why = '') {
    if (ok) {
      this.passed += 1;
      process.stdout.write(`  ok    ${description}\n`);
    } else {
      this.warnings.push({ description, why });
      process.stdout.write(`  warn  ${description}${why ? `\n        ${why}` : ''}\n`);
    }
    return ok;
  }

  /** Exit with the gate's verdict. Prints a one-line summary the orchestrator greps. */
  done() {
    const total = this.passed + this.failures.length;
    if (this.warnings.length) {
      process.stdout.write(`\n  ${this.warnings.length} warning(s):\n`);
      for (const w of this.warnings) {
        process.stdout.write(`  - ${w.description}${w.why ? `: ${w.why}` : ''}\n`);
      }
    }
    if (this.failures.length === 0) {
      process.stdout.write(`GATE PASS  ${this.name}  (${total}/${total})\n`);
      process.exit(0);
    }
    process.stdout.write(`GATE FAIL  ${this.name}  (${this.passed}/${total})\n`);
    for (const f of this.failures) {
      process.stdout.write(`  - ${f.description}${f.why ? `: ${f.why}` : ''}\n`);
    }
    process.exit(1);
  }
}

/**
 * A subprocess environment with the ambient agent-harness variables stripped.
 *
 * This matters more than it looks. Whatever harness is running this suite
 * (Claude Code, Subspace, Codex) may itself write managed blocks into
 * AGENTS.override.md of whatever project its env vars point at. Inherit those
 * vars into a test subprocess and the harness will happily inject into our
 * throwaway temp projects — which then look like spectre's own output and
 * produce failures that have nothing to do with spectre.
 *
 * Gate 4 asserts on AGENTS.override.md, so it has to be the only writer.
 * Pass what the CLI genuinely needs explicitly via opts.env instead.
 */
export function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(SUBSPACE|GROVE|CLAUDE|SPECTRE|CODEX)/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

/** Run a command, capturing output. Never throws — returns the exit code. */
export function run(cmd, args, opts = {}) {
  try {
    const base = opts.isolated ? cleanEnv() : process.env;
    const stdout = execFileSync(cmd, args, {
      cwd: opts.cwd || REPO,
      encoding: 'utf8',
      input: opts.input,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...base, ...(opts.env || {}) },
      timeout: opts.timeout || 300000,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message,
    };
  }
}

/** Parse YAML frontmatter. Deliberately minimal — these files are ours, not arbitrary YAML. */
export function frontmatter(content) {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return null;
  const fields = {};
  for (const line of content.slice(4, end).split('\n')) {
    const match = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return fields;
}

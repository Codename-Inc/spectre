#!/usr/bin/env node
/**
 * Gate 4 — Real-CLI behavioral validation.
 *
 * This is the gate that actually matters. Unit tests exercise functions; users
 * exercise the installed CLI and the hooks Claude/Codex fire at session start.
 * Those are different things, and the gap between them is where this project's
 * real bugs have lived (a {{REGISTRY}} placeholder shipped raw, an injection
 * block that silently never wrote).
 *
 * Everything runs in throwaway temp dirs with a fresh CODEX_HOME. Nothing here
 * touches the user's real state.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gate, REPO, run } from './lib.mjs';

const g = new Gate('4 real-cli');
const PLUGIN = path.join(REPO, 'plugins', 'spectre');
const HOOKS = path.join(PLUGIN, 'hooks', 'scripts');
const CLI = path.join(REPO, 'bin', 'spectre.js');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-verify-'));
const CODEX_HOME = path.join(ROOT, 'codex-home');
fs.mkdirSync(CODEX_HOME, { recursive: true });
process.on('exit', () => fs.rmSync(ROOT, { recursive: true, force: true }));

/** A disposable project. `seeded` gives it the knowledge surface the hook gates on. */
function makeProject(name, { seeded = false, registry = null, legacyMarkers = false } = {}) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  run('git', ['init', '-b', 'main'], { cwd: dir });

  if (seeded) {
    fs.mkdirSync(path.join(dir, '.spectre'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.spectre', 'manifest.json'), JSON.stringify({ scope: 'project' }));
  }
  if (registry !== null) {
    const refs = path.join(dir, '.claude', 'skills', 'spectre-recall', 'references');
    fs.mkdirSync(refs, { recursive: true });
    fs.writeFileSync(path.join(refs, 'registry.toon'), registry);
  }
  if (legacyMarkers) {
    fs.writeFileSync(path.join(dir, 'AGENTS.override.md'),
      '<!-- caspar-knowledge:start -->\nstale fork block\n<!-- caspar-knowledge:end -->\n');
  }
  return dir;
}

// isolated: true strips the ambient harness env, so this suite is the only
// thing writing to these projects' AGENTS.override.md. See cleanEnv() in lib.
const hook = (script, projectDir) => run('node', [path.join(HOOKS, script)], {
  env: { CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PLUGIN_ROOT: PLUGIN },
  cwd: projectDir,
  isolated: true,
});

const cli = (args, projectDir) => run('node', [CLI, ...args], {
  env: { CODEX_HOME },
  cwd: projectDir || REPO,
  isolated: true,
});

const override = (dir) => {
  const p = path.join(dir, 'AGENTS.override.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

// ---------------------------------------------------------------------------
// A. Non-spectre project guard
// A bare directory has no knowledge surface, so the hook must write nothing.
// Injecting into an unrelated repo would be a genuinely bad bug.
// ---------------------------------------------------------------------------
const bare = makeProject('bare');
const bareRun = hook('load-knowledge.mjs', bare);
g.check(bareRun.code === 0, 'load-knowledge exits 0 on a non-spectre project', bareRun.stderr);
g.check(override(bare) === null, 'load-knowledge writes nothing to a non-spectre project',
  'AGENTS.override.md was created in a project with no spectre surface');

// ---------------------------------------------------------------------------
// B. Populated registry — the happy path
// ---------------------------------------------------------------------------
const REGISTRY = [
  'gotchas-hook-timeout|gotchas|hook,timeout,sessionstart|Use when a SessionStart hook hangs.',
  'patterns-registry-toon|patterns|registry,toon|Use when editing the knowledge registry.',
].join('\n');

const populated = makeProject('populated', { seeded: true, registry: REGISTRY });
const popRun = hook('load-knowledge.mjs', populated);
g.check(popRun.code === 0, 'load-knowledge exits 0 with a populated registry', popRun.stderr);

const popBody = override(populated);
g.check(popBody !== null, 'injection writes AGENTS.override.md');
if (popBody) {
  g.check(popBody.includes('<!-- spectre-knowledge:start -->') && popBody.includes('<!-- spectre-knowledge:end -->'),
    'injected block is delimited by spectre-knowledge markers');
  g.check(popBody.includes('gotchas-hook-timeout'), 'registry rows are inlined into the injected block',
    'the registry was not substituted — agents would have to read the registry file to discover knowledge');
  // The bug this whole gate was built around.
  g.check(!popBody.includes('{{REGISTRY}}'), 'no raw {{REGISTRY}} placeholder survives injection',
    'the placeholder shipped unsubstituted — the apply skill is broken for this project');
}

let notice = null;
try { notice = JSON.parse(popRun.stdout); } catch { /* handled below */ }
g.check(notice !== null, 'load-knowledge emits valid JSON on stdout',
  'Claude Code parses this; malformed JSON silently drops the hook output');
g.check(Boolean(notice?.systemMessage?.includes('2')), 'visible notice reports the right knowledge count',
  `expected a count of 2, got: ${notice?.systemMessage}`);

// ---------------------------------------------------------------------------
// C. Idempotency — SessionStart fires on every startup/clear/compact
// A block that grows or reshuffles on each run would bloat context indefinitely.
// ---------------------------------------------------------------------------
const first = override(populated);
hook('load-knowledge.mjs', populated);
g.check(override(populated) === first, 're-running load-knowledge is byte-identical',
  'the injected block changed on second run — it accumulates or reorders across sessions');

// ---------------------------------------------------------------------------
// D. Empty registry
// This is the case that catches a missed substitution in the Codex parallel
// path: with no rows to inline, a broken substitution leaves {{REGISTRY}} bare.
// ---------------------------------------------------------------------------
const empty = makeProject('empty', { seeded: true, registry: '' });
const emptyRun = hook('load-knowledge.mjs', empty);
g.check(emptyRun.code === 0, 'load-knowledge exits 0 with an empty registry', emptyRun.stderr);

const emptyBody = override(empty);
g.check(emptyBody !== null, 'injection still writes a block when the registry is empty');
if (emptyBody) {
  g.check(!emptyBody.includes('{{REGISTRY}}'), 'no raw {{REGISTRY}} placeholder with an empty registry',
    'substitution is skipped when there are no rows — the empty-registry path is broken');
  g.check(/no knowledge captured yet/i.test(emptyBody), 'empty-registry notice renders');
}

// ---------------------------------------------------------------------------
// E. Session memory
// ---------------------------------------------------------------------------
const session = makeProject('session', { seeded: true });
const logs = path.join(session, 'docs', 'tasks', 'main', 'session_logs');
fs.mkdirSync(logs, { recursive: true });
fs.writeFileSync(path.join(logs, '20260714_handoff.json'), JSON.stringify({
  summary: 'Verifying the merge',
  next_steps: ['run gate 4'],
  tasks: [],
}));

const bootRun = hook('bootstrap.mjs', session);
g.check(bootRun.code === 0, 'bootstrap exits 0', bootRun.stderr);

const resumeRun = hook('handoff-resume.mjs', session);
g.check(resumeRun.code === 0, 'handoff-resume exits 0', resumeRun.stderr);
g.check(/handoff|resume|Verifying the merge/i.test(resumeRun.stdout),
  'handoff-resume surfaces the latest handoff',
  'a handoff exists but the resume notice does not mention it — session memory is silently dead');

// ---------------------------------------------------------------------------
// F. CLI install / doctor / uninstall, both scopes
// ---------------------------------------------------------------------------
// The lifecycle that matters is install -> session -> uninstall. Install alone
// writes no override block (the SessionStart hook does), so asserting on a
// freshly-installed project would test nothing: it would pass even if uninstall
// never cleaned up. Drive a real session in between so there is genuinely
// something to clean.
for (const scope of ['project', 'user']) {
  const proj = makeProject(`install-${scope}`);

  const install = cli(['install', 'codex', '--scope', scope, '--project-dir', proj], proj);
  g.check(install.code === 0, `install codex --scope ${scope} succeeds`, install.stderr || install.stdout);

  const doctor = cli(['doctor', 'codex', '--scope', scope, '--project-dir', proj, '--json'], proj);
  g.check(doctor.code === 0, `doctor codex --scope ${scope} passes`, doctor.stderr || doctor.stdout);
  let report = null;
  try { report = JSON.parse(doctor.stdout); } catch { /* handled below */ }
  g.check(report !== null, `doctor --json emits parseable JSON (${scope})`);

  // Only a project-scope install writes .spectre/manifest.json into the project,
  // which is what gives the hook a knowledge surface to inject against. A
  // user-scope install lives in CODEX_HOME, so there is deliberately nothing to
  // inject here — asserting otherwise would be testing the wrong contract.
  if (scope === 'project') {
    hook('load-knowledge.mjs', proj);
    const injected = override(proj) || '';
    g.check(injected.includes('spectre-knowledge:start'),
      'session after a project install injects a managed block',
      'nothing was injected, so the uninstall check below would be vacuous');
  }

  const uninstall = cli(['uninstall', 'codex', '--scope', scope, '--project-dir', proj], proj);
  g.check(uninstall.code === 0, `uninstall codex --scope ${scope} succeeds`, uninstall.stderr || uninstall.stdout);

  const left = override(proj) || '';
  g.check(!left.includes('spectre-knowledge:start') && !left.includes('spectre-session:start'),
    `uninstall (${scope}) removes the managed blocks it wrote`,
    'AGENTS.override.md still carries spectre-managed blocks after uninstall');
}

// ---------------------------------------------------------------------------
// G. Legacy fork-marker cleanup  [warning, not a failure]
// Projects installed during the caspar experiment carry caspar-* marker blocks.
// Reinstall should clear them, or they linger inert in the user's override file.
// This is a one-time migration concern, not a durable invariant — so it warns
// rather than fails. A permanently-red check in a regression suite just teaches
// people to ignore red. Turn it into a check() once the merge ships and
// cleanupLegacyProjectContext handles caspar-* markers.
// ---------------------------------------------------------------------------
const legacy = makeProject('legacy', { legacyMarkers: true });
cli(['install', 'codex', '--scope', 'project', '--project-dir', legacy], legacy);
const legacyBody = override(legacy) || '';
g.warn(!legacyBody.includes('caspar-'), 'reinstall clears legacy caspar-* markers',
  'stale fork markers survive reinstall — extend cleanupLegacyProjectContext in src/lib/project.js (merge Phase 4)');

g.done();

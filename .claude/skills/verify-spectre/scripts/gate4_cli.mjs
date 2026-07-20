#!/usr/bin/env node
/**
 * Gate 4 — Real-CLI behavioral validation.
 *
 * This is the gate that actually matters. Unit tests exercise functions; users
 * exercise the installed CLI and the hooks Claude/Codex fire at session start
 * and prompt submission.
 * Those are different things, and the gap between them is where this project's
 * real bugs have lived (a resolver missing from the generated runtime, a
 * capability hook silently never writing its managed block).
 *
 * Everything runs in throwaway temp dirs with a fresh CODEX_HOME. Nothing here
 * touches the user's real state.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gate, REPO, run } from './lib.mjs';
import { refreshKnowledgeIndex } from '../../../../plugins/spectre/hooks/scripts/knowledge/records.mjs';
import { resolveProjectStore } from '../../../../plugins/spectre/hooks/scripts/knowledge/store.mjs';

const g = new Gate('4 real-cli');
const PLUGIN = path.join(REPO, 'plugins', 'spectre');
const HOOKS = path.join(PLUGIN, 'hooks', 'scripts');
const CLI = path.join(REPO, 'bin', 'spectre.js');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-verify-'));
const CODEX_HOME = path.join(ROOT, 'codex-home');
const SPECTRE_HOME = path.join(ROOT, 'spectre-home');
fs.mkdirSync(CODEX_HOME, { recursive: true });
process.on('exit', () => fs.rmSync(ROOT, { recursive: true, force: true }));

/** A disposable project. `seeded` gives it the knowledge surface the hook gates on. */
function makeProject(name, { seeded = false, legacyMarkers = false } = {}) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  run('git', ['init', '-b', 'main'], { cwd: dir });

  if (seeded) {
    fs.mkdirSync(path.join(dir, '.spectre'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.spectre', 'manifest.json'), JSON.stringify({ scope: 'project' }));
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
  env: {
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_PLUGIN_ROOT: PLUGIN,
    SPECTRE_HOME,
  },
  cwd: projectDir,
  isolated: true,
});

const hookEvent = (script, projectDir, input, host = 'claude') =>
  run('node', [path.join(HOOKS, script), '--host', host], {
    env: {
      CLAUDE_PROJECT_DIR: projectDir,
      CLAUDE_PLUGIN_ROOT: PLUGIN,
      SPECTRE_HOME,
    },
    cwd: projectDir,
    isolated: true,
    input: JSON.stringify(input),
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

async function seedCanonicalRecord(projectDir, {
  id = 'gotchas-hook-timeout',
  trigger = 'hook timeout',
  sentinel = 'SPECTRE_GATE4_CANONICAL_SENTINEL',
} = {}) {
  const resolved = await resolveProjectStore(projectDir, { spectreHome: SPECTRE_HOME });
  const skillPath = path.join(resolved.storePath, 'knowledge', id, 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, [
    '---',
    `name: ${id}`,
    'description: Use when diagnosing a hook timeout in the real CLI gate.',
    'metadata:',
    '  spectre-category: "gotchas"',
    `  spectre-triggers: '${JSON.stringify([trigger])}'`,
    '  spectre-status: "active"',
    '  spectre-version: "1"',
    '---',
    `# ${id}`,
    '',
    sentinel,
    '',
    'Keep hook diagnostics bounded and deterministic.',
    '',
  ].join('\n'));
  refreshKnowledgeIndex(resolved.storePath);
  return { id, sentinel, storePath: resolved.storePath };
}

// ---------------------------------------------------------------------------
// A. Non-spectre project guard
// A bare directory has no knowledge surface, so the hook must write nothing.
// Injecting into an unrelated repo would be a genuinely bad bug.
// ---------------------------------------------------------------------------
const bare = makeProject('bare');
const bareRun = hookEvent('load-knowledge.mjs', bare, {
  hook_event_name: 'SessionStart',
  source: 'startup',
  cwd: bare,
  session_id: 'gate4-bare',
});
g.check(bareRun.code === 0, 'load-knowledge exits 0 on a non-spectre project', bareRun.stderr);
g.check(override(bare) === null, 'load-knowledge writes nothing to a non-spectre project',
  'AGENTS.override.md was created in a project with no spectre surface');

// ---------------------------------------------------------------------------
// B. Canonical store — capability-only SessionStart and prompt-time delivery
// ---------------------------------------------------------------------------
const populated = makeProject('populated', { seeded: true });
const canonical = await seedCanonicalRecord(populated);
const sessionInput = {
  hook_event_name: 'SessionStart',
  source: 'startup',
  cwd: populated,
  session_id: 'gate4-populated',
};
const popRun = hookEvent('load-knowledge.mjs', populated, sessionInput);
g.check(popRun.code === 0, 'load-knowledge exits 0 with a canonical store', popRun.stderr);

const popBody = override(populated);
g.check(popBody !== null, 'SessionStart writes the constant capability block');
if (popBody) {
  g.check(popBody.includes('<!-- spectre-knowledge:start -->') && popBody.includes('<!-- spectre-knowledge:end -->'),
    'capability block is delimited by spectre-knowledge markers');
  g.check(
    popBody.includes('spectre knowledge search "<query>"') &&
      popBody.includes('/spectre:learn'),
    'SessionStart exposes constant search and learn guidance');
  g.check(
    !popBody.includes(canonical.id) &&
      !popBody.includes(canonical.sentinel) &&
      !popBody.includes('{{REGISTRY}}'),
    'SessionStart exposes no canonical record body or registry placeholder');
}

let notice = null;
try { notice = JSON.parse(popRun.stdout); } catch { /* handled below */ }
g.check(notice !== null, 'load-knowledge emits valid SessionStart JSON on stdout',
  'Claude Code parses this; malformed JSON silently drops the hook output');
g.check(
  Boolean(notice?.systemMessage?.includes('knowledge is applied automatically')),
  'SessionStart notice reports the prompt-time knowledge capability',
  `unexpected notice: ${notice?.systemMessage}`,
);
g.check(
  !fs.existsSync(path.join(populated, '.agents', 'skills', canonical.id)) &&
    !fs.existsSync(path.join(populated, '.claude', 'skills', canonical.id)),
  'canonical knowledge remains outside repository-native skill roots',
);

const promptInput = {
  hook_event_name: 'UserPromptSubmit',
  prompt: 'Please diagnose this hook timeout.',
  cwd: populated,
  session_id: 'gate4-populated',
};
const promptRun = hookEvent('user-prompt-submit.mjs', populated, promptInput);
let promptOutput = null;
try { promptOutput = JSON.parse(promptRun.stdout); } catch { /* handled below */ }
g.check(promptRun.code === 0, 'UserPromptSubmit exits 0 for a matching prompt', promptRun.stderr);
g.check(
  promptOutput?.hookSpecificOutput?.additionalContext?.includes(canonical.sentinel),
  'UserPromptSubmit delivers the complete matching canonical record inline',
);
g.check(
  promptOutput?.systemMessage === `spectre: applied ${canonical.id}; 0 also matching`,
  'UserPromptSubmit emits the concise applied-record notice',
  `unexpected notice: ${promptOutput?.systemMessage}`,
);
const repeatRun = hookEvent('user-prompt-submit.mjs', populated, promptInput);
g.check(repeatRun.stdout === '', 'UserPromptSubmit dedupes a repeat in the same session',
  `repeat emitted unexpected output: ${repeatRun.stdout}`);

// ---------------------------------------------------------------------------
// C. Idempotency — SessionStart fires on every startup/clear/compact
// A block that grows or reshuffles on each run would bloat context indefinitely.
// ---------------------------------------------------------------------------
const first = override(populated);
hookEvent('load-knowledge.mjs', populated, sessionInput);
g.check(override(populated) === first, 're-running load-knowledge is byte-identical',
  'the injected block changed on second run — it accumulates or reorders across sessions');

// ---------------------------------------------------------------------------
// D. No-match prompt
// ---------------------------------------------------------------------------
const noMatchRun = hookEvent('user-prompt-submit.mjs', populated, {
  ...promptInput,
  prompt: 'This prompt deliberately matches no canonical record.',
});
g.check(noMatchRun.code === 0, 'UserPromptSubmit exits 0 for a no-match prompt', noMatchRun.stderr);
g.check(noMatchRun.stdout === '', 'UserPromptSubmit remains silent for a no-match prompt',
  `no-match emitted unexpected output: ${noMatchRun.stdout}`);

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
    hookEvent('load-knowledge.mjs', proj, {
      hook_event_name: 'SessionStart',
      source: 'startup',
      cwd: proj,
      session_id: `gate4-install-${scope}`,
    });
    const injected = override(proj) || '';
    g.check(
      injected.includes('spectre-knowledge:start') &&
        injected.includes('knowledge is applied automatically'),
      'session after a project install writes the managed capability block',
      'no capability block was written, so the uninstall check below would be vacuous');
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
g.check(!legacyBody.includes('caspar-'), 'reinstall clears legacy caspar-* markers',
  'stale fork markers survive reinstall — extend cleanupLegacyProjectContext in src/lib/project.js (merge Phase 4)');

g.done();

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

function makeProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-codex-install-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: tmp, stdio: 'ignore' });
  fs.mkdirSync(path.join(tmp, 'docs', 'tasks', 'main', 'session_logs'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'docs', 'tasks', 'main', 'session_logs', '2026-03-09-100000_handoff.json'),
    JSON.stringify({
      branch_name: 'main',
      progress_update: {
        goal: 'Port Spectre to Codex',
        summary: 'Subagents and workflow skills wired.',
        now: 'Verifying installer',
        next_steps: ['Run tests'],
        constraints: ['Hooks hidden injection remains unverified']
      },
      working_set: {
        key_files: ['src/lib/install.js']
      }
    }, null, 2)
  );
  return tmp;
}

test('project install writes workflow skills, agent config, and official SessionStart continuity', { concurrency: false }, async () => {
  const projectDir = makeProject();
  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    const { main } = await import('./main.js');
    await main(['install', 'codex', '--scope', 'project', '--project-dir', projectDir]);

    const codeHome = path.join(projectDir, '.codex');
    const scopeSkillPath = path.join(codeHome, 'skills', 'spectre-scope', 'SKILL.md');
    assert.ok(fs.existsSync(scopeSkillPath));
    assert.match(fs.readFileSync(scopeSkillPath, 'utf8'), /Treat the current user request as the input arguments for this workflow/);
    assert.match(fs.readFileSync(scopeSkillPath, 'utf8'), /This is the Codex skill replacement for the deprecated custom prompt \/spectre:scope/);

    const applySkillPath = path.join(codeHome, 'skills', 'spectre-apply', 'SKILL.md');
    assert.ok(fs.existsSync(applySkillPath));
    assert.match(fs.readFileSync(applySkillPath, 'utf8'), /If ANY entry's triggers or description match your current task, you MUST load the skill FIRST/);

    const learnSkillPath = path.join(codeHome, 'skills', 'spectre-learn', 'SKILL.md');
    assert.ok(fs.existsSync(learnSkillPath));
    assert.match(fs.readFileSync(learnSkillPath, 'utf8'), /### 13\. Register the Learning/);
    assert.match(fs.readFileSync(learnSkillPath, 'utf8'), /\.agents\/skills\/spectre-recall\/references\/registry\.toon/);

    const agentPath = path.join(codeHome, 'spectre', 'agents', 'dev.toml');
    assert.ok(fs.existsSync(agentPath));
    const agentConfig = fs.readFileSync(agentPath, 'utf8');
    assert.match(agentConfig, /name = "dev"/);
    assert.match(agentConfig, /description = /);
    assert.match(agentConfig, /developer_instructions = \"\"\"/);
    assert.doesNotMatch(agentConfig, /base_instructions = /);

    const config = fs.readFileSync(path.join(codeHome, 'config.toml'), 'utf8');
    assert.match(config, /suppress_unstable_features_warning = true/);
    assert.match(config, /\[agents\.spectre_dev\]/);
    assert.match(config, /codex_hooks = true/);
    assert.match(config, /multi_agent = true/);
    assert.doesNotMatch(config, /session_start = /);
    assert.doesNotMatch(config, /pre_session_start/);
    assert.match(config, /\[\[skills\.config\]\]/);
    assert.match(config, /path = ".*\.agents\/skills\/spectre-recall\/SKILL\.md"/);

    const hooksConfig = JSON.parse(fs.readFileSync(path.join(codeHome, 'hooks.json'), 'utf8'));
    assert.ok(Array.isArray(hooksConfig.hooks.SessionStart));
    assert.equal(hooksConfig.hooks.SessionStart.length, 1);
    assert.deepEqual(hooksConfig.hooks.SessionStart[0].hooks, [
      {
        type: 'command',
        command: `node '${path.join(codeHome, 'spectre', 'hooks', 'session-start.mjs')}'`,
        statusMessage: 'Spectre: loading session context'
      }
    ]);
    assert.ok(fs.existsSync(path.join(codeHome, 'spectre', 'tools', 'sync-session-override.mjs')));
    assert.ok(fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-recall', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-recall', 'references', 'registry.toon')));

    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, '.spectre', 'manifest.json'), 'utf8'));
    assert.equal(manifest.codexIntegration.hiddenContextInjection, 'agents_override_managed_block');
    assert.equal(manifest.codexIntegration.fallback, 'none');

    assert.ok(!fs.existsSync(path.join(projectDir, 'AGENTS.md')));
    assert.ok(!fs.existsSync(path.join(projectDir, 'AGENTS.override.md')));
    assert.ok(!fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-session')));
    assert.ok(!fs.existsSync(path.join(projectDir, '.spectre', 'bin', 'codex')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'prompts', 'spectre:scope.md')));
    execFileSync('codex', ['--version'], {
      env: {
        ...process.env,
        CODEX_HOME: codeHome
      },
      stdio: 'ignore'
    });
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});

test('project install removes legacy bridge artifacts while preserving non-managed AGENTS content', { concurrency: false }, async () => {
  const projectDir = makeProject();
  fs.writeFileSync(
    path.join(projectDir, 'AGENTS.md'),
    [
      'Project-specific instructions.',
      '',
      '<!-- spectre-codex:start -->',
      'Read `AGENTS.override.md` before doing work in this repository.',
      '<!-- spectre-codex:end -->'
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(projectDir, 'AGENTS.override.md'),
    [
      'User-owned override content.',
      '',
      '<!-- spectre-session:start -->',
      'legacy session context',
      '<!-- spectre-session:end -->',
      '',
      '<!-- spectre-knowledge:start -->',
      'legacy knowledge context',
      '<!-- spectre-knowledge:end -->'
    ].join('\n')
  );
  fs.mkdirSync(path.join(projectDir, '.agents', 'skills', 'spectre-session'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.agents', 'skills', 'spectre-session', 'SKILL.md'), 'legacy session skill\n');
  fs.mkdirSync(path.join(projectDir, '.spectre', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.spectre', 'bin', 'codex'), '#!/bin/sh\n');

  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    const { main } = await import('./main.js');
    await main(['install', 'codex', '--scope', 'project', '--project-dir', projectDir]);

    const agentsContent = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf8');
    assert.match(agentsContent, /Project-specific instructions\./);
    assert.doesNotMatch(agentsContent, /spectre-codex:start/);
    const overrideContent = fs.readFileSync(path.join(projectDir, 'AGENTS.override.md'), 'utf8');
    assert.match(overrideContent, /User-owned override content\./);
    assert.doesNotMatch(overrideContent, /spectre-session:start/);
    assert.doesNotMatch(overrideContent, /spectre-knowledge:start/);
    assert.ok(!fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-session')));
    assert.ok(!fs.existsSync(path.join(projectDir, '.spectre', 'bin', 'codex')));
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});

test('project install preserves unrelated hooks.json handlers while adding Spectre SessionStart', { concurrency: false }, async () => {
  const projectDir = makeProject();
  const codeHome = path.join(projectDir, '.codex');
  fs.mkdirSync(codeHome, { recursive: true });
  fs.writeFileSync(
    path.join(codeHome, 'hooks.json'),
    JSON.stringify({
      hooks: {
        Stop: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'echo existing-stop-hook'
              }
            ]
          }
        ]
      }
    }, null, 2)
  );

  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    const { main } = await import('./main.js');
    await main(['install', 'codex', '--scope', 'project', '--project-dir', projectDir]);

    const hooksConfig = JSON.parse(fs.readFileSync(path.join(codeHome, 'hooks.json'), 'utf8'));
    assert.deepEqual(hooksConfig.hooks.Stop, [
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: 'echo existing-stop-hook'
          }
        ]
      }
    ]);
    assert.ok(Array.isArray(hooksConfig.hooks.SessionStart));
    assert.ok(hooksConfig.hooks.SessionStart.some(group =>
      Array.isArray(group.hooks) && group.hooks.some(hook => hook.command.includes('spectre/hooks/session-start.mjs'))
    ));
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});

test('project uninstall removes managed workflow skills, agent config, and project skill registrations', { concurrency: false }, async () => {
  const projectDir = makeProject();
  fs.writeFileSync(
    path.join(projectDir, 'AGENTS.override.md'),
    [
      'User-owned override content.',
      '',
      '<!-- spectre-session:start -->',
      'legacy session context',
      '<!-- spectre-session:end -->',
      '',
      '<!-- spectre-knowledge:start -->',
      'legacy knowledge context',
      '<!-- spectre-knowledge:end -->'
    ].join('\n')
  );
  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    const { main } = await import('./main.js');
    await main(['install', 'codex', '--scope', 'project', '--project-dir', projectDir]);
    await main(['uninstall', 'codex', '--scope', 'project', '--project-dir', projectDir]);

    const codeHome = path.join(projectDir, '.codex');

    assert.ok(!fs.existsSync(path.join(codeHome, 'skills', 'spectre-scope')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'spectre')));

    const config = fs.readFileSync(path.join(codeHome, 'config.toml'), 'utf8');
    assert.doesNotMatch(config, /\[agents\.spectre_dev\]/);
    assert.doesNotMatch(config, /\[\[skills\.config\]\][\s\S]*spectre-recall/);
    assert.doesNotMatch(config, /pre_session_start/);
    assert.doesNotMatch(config, /session_start = /);

    assert.ok(!fs.existsSync(path.join(projectDir, '.spectre', 'manifest.json')));
    const overrideContent = fs.readFileSync(path.join(projectDir, 'AGENTS.override.md'), 'utf8');
    assert.match(overrideContent, /User-owned override content\./);
    assert.doesNotMatch(overrideContent, /spectre-session:start/);
    assert.doesNotMatch(overrideContent, /spectre-knowledge:start/);
    assert.ok(!fs.existsSync(path.join(projectDir, '.spectre', 'bin', 'codex')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'hooks.json')));
    assert.ok(fs.existsSync(path.join(projectDir, '.agents', 'skills', 'spectre-recall', 'SKILL.md')));
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});

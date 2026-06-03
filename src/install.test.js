import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

function makeProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caspar-codex-install-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: tmp, stdio: 'ignore' });
  fs.mkdirSync(path.join(tmp, 'docs', 'tasks', 'main', 'session_logs'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'docs', 'tasks', 'main', 'session_logs', '2026-03-09-100000_handoff.json'),
    JSON.stringify({
      branch_name: 'main',
      progress_update: {
        goal: 'Port Caspar to Codex',
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

test('project install writes workflow skills and agent config without memory hooks', { concurrency: false }, async () => {
  const projectDir = makeProject();
  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    fs.mkdirSync(path.join(projectDir, '.codex', 'skills', 'scope'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.codex', 'skills', 'scope', 'SKILL.md'), 'legacy bare scope skill\n');

    const { main } = await import('./main.js');
    await main(['install', 'codex', '--scope', 'project', '--project-dir', projectDir]);

    const codeHome = path.join(projectDir, '.codex');
    const scopeSkillPath = path.join(codeHome, 'skills', 'caspar-scope', 'SKILL.md');
    assert.ok(fs.existsSync(scopeSkillPath));
    assert.ok(!fs.existsSync(path.join(codeHome, 'skills', 'scope')));
    const scopeSkill = fs.readFileSync(scopeSkillPath, 'utf8');
    assert.match(scopeSkill, /# scope/);
    assert.match(scopeSkill, /clear on WHAT, silent on HOW/);
    assert.doesNotMatch(scopeSkill, /This is the Codex skill replacement for the deprecated custom prompt \/caspar:scope/);
    assert.doesNotMatch(scopeSkill, /Skill\(scope\)/);

    for (const removedSkill of [
      'caspar-apply',
      'caspar-architecture_review',
      'caspar-evaluate',
      'caspar-forget',
      'caspar-handoff'
    ]) {
      assert.ok(!fs.existsSync(path.join(codeHome, 'skills', removedSkill)), `${removedSkill} should not be installed`);
    }

    const learnSkillPath = path.join(codeHome, 'skills', 'caspar-learn', 'SKILL.md');
    assert.ok(fs.existsSync(learnSkillPath));
    assert.match(fs.readFileSync(learnSkillPath, 'utf8'), /Proposal gate/);
    assert.match(fs.readFileSync(learnSkillPath, 'utf8'), /\.agents\/skills\/caspar-recall\/references\/registry\.toon/);
    assert.ok(fs.existsSync(path.join(codeHome, 'skills', 'caspar-learn', 'references', 'recall-template.md')));

    const agentPath = path.join(codeHome, 'caspar', 'agents', 'dev.toml');
    assert.ok(fs.existsSync(agentPath));
    const agentConfig = fs.readFileSync(agentPath, 'utf8');
    assert.match(agentConfig, /name = "dev"/);
    assert.match(agentConfig, /description = /);
    assert.doesNotMatch(agentConfig, /^model = /m);
    assert.doesNotMatch(agentConfig, /^model_reasoning_effort = /m);
    assert.match(agentConfig, /sandbox_mode = "workspace-write"/);
    assert.match(agentConfig, /developer_instructions = \"\"\"/);
    assert.doesNotMatch(agentConfig, /base_instructions = /);

    const config = fs.readFileSync(path.join(codeHome, 'config.toml'), 'utf8');
    assert.match(config, /suppress_unstable_features_warning = true/);
    assert.match(config, /\[agents\.caspar_dev\]/);
    assert.doesNotMatch(config, /^hooks = true$/m);
    assert.doesNotMatch(config, /codex_hooks = true/);
    assert.match(config, /multi_agent = true/);
    assert.doesNotMatch(config, /session_start = /);
    assert.doesNotMatch(config, /pre_session_start/);
    assert.match(config, /\[\[skills\.config\]\]/);
    assert.match(config, /path = ".*\.agents\/skills\/caspar-recall\/SKILL\.md"/);

    assert.ok(!fs.existsSync(path.join(codeHome, 'hooks.json')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'caspar', 'hooks', 'hooks.json')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'caspar', 'hooks', 'scripts', 'load-knowledge.mjs')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'caspar', 'hooks', 'scripts', 'handoff-resume.mjs')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'caspar', 'hooks', 'scripts', 'bootstrap.mjs')));
    assert.ok(fs.existsSync(path.join(codeHome, 'caspar', 'hooks', 'scripts', 'register_learning.mjs')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'caspar', 'tools', 'sync-session-override.mjs')));
    assert.ok(fs.existsSync(path.join(projectDir, '.agents', 'skills', 'caspar-recall', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(projectDir, '.agents', 'skills', 'caspar-recall', 'references', 'registry.toon')));

    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, '.caspar', 'manifest.json'), 'utf8'));
    assert.equal(manifest.codexIntegration.hiddenContextInjection, 'none');
    assert.equal(manifest.codexIntegration.fallback, 'none');

    assert.ok(!fs.existsSync(path.join(projectDir, 'AGENTS.md')));
    assert.ok(!fs.existsSync(path.join(projectDir, 'AGENTS.override.md')));
    assert.ok(!fs.existsSync(path.join(projectDir, '.agents', 'skills', 'caspar-session')));
    assert.ok(!fs.existsSync(path.join(projectDir, '.caspar', 'bin', 'codex')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'prompts', 'caspar:scope.md')));

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

test('user install installs skills and agents without generated hooks', { concurrency: false }, () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caspar-codex-home-'));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caspar-codex-workspace-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: workspaceDir, stdio: 'ignore' });

  execFileSync(process.execPath, [
    path.join(process.cwd(), 'bin', 'caspar.js'),
    'install',
    'codex',
    '--scope',
    'user',
    '--project-dir',
    workspaceDir
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: homeDir,
      CODEX_HOME: ''
    },
    stdio: 'ignore'
  });

  const codeHome = path.join(homeDir, '.codex');
  assert.ok(fs.existsSync(path.join(codeHome, 'skills', 'caspar-plan', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(codeHome, 'caspar', 'agents', 'dev.toml')));
  assert.ok(!fs.existsSync(path.join(codeHome, 'hooks.json')));
  assert.ok(!fs.existsSync(path.join(codeHome, 'caspar', 'hooks', 'scripts', 'load-knowledge.mjs')));
  assert.ok(!fs.existsSync(path.join(codeHome, 'caspar', 'hooks', 'session-start.mjs')));
  assert.ok(!fs.existsSync(path.join(workspaceDir, '.caspar', 'manifest.json')));
  assert.ok(!fs.existsSync(path.join(workspaceDir, 'AGENTS.override.md')));
});

test('project install removes legacy bridge artifacts while preserving non-managed AGENTS content', { concurrency: false }, async () => {
  const projectDir = makeProject();
  fs.writeFileSync(
    path.join(projectDir, 'AGENTS.md'),
    [
      'Project-specific instructions.',
      '',
      '<!-- caspar-codex:start -->',
      'Read `AGENTS.override.md` before doing work in this repository.',
      '<!-- caspar-codex:end -->'
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(projectDir, 'AGENTS.override.md'),
    [
      'User-owned override content.',
      '',
      '<!-- caspar-session:start -->',
      'legacy session context',
      '<!-- caspar-session:end -->',
      '',
      '<!-- caspar-knowledge:start -->',
      'legacy knowledge context',
      '<!-- caspar-knowledge:end -->'
    ].join('\n')
  );
  fs.mkdirSync(path.join(projectDir, '.agents', 'skills', 'caspar-session'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.agents', 'skills', 'caspar-session', 'SKILL.md'), 'legacy session skill\n');
  fs.mkdirSync(path.join(projectDir, '.caspar', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.caspar', 'bin', 'codex'), '#!/bin/sh\n');

  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    const { main } = await import('./main.js');
    await main(['install', 'codex', '--scope', 'project', '--project-dir', projectDir]);

    const agentsContent = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf8');
    assert.match(agentsContent, /Project-specific instructions\./);
    assert.doesNotMatch(agentsContent, /caspar-codex:start/);
    const overrideContent = fs.readFileSync(path.join(projectDir, 'AGENTS.override.md'), 'utf8');
    assert.match(overrideContent, /User-owned override content\./);
    assert.doesNotMatch(overrideContent, /caspar-session:start/);
    assert.doesNotMatch(overrideContent, /caspar-knowledge:start/);
    assert.ok(!fs.existsSync(path.join(projectDir, '.agents', 'skills', 'caspar-session')));
    assert.ok(!fs.existsSync(path.join(projectDir, '.caspar', 'bin', 'codex')));
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});

test('project install preserves unrelated hooks.json handlers without adding Caspar hooks', { concurrency: false }, async () => {
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
    assert.equal(hooksConfig.hooks.SessionStart, undefined);
    assert.equal(hooksConfig.hooks.PreCompact, undefined);
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});

test('install removes legacy Spectre agent definitions that duplicate Caspar agents', { concurrency: false }, async () => {
  const projectDir = makeProject();
  const codeHome = path.join(projectDir, '.codex');
  fs.mkdirSync(path.join(codeHome, 'spectre', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(codeHome, 'spectre', 'agents', 'dev.toml'), 'name = "dev"\n');
  fs.writeFileSync(
    path.join(codeHome, 'config.toml'),
    [
      '[features]',
      'multi_agent = true',
      '',
      '[agents.spectre_dev]',
      'description = "legacy dev"',
      `config_file = "${path.join(codeHome, 'spectre', 'agents', 'dev.toml')}"`,
      'nickname_candidates = ["dev", "spectre-dev", "spectre dev", "spectre_dev"]',
      '',
      '[agents.unrelated_dev]',
      'description = "user-owned dev"',
      'config_file = "/tmp/unrelated-dev.toml"',
      'nickname_candidates = ["other-dev"]'
    ].join('\n')
  );

  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    const { main } = await import('./main.js');
    await main(['install', 'codex', '--scope', 'project', '--project-dir', projectDir]);

    const config = fs.readFileSync(path.join(codeHome, 'config.toml'), 'utf8');
    assert.match(config, /\[agents\.caspar_dev\]/);
    assert.doesNotMatch(config, /\[agents\.spectre_dev\]/);
    assert.doesNotMatch(config, /spectre\/agents\/dev\.toml/);
    assert.match(config, /\[agents\.unrelated_dev\]/);
    assert.ok(!fs.existsSync(path.join(codeHome, 'spectre')));
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
      '<!-- caspar-session:start -->',
      'legacy session context',
      '<!-- caspar-session:end -->',
      '',
      '<!-- caspar-knowledge:start -->',
      'legacy knowledge context',
      '<!-- caspar-knowledge:end -->'
    ].join('\n')
  );
  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    const { main } = await import('./main.js');
    await main(['install', 'codex', '--scope', 'project', '--project-dir', projectDir]);
    await main(['uninstall', 'codex', '--scope', 'project', '--project-dir', projectDir]);

    const codeHome = path.join(projectDir, '.codex');

    assert.ok(!fs.existsSync(path.join(codeHome, 'skills', 'caspar-scope')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'caspar')));

    const config = fs.readFileSync(path.join(codeHome, 'config.toml'), 'utf8');
    assert.doesNotMatch(config, /\[agents\.caspar_dev\]/);
    assert.doesNotMatch(config, /\[\[skills\.config\]\][\s\S]*caspar-recall/);
    assert.doesNotMatch(config, /pre_session_start/);
    assert.doesNotMatch(config, /session_start = /);

    assert.ok(!fs.existsSync(path.join(projectDir, '.caspar', 'manifest.json')));
    const overrideContent = fs.readFileSync(path.join(projectDir, 'AGENTS.override.md'), 'utf8');
    assert.match(overrideContent, /User-owned override content\./);
    assert.doesNotMatch(overrideContent, /caspar-session:start/);
    assert.doesNotMatch(overrideContent, /caspar-knowledge:start/);
    assert.ok(!fs.existsSync(path.join(projectDir, '.caspar', 'bin', 'codex')));
    assert.ok(!fs.existsSync(path.join(codeHome, 'hooks.json')));
    assert.ok(fs.existsSync(path.join(projectDir, '.agents', 'skills', 'caspar-recall', 'SKILL.md')));
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});

'use strict';

const fs = require('fs');
const path = require('path');

function parseFrontmatter(source, filePath) {
  if (!source.startsWith('---\n')) {
    throw new Error(`Missing frontmatter in ${filePath}`);
  }

  const end = source.indexOf('\n---', 4);
  if (end === -1) {
    throw new Error(`Unclosed frontmatter in ${filePath}`);
  }

  const frontmatterText = source.slice(4, end).trim();
  const body = source.slice(end + 4).replace(/^\r?\n/, '');
  const frontmatter = {};

  for (const line of frontmatterText.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) throw new Error(`Invalid frontmatter line in ${filePath}: ${line}`);

    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function yamlScalar(value) {
  if (value === 'true' || value === true) return 'true';
  if (value === 'false' || value === false) return 'false';
  return JSON.stringify(String(value));
}

function renderFrontmatter(frontmatter, body) {
  const fields = Object.entries(frontmatter).map(([key, value]) => `${key}: ${yamlScalar(value)}`);
  return `---\n${fields.join('\n')}\n---\n${body}`;
}

function rewriteProjectSkillPaths(source) {
  return source
    .replace(/\.claude\/skills\//g, '.agents/skills/')
    .replace(/\.claude\\skills\\/g, '.agents\\skills\\');
}

function rewriteCodexCommandRefs(source) {
  return source
    .replace(/@skill-spectre:([A-Za-z0-9_-]+)/g, (_match, skillName) => {
      return `Skill(${skillName})`;
    })
    .replace(/\/skill-spectre:([A-Za-z0-9_-]+)/g, (_match, skillName) => {
      return `Skill(${skillName})`;
    })
    .replace(/@@spectre:([A-Za-z0-9_-]+)/g, '@$1')
    .replace(/@spectre:([A-Za-z0-9_-]+)/g, '@$1')
    .replace(/\/spectre:([A-Za-z0-9_-]+)/g, (_match, skillName) => {
      return skillName.startsWith('spectre-') ? skillName : `spectre-${skillName}`;
    });
}

function rewriteSkillForCodex(source) {
  const { frontmatter, body } = parseFrontmatter(source, 'SKILL.md');
  const rewrittenBody = rewriteCodexCommandRefs(rewriteProjectSkillPaths(body));
  return renderFrontmatter(frontmatter, rewrittenBody);
}

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

function copyDirectory(sourceDir, targetDir, keep) {
  const results = [];

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.DS_Store') continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      results.push(...copyDirectory(sourcePath, targetPath, keep));
      continue;
    }

    if (!entry.isFile()) continue;

    const content = fs.readFileSync(sourcePath, 'utf8');
    const output = entry.name === 'SKILL.md' ? rewriteSkillForCodex(content) : content;
    const status = writeIfChanged(targetPath, output);
    keep.add(targetPath);
    results.push({ path: targetPath, sourcePath, status });
  }

  return results;
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
  const sourceDir = path.join(canonicalRoot, 'skills');
  const targetDir = path.join(codexRoot, 'skills');
  const results = [];
  const keep = new Set();

  if (!fs.existsSync(sourceDir)) return results;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;

    const sourceSkillDir = path.join(sourceDir, entry.name);
    const skillPath = path.join(sourceSkillDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    const targetSkillDir = path.join(targetDir, entry.name);
    results.push(...copyDirectory(sourceSkillDir, targetSkillDir, keep));
  }

  results.push(...removeStaleFiles(targetDir, keep));
  return results;
}

function verify(codexRoot) {
  const targetDir = path.join(codexRoot, 'skills');
  const results = [];

  if (!fs.existsSync(targetDir)) {
    return [{ path: targetDir, ok: false, error: 'Missing generated skills directory' }];
  }

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;

    const skillPath = path.join(targetDir, entry.name, 'SKILL.md');
    try {
      if (!fs.existsSync(skillPath)) throw new Error('Missing SKILL.md');

      const { frontmatter } = parseFrontmatter(fs.readFileSync(skillPath, 'utf8'), skillPath);
      if (!frontmatter.name) throw new Error('Missing required frontmatter field "name"');
      if (!frontmatter.description) throw new Error('Missing required frontmatter field "description"');
      if (frontmatter.name !== entry.name) {
        throw new Error(`Skill name "${frontmatter.name}" does not match directory "${entry.name}"`);
      }

      results.push({ path: skillPath, ok: true });
    } catch (error) {
      results.push({ path: skillPath, ok: false, error: error.message });
    }
  }

  if (results.length === 0) {
    results.push({ path: targetDir, ok: false, error: 'No generated skills found' });
  }

  return results;
}

module.exports = {
  parseFrontmatter,
  renderFrontmatter,
  rewriteCodexCommandRefs,
  rewriteProjectSkillPaths,
  rewriteSkillForCodex,
  yamlScalar,
  translate,
  verify,
};

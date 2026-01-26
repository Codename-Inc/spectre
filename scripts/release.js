#!/usr/bin/env node

import { createInterface } from 'readline';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// New structure: marketplace and plugin are both in integrations/claude-code/
const CC_INTEGRATION = join(ROOT, 'integrations/claude-code');
const MARKETPLACE_PATH = join(CC_INTEGRATION, '.claude-plugin/marketplace.json');
const PLUGIN_PATH = join(CC_INTEGRATION, 'plugin.json');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJSON = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');

const bumpVersion = (version, type) => {
  if (!version || version === 'unknown') return version;
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return version;
  }
};

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT });
    return true;
  } catch (e) {
    console.error(`Command failed: ${cmd}`);
    return false;
  }
};

async function main() {
  console.log('\n🚀 SPECTRE Release Script\n');

  // Read current versions
  const marketplace = readJSON(MARKETPLACE_PATH);
  const plugin = readJSON(PLUGIN_PATH);

  const currentVersion = plugin.version || marketplace.plugins[0]?.version || 'unknown';

  console.log(`Current version: ${currentVersion}\n`);

  // Ask version bump type
  console.log('Version bump:');
  console.log(`  1. patch → ${bumpVersion(currentVersion, 'patch')}`);
  console.log(`  2. minor → ${bumpVersion(currentVersion, 'minor')}`);
  console.log(`  3. major → ${bumpVersion(currentVersion, 'major')}`);
  console.log(`  4. skip (no change)\n`);

  const choice = await ask('Choice [1]: ');
  const type = { '1': 'patch', '2': 'minor', '3': 'major', '4': 'skip' }[choice.trim() || '1'] || 'patch';

  if (type === 'skip') {
    console.log('\nNo changes selected. Exiting.');
    rl.close();
    process.exit(0);
  }

  const newVersion = bumpVersion(currentVersion, type);

  // Show summary
  console.log('\n--- Release Summary ---');
  console.log(`  spectre: ${currentVersion} → ${newVersion}`);

  // Confirm
  const confirm = await ask('\nProceed with release? [Y/n]: ');
  if (confirm.toLowerCase() === 'n') {
    console.log('Aborted.');
    rl.close();
    process.exit(0);
  }

  // Update files
  console.log('\nUpdating version files...');

  // Update plugin.json
  plugin.version = newVersion;
  writeJSON(PLUGIN_PATH, plugin);
  console.log(`  ✓ integrations/claude-code/plugin.json → ${newVersion}`);

  // Update marketplace.json (both top-level version and plugin entry version)
  marketplace.version = newVersion;
  if (marketplace.plugins && marketplace.plugins[0]) {
    marketplace.plugins[0].version = newVersion;
  }
  writeJSON(MARKETPLACE_PATH, marketplace);
  console.log(`  ✓ integrations/claude-code/.claude-plugin/marketplace.json → ${newVersion}`);

  // Git operations
  console.log('\nGit operations...');

  const commitMsg = `release: v${newVersion}`;
  const tagName = `v${newVersion}`;

  run('git add -A');
  run(`git commit -m "${commitMsg}"`);

  const pushConfirm = await ask('\nPush to remote and create tag? [Y/n]: ');
  if (pushConfirm.toLowerCase() !== 'n') {
    run('git push');
    run(`git tag ${tagName}`);
    run('git push --tags');
    console.log(`\n✅ Released ${tagName}`);
  } else {
    console.log(`\n✅ Committed locally as ${tagName} (not pushed)`);
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});

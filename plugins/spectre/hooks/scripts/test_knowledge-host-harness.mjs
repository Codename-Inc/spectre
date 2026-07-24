#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  CORE_SENTINEL,
  OMITTED_ID,
  RESOURCE_SENTINEL,
  SEARCH_QUERY,
  observedRegistryCounts,
  prepareFixture,
} from '../../../../scripts/verify-knowledge-hosts.mjs';

function runBundled(hostFixture, args) {
  return spawnSync(process.execPath, [hostFixture.cliPath, ...args, '--json'], {
    cwd: hostFixture.projectDir,
    env: {
      ...process.env,
      SPECTRE_HOME: hostFixture.spectreHome,
      CODEX_HOME: hostFixture.codexHome ?? '',
      PLUGIN_ROOT: hostFixture.pluginRoot,
    },
    encoding: 'utf8',
  });
}

describe('isolated real-host registry fixture', () => {
  it('reports included and omitted counts from the observed host frame', () => {
    assert.deepEqual(
      observedRegistryCounts(
        { activeRecordCount: 65, preflight: { includedCount: 10, omittedCount: 55 } },
        { observation: { omittedCount: 56 } },
      ),
      { includedCount: 9, omittedCount: 56 },
    );
  });

  it('preflights budgeted metadata and recovers the omitted resource through each bundled runtime', async (t) => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-host-harness-'));
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
    const manifest = await prepareFixture(fixtureRoot, { date: '2026-07-22' });

    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.expected.omittedId, OMITTED_ID);
    assert.equal(manifest.expected.searchQuery, SEARCH_QUERY);
    assert.doesNotMatch(manifest.prompt, new RegExp(CORE_SENTINEL));
    assert.doesNotMatch(manifest.prompt, new RegExp(RESOURCE_SENTINEL));
    assert.match(manifest.evidencePath, /host-registry-2026-07-22\.md$/);

    for (const host of ['claude', 'codex']) {
      const value = manifest.hosts[host];
      assert.ok(value.preflight.includedCount > 0);
      assert.ok(value.preflight.omittedCount > 0);
      assert.equal(value.preflight.measurement.ok, true);
      assert.equal(value.preflight.observation.validJson, true);
      assert.equal(value.preflight.observation.hookEventMatches, true);
      assert.equal(value.preflight.observation.expectedIdVisible, false);
      assert.equal(value.preflight.observation.coreSentinelVisible, false);
      assert.equal(value.preflight.observation.resourceSentinelVisible, false);
      assert.equal(value.preflight.observation.hasTopLevelSystemMessage, false);
      assert.equal(value.preflight.observation.hasHookSystemMessage, false);
      assert.equal(value.preflight.observation.hasPreview, false);
      assert.equal(value.preflight.observation.hasFallbackFile, false);
      assert.equal(value.preflight.observation.omittedCount, value.preflight.omittedCount);
      assert.equal(fs.existsSync(path.join(value.storePath, 'activity.json')), false);
      assert.match(value.command, new RegExp(value.projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

      const search = runBundled(value, [
        'search',
        SEARCH_QUERY,
        '--project-dir',
        value.projectDir,
      ]);
      assert.equal(search.status, 0, search.stderr);
      const searched = JSON.parse(search.stdout);
      assert.deepEqual(searched.results.map(({ id }) => id), [OMITTED_ID]);

      const load = runBundled(value, [
        'load',
        OMITTED_ID,
        '--project-dir',
        value.projectDir,
      ]);
      assert.equal(load.status, 0, load.stderr);
      const loaded = JSON.parse(load.stdout);
      assert.match(loaded.content, new RegExp(CORE_SENTINEL));
      assert.equal(loaded.recordDirectory, value.recordDirectory);
      assert.deepEqual(loaded.resources, [{
        relativePath: 'references/proof.txt',
        absolutePath: value.resourcePath,
      }]);
      assert.equal(loaded.activity.successfulLoads, 1);
      assert.equal(fs.readFileSync(value.resourcePath, 'utf8').trim(), RESOURCE_SENTINEL);
    }
  });
});

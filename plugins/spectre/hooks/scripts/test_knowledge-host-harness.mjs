#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  CORE_SENTINEL,
  OMITTED_ID,
  RESOURCE_SENTINEL,
  observedRegistryCounts,
  prepareFixture,
} from '../../../../scripts/verify-knowledge-hosts.mjs';

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

  it('preflights typed metadata without exposing record bodies before real-host execution', async (t) => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spectre-host-harness-'));
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
    const manifest = await prepareFixture(fixtureRoot, { date: '2026-07-22' });

    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.expected.omittedId, OMITTED_ID);
    assert.doesNotMatch(manifest.prompt, new RegExp(CORE_SENTINEL));
    assert.doesNotMatch(manifest.prompt, new RegExp(RESOURCE_SENTINEL));
    assert.match(manifest.evidencePath, /host-registry-2026-07-22\.md$/);

    for (const host of ['claude', 'codex']) {
      const value = manifest.hosts[host];
      assert.equal(value.preflight.includedCount, 0);
      assert.equal(value.preflight.omittedCount, 0);
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
      assert.equal(value.preflight.observation.omittedCount, null);
      assert.equal(fs.existsSync(path.join(value.storePath, 'activity.json')), false);
      assert.match(value.command, new RegExp(value.projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

      assert.equal(fs.readFileSync(value.resourcePath, 'utf8').trim(), RESOURCE_SENTINEL);
    }
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

const REQUIRED_METRICS = [
  'tokens',
  'cost',
  'tool_calls',
  'messages',
  'retries',
  'timing',
];

async function loadValidator() {
  const moduleUrl = new URL('./verify-probes.mjs', import.meta.url);
  const implementation = await import(moduleUrl);
  assert.equal(typeof implementation.validateTelemetryMap, 'function');
  return implementation;
}

test('accepts an observed-or-unavailable entry for every required metric', async () => {
  const { validateTelemetryMap } = await loadValidator();
  const telemetry = Object.fromEntries(
    REQUIRED_METRICS.map((metric) => [
      metric,
      { status: 'unavailable', reason: `${metric} is not emitted by this sample` },
    ]),
  );
  telemetry.tokens = {
    status: 'observed',
    source: 'result.usage.input_tokens',
  };

  assert.doesNotThrow(() => validateTelemetryMap(telemetry));
});

test('rejects a required metric without an observed source or unavailable reason', async () => {
  const { validateTelemetryMap } = await loadValidator();
  const telemetry = Object.fromEntries(
    REQUIRED_METRICS.map((metric) => [
      metric,
      { status: 'unavailable', reason: `${metric} is not emitted by this sample` },
    ]),
  );
  telemetry.cost = { status: 'unavailable' };

  assert.throws(
    () => validateTelemetryMap(telemetry),
    /cost unavailable reason is required/,
  );
});

test('verifies the persisted real-probe bundle and raw hashes', async () => {
  const implementation = await loadValidator();
  assert.equal(typeof implementation.verifyProbeBundle, 'function');

  const result = implementation.verifyProbeBundle(
    new URL('.', import.meta.url),
  );

  assert.deepEqual(result, {
    schemaVersion: 1,
    probes: ['claude', 'codex'],
    rawFilesVerified: 4,
  });
});

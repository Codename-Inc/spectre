import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_METRICS = [
  'tokens',
  'cost',
  'tool_calls',
  'messages',
  'retries',
  'timing',
];

export function validateTelemetryMap(telemetry) {
  for (const metric of REQUIRED_METRICS) {
    const entry = telemetry[metric];
    if (!entry) throw new Error(`${metric} telemetry entry is required`);
    if (entry.status === 'observed') {
      if (!entry.source) throw new Error(`${metric} observed source is required`);
      continue;
    }
    if (entry.status === 'unavailable') {
      if (!entry.reason) throw new Error(`${metric} unavailable reason is required`);
      continue;
    }
    throw new Error(`${metric} status must be observed or unavailable`);
  }
}

export function verifyProbeBundle(directory) {
  const bundleDirectory = directory instanceof URL
    ? fileURLToPath(directory)
    : path.resolve(directory);
  const summary = JSON.parse(
    fs.readFileSync(path.join(bundleDirectory, 'probe-summary.json'), 'utf8'),
  );
  const probeNames = Object.keys(summary.probes);
  if (summary.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (probeNames.join(',') !== 'claude,codex') {
    throw new Error('expected claude and codex probes');
  }

  let rawFilesVerified = 0;
  for (const probeName of probeNames) {
    const probe = summary.probes[probeName];
    if (probe.exitCode !== 0) throw new Error(`${probeName} exitCode must be 0`);
    if (probe.result !== 'TELEMETRY_PROBE_OK') {
      throw new Error(`${probeName} result mismatch`);
    }
    validateTelemetryMap(probe.telemetry);

    for (const [stream, raw] of Object.entries(probe.raw)) {
      const rawPath = path.join(bundleDirectory, raw.path);
      const content = fs.readFileSync(rawPath);
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      if (actualHash !== raw.sha256) {
        throw new Error(`${probeName} ${stream} hash mismatch`);
      }
      if (stream === 'stdout') {
        const lines = content.toString('utf8').trim().split('\n');
        if (lines.length === 0) throw new Error(`${probeName} stdout is empty`);
        for (const line of lines) JSON.parse(line);
      }
      rawFilesVerified += 1;
    }
  }

  return {
    schemaVersion: summary.schemaVersion,
    probes: probeNames,
    rawFilesVerified,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyProbeBundle(new URL('.', import.meta.url))));
}

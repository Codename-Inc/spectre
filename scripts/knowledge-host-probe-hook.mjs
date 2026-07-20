#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { measurePayload } from '../plugins/spectre/hooks/scripts/knowledge/payload.mjs';
import { parseKnowledgeRecord } from '../plugins/spectre/hooks/scripts/knowledge/records.mjs';

const FIXTURES = new Map([
  [
    'Apply the knowledge for spectre payload prose boundary and reply exactly SPECTRE_PROSE_INLINE_OK.',
    'testing-payload-prose',
  ],
  [
    'Apply the knowledge for spectre payload code boundary and reply exactly SPECTRE_CODE_INLINE_OK.',
    'testing-payload-code',
  ],
]);

function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? null : argv[index + 1];
  };
  const storePath = valueAfter('--store');
  const host = valueAfter('--host');
  const stateRoot = valueAfter('--state-root');
  if (!storePath || !host || !stateRoot) {
    throw new Error(
      'Usage: knowledge-host-probe-hook.mjs --store <path> --host <host> --state-root <path>',
    );
  }
  return {
    storePath: path.resolve(storePath),
    host,
    stateRoot: path.resolve(stateRoot),
  };
}

function readInput() {
  const raw = fs.readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

function frameRecord(content) {
  return [
    '# Spectre applied knowledge',
    '',
    content,
    '',
    'No additional knowledge records matched.',
  ].join('\n');
}

function sessionStatePath(stateRoot, sessionId) {
  const digest = createHash('sha256').update(sessionId).digest('hex');
  return path.join(stateRoot, `${digest}.json`);
}

function markApplied(stateRoot, sessionId, recordKey) {
  if (typeof sessionId !== 'string' || sessionId === '') return true;
  fs.mkdirSync(stateRoot, { recursive: true });
  const statePath = sessionStatePath(stateRoot, sessionId);
  let applied = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (Array.isArray(parsed.applied)) applied = parsed.applied;
  } catch {
    // Missing or malformed proof state starts a fresh isolated session.
  }
  if (applied.includes(recordKey)) return false;
  applied.push(recordKey);
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify({ applied })}\n`);
  fs.renameSync(temporaryPath, statePath);
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = readInput();
  const recordId = FIXTURES.get(input.prompt);
  if (!recordId) return;

  const skillPath = path.join(
    args.storePath,
    'knowledge',
    recordId,
    'SKILL.md',
  );
  const parsed = parseKnowledgeRecord(skillPath);
  const framed = frameRecord(parsed.content);
  const measurement = measurePayload(args.host, framed);
  if (!measurement.ok) {
    throw new Error(
      `${recordId} exceeds ${args.host} proof payload limit: ` +
        `${measurement.measured} > ${measurement.limit}`,
    );
  }

  const recordKey = `${parsed.record.id}@${parsed.record.version}`;
  if (!markApplied(args.stateRoot, input.session_id, recordKey)) return;

  process.stdout.write(
    JSON.stringify({
      systemMessage:
        `Spectre applied ${parsed.record.id} (0 additional matches).`,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: framed,
      },
    }),
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`knowledge host probe failed: ${error.message}\n`);
  process.exitCode = 1;
}

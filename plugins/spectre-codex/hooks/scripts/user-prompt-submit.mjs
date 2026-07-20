#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  buildPromptContext,
  filterAppliedKnowledge,
  markKnowledgeApplied,
  matchKnowledge,
} from './knowledge/matcher.mjs';
import {
  readVerifiedIndexedRecord,
  refreshKnowledgeIndex,
} from './knowledge/records.mjs';
import { resolveProjectStore } from './knowledge/store.mjs';

const HOSTS = new Set(['claude', 'codex']);

function parseHost(argv) {
  const index = argv.indexOf('--host');
  const host = index === -1 ? null : argv[index + 1];
  return HOSTS.has(host) ? host : null;
}

function readHookInput() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input;
}

function projectDirectory(input) {
  if (typeof input.cwd === 'string' && input.cwd !== '') {
    return path.resolve(input.cwd);
  }
  if (
    typeof process.env.CLAUDE_PROJECT_DIR === 'string' &&
    process.env.CLAUDE_PROJECT_DIR !== ''
  ) {
    return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  }
  return process.cwd();
}

async function resolvePrompt(input, host) {
  if (
    input?.hook_event_name !== 'UserPromptSubmit' ||
    typeof input.prompt !== 'string' ||
    input.prompt.trim() === ''
  ) {
    return null;
  }

  const projectDir = projectDirectory(input);
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: process.env.SPECTRE_HOME,
    readOnly: true,
  });
  if (!resolved.storePath) return null;

  const { index } = refreshKnowledgeIndex(resolved.storePath, {
    persist: false,
  });
  const matches = filterAppliedKnowledge({
    storePath: resolved.storePath,
    host,
    sessionId: input.session_id,
    matches: matchKnowledge(input.prompt, index),
  });
  if (matches.length === 0) return null;

  for (const match of matches) {
    const parsed = readVerifiedIndexedRecord(resolved.storePath, match);
    if (!parsed) continue;
    const context = buildPromptContext({
      host,
      primary: {
        ...match,
        content: parsed.content,
      },
      secondaryMatches: matches.filter(({ id }) => id !== match.id),
    });
    if (!context.ok) {
      process.stderr.write(
        `spectre prompt hook candidate skipped: id=${match.id} ` +
        `reason=${context.reason} measured=${context.measurement.measured} ` +
        `limit=${context.measurement.limit}\n`,
      );
      continue;
    }

    markKnowledgeApplied({
      storePath: resolved.storePath,
      host,
      sessionId: input.session_id,
      record: match,
    });
    return {
      systemMessage: context.systemMessage,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context.additionalContext,
      },
    };
  }
  return null;
}

async function main() {
  const host = parseHost(process.argv.slice(2));
  if (!host) return;
  const input = readHookInput();
  const output = await resolvePrompt(input, host);
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`spectre prompt hook skipped: ${error.message}\n`);
}

export { projectDirectory, resolvePrompt };

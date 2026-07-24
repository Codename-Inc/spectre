import path from 'node:path';

import { aggregateKnowledgeRecordActivity } from './activity.mjs';
import { measurePayload } from './payload.mjs';

const SUPPORTED_HOSTS = new Set(['claude', 'codex']);

function assertOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
}

function sourceMtime(record) {
  const milliseconds = Number(record.sourceMtimeMs);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function activeRecords(records) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  return records.filter((record) => record?.status === 'active');
}

function compareIds(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Produce the single host-independent registry order. Successful search activity
 * is deliberately not consulted: only verified loads and source newness promote
 * a record.
 */
export function rankKnowledgeEntries(options) {
  assertOptions(options);
  const activity = options.activity || {
    schemaVersion: 1,
    records: {},
    search: { matches: 0, misses: 0, recordMatches: {} },
  };
  return activeRecords(options.records).map((record) => {
    const aggregate = aggregateKnowledgeRecordActivity(activity, record.id);
    const loadedAt = aggregate.lastLoadedAt === undefined
      ? undefined
      : Date.parse(aggregate.lastLoadedAt);
    const promotionAt = loadedAt === undefined ? sourceMtime(record) : loadedAt;
    return {
      ...record,
      successfulLoads: aggregate.successfulLoads,
      ...(aggregate.lastLoadedAt === undefined
        ? {}
        : { lastLoadedAt: aggregate.lastLoadedAt }),
      promotionAt,
    };
  }).sort((left, right) =>
    right.promotionAt - left.promotionAt
    || right.successfulLoads - left.successfulLoads
    || compareIds(left.id, right.id));
}

export function shellQuote(value) {
  if (typeof value !== 'string') throw new TypeError('shell value must be a string');
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function bundledCommand(cliPath, operation, operand, projectDir) {
  return [
    shellQuote(cliPath),
    operation,
    shellQuote(operand),
    '--project-dir',
    shellQuote(projectDir),
  ].join(' ');
}

/**
 * One entry carries only what the agent needs to route and to build its exact
 * load command: the verbatim ID, version, the Use when condition, and cues.
 * The load command itself is hoisted to a single template above the entries so
 * the absolute CLI and project paths are not repeated once per record.
 */
function renderEntry(entry) {
  return [
    `- ID: ${entry.id} (v${entry.version}) — Use when: ${oneLine(entry.description)}`,
    `  Cues: ${entry.triggers.map(oneLine).join('; ')}`,
  ].join('\n');
}

/**
 * Ranking decides which records survive the payload budget; it must not decide
 * what order they print in. Rendering in a fixed id order keeps the emitted
 * bytes stable across sessions, so load activity that reshuffles the ranking
 * no longer changes the attachment or breaks host prefix cache reuse.
 */
function renderOrder(entries) {
  return [...entries].sort((left, right) => compareIds(left.id, right.id));
}

function renderContent({ entries, omittedCount, cliPath, projectDir }) {
  const searchCommand = bundledCommand(cliPath, 'search', '<query>', projectDir);
  const sections = [
    [
      '## SPECTRE Project Knowledge',
      '',
      'This project captures hard-won knowledge—features, gotchas, procedures, and decisions—as verified, loadable records.',
      '',
      'The registry below contains routing metadata, not the records themselves. It is size-bounded, so older active records may be omitted even though they remain searchable and loadable.',
      '',
      '## Before You Work',
      '',
      'Before substantive implementation, debugging, research, planning, or architectural explanation:',
      '',
      '1. Review the registry for relevant project knowledge.',
      '2. A record is relevant only when both the current task subject matches the record and the record\'s **Use when** condition applies.',
      '3. Activation cues are supporting evidence, not automatic keyword matches.',
      '4. When a record is relevant, run its exact load command before relying on project assumptions, reading broadly, or dispatching agents.',
      '5. Apply the knowledge only after a successful verified load.',
      '',
      'Do not skip a relevant load because the task appears simple, the answer seems obvious, or related context already exists in `AGENTS.md`, conversation history, memory, or the pasted request. Those are summaries and may omit the exact constraints, paths, or procedures preserved in the record.',
      '',
      'Registry exposure and search results are discovery signals only. They do not mean the record content has been loaded.',
      '',
      '## Finding Knowledge Not Shown',
      '',
      'If no visible entry clearly fits, the exact ID is unknown, or older project knowledge may apply, run:',
      '',
      searchCommand,
      '',
      'Search returns metadata for active records. Choose a relevant exact ID, then run its exact load command before applying it.',
      '',
      `Omitted active records: ${omittedCount}. Omitted records remain active, searchable, and loadable by exact ID.`,
      '',
      '## After Loading',
      '',
      'A successful exact load returns the verified full record, its canonical record directory, and safe paths for supporting resources.',
      '',
      'Supporting-resource paths are references, not automatically loaded content. Read relevant resources when the record directs you to them or the task requires their detail.',
      '',
      'If search or load fails, surface the failure and do not claim or fabricate knowledge from that record.',
      '',
      '## After Significant Work',
      '',
      'When work changes a loaded record\'s facts, procedures, paths, or decisions, identify the record that may now be stale. Do not silently edit knowledge.',
      '',
      'Before handing back, offer to update or capture the durable learning through `/spectre:learn`, describing what should change. Registration remains approval-gated.',
      '',
      '## Available Knowledge',
      '',
      'Load a record by copying its ID verbatim into this command:',
      '',
      bundledCommand(cliPath, 'load', '<ID>', projectDir),
    ].join('\n'),
  ];
  if (entries.length > 0) {
    sections.push(renderOrder(entries).map(renderEntry).join('\n'));
  }
  return sections.join('\n\n');
}

export function knowledgeRegistryFrame(content) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: content,
    },
  });
}

/**
 * Render the longest whole-entry prefix whose complete serialized SessionStart
 * frame passes the retained host estimator. The renderer is pure and does not
 * create, mutate, or expose canonical record content.
 */
export function renderKnowledgeRegistry(options) {
  assertOptions(options);
  const {
    host,
    records,
    activity,
    projectDir,
    cliPath,
  } = options;
  if (!SUPPORTED_HOSTS.has(host)) throw new RangeError(`Unsupported registry host: ${host}`);
  if (typeof projectDir !== 'string' || !path.isAbsolute(projectDir)) {
    throw new TypeError('projectDir must be an absolute path');
  }
  if (typeof cliPath !== 'string' || !path.isAbsolute(cliPath)) {
    throw new TypeError('cliPath must be an absolute path');
  }

  const rankedEntries = rankKnowledgeEntries({ records, activity });
  let selected;
  for (let count = 0; count <= rankedEntries.length; count += 1) {
    const includedEntries = rankedEntries.slice(0, count);
    const omittedCount = rankedEntries.length - count;
    const content = renderContent({
      entries: includedEntries,
      omittedCount,
      cliPath,
      projectDir,
    });
    const frame = knowledgeRegistryFrame(content);
    const measurement = measurePayload(host, frame);
    if (measurement.ok) {
      selected = {
        content,
        frame,
        measurement,
        includedEntries,
        renderedEntries: renderOrder(includedEntries),
        includedCount: count,
        omittedCount,
      };
    }
  }

  if (!selected) {
    throw new RangeError(`Knowledge registry policy exceeds the ${host} payload budget`);
  }
  return {
    host,
    rankedEntries,
    ...selected,
  };
}

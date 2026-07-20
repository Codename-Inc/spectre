import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { measurePayload } from './payload.mjs';
import { atomicWriteJson } from './store.mjs';

const MAX_SECONDARY_ENTRIES = 3;
const MAX_SECONDARY_CHARACTERS = 750;
const MAX_SECONDARY_DESCRIPTION = 64;

function normalizePhrase(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{P}+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function stableCompare(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function matchingTrigger(prompt, triggers) {
  const framedPrompt = ` ${prompt} `;
  return triggers
    .map((trigger) => ({
      trigger,
      normalized: normalizePhrase(trigger),
    }))
    .filter(({ normalized }) =>
      normalized !== '' && framedPrompt.includes(` ${normalized} `))
    .sort((left, right) =>
      right.normalized.length - left.normalized.length ||
      stableCompare(left.normalized, right.normalized) ||
      stableCompare(left.trigger, right.trigger))[0] || null;
}

export function matchKnowledge(prompt, index) {
  const normalizedPrompt = normalizePhrase(prompt);
  if (normalizedPrompt === '' || !Array.isArray(index?.records)) return [];

  const matches = [];
  for (const record of index.records) {
    if (
      record?.status !== 'active' ||
      typeof record.id !== 'string' ||
      !Array.isArray(record.triggers)
    ) {
      continue;
    }
    const matched = matchingTrigger(normalizedPrompt, record.triggers);
    if (!matched) continue;
    matches.push({
      ...record,
      matchedTrigger: matched.trigger,
      normalizedMatchedTrigger: matched.normalized,
      triggerLength: matched.normalized.length,
    });
  }

  return matches.sort((left, right) =>
    right.triggerLength - left.triggerLength ||
    stableCompare(left.id, right.id));
}

function collapseDescription(value) {
  if (typeof value !== 'string') return '';
  const collapsed = value.replace(/\s+/gu, ' ').trim();
  if (collapsed.length <= MAX_SECONDARY_DESCRIPTION) return collapsed;
  return `${collapsed.slice(0, MAX_SECONDARY_DESCRIPTION - 3).trimEnd()}...`;
}

function secondaryLine(match) {
  const description = collapseDescription(match.description);
  return (
    `- ${match.id}; trigger: "${match.matchedTrigger}"; ` +
    `description: ${description}; search: ` +
    `\`spectre knowledge search "${match.id}"\``
  );
}

function omittedLine(count) {
  return `${count} additional ${count === 1 ? 'match' : 'matches'} omitted.`;
}

function secondaryMetadata(secondaryMatches) {
  const candidates = secondaryMatches.slice(0, MAX_SECONDARY_ENTRIES);
  const included = [];

  for (const candidate of candidates) {
    const tentative = [...included, candidate];
    const omittedCount = secondaryMatches.length - tentative.length;
    const lines = [
      '## Also matching',
      ...tentative.map(secondaryLine),
      ...(omittedCount > 0 ? [omittedLine(omittedCount)] : []),
    ];
    if (lines.join('\n').length > MAX_SECONDARY_CHARACTERS) break;
    included.push(candidate);
  }

  const omittedCount = secondaryMatches.length - included.length;
  const lines = [
    '## Also matching',
    ...included.map(secondaryLine),
    ...(omittedCount > 0 ? [omittedLine(omittedCount)] : []),
  ];
  return {
    included,
    omittedCount,
    content: lines.join('\n'),
  };
}

function renderSecondaryMetadata(included, omittedCount) {
  if (included.length === 0 && omittedCount === 0) return '';
  return [
    '## Also matching',
    ...included.map(secondaryLine),
    ...(omittedCount > 0 ? [omittedLine(omittedCount)] : []),
  ].join('\n');
}

function buildAdditionalContext(primary, secondaryContent = '') {
  return [
    `# Spectre applied knowledge: ${primary.id}`,
    '',
    primary.content,
    ...(secondaryContent ? ['', secondaryContent] : []),
  ].join('\n');
}

function fitSecondaryMetadata({ host, primary, secondaryMatches }) {
  const candidates = secondaryMatches.slice(0, MAX_SECONDARY_ENTRIES);
  const included = [];

  for (const candidate of candidates) {
    const tentative = [...included, candidate];
    const omittedCount = secondaryMatches.length - tentative.length;
    const content = renderSecondaryMetadata(tentative, omittedCount);
    if (content.length > MAX_SECONDARY_CHARACTERS) break;
    const measurement = measurePayload(host, buildAdditionalContext(primary, content));
    if (!measurement.ok) break;
    included.push(candidate);
  }

  let omittedCount = secondaryMatches.length - included.length;
  let content = renderSecondaryMetadata(included, omittedCount);
  let measurement = measurePayload(host, buildAdditionalContext(primary, content));
  if (!measurement.ok && included.length === 0 && omittedCount > 0) {
    content = '';
    measurement = measurePayload(host, buildAdditionalContext(primary, content));
  }
  if (!measurement.ok) {
    throw new Error('primary frame exceeded payload budget after prior validation');
  }

  omittedCount = secondaryMatches.length - included.length;
  return {
    included,
    omittedCount,
    content,
    measurement,
  };
}

export function buildPromptContext({ host, primary, secondaryMatches = [] }) {
  if (
    !primary ||
    typeof primary.id !== 'string' ||
    typeof primary.content !== 'string'
  ) {
    throw new TypeError('primary must contain string id and content fields');
  }

  const primaryContext = buildAdditionalContext(primary);
  const primaryMeasurement = measurePayload(host, primaryContext);
  if (!primaryMeasurement.ok) {
    const secondary = secondaryMetadata(secondaryMatches);
    return {
      ok: false,
      reason: 'PAYLOAD_LIMIT',
      additionalContext: null,
      systemMessage: null,
      secondaryMetadata: secondary.content,
      includedSecondary: secondary.included,
      omittedCount: secondary.omittedCount,
      measurement: primaryMeasurement,
    };
  }

  const secondary = fitSecondaryMetadata({ host, primary, secondaryMatches });
  const additionalContext = buildAdditionalContext(primary, secondary.content);
  const includedCount = secondary.included.length;
  return {
    ok: true,
    additionalContext,
    systemMessage:
      `spectre: applied ${primary.id}; ${includedCount} also matching` +
      (secondary.omittedCount > 0 ? `; ${secondary.omittedCount} omitted` : ''),
    secondaryMetadata: secondary.content,
    includedSecondary: secondary.included,
    omittedCount: secondary.omittedCount,
    measurement: secondary.measurement,
  };
}

function validSessionId(sessionId) {
  return typeof sessionId === 'string' && sessionId !== '';
}

function ledgerPath(storePath, host, sessionId) {
  const digest = createHash('sha256')
    .update(`${host}\0${sessionId}`)
    .digest('hex');
  return path.join(storePath, 'runtime', 'sessions', `${digest}.json`);
}

function readAppliedKeys(storePath, host, sessionId) {
  if (!validSessionId(sessionId)) return new Set();
  try {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath(storePath, host, sessionId), 'utf8'));
    if (
      ledger?.schemaVersion !== 1 ||
      ledger.host !== host ||
      ledger.sessionId !== sessionId ||
      !Array.isArray(ledger.applied)
    ) {
      return new Set();
    }
    return new Set(ledger.applied.filter((value) => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function recordKey(record) {
  return `${record.id}@${record.version}`;
}

export function filterAppliedKnowledge({
  storePath,
  host,
  sessionId,
  matches,
}) {
  if (!Array.isArray(matches)) throw new TypeError('matches must be an array');
  if (!validSessionId(sessionId)) return [...matches];
  const applied = readAppliedKeys(storePath, host, sessionId);
  return matches.filter((match) => !applied.has(recordKey(match)));
}

export function markKnowledgeApplied({
  storePath,
  host,
  sessionId,
  record,
}) {
  if (!validSessionId(sessionId)) return false;
  const applied = readAppliedKeys(storePath, host, sessionId);
  const key = recordKey(record);
  if (applied.has(key)) return false;
  applied.add(key);
  atomicWriteJson(ledgerPath(storePath, host, sessionId), {
    schemaVersion: 1,
    host,
    sessionId,
    applied: [...applied].sort(stableCompare),
  });
  return true;
}

export {
  MAX_SECONDARY_CHARACTERS,
  MAX_SECONDARY_ENTRIES,
  normalizePhrase,
};

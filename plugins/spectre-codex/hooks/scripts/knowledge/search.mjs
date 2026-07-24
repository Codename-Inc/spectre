import path from 'node:path';

import { recordKnowledgeSearch } from './activity.mjs';
import { refreshKnowledgeIndex } from './records.mjs';
import { resolveProjectStore } from './store.mjs';

const SEARCH_DIAGNOSTIC_WRITE_FAILED = 'KNOWLEDGE_SEARCH_DIAGNOSTIC_WRITE_FAILED';

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  const normalized = normalizeSearchText(value);
  return normalized === '' ? [] : normalized.split(' ');
}

function overlapCount(queryTokens, values) {
  const valueTokens = new Set(values.flatMap((value) => tokens(value)));
  return queryTokens.reduce(
    (count, token) => count + (valueTokens.has(token) ? 1 : 0),
    0,
  );
}

function containsPhrase(value, phrase) {
  if (phrase === '') return false;
  return ` ${normalizeSearchText(value)} `.includes(` ${phrase} `);
}

function scoreRecord(entry, normalizedQuery, queryTokens) {
  const matchedExactPhrase = [
    entry.id,
    ...entry.triggers,
    entry.description,
  ].some((value) => containsPhrase(value, normalizedQuery));
  const triggerOverlap = overlapCount(queryTokens, [entry.id, ...entry.triggers]);
  const descriptionOverlap = overlapCount(queryTokens, [entry.description]);
  return { matchedExactPhrase, triggerOverlap, descriptionOverlap };
}

function compareRankedResults(left, right) {
  if (left.matchedExactPhrase !== right.matchedExactPhrase) {
    return left.matchedExactPhrase ? -1 : 1;
  }
  if (left.triggerOverlap !== right.triggerOverlap) {
    return right.triggerOverlap - left.triggerOverlap;
  }
  if (left.descriptionOverlap !== right.descriptionOverlap) {
    return right.descriptionOverlap - left.descriptionOverlap;
  }
  return compareText(left.id, right.id);
}

function compareCorpusResults(left, right) {
  return compareText(left.category, right.category) || compareText(left.id, right.id);
}

function resultFromEntry(storePath, entry, score = {}) {
  return {
    id: entry.id,
    category: entry.category,
    description: entry.description,
    triggers: [...entry.triggers],
    status: entry.status,
    version: entry.version,
    recordPath: path.resolve(storePath, entry.recordPath),
    ...score,
  };
}

export async function searchKnowledge(options) {
  const projectDir = options?.projectDir;
  if (!projectDir) throw new Error('projectDir is required');
  const resolved = await resolveProjectStore(projectDir, {
    spectreHome: options.spectreHome,
    gitRunner: options.gitRunner,
    readOnly: true,
  });
  if (!resolved.storePath) return { results: [], warnings: [] };

  const { index, errors } = refreshKnowledgeIndex(resolved.storePath);
  const normalizedQuery = normalizeSearchText(options.query);
  let results;
  if (normalizedQuery === '') {
    results = index.records
      .map((entry) => resultFromEntry(resolved.storePath, entry))
      .sort(compareCorpusResults);
  } else {
    const queryTokens = tokens(normalizedQuery);
    results = index.records
      .map((entry) => {
        const score = scoreRecord(entry, normalizedQuery, queryTokens);
        return resultFromEntry(resolved.storePath, entry, score);
      })
      .filter((result) =>
        result.matchedExactPhrase ||
        result.triggerOverlap > 0 ||
        result.descriptionOverlap > 0,
      )
      .sort(compareRankedResults);
  }

  const warnings = [...errors];
  try {
    await recordKnowledgeSearch({
      storePath: resolved.storePath,
      results,
      now: options.now,
      lockOptions: options.lockOptions,
      atomicWriteOptions: options.atomicWriteOptions,
    });
  } catch (error) {
    warnings.push({
      code: SEARCH_DIAGNOSTIC_WRITE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return { results, warnings };
}

export function formatKnowledgeSearchHuman({ results }, query = '') {
  if (results.length === 0) {
    return query
      ? `No active knowledge matches "${query}".\n`
      : 'No active knowledge found.\n';
  }

  if (normalizeSearchText(query) !== '') {
    return `${results.map((result) => [
      `${result.id} [${result.category}]`,
      `  ${result.description}`,
      `  triggers: ${result.triggers.join(', ')}`,
      `  path: ${result.recordPath}`,
    ].join('\n')).join('\n\n')}\n`;
  }

  const categories = new Map();
  for (const result of results) {
    const categoryResults = categories.get(result.category) || [];
    categoryResults.push(result);
    categories.set(result.category, categoryResults);
  }
  return `${[...categories].map(([category, categoryResults]) => [
    `${category}:`,
    ...categoryResults.map((result) => [
      `  ${result.id} - ${result.description}`,
      `    triggers: ${result.triggers.join(', ')}`,
      `    path: ${result.recordPath}`,
    ].join('\n')),
  ].join('\n')).join('\n\n')}\n`;
}

export function formatKnowledgeSearchWarningsHuman(warnings = []) {
  return warnings.map((warning) => warning.code === SEARCH_DIAGNOSTIC_WRITE_FAILED
    ? `spectre: ${warning.code}: ${warning.message}\n`
    : `spectre: skipped invalid knowledge record: ${warning.message}\n`).join('');
}

export { normalizeSearchText, SEARCH_DIAGNOSTIC_WRITE_FAILED };

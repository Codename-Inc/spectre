import { createHash } from 'node:crypto';

import { measurePayload } from './payload.mjs';
import { refreshKnowledgeIndex } from './records.mjs';
import { readTagCatalog } from './tags.mjs';
import { resolveProjectStore } from './store.mjs';

const SEARCH_RESPONSE_TOKEN_LIMIT = 500;
const SEARCH_RESULT_LIMIT = 5;

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value) {
  const normalized = normalizeSearchText(value);
  return normalized === '' ? [] : normalized.split(' ');
}

function indexFingerprint(index) {
  return createHash('sha256')
    .update(JSON.stringify(index.records.map((entry) => [entry.id, entry.revisionToken])))
    .digest('hex');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!value || typeof value.query !== 'string' || typeof value.index !== 'string'
      || !Number.isSafeInteger(value.offset) || value.offset < 0) throw new Error('invalid');
    return value;
  } catch {
    throw codedError('SEARCH_CURSOR_INVALID', 'Search cursor is invalid.');
  }
}

function cursor(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function activation(entry, options) {
  if (entry.kind === 'work') {
    return { historical: true, value: entry.imported ? 'imported-history' : 'work-history' };
  }
  if (entry.status !== 'active') return { historical: true, value: 'inactive-history' };
  if (entry.applicability.scope === 'project') return { historical: false, value: 'current-guidance' };
  const matchingWork = options.workId === entry.applicability.workId;
  const matchingRun = entry.applicability.runIds?.includes(options.runId);
  return matchingWork || matchingRun
    ? { historical: false, value: 'current-guidance' }
    : { historical: true, value: 'work-history' };
}

function aliases(storePath) {
  try {
    const catalog = readTagCatalog(storePath);
    return new Map(Object.entries(catalog.tags).map(([id, tag]) => [id, [id, ...tag.aliases]]));
  } catch {
    return new Map();
  }
}

function score(entry, query, queryTokens, tagAliases, paths) {
  const values = [entry.id, entry.title, entry.summary, entry.useWhen, entry.sourceBody,
    ...(entry.cues || []), ...entry.tags.flatMap((tag) => tagAliases.get(tag) || [tag])]
    .filter(Boolean).map(normalizeSearchText);
  const allTokens = new Set(values.flatMap((value) => value.split(' ')));
  const phrase = query !== '' && values.some((value) => ` ${value} `.includes(` ${query} `));
  const terms = queryTokens.filter((token) => allTokens.has(token));
  const pathTerms = paths.flatMap(tokens).filter((token) => allTokens.has(token));
  return {
    coverage: terms.length + pathTerms.length + (phrase ? queryTokens.length : 0),
    signals: [...(phrase ? ['exact-phrase'] : []), ...terms.map((term) => `term:${term}`), ...pathTerms.map((term) => `path:${term}`)],
  };
}

function compare(left, right) {
  if (left.coverage !== right.coverage) return right.coverage - left.coverage;
  if (left.current !== right.current) return left.current ? -1 : 1;
  return left.id.localeCompare(right.id);
}

function preview(entry, match, state) {
  return {
    id: entry.id,
    kind: entry.kind,
    ...(entry.kind === 'knowledge' ? { useWhen: entry.useWhen } : { summary: entry.summary }),
    matchedSignals: match.signals,
    applicability: entry.applicability,
    activation: state.value,
    revisionToken: entry.revisionToken,
    estimatedLoadTokens: Math.ceil(entry.sourceSize / 4),
    loadCommand: `knowledge-cli.mjs load ${entry.id} --project-dir <project-dir>`,
  };
}

function boundedPage(results, base, limit, fingerprint, query, offset) {
  const entries = [];
  const end = Math.min(results.length, offset + limit);
  for (let position = offset; position < end; position += 1) {
    const candidate = [...entries, results[position]];
    const next = offset + candidate.length;
    const response = {
      ...base,
      results: candidate,
      ...(next < results.length ? { cursor: cursor({ query, index: fingerprint, offset: next }) } : {}),
    };
    if (measurePayload('codex', JSON.stringify(response)).measured > SEARCH_RESPONSE_TOKEN_LIMIT) break;
    entries.push(results[position]);
  }
  const next = offset + entries.length;
  return {
    ...base,
    results: entries,
    ...(next < results.length ? { cursor: cursor({ query, index: fingerprint, offset: next }) } : { cursor: null }),
  };
}

export async function searchKnowledge(options = {}) {
  if (!options.projectDir) throw new Error('projectDir is required');
  const resolved = await resolveProjectStore(options.projectDir, {
    spectreHome: options.spectreHome, gitRunner: options.gitRunner, readOnly: true,
  });
  if (!resolved.storePath) return { results: [], warnings: [], cursor: null };
  const { index, errors } = refreshKnowledgeIndex(resolved.storePath);
  const query = normalizeSearchText(options.query);
  const fingerprint = indexFingerprint(index);
  const pageCursor = decodeCursor(options.cursor);
  if (pageCursor && (pageCursor.query !== query || pageCursor.index !== fingerprint)) {
    throw codedError('SEARCH_CURSOR_STALE', 'Search index changed; restart the query.');
  }
  const kind = options.kind || 'all';
  if (!['all', 'knowledge', 'work'].includes(kind)) {
    throw codedError('SEARCH_KIND_INVALID', `Unsupported search kind: ${kind}`);
  }
  const limit = Math.min(Math.max(Number.isInteger(options.limit) ? options.limit : SEARCH_RESULT_LIMIT, 1), SEARCH_RESULT_LIMIT);
  const tagAliases = aliases(resolved.storePath);
  const queryTokens = tokens(query);
  const paths = Array.isArray(options.paths) ? options.paths : [];
  const ranked = index.records
    .filter((entry) => kind === 'all' || entry.kind === kind)
    .map((entry) => {
      const state = activation(entry, options);
      const match = score(entry, query, queryTokens, tagAliases, paths);
      return { ...preview(entry, match, state), coverage: match.coverage, current: !state.historical };
    })
    .filter((entry) => query === '' || entry.coverage > 0)
    .sort(compare)
    .map(({ coverage, current, ...entry }) => entry);
  return boundedPage(ranked, { results: [], warnings: errors, query, index: fingerprint }, limit, fingerprint, query, pageCursor?.offset || 0);
}

export function formatKnowledgeSearchHuman({ results }, query = '') {
  if (results.length === 0) return query ? `No knowledge matches "${query}".\n` : 'No knowledge found.\n';
  return `${results.map((result) => `${result.id} [${result.kind}]\n  ${result.summary || result.useWhen}\n  ${result.loadCommand}`).join('\n\n')}\n`;
}

export function formatKnowledgeSearchWarningsHuman(warnings = []) {
  return warnings.map((warning) => `spectre: skipped invalid knowledge record: ${warning.message}\n`).join('');
}

export { normalizeSearchText, SEARCH_RESPONSE_TOKEN_LIMIT, SEARCH_RESULT_LIMIT };

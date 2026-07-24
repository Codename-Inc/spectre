import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const legacyPrefixPattern = /docs\/(?:active_)?tasks\//g;
const forbiddenShippedClassifications = new Set([
  'active_default',
  'stale_documentation',
]);

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

export function scopedFiles(projectRoot) {
  const topLevelDocs = readdirSync(join(projectRoot, 'docs'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(projectRoot, 'docs', entry.name));

  return [
    join(projectRoot, 'README.md'),
    ...topLevelDocs,
    ...collectFiles(join(projectRoot, 'plugins', 'spectre')),
    ...collectFiles(join(projectRoot, 'plugins', 'spectre-codex')),
    ...collectFiles(join(projectRoot, 'src')),
  ];
}

export function scanLegacyPrefixes(projectRoot, files = scopedFiles(projectRoot)) {
  const occurrences = [];
  for (const file of files) {
    const path = relative(projectRoot, file);
    const content = readFileSync(file, 'utf8');
    const repeatedContexts = new Map();
    for (const [lineIndex, context] of content.split('\n').entries()) {
      const matches = [...context.matchAll(legacyPrefixPattern)];
      if (matches.length === 0) continue;

      const contextIndex = (repeatedContexts.get(context) ?? 0) + 1;
      repeatedContexts.set(context, contextIndex);
      const contextHash = createHash('sha256').update(context).digest('hex').slice(0, 12);
      matches.forEach((match, matchIndex) => {
        occurrences.push({
          id: `${contextHash}:${contextIndex}:${matchIndex + 1}`,
          path,
          line: lineIndex + 1,
          column: match.index + 1,
          context,
        });
      });
    }
  }
  return occurrences;
}

export function inventoryMismatches(actual, expected) {
  const actualByKey = new Map(actual.map((entry) => [`${entry.path}#${entry.id}`, entry]));
  const expectedByKey = new Map(
    Object.entries(expected).flatMap(([path, entries]) => {
      if (
        path.includes('*') ||
        !entries ||
        typeof entries !== 'object' ||
        Array.isArray(entries)
      ) {
        return [[`${path}#*`, { path, id: '*', classification: 'invalid_allowlist' }]];
      }
      return Object.entries(entries).map(([id, classification]) => [
        `${path}#${id}`,
        { path, id, classification },
      ]);
    }),
  );
  const keys = new Set([...actualByKey.keys(), ...expectedByKey.keys()]);
  return [...keys]
    .sort()
    .flatMap((key) => {
      const found = actualByKey.get(key);
      const allowed = expectedByKey.get(key);
      if (!allowed) {
        return [
          `${found.path}:${found.line}:${found.column}: unclassified ${found.context.trim()}`,
        ];
      }
      if (allowed.id.includes('*') || allowed.classification === 'invalid_allowlist') {
        return [`${allowed.path}#${allowed.id}: wildcard or file-level exemption is forbidden`];
      }
      if (!found) return [`${allowed.path}#${allowed.id}: allowlist entry is stale`];
      if (forbiddenShippedClassifications.has(allowed.classification)) {
        return [
          `${allowed.path}#${allowed.id}: forbidden shipped classification ${allowed.classification}`,
        ];
      }
      return [];
    });
}

export function checkLegacyPathInvariant(projectRoot, inventory) {
  const files = scopedFiles(projectRoot);
  const occurrences = scanLegacyPrefixes(projectRoot, files);
  const mismatches = inventoryMismatches(occurrences, inventory.occurrences);
  const knownClassifications = new Set(inventory.classifications);

  for (const [path, entries] of Object.entries(inventory.occurrences)) {
    for (const [id, classification] of Object.entries(entries)) {
      if (!knownClassifications.has(classification)) {
        mismatches.push(`${path}#${id}: unknown classification ${classification}`);
      }
    }
  }

  const scopedText = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  for (const [form, literal] of Object.entries(inventory.required_forms)) {
    if (!scopedText.includes(literal)) {
      mismatches.push(`legacy inventory is missing ${form}: ${literal}`);
    }
  }

  const totals = Object.values(inventory.occurrences)
    .flatMap((entries) => Object.values(entries))
    .reduce((summary, classification) => {
      summary[classification] = (summary[classification] ?? 0) + 1;
      return summary;
    }, {});

  return { files, occurrences, mismatches: mismatches.sort(), totals };
}

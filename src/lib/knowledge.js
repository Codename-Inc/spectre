import {
  formatKnowledgeLoadHuman,
  loadKnowledgeById,
  serializeKnowledgeLoadError
} from '../../plugins/spectre/hooks/scripts/knowledge/loader.mjs';
import {
  migrateLegacyKnowledge
} from '../../plugins/spectre/hooks/scripts/knowledge/migration.mjs';
import {
  refreshKnowledgeIndex
} from '../../plugins/spectre/hooks/scripts/knowledge/records.mjs';
import {
  registerCanonicalKnowledge as registerKnowledge,
  serializeKnowledgeError
} from '../../plugins/spectre/hooks/scripts/knowledge/registration.mjs';
import {
  formatKnowledgeSearchHuman,
  formatKnowledgeSearchWarningsHuman,
  searchKnowledge
} from '../../plugins/spectre/hooks/scripts/knowledge/search.mjs';
import {
  resolveProjectStore
} from '../../plugins/spectre/hooks/scripts/knowledge/store.mjs';
import {
  previewKnowledgeRegistry
} from '../../plugins/spectre/hooks/scripts/knowledge/preview.mjs';

export async function searchCanonicalKnowledge(options) {
  return searchKnowledge(options);
}

export function formatCanonicalKnowledgeSearch(result, query) {
  return formatKnowledgeSearchHuman(result, query);
}

export function formatCanonicalKnowledgeSearchWarnings(warnings) {
  return formatKnowledgeSearchWarningsHuman(warnings);
}

export async function loadCanonicalKnowledge(options) {
  return loadKnowledgeById(options);
}

export async function previewCanonicalKnowledgeRegistry(options) {
  return previewKnowledgeRegistry(options);
}

export function formatCanonicalKnowledgeLoad(result) {
  return formatKnowledgeLoadHuman(result);
}

export function serializeCanonicalKnowledgeLoadError(error) {
  return serializeKnowledgeLoadError(error);
}

export async function registerCanonicalKnowledge(options) {
  return registerKnowledge(options);
}

export function serializeCanonicalKnowledgeError(error) {
  return serializeKnowledgeError(error);
}

export async function migrateCanonicalKnowledge(options) {
  return migrateLegacyKnowledge(options);
}

export async function initializeProjectKnowledge(options) {
  const migrationReport = await migrateCanonicalKnowledge(options);
  const resolved = await resolveProjectStore(options.projectDir, {
    spectreHome: options.spectreHome,
    gitRunner: options.gitRunner,
    allocationLockOptions: options.allocationLockOptions,
  });
  const index = refreshKnowledgeIndex(resolved.storePath);

  return {
    migrationReport,
    storePath: resolved.storePath,
    index,
  };
}

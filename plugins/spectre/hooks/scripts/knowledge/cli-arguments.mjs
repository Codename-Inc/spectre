import path from 'node:path';

export function resolveKnowledgeProjectDir(value, cwd = process.cwd()) {
  if (value === true) {
    throw new Error('Missing value for --project-dir.');
  }
  return path.resolve(value || cwd);
}

'use strict';

const defaultsByRole = {
  readonly: {
    sandbox_mode: 'read-only',
  },
  mutating: {
    sandbox_mode: 'workspace-write',
  },
};

const roleHints = {
  analyst: 'readonly',
  finder: 'readonly',
  patterns: 'readonly',
  reviewer: 'readonly',
  'web-research': 'readonly',
  dev: 'mutating',
  sync: 'mutating',
  tester: 'mutating',
};

function defaultsForAgent(agentName) {
  const role = roleHints[agentName] || 'mutating';
  return defaultsByRole[role];
}

module.exports = {
  defaultsByRole,
  roleHints,
  defaultsForAgent,
};

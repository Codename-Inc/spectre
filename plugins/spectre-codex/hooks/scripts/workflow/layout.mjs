import path from 'node:path';

export function workflowStorageLayout(storePath) {
  const workflowRoot = path.join(storePath, 'workflow');
  const executeRoot = path.join(workflowRoot, 'execute');
  const planRoot = path.join(workflowRoot, 'plan');
  const shipRoot = path.join(workflowRoot, 'ship');
  return {
    workflowRoot,
    executeRoot,
    executeRunsDir: path.join(executeRoot, 'runs'),
    planRoot,
    planEventsPath: path.join(planRoot, 'events.jsonl'),
    shipRoot,
    shipMeasurementsPath: path.join(shipRoot, 'measurements.json'),
    recoveryDir: path.join(workflowRoot, 'recovery'),
    legacyExecuteRunsDir: path.join(workflowRoot, 'runs'),
    legacyPlanEventsPath: path.join(workflowRoot, 'plan-classification.jsonl'),
    legacyShipMeasurementsPath: path.join(workflowRoot, 'ship-measurements.json'),
  };
}

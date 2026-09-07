import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEvaluationTrace, detectTraceBypass } from './knowledge/evaluation-trace.mjs';

test('evaluation traces are opt-in, hash task input, and detect direct record reads', () => {
  const disabled = createEvaluationTrace({ enabled: false });
  disabled.record({ type: 'search', query: 'secret task' });
  assert.deepEqual(disabled.events(), []);
  const trace = createEvaluationTrace({ enabled: true });
  trace.record({ type: 'search', query: 'secret task', contextId: 'run-1', resultIds: ['record-a'], responseTokens: 12 });
  const [event] = trace.events();
  assert.equal(event.query, undefined);
  assert.match(event.queryHash, /^sha256:/);
  assert.deepEqual(detectTraceBypass([{ type: 'Read', path: 'knowledge/a/record.json' }, { type: 'shell', command: 'cat knowledge/a/record.json' }]), [
    { type: 'bypass', reason: 'direct-read' }, { type: 'bypass', reason: 'shell-read' },
  ]);
});

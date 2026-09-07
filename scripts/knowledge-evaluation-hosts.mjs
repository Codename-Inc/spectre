import { spawn as nativeSpawn } from 'node:child_process';
import { access, chmod, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_LIMITS = Object.freeze({
  timeoutMs: 600_000,
  maxOutputBytes: 20 * 1024 * 1024,
  terminationGraceMs: 100,
});

function isWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function absoluteDirectory(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`);
  }
  return path.resolve(value);
}

function optionalDirectory(value, label) {
  return value == null ? null : absoluteDirectory(value, label);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function usage(input = {}) {
  return {
    input: Number.isFinite(input.input) ? input.input : null,
    cache: Number.isFinite(input.cache) ? input.cache : null,
    cacheWrite: Number.isFinite(input.cacheWrite) ? input.cacheWrite : null,
    output: Number.isFinite(input.output) ? input.output : null,
    reasoning: Number.isFinite(input.reasoning) ? input.reasoning : null,
  };
}

function claudeUsage(value) {
  return usage({
    input: value?.input_tokens ?? value?.inputTokens,
    cache: value?.cache_read_input_tokens ?? value?.cacheReadInputTokens,
    cacheWrite: value?.cache_creation_input_tokens ?? value?.cacheCreationInputTokens,
    output: value?.output_tokens ?? value?.outputTokens,
  });
}

function codexUsage(value) {
  return usage({
    input: value?.input_tokens,
    cache: value?.cached_input_tokens,
    cacheWrite: value?.cache_write_input_tokens,
    output: value?.output_tokens,
    reasoning: value?.reasoning_output_tokens,
  });
}

function aggregateUsage(values) {
  const total = {};
  for (const field of ['input', 'cache', 'cacheWrite', 'output', 'reasoning']) {
    total[field] = values.length > 0 && values.every((value) => Number.isFinite(value[field]))
      ? values.reduce((sum, value) => sum + value[field], 0)
      : null;
  }
  return total;
}

function claudeModelUsage(modelUsage) {
  if (!modelUsage || typeof modelUsage !== 'object' || Array.isArray(modelUsage)) return null;
  const models = Object.entries(modelUsage).flatMap(([model, value]) =>
    value && typeof value === 'object' ? [{ model, ...claudeUsage(value) }] : []
  );
  if (models.length === 0) return null;
  // Claude result.usage excludes subagents; modelUsage is already inclusive. Never add primary again.
  return { source: 'result.modelUsage', models, total: aggregateUsage(models) };
}

function parseJsonLines(raw) {
  const events = [];
  let malformedLineCount = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      malformedLineCount += 1;
    }
  }
  return { events, malformedLineCount };
}

function workerId(event, fallback) {
  const value = event.worker_id ?? event.workerId ?? event.agent_id ?? event.agentId ?? event.message?.id;
  return typeof value === 'string' && value ? value : fallback;
}

function isWorkerEvent(event) {
  return event.is_sidechain === true || event.is_worker === true ||
    event.worker_id != null || event.workerId != null ||
    event.parent_tool_use_id != null || event.parentToolUseId != null ||
    event.parent_agent_id != null || event.parentAgentId != null;
}

function actorDetails(event) {
  const worker = isWorkerEvent(event);
  const id = event.worker_id ?? event.workerId ?? event.agent_id ?? event.agentId ?? null;
  return {
    actorRole: worker ? 'worker' : 'primary',
    actorId: typeof id === 'string' ? id : null,
    parentToolUseId: event.parent_tool_use_id ?? event.parentToolUseId ?? null,
  };
}

function textBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) =>
    block?.type === 'text' && typeof block.text === 'string' ? [block.text] : []
  );
}

function claudeOperation(block, event) {
  return {
    id: typeof block.id === 'string' ? block.id : null,
    host: 'claude',
    name: typeof block.name === 'string' ? block.name : 'unknown',
    type: 'tool_use',
    input: block.input ?? null,
    status: null,
    startedAt: null,
    endedAt: null,
    durationMs: null,
    ...actorDetails(event),
  };
}

function codexOperation(item, event) {
  const type = item?.type;
  if (type === 'command_execution') {
    return {
      id: typeof item.id === 'string' ? item.id : null,
      host: 'codex', name: 'exec', type,
      input: { command: item.command ?? null }, status: item.status ?? null,
      startedAt: item.started_at ?? item.startedAt ?? null,
      endedAt: item.ended_at ?? item.endedAt ?? null,
      durationMs: Number.isFinite(item.duration_ms) ? item.duration_ms : null,
      ...actorDetails({ ...event, agent_id: event.agent_id ?? event.agentId ?? item.agent_id ?? item.agentId }),
    };
  }
  if (['mcp_tool_call', 'web_search', 'file_change', 'function_call'].includes(type)) {
    return {
      id: typeof item.id === 'string' ? item.id : null,
      host: 'codex', name: item.name ?? item.tool_name ?? type, type,
      input: item.input ?? item.arguments ?? null, status: item.status ?? null,
      startedAt: item.started_at ?? item.startedAt ?? null,
      endedAt: item.ended_at ?? item.endedAt ?? null,
      durationMs: Number.isFinite(item.duration_ms) ? item.duration_ms : null,
      ...actorDetails({ ...event, agent_id: event.agent_id ?? event.agentId ?? item.agent_id ?? item.agentId }),
    };
  }
  return null;
}

function normalizeClaude(events) {
  let workers = null;
  const operations = [];
  const toolResults = [];
  const answers = [];
  let primary = usage();
  let nativeDurationMs = null;
  let workerSequence = 0;
  let fullCycle = null;
  const workerMessageIds = new Set();
  for (const [eventOrdinal, event] of events.entries()) {
    if (event.type === 'assistant') {
      const content = event.message?.content ?? [];
      operations.push(...content.filter((block) => block?.type === 'tool_use').map((block) => ({ ...claudeOperation(block, event), eventOrdinal })));
      if (!isWorkerEvent(event)) answers.push(...textBlocks(content));
      const messageId = event.message?.id;
      if (isWorkerEvent(event) && event.message?.usage &&
        (typeof messageId !== 'string' || !workerMessageIds.has(messageId))) {
        if (typeof messageId === 'string') workerMessageIds.add(messageId);
        if (workers === null) workers = [];
        workerSequence += 1;
        workers.push({ id: workerId(event, `worker-${workerSequence}`), ...claudeUsage(event.message.usage) });
      }
    }
    if (event.type === 'user') {
      for (const block of event.message?.content ?? []) {
        if (block?.type === 'tool_result') {
          toolResults.push({
            host: 'claude', toolUseId: block.tool_use_id ?? null, eventOrdinal,
            content: safeLog(typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? null)),
          });
        }
      }
    }
    if (event.type === 'result') {
      primary = claudeUsage(event.usage);
      fullCycle = claudeModelUsage(event.modelUsage ?? event.model_usage) ?? fullCycle;
      nativeDurationMs = Number.isFinite(event.duration_ms) ? event.duration_ms : null;
      if (typeof event.result === 'string' && event.result) answers.push(event.result);
    }
  }
  return { usage: { primary, workers, fullCycle }, toolOperations: operations, toolResults, textFinalAnswers: [...new Set(answers)], nativeDurationMs };
}

function normalizeCodex(events) {
  let workers = null;
  const operations = [];
  const toolResults = [];
  const answers = [];
  let primary = usage();
  let workerSequence = 0;
  for (const [eventOrdinal, event] of events.entries()) {
    const item = event.item;
    if (event.type === 'item.completed' && item) {
      const operation = codexOperation(item, event);
      if (operation) operations.push({ ...operation, eventOrdinal });
      if (typeof item.aggregated_output === 'string') {
        toolResults.push({ host: 'codex', toolUseId: item.id ?? null, eventOrdinal, content: safeLog(item.aggregated_output) });
      }
      if (item.type === 'agent_message') {
        const text = item.text ?? item.content;
        if (typeof text === 'string' && text) answers.push(text);
      }
    }
    if (isWorkerEvent(event) && event.usage) {
      if (workers === null) workers = [];
      workerSequence += 1;
      workers.push({ id: workerId(event, `worker-${workerSequence}`), ...codexUsage(event.usage) });
    }
    if (event.type === 'turn.completed') primary = codexUsage(event.usage);
  }
  return { usage: { primary, workers, fullCycle: null }, toolOperations: operations, toolResults, textFinalAnswers: [...new Set(answers)], nativeDurationMs: null };
}

/**
 * Normalize structured native host output. Claude's inclusive modelUsage is the sole full-cycle
 * aggregate. Codex input_tokens already includes cached dimensions, so consumers must not add them.
 */
export function normalizeKnowledgeHostTranscript(host, rawStdout) {
  const { events, malformedLineCount } = parseJsonLines(rawStdout);
  const normalized = host === 'claude' ? normalizeClaude(events) : normalizeCodex(events);
  return { ...normalized, transcript: { eventCount: events.length, malformedLineCount } };
}

function cleanEnvironment(base = process.env) {
  const environment = {};
  for (const [key, value] of Object.entries(base)) {
    if (/^(CLAUDE|CODEX|SPECTRE|ANTHROPIC)_/.test(key)) continue;
    environment[key] = value;
  }
  return environment;
}

function hostCommand({ host, model, effort, prompt, preparedFixture, command, extraArgs = [], allowedTools }) {
  const binary = command ?? (host === 'claude' ? process.env.CLAUDE_BIN || 'claude' : process.env.CODEX_BIN || 'codex');
  if (host === 'claude') {
    return {
      command: binary,
      args: [
        ...(preparedFixture.pluginDir ? ['--plugin-dir', preparedFixture.pluginDir, '--setting-sources', 'project'] : []),
        '--allowedTools', (allowedTools ?? ['Bash', 'Read', 'Glob', 'Grep', 'Write', 'Edit', 'Skill', 'Task']).join(','),
        '--permission-mode', 'dontAsk', '--no-session-persistence',
        '--output-format', 'stream-json', '--include-hook-events', '--verbose',
        ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []),
        ...extraArgs, '-p', prompt,
      ],
    };
  }
  return {
    command: binary,
    args: [
      'exec', '--json', '--ephemeral', '--skip-git-repo-check',
      '--dangerously-bypass-hook-trust', '--sandbox', 'workspace-write',
      ...(preparedFixture.storeDir ? ['--add-dir', preparedFixture.storeDir] : []), '-c', 'approval_policy="never"',
      '-C', preparedFixture.projectDir,
      ...(model ? ['-m', model] : []),
      ...(effort ? ['-c', `model_reasoning_effort=${JSON.stringify(effort)}`] : []),
      ...extraArgs, prompt,
    ],
  };
}

function safeLog(value) {
  return String(value)
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED]');
}

async function stageCodexAuth(codexHome, authSourcePath) {
  const source = authSourcePath ?? path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json');
  if (!(await exists(source))) return null;
  const destination = path.join(codexHome, 'auth.json');
  await copyFile(source, destination);
  await chmod(destination, 0o600);
  return destination;
}

function runChild(command, args, options, spawn) {
  return new Promise((resolveRun) => {
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let timedOut = false;
    let outputLimited = false;
    let settled = false;
    let timeout;
    let force;
    const complete = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(force);
      resolveRun({ ...result, stdout, stderr, timedOut, outputLimited });
    };
    let child;
    try {
      child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      complete({ exitCode: null, signal: null, error: error.message });
      return;
    }
    const append = (stream) => (chunk) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      const remaining = options.maxOutputBytes - bytes;
      if (remaining > 0) {
        const bounded = Buffer.from(text).subarray(0, remaining).toString('utf8');
        if (stream === 'stdout') stdout += bounded;
        else stderr += bounded;
      }
      bytes += Buffer.byteLength(text);
      if (bytes > options.maxOutputBytes && !outputLimited) {
        outputLimited = true;
        child.kill?.('SIGTERM');
      }
    };
    child.stdout?.on('data', append('stdout'));
    child.stderr?.on('data', append('stderr'));
    child.on?.('error', (error) => complete({ exitCode: null, signal: null, error: error.message }));
    child.on?.('close', (exitCode, signal) => complete({ exitCode, signal, error: null }));
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill?.('SIGTERM');
      force = setTimeout(() => {
        child.kill?.('SIGKILL');
        complete({ exitCode: null, signal: 'SIGKILL', error: null });
      }, options.terminationGraceMs);
    }, options.timeoutMs);
  });
}

function validateInputs({ host, model, effort, prompt, preparedFixture, rawLogDirectory, repositoryRoot }) {
  if (!['claude', 'codex'].includes(host)) throw new Error('host must be claude or codex');
  if (typeof model !== 'string' || !model) throw new Error('model is required');
  if (typeof effort !== 'string' || !effort) throw new Error('effort is required');
  if (typeof prompt !== 'string' || !prompt) throw new Error('prompt is required');
  const projectDir = absoluteDirectory(preparedFixture?.projectDir, 'preparedFixture.projectDir');
  const noKnowledge = preparedFixture?.noKnowledge === true;
  const storeDir = noKnowledge ? optionalDirectory(preparedFixture?.storeDir ?? preparedFixture?.spectreHome, 'preparedFixture.storeDir') : absoluteDirectory(preparedFixture?.storeDir ?? preparedFixture?.spectreHome, 'preparedFixture.storeDir');
  const pluginDir = noKnowledge ? optionalDirectory(preparedFixture?.pluginDir, 'preparedFixture.pluginDir') : absoluteDirectory(preparedFixture?.pluginDir, 'preparedFixture.pluginDir');
  const rawDirectory = absoluteDirectory(rawLogDirectory, 'rawLogDirectory');
  const root = path.resolve(repositoryRoot ?? process.cwd());
  if (isWithin(root, rawDirectory)) throw new Error('rawLogDirectory must be outside the checkout');
  if ([projectDir, storeDir, pluginDir].filter(Boolean).some((directory) => isWithin(root, directory))) {
    throw new Error('prepared fixture directories must be isolated outside the checkout');
  }
  const directories = [projectDir, storeDir, pluginDir].filter(Boolean);
  if (new Set(directories).size !== directories.length) throw new Error('prepared fixture directories must be distinct');
  return { projectDir, storeDir, pluginDir, noKnowledge, rawDirectory, repositoryRoot: root };
}

/**
 * Launch one real native Claude or Codex invocation in a caller-supplied isolated fixture.
 * Raw streams are redacted and retained only in `rawLogDirectory`; return data contains no raw streams.
 */
export async function invokeKnowledgeHost(request, dependencies = {}) {
  const { host, model, effort, prompt, preparedFixture, rawLogDirectory } = request ?? {};
  const paths = validateInputs({ ...request, host, model, effort, prompt, preparedFixture, rawLogDirectory });
  const limits = { ...DEFAULT_LIMITS, ...(request.limits ?? {}) };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`limits.${name} must be a positive number`);
  }
  const fixture = { ...preparedFixture, ...paths };
  if (host === 'codex') fixture.codexHome = absoluteDirectory(preparedFixture.codexHome, 'preparedFixture.codexHome');
  if (host === 'claude') fixture.claudeHome = absoluteDirectory(preparedFixture.claudeHome ?? path.join(paths.projectDir, '.claude-runtime'), 'preparedFixture.claudeHome');
  await mkdir(paths.rawDirectory, { recursive: true, mode: 0o700 });
  await Promise.all([mkdir(paths.projectDir, { recursive: true }), ...[paths.storeDir, paths.pluginDir].filter(Boolean).map((directory) => mkdir(directory, { recursive: true }))]);
  if (host === 'codex') await mkdir(fixture.codexHome, { recursive: true, mode: 0o700 });
  else await mkdir(fixture.claudeHome, { recursive: true, mode: 0o700 });

  const environment = {
    ...cleanEnvironment(dependencies.baseEnvironment), ...(request.environment ?? {}),
    ...(paths.storeDir ? { SPECTRE_HOME: paths.storeDir } : {}),
    ...(paths.pluginDir ? { CLAUDE_PROJECT_DIR: paths.projectDir, CLAUDE_PLUGIN_ROOT: paths.pluginDir, PLUGIN_ROOT: paths.pluginDir } : {}),
  };
  if (host === 'claude') {
    environment.CLAUDE_CONFIG_DIR = fixture.claudeHome;
    environment.CLAUDE_SECURESTORAGE_CONFIG_DIR = '';
  } else {
    environment.CODEX_HOME = fixture.codexHome;
  }
  const native = hostCommand({ host, model, effort, prompt, preparedFixture: fixture, command: request.command, extraArgs: request.extraArgs, allowedTools: request.allowedTools });
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let stagedAuth = null;
  let processResult;
  let cleanup = { stagedAuth: 'not-staged' };
  try {
    if (host === 'codex') stagedAuth = await stageCodexAuth(fixture.codexHome, request.authSourcePath);
    processResult = await runChild(native.command, native.args, {
      cwd: paths.projectDir, env: environment, timeoutMs: limits.timeoutMs,
      maxOutputBytes: limits.maxOutputBytes, terminationGraceMs: limits.terminationGraceMs,
    }, dependencies.spawn ?? nativeSpawn);
  } catch (error) {
    processResult = {
      exitCode: null, signal: null, timedOut: false, outputLimited: false,
      error: error instanceof Error ? error.message : String(error), stdout: '', stderr: '',
    };
  } finally {
    if (stagedAuth) {
      try {
        await (dependencies.removeFile ?? rm)(stagedAuth, { force: true });
        cleanup = { stagedAuth: 'removed' };
      } catch {
        cleanup = { stagedAuth: 'cleanup-failed' };
      }
    }
  }
  const stdoutPath = path.join(paths.rawDirectory, `${host}.stdout.jsonl`);
  const stderrPath = path.join(paths.rawDirectory, `${host}.stderr.log`);
  await Promise.all([
    writeFile(stdoutPath, safeLog(processResult?.stdout ?? ''), { mode: 0o600 }),
    writeFile(stderrPath, safeLog(processResult?.stderr ?? ''), { mode: 0o600 }),
  ]);
  const normalized = normalizeKnowledgeHostTranscript(host, processResult?.stdout ?? '');
  const status = processResult.timedOut ? 'timed_out'
    : processResult.outputLimited ? 'output_limited'
      : processResult.error ? 'launch_failed'
        : processResult.exitCode === 0 ? 'completed' : 'failed';
  return {
    status,
    exit: {
      exitCode: processResult.exitCode, signal: processResult.signal,
      timedOut: processResult.timedOut, outputLimited: processResult.outputLimited,
      error: processResult.error,
    },
    usage: normalized.usage,
    toolOperations: normalized.toolOperations,
    toolResults: normalized.toolResults,
    textFinalAnswers: normalized.textFinalAnswers,
    transcript: normalized.transcript,
    traceUnavailable: /SPECTRE_EVALUATION_TRACE_UNAVAILABLE\b/.test(processResult?.stderr ?? ''),
    timing: { startedAt, endedAt: new Date().toISOString(), wallDurationMs: performance.now() - started, nativeDurationMs: normalized.nativeDurationMs },
    rawLogs: { stdoutPath, stderrPath },
    cleanup,
    isolation: {
      projectDir: paths.projectDir, storeDir: paths.storeDir, pluginDir: paths.pluginDir,
      freshStore: preparedFixture.freshStore ?? null, isolated: true,
      rawLogsOutsideCheckout: !isWithin(paths.repositoryRoot, paths.rawDirectory),
    },
  };
}

export { hostCommand };

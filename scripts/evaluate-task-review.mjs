#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "task-review-evaluation-result/v1";
const AGGREGATE_SCHEMA_VERSION = "task-review-evaluation-summary/v1";
const SEVERITIES = ["Blocker", "High", "Medium", "Low"];
const SEVERITY_WEIGHTS = {
  Blocker: 8,
  High: 4,
  Medium: 2,
  Low: 1,
};
const VARIANTS = {
  "baseline-opus-max": {
    contract: "baseline/contract.json",
    runtime: "claude-code",
    runtimeLabel: "Claude Code",
    model: "opus",
    effort: "max",
    primaryRuntime: "codex",
    route: "Codex -> Claude Code",
  },
  "candidate-opus-medium": {
    contract: "candidate/contract.json",
    runtime: "claude-code",
    runtimeLabel: "Claude Code",
    model: "opus",
    effort: "medium",
    primaryRuntime: "codex",
    route: "Codex -> Claude Code",
  },
  "candidate-sol-medium": {
    contract: "candidate/contract.json",
    runtime: "codex",
    runtimeLabel: "Codex",
    model: "gpt-5.6-sol",
    effort: "medium",
    primaryRuntime: "claude-code",
    route: "Claude Code -> Codex",
  },
};
const PROTECTED_INPUTS = [
  "specs/plan.md",
  "specs/execute.md",
  "specs/tasks.json",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function atomicWriteJson(path, value) {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

async function hashFile(path) {
  return sha256(await readFile(path));
}

async function hashProtectedInputs(taskRoot) {
  const hashes = {};
  for (const input of PROTECTED_INPUTS) {
    hashes[input] = await hashFile(join(taskRoot, input));
  }
  return hashes;
}

async function filesBelow(root) {
  const files = [];
  if (!(await exists(root))) return files;

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        files.push(relative(root, path));
      }
    }
  }

  await visit(root);
  return files.sort();
}

function parseArguments(args) {
  const [command, ...rest] = args;
  const options = { reviewerArg: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    );
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${token} requires a value`);
    }
    index += 1;
    if (key === "reviewerArg") {
      options.reviewerArg.push(value);
    } else {
      options[key] = value;
    }
  }
  return { command, options };
}

function requireOptions(options, names) {
  for (const name of names) {
    if (options[name] === undefined) {
      throw new Error(`--${name.replace(/[A-Z]/g, (letter) =>
        `-${letter.toLowerCase()}`,
      )} is required`);
    }
  }
}

function cleanEnvironment() {
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(SUBSPACE|GROVE|CLAUDE|SPECTRE|CODEX|ANTHROPIC)/.test(key)) {
      continue;
    }
    environment[key] = value;
  }
  return environment;
}

function claudeAuthenticationEnvironment(claudeHome, baseEnvironment) {
  return {
    ...baseEnvironment,
    CLAUDE_CONFIG_DIR: claudeHome,
    // Keep config/session output isolated while using Claude's existing secure
    // storage namespace. The credential itself remains in Keychain or the
    // runtime-managed default credential store and is never copied here.
    CLAUDE_SECURESTORAGE_CONFIG_DIR: "",
  };
}

export function probeClaudeAuthentication(
  command,
  claudeHome,
  baseEnvironment = cleanEnvironment(),
) {
  const result = spawnSync(command, ["auth", "status", "--json"], {
    encoding: "utf8",
    env: claudeAuthenticationEnvironment(claudeHome, baseEnvironment),
    timeout: 5_000,
  });
  let status = {};
  try {
    status = JSON.parse(result.stdout || "{}");
  } catch {
    return {
      checked: true,
      logged_in: false,
      auth_method: null,
      api_provider: null,
      source: "default-secure-storage",
      unavailable_reason: "Claude auth status returned invalid JSON.",
    };
  }
  const loggedIn = result.status === 0 && status.loggedIn === true;
  return {
    checked: true,
    logged_in: loggedIn,
    auth_method:
      typeof status.authMethod === "string" ? status.authMethod : null,
    api_provider:
      typeof status.apiProvider === "string" ? status.apiProvider : null,
    source: "default-secure-storage",
    unavailable_reason: loggedIn
      ? null
      : `Claude auth status exited ${result.status ?? "without a status"}.`,
  };
}

async function stageCodexAuthentication(codexHome) {
  const sourceHome = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : join(process.env.HOME ?? "", ".codex");
  const source = join(sourceHome, "auth.json");
  if (!(await exists(source))) return null;
  const destination = join(codexHome, "auth.json");
  await cp(source, destination);
  return destination;
}

async function verifyFixture(fixtureRoot) {
  const manifestPath = join(fixtureRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schema_version !== "task-review-fixture-manifest/v1") {
    throw new Error("unsupported fixture manifest");
  }
  for (const [componentPath, expected] of Object.entries(
    manifest.components ?? {},
  )) {
    const target = join(fixtureRoot, componentPath);
    const bytes = await readFile(target);
    if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`fixture component mismatch: ${componentPath}`);
    }
  }
  return {
    manifest,
    manifestHash: await hashFile(manifestPath),
  };
}

function buildCandidatePrompt(taskRoot, reportPath) {
  return `Perform an adversarial generated-task review.

TASK_DIR: ${taskRoot}
EXECUTE_INDEX: ${join(taskRoot, "specs", "execute.md")}
TASKS_JSON: ${join(taskRoot, "specs", "tasks.json")}
PLAN: ${join(taskRoot, "specs", "plan.md")}
REVIEW_REPORT: ${reportPath}
MODE: adversarial

Write permission is limited to REVIEW_REPORT. Do not edit the plan, execute
index, task graph, or any other file. Review semantic coverage,
executability, integration, and reference relevance in one non-sharded pass.
Do not infer correctness from structural token or path presence alone.

Write a Findings table with columns # | Severity | Lens | Location | Finding |
Suggested Edit, or an explicit "No findings." form. Include Review Metadata
with Mode, Reviewer Runtime, Reviewer Model, Reviewer Effort, and Invocation
Route.`;
}

async function loadPrompt(fixtureRoot, variant, taskRoot, reportPath) {
  if (variant !== "baseline-opus-max") {
    return buildCandidatePrompt(taskRoot, reportPath);
  }
  const contract = JSON.parse(
    await readFile(join(fixtureRoot, "baseline", "contract.json"), "utf8"),
  );
  return contract.historical_prompt.text
    .replaceAll(
      "docs/tasks/main/knowledge-surfacing",
      relative(dirname(taskRoot), taskRoot) === basename(taskRoot)
        ? taskRoot
        : taskRoot,
    )
    .replace(
      /Reviewer Model: fable/g,
      "Reviewer Model: opus",
    )
    .replace(
      /Reviewer Effort: high/g,
      "Reviewer Effort: max",
    );
}

function reviewerCommand(configuration, prompt, workspace, custom) {
  if (custom.command) {
    return {
      command: custom.command,
      args: custom.args,
    };
  }
  if (configuration.runtime === "claude-code") {
    return {
      command: process.env.CLAUDE_BIN || "claude",
      args: [
        "-p",
        "--safe-mode",
        "--model",
        configuration.model,
        "--effort",
        configuration.effort,
        "--permission-mode",
        "dontAsk",
        "--output-format",
        "stream-json",
        "--verbose",
        "--no-session-persistence",
        prompt,
      ],
    };
  }
  return {
    command: process.env.CODEX_BIN || "codex",
    args: [
      "exec",
      "-C",
      workspace,
      "-m",
      configuration.model,
      "-c",
      `model_reasoning_effort=${JSON.stringify(configuration.effort)}`,
      "-s",
      "workspace-write",
      "--json",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--disable",
      "hooks",
      prompt,
    ],
  };
}

function commandVersion(command, environment) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    env: environment,
    timeout: 5_000,
  });
  if (result.error || result.status !== 0) {
    return {
      value: null,
      unavailable_reason:
        result.error?.message ||
        result.stderr?.trim() ||
        `version command exited ${result.status}`,
    };
  }
  return {
    value: result.stdout.trim() || result.stderr.trim(),
    unavailable_reason: null,
  };
}

function runReviewer(command, args, options) {
  return new Promise((resolveRun) => {
    const startedAt = performance.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let forceKillTimer;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 50);
    }, options.timeoutMs);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);
      resolveRun({
        ...result,
        stdout,
        stderr,
        timedOut,
        durationMs: performance.now() - startedAt,
      });
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finish({ exitCode: null, signal: null, error: error.message });
    });
    child.on("close", (exitCode, signal) => {
      finish({ exitCode, signal, error: null });
    });
  });
}

function parseJsonLines(raw) {
  const events = [];
  const rawEvents = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
      rawEvents.push(line);
    } catch {
      // stdout remains authoritative raw evidence; non-JSON lines are retained there.
    }
  }
  return {
    events,
    rawEvents: rawEvents.length > 0 ? `${rawEvents.join("\n")}\n` : "",
  };
}

function observed(value, source, extra = {}) {
  if (value === null || value === undefined) {
    return {
      value: null,
      unavailable_reason: "The runtime did not expose this field.",
      ...extra,
    };
  }
  return { value, source, unavailable_reason: null, ...extra };
}

function unavailable(reason, extra = {}) {
  return { value: null, unavailable_reason: reason, ...extra };
}

function estimatedCost(runtime, selector, tokens, priceBasis) {
  const rate = priceBasis?.public_price_estimate?.rates?.find(
    (entry) => entry.runtime === runtime && entry.selector === selector,
  );
  if (!rate) {
    return unavailable("No dated public price rate matches this runtime/model.", {
      label: "estimate",
      basis_version: priceBasis?.basis_version ?? null,
    });
  }
  if (tokens.input.value === null || tokens.output.value === null) {
    return unavailable("Required native token fields were not exposed.", {
      label: "estimate",
      basis_version: priceBasis.basis_version,
    });
  }
  const input = tokens.input.value * rate.input;
  const cached =
    (tokens.cached_input.value ?? 0) * (rate.cached_input ?? rate.input);
  const cacheWrite =
    (tokens.cache_write_input.value ?? 0) *
    (rate.cache_write_5m ?? rate.input);
  const output = tokens.output.value * rate.output;
  return observed((input + cached + cacheWrite + output) / 1_000_000, [
    "native token fields",
    `price basis ${priceBasis.basis_version}`,
  ].join(" + "), {
    label: "estimate",
    basis_version: priceBasis.basis_version,
  });
}

export function normalizeTelemetry(runtime, events, priceBasis, selector) {
  let tokens;
  let actualCost;
  let toolCalls;
  let messages;
  let nativeTiming;
  let retries;

  if (runtime === "claude-code") {
    const result = [...events].reverse().find((event) => event.type === "result");
    const usage = result?.usage;
    tokens = {
      input: usage
        ? observed(usage.input_tokens ?? null, "result.usage.input_tokens")
        : unavailable("The runtime did not expose input tokens."),
      cached_input: usage
        ? observed(
          usage.cache_read_input_tokens ?? null,
          "result.usage.cache_read_input_tokens",
        )
        : unavailable("The runtime did not expose cached-input tokens."),
      cache_write_input: usage
        ? observed(
          usage.cache_creation_input_tokens ?? null,
          "result.usage.cache_creation_input_tokens",
        )
        : unavailable("The runtime did not expose cache-write input tokens."),
      output: usage
        ? observed(usage.output_tokens ?? null, "result.usage.output_tokens")
        : unavailable("The runtime did not expose output tokens."),
      reasoning_output: unavailable(
        "Reasoning-output tokens were not exposed by the Claude runtime.",
      ),
      total: unavailable(
        "The Claude runtime did not expose a native total-token field.",
      ),
    };
    actualCost = result
      ? observed(result.total_cost_usd ?? null, "result.total_cost_usd", {
        label: "actual",
      })
      : unavailable("Actual runtime cost was not exposed.", {
        label: "actual",
      });
    toolCalls = events.length > 0
      ? observed(
        events.reduce(
          (count, event) =>
            count +
            (event.type === "assistant"
              ? (event.message?.content ?? []).filter(
                (block) => block.type === "tool_use",
              ).length
              : 0),
          0,
        ),
        "complete structured stream assistant tool_use count",
      )
      : unavailable("Structured tool-call events were not exposed.");
    messages = result?.num_turns !== undefined
      ? observed(result.num_turns, "result.num_turns", { unit: "turns" })
      : unavailable("The runtime did not expose message/turn count.", {
        unit: "turns",
      });
    nativeTiming = result?.duration_ms !== undefined
      ? observed(result.duration_ms, "result.duration_ms")
      : unavailable("The runtime did not expose native duration.");
  } else {
    const completed = [...events]
      .reverse()
      .find((event) => event.type === "turn.completed");
    const usage = completed?.usage;
    tokens = {
      input: usage
        ? observed(usage.input_tokens ?? null, "turn.completed.usage.input_tokens")
        : unavailable("The runtime did not expose input tokens."),
      cached_input: usage
        ? observed(
          usage.cached_input_tokens ?? null,
          "turn.completed.usage.cached_input_tokens",
        )
        : unavailable("The runtime did not expose cached-input tokens."),
      cache_write_input: usage
        ? observed(
          usage.cache_write_input_tokens ?? null,
          "turn.completed.usage.cache_write_input_tokens",
        )
        : unavailable("The runtime did not expose cache-write input tokens."),
      output: usage
        ? observed(
          usage.output_tokens ?? null,
          "turn.completed.usage.output_tokens",
        )
        : unavailable("The runtime did not expose output tokens."),
      reasoning_output: usage
        ? observed(
          usage.reasoning_output_tokens ?? null,
          "turn.completed.usage.reasoning_output_tokens",
        )
        : unavailable("The runtime did not expose reasoning-output tokens."),
      total: unavailable(
        "The Codex runtime did not expose a native total-token field.",
      ),
    };
    actualCost = unavailable(
      "Actual runtime cost was not exposed by the Codex runtime.",
      { label: "actual" },
    );
    const toolTypes = new Set([
      "command_execution",
      "mcp_tool_call",
      "web_search",
      "file_change",
    ]);
    toolCalls = events.length > 0
      ? observed(
        events.filter(
          (event) =>
            event.type === "item.completed" && toolTypes.has(event.item?.type),
        ).length,
        "complete structured stream item.completed tool count",
      )
      : unavailable("Structured tool-call events were not exposed.");
    messages = events.length > 0
      ? observed(
        events.filter(
          (event) =>
            event.type === "item.completed" &&
            event.item?.type === "agent_message",
        ).length,
        "complete structured stream item.completed agent_message count",
        { unit: "messages" },
      )
      : unavailable("Structured message events were not exposed.", {
        unit: "messages",
      });
    nativeTiming = unavailable(
      "The Codex runtime did not expose native duration.",
    );
  }

  const retryEvents = events.filter(
    (event) =>
      event.type === "retry" ||
      event.subtype === "retry" ||
      event.type === "api_retry",
  );
  retries = retryEvents.length > 0
    ? observed(retryEvents.length, "structured retry event count")
    : unavailable("The runtime did not expose a retry counter or retry event.");

  return {
    tokens,
    cost: {
      actual_runtime_usd: actualCost,
      estimated_token_usd: estimatedCost(
        runtime,
        selector,
        tokens,
        priceBasis,
      ),
    },
    tool_calls: toolCalls,
    messages,
    retries,
    timing: {
      runtime_duration_ms: nativeTiming,
    },
  };
}

function parseReportFindings(report) {
  const findingsSection = report.match(
    /## Findings\s*([\s\S]*?)(?=\n## |\s*$)/i,
  )?.[1] ?? "";
  if (/^\s*No findings\.\s*$/im.test(findingsSection)) return [];
  const rows = findingsSection
    .split("\n")
    .filter((line) => /^\s*\|/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter(
      (cells) =>
        cells.length >= 6 &&
        !/^#$/i.test(cells[0]) &&
        !/^[-:]+$/.test(cells[0]),
    );
  return rows.map((cells) => {
    const fingerprint = cells.join(" ").match(/\b[a-f0-9]{64}\b/i)?.[0];
    return {
      id: cells[0],
      severity: cells[1],
      lens: cells[2],
      location: cells[3],
      finding: cells[4],
      suggested_edit: cells.slice(5).join(" | "),
      fingerprint: fingerprint?.toLowerCase(),
      scope_change: cells[1] === "Scope Change Required",
    };
  });
}

function validateReport(report, configuration) {
  const failures = [];
  if (!/## Findings\b/i.test(report)) {
    failures.push("report is missing a Findings section");
  } else if (
    !/\bNo findings\./i.test(report) &&
    parseReportFindings(report).length === 0
  ) {
    failures.push("report Findings table is invalid");
  }
  const metadata = {
    mode: report.match(/^Mode:\s*(.+)$/im)?.[1]?.trim(),
    runtime: report.match(/^Reviewer Runtime:\s*(.+)$/im)?.[1]?.trim(),
    model: report.match(/^Reviewer Model:\s*(.+)$/im)?.[1]?.trim(),
    effort: report.match(/^Reviewer Effort:\s*(.+)$/im)?.[1]?.trim(),
    route: report.match(/^Invocation Route:\s*(.+)$/im)?.[1]?.trim(),
  };
  const expected = {
    mode: "adversarial",
    runtime: configuration.runtimeLabel,
    model: configuration.model,
    effort: configuration.effort,
    route: configuration.route,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (metadata[field] !== value) {
      failures.push(
        `report metadata ${field} expected ${JSON.stringify(value)}, found ${JSON.stringify(metadata[field] ?? null)}`,
      );
    }
  }
  return { valid: failures.length === 0, failures, metadata };
}

export function scoreFindings({
  oracleFindings,
  candidateFindings,
  adjudications = [],
}) {
  const adjudicationByCandidate = new Map(
    adjudications.map((record) => [record.candidate_id, record]),
  );
  const oracleByFingerprint = new Map(
    oracleFindings.map((finding) => [finding.fingerprint, finding]),
  );
  const matchedOracle = new Map();
  const matchedCandidates = new Set();
  const duplicateCandidates = new Set();
  const severityDrift = [];

  for (const candidate of candidateFindings) {
    const oracle = oracleByFingerprint.get(candidate.fingerprint);
    if (!oracle) continue;
    if (matchedOracle.has(oracle.id)) {
      duplicateCandidates.add(candidate.id);
      continue;
    }
    matchedOracle.set(oracle.id, candidate);
    matchedCandidates.add(candidate.id);
    if (candidate.severity !== oracle.severity) {
      severityDrift.push({
        candidate_id: candidate.id,
        oracle_id: oracle.id,
        expected: oracle.severity,
        observed: candidate.severity,
      });
    }
  }

  const recallBySeverity = {};
  for (const severity of SEVERITIES) {
    const expected = oracleFindings.filter(
      (finding) => finding.severity === severity,
    );
    const matched = expected.filter((finding) =>
      matchedOracle.has(finding.id),
    );
    recallBySeverity[severity] =
      expected.length === 0 ? null : matched.length / expected.length;
  }
  const totalWeight = oracleFindings.reduce(
    (total, finding) => total + (SEVERITY_WEIGHTS[finding.severity] ?? 0),
    0,
  );
  const matchedWeight = oracleFindings
    .filter((finding) => matchedOracle.has(finding.id))
    .reduce(
      (total, finding) => total + (SEVERITY_WEIGHTS[finding.severity] ?? 0),
      0,
    );

  const unmatchedCandidates = candidateFindings
    .filter(
      (candidate) =>
        !matchedCandidates.has(candidate.id) &&
        !duplicateCandidates.has(candidate.id),
    )
    .map((candidate) => {
      const adjudication = adjudicationByCandidate.get(candidate.id);
      const routeBlind = adjudication?.route_blind === true;
      const acceptedDisposition = new Set(["supported", "unsupported"]);
      return {
        id: candidate.id,
        status:
          routeBlind && acceptedDisposition.has(adjudication.disposition)
            ? adjudication.disposition
            : "unadjudicated",
        route_blind:
          routeBlind && acceptedDisposition.has(adjudication?.disposition),
      };
    });
  const adjudicated = unmatchedCandidates.filter(
    ({ status }) => status !== "unadjudicated",
  );
  const supportedCount =
    matchedOracle.size +
    adjudicated.filter(({ status }) => status === "supported").length;
  const precisionDenominator = matchedOracle.size + adjudicated.length;

  return {
    recall_by_severity: recallBySeverity,
    weighted_recall: totalWeight === 0 ? null : matchedWeight / totalWeight,
    duplicate_count: duplicateCandidates.size,
    duplicate_candidate_ids: [...duplicateCandidates],
    severity_drift: severityDrift,
    false_scope_change_count: candidateFindings.filter((candidate) => {
      const adjudication = adjudicationByCandidate.get(candidate.id);
      return (
        candidate.scope_change === true &&
        adjudication?.route_blind === true &&
        adjudication.disposition === "unsupported"
      );
    }).length,
    unmatched_known: oracleFindings.filter(
      (finding) => !matchedOracle.has(finding.id),
    ),
    unmatched_candidates: unmatchedCandidates,
    supported_precision:
      precisionDenominator === 0 ? null : supportedCount / precisionDenominator,
  };
}

function median(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

export function aggregateRuns(runs) {
  const valid = runs.filter((run) => run.status === "valid");
  const excluded = runs
    .filter((run) => run.status !== "valid")
    .map((run) => ({ id: run.id, status: run.status }));
  const variants = {};
  for (const run of valid) {
    variants[run.variant] ??= {
      individual_runs: [],
      duration_ms: { individual: [], median: null, range: [] },
    };
    variants[run.variant].individual_runs.push(run);
    variants[run.variant].duration_ms.individual.push(run.timing.total_ms);
  }
  for (const summary of Object.values(variants)) {
    const values = summary.duration_ms.individual;
    summary.duration_ms.median = median(values);
    summary.duration_ms.range =
      values.length === 0 ? [] : [Math.min(...values), Math.max(...values)];
  }

  const baselineByBlock = new Map(
    valid
      .filter((run) => run.variant === "baseline-opus-max")
      .map((run) => [String(run.block), run]),
  );
  const pairedDeltas = {};
  for (const variant of Object.keys(variants).filter(
    (name) => name !== "baseline-opus-max",
  )) {
    pairedDeltas[variant] = valid
      .filter((run) => run.variant === variant)
      .flatMap((candidate) => {
        const baseline = baselineByBlock.get(String(candidate.block));
        if (!baseline) return [];
        const baselineMs = baseline.timing.total_ms;
        const candidateMs = candidate.timing.total_ms;
        return [{
          block: candidate.block,
          baseline_ms: baselineMs,
          candidate_ms: candidateMs,
          improvement_percent:
            ((baselineMs - candidateMs) / baselineMs) * 100,
        }];
      });
  }
  return {
    schema_version: AGGREGATE_SCHEMA_VERSION,
    variants,
    excluded,
    paired_deltas: pairedDeltas,
  };
}

async function acquireLock(lockFile, attestation) {
  await mkdir(dirname(lockFile), { recursive: true });
  try {
    const handle = await open(lockFile, "wx");
    await handle.writeFile(`${JSON.stringify(attestation)}\n`);
    await handle.close();
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(`evaluation lock is held: ${lockFile}`);
    }
    throw error;
  }
}

function safeHashObject(value) {
  return sha256(canonicalJson(value));
}

async function runEvaluation(options, hooks = {}) {
  requireOptions(options, [
    "fixture",
    "variant",
    "trial",
    "outputDir",
    "priceBasis",
  ]);
  const configuration = VARIANTS[options.variant];
  if (!configuration) {
    throw new Error(`unknown variant: ${options.variant}`);
  }
  const fixtureRoot = resolve(options.fixture);
  const outputDirectory = resolve(options.outputDir);
  const priceBasisPath = resolve(options.priceBasis);
  const timeoutMs = Number(options.timeoutMs ?? 1_200_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }
  if (await exists(outputDirectory)) {
    throw new Error(`output directory already exists: ${outputDirectory}`);
  }

  const totalStarted = performance.now();
  const wallStarted = new Date().toISOString();
  const lockFile = resolve(
    options.lockFile ?? join(tmpdir(), "spectre-task-review-evaluation.lock"),
  );
  if (hooks.beforeLock) await hooks.beforeLock({ lockFile });
  const lockAttestation = {
    pid: process.pid,
    trial: options.trial,
    variant: options.variant,
    started_at: wallStarted,
  };
  await acquireLock(lockFile, lockAttestation);

  let outputCreated = false;
  let stagedAuth = null;
  try {
    await mkdir(outputDirectory, { recursive: false });
    outputCreated = true;
    const workspace = join(outputDirectory, "workspace");
    const taskRoot = join(
      workspace,
      "docs",
      "tasks",
      "main",
      "knowledge-surfacing",
    );
    const runtimeRoot = join(outputDirectory, "runtime");
    const claudeHome = join(runtimeRoot, "claude");
    const codexHome = join(runtimeRoot, "codex");
    const spectreHome = join(runtimeRoot, "spectre");
    const rawDirectory = join(outputDirectory, "raw");
    const reportPath = join(taskRoot, "reviews", "task_review.md");
    await Promise.all([
      mkdir(taskRoot, { recursive: true }),
      mkdir(claudeHome, { recursive: true }),
      mkdir(codexHome, { recursive: true }),
      mkdir(spectreHome, { recursive: true }),
      mkdir(rawDirectory, { recursive: true }),
      mkdir(dirname(reportPath), { recursive: true }),
    ]);

    const { manifest, manifestHash } = await verifyFixture(fixtureRoot);
    await cp(join(fixtureRoot, "input"), taskRoot, { recursive: true });
    const beforeHashes = await hashProtectedInputs(taskRoot);
    const contractPath = join(fixtureRoot, configuration.contract);
    const contractHash = await hashFile(contractPath);
    const priceBasis = JSON.parse(await readFile(priceBasisPath, "utf8"));
    const priceBasisHash = await hashFile(priceBasisPath);
    const prompt = await loadPrompt(
      fixtureRoot,
      options.variant,
      taskRoot,
      reportPath,
    );
    const command = reviewerCommand(configuration, prompt, workspace, {
      command: options.reviewerCommand,
      args: options.reviewerArg,
    });
    const baseEnvironment = cleanEnvironment();
    const environment = {
      ...claudeAuthenticationEnvironment(claudeHome, baseEnvironment),
      CODEX_HOME: codexHome,
      SPECTRE_HOME: spectreHome,
      TASK_REVIEW_REPORT: reportPath,
      TASK_REVIEW_WORKSPACE: taskRoot,
      TASK_REVIEW_RUNTIME: configuration.runtimeLabel,
      TASK_REVIEW_MODEL: configuration.model,
      TASK_REVIEW_EFFORT: configuration.effort,
      TASK_REVIEW_ROUTE: configuration.route,
    };
    stagedAuth = await stageCodexAuthentication(codexHome);
    const claudeAuthentication =
      configuration.runtime !== "claude-code"
        ? {
          checked: false,
          logged_in: null,
          auth_method: null,
          api_provider: null,
          source: "not-applicable",
          unavailable_reason: "The selected reviewer runtime is not Claude Code.",
        }
        : options.reviewerCommand
          ? {
            checked: false,
            logged_in: null,
            auth_method: null,
            api_provider: null,
            source: "default-secure-storage",
            unavailable_reason:
              "Custom reviewer command bypassed the real Claude auth preflight.",
          }
          : probeClaudeAuthentication(command.command, claudeHome, environment);
    const version = commandVersion(command.command, environment);
    const preflightEnded = performance.now();

    const authenticationBlocked =
      configuration.runtime === "claude-code" &&
      claudeAuthentication.checked &&
      !claudeAuthentication.logged_in;
    const processResult = authenticationBlocked
      ? {
        exitCode: null,
        signal: null,
        error: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        skipped: true,
        durationMs: 0,
      }
      : await runReviewer(command.command, command.args, {
        cwd: workspace,
        env: environment,
        timeoutMs,
      });
    const reviewerEnded = performance.now();
    const rawStdoutPath = join(rawDirectory, "reviewer.stdout.jsonl");
    const rawStderrPath = join(rawDirectory, "reviewer.stderr.txt");
    const rawEventsPath = join(rawDirectory, "reviewer.events.jsonl");
    const { events, rawEvents } = parseJsonLines(processResult.stdout);
    await Promise.all([
      writeFile(rawStdoutPath, processResult.stdout),
      writeFile(rawStderrPath, processResult.stderr),
      writeFile(rawEventsPath, rawEvents),
    ]);

    const blockedReasons = [];
    if (authenticationBlocked) {
      blockedReasons.push(
        `Claude authentication preflight failed: ${claudeAuthentication.unavailable_reason}`,
      );
    } else if (processResult.timedOut) {
      blockedReasons.push(`reviewer timeout after ${timeoutMs}ms`);
    } else if (processResult.error) {
      blockedReasons.push(`reviewer process error: ${processResult.error}`);
    } else if (processResult.exitCode !== 0) {
      blockedReasons.push(`reviewer exit ${processResult.exitCode}`);
    }

    let report = null;
    if (await exists(reportPath)) {
      report = await readFile(reportPath, "utf8");
    } else {
      blockedReasons.push("review report is missing");
    }
    const reportValidation = report
      ? validateReport(report, configuration)
      : { valid: false, failures: ["report is missing"], metadata: {} };
    blockedReasons.push(...reportValidation.failures);
    const afterHashes = await hashProtectedInputs(taskRoot);
    const inputsUnchanged =
      canonicalJson(beforeHashes) === canonicalJson(afterHashes);
    if (!inputsUnchanged) {
      blockedReasons.push("protected input mutation detected");
    }
    const workspaceFiles = await filesBelow(workspace);
    const oraclePresent = workspaceFiles.some((path) =>
      /(^|\/)oracle(\/|$)|historical-task-review|findings\.json/i.test(path),
    );
    if (oraclePresent) {
      blockedReasons.push("oracle data is present in candidate workspace");
    }

    const oracle = JSON.parse(
      await readFile(join(fixtureRoot, "oracle", "findings.json"), "utf8"),
    );
    const quality = reportValidation.valid
      ? scoreFindings({
        oracleFindings: oracle.findings,
        candidateFindings: parseReportFindings(report),
      })
      : null;
    const validationEnded = performance.now();
    const intervals = {
      preflight_ms: preflightEnded - totalStarted,
      reviewer_ms: reviewerEnded - preflightEnded,
      validation_ms: validationEnded - reviewerEnded,
    };
    const totalMs = validationEnded - totalStarted;
    const intervalSum = Object.values(intervals).reduce(
      (sum, value) => sum + value,
      0,
    );
    const result = {
      schema_version: SCHEMA_VERSION,
      id: options.trial,
      variant: options.variant,
      trial: options.trial,
      block: options.block ?? null,
      status: blockedReasons.length === 0 ? "valid" : "blocked",
      blocked_reasons: blockedReasons,
      route: {
        primary_runtime: configuration.primaryRuntime,
        reviewer_runtime: configuration.runtime,
        model: configuration.model,
        effort: configuration.effort,
        invocation_route: configuration.route,
      },
      versions: {
        evaluator: "evaluate-task-review/v1",
        node: process.version,
        reviewer_cli: version,
      },
      hashes: {
        fixture_manifest: manifestHash,
        fixture_components: safeHashObject(manifest.components),
        contract: contractHash,
        prompt: sha256(prompt),
        price_basis: priceBasisHash,
        environment: safeHashObject({
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          path: baseEnvironment.PATH ?? null,
        }),
      },
      isolation: {
        workspace,
        task_root: taskRoot,
        runtime_homes: {
          claude: claudeHome,
          codex: codexHome,
          spectre: spectreHome,
        },
        oracle_present: oraclePresent,
      },
      protected_inputs: {
        before: beforeHashes,
        after: afterHashes,
      },
      process: {
        command: command.command,
        args: command.args,
        exit_code: processResult.exitCode,
        signal: processResult.signal,
        timed_out: processResult.timedOut,
        timeout_ms: timeoutMs,
        launched: !processResult.skipped,
        attempts: 1,
        retries: 0,
        repairs: 0,
        fallback: {
          value: null,
          unavailable_reason:
            "No fallback route was configured or attempted by this evaluator run.",
        },
      },
      authentication: {
        claude: claudeAuthentication,
      },
      lock: {
        path: lockFile,
        exclusive: true,
        attestation: lockAttestation,
      },
      validity: {
        first_pass: reportValidation.valid,
        report: reportValidation.valid,
        report_failures: reportValidation.failures,
        inputs_unchanged: inputsUnchanged,
        allowed_writes: !oraclePresent && inputsUnchanged,
      },
      telemetry: normalizeTelemetry(
        configuration.runtime,
        events,
        priceBasis,
        configuration.model,
      ),
      quality,
      evidence: {
        raw_stdout: relative(outputDirectory, rawStdoutPath),
        raw_stdout_sha256: await hashFile(rawStdoutPath),
        raw_stderr: relative(outputDirectory, rawStderrPath),
        raw_stderr_sha256: await hashFile(rawStderrPath),
        raw_events: relative(outputDirectory, rawEventsPath),
        raw_events_sha256: await hashFile(rawEventsPath),
        report: report ? relative(outputDirectory, reportPath) : null,
        report_sha256: report ? sha256(report) : null,
      },
      timing: {
        clock: "performance.now monotonic milliseconds",
        started_at: wallStarted,
        ended_at: new Date().toISOString(),
        total_ms: totalMs,
        intervals,
        reconciliation_error_ms: Math.abs(totalMs - intervalSum),
      },
    };
    await atomicWriteJson(join(outputDirectory, "result.json"), result);
    return result;
  } catch (error) {
    if (outputCreated && !(await exists(join(outputDirectory, "result.json")))) {
      const failedAt = performance.now();
      await atomicWriteJson(join(outputDirectory, "result.json"), {
        schema_version: SCHEMA_VERSION,
        id: options.trial,
        variant: options.variant,
        trial: options.trial,
        block: options.block ?? null,
        status: "blocked",
        blocked_reasons: [`evaluator error: ${error.message}`],
        timing: {
          clock: "performance.now monotonic milliseconds",
          started_at: wallStarted,
          ended_at: new Date().toISOString(),
          total_ms: failedAt - totalStarted,
        },
      });
    }
    throw error;
  } finally {
    if (stagedAuth) await rm(stagedAuth, { force: true });
    await rm(lockFile, { force: true });
  }
}

async function readRunResults(runsPath) {
  const resolved = resolve(runsPath);
  const information = await stat(resolved);
  if (information.isFile()) {
    const value = JSON.parse(await readFile(resolved, "utf8"));
    return Array.isArray(value) ? value : [value];
  }
  const results = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name === "result.json") {
        results.push(JSON.parse(await readFile(path, "utf8")));
      }
    }
  }
  await visit(resolved);
  return results;
}

async function summarize(options) {
  requireOptions(options, ["runs", "output"]);
  const runs = await readRunResults(options.runs);
  const summary = aggregateRuns(runs);
  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  await atomicWriteJson(output, summary);
  return summary;
}

export async function runCli(args, hooks = {}) {
  const { command, options } = parseArguments(args);
  if (command === "run") return runEvaluation(options, hooks);
  if (command === "summarize") return summarize(options);
  throw new Error(
    "usage: evaluate-task-review.mjs <run|summarize> [options]",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await runCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "blocked") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

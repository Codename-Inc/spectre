import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(testDirectory, "..", "..");
const evaluatorPath = join(repositoryRoot, "scripts", "evaluate-task-review.mjs");
const fakeReviewerPath = join(
  testDirectory,
  "fixtures",
  "fake-reviewer.mjs",
);
const fixtureRoot = join(
  testDirectory,
  "..",
  "fixtures",
  "task-review",
  "knowledge-surfacing-before",
);
const priceBasisPath = join(fixtureRoot, "pricing", "basis.json");

async function implementation() {
  return import(`${new URL(`file://${evaluatorPath}`).href}?t=${Date.now()}`);
}

async function runEvaluation(root, name, scenario, extra = []) {
  const { runCli } = await implementation();
  const outputDirectory = join(root, name);
  const timeoutMs = scenario === "timeout" ? "100" : "1000";
  const result = await runCli([
    "run",
    "--fixture",
    fixtureRoot,
    "--variant",
    "baseline-opus-max",
    "--trial",
    name,
    "--output-dir",
    outputDirectory,
    "--price-basis",
    priceBasisPath,
    "--reviewer-command",
    fakeReviewerPath,
    "--reviewer-arg",
    scenario,
    "--timeout-ms",
    timeoutMs,
    ...extra,
  ]);
  return {
    outputDirectory,
    result,
    persisted: JSON.parse(
      await readFile(join(outputDirectory, "result.json"), "utf8"),
    ),
  };
}

test("run isolates candidate inputs and homes, excludes oracle, and persists raw evidence atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-evaluator-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const early = await runEvaluation(
      root,
      "early",
      "early-success",
      ["--timeout-ms", "1000"],
    );
    const quiet = await runEvaluation(
      root,
      "quiet",
      "quiet-success",
      ["--timeout-ms", "1000"],
    );
    const scored = await runEvaluation(
      root,
      "scored",
      "scored-report",
      ["--timeout-ms", "1000"],
    );

    for (const run of [early, quiet, scored]) {
      assert.equal(run.result.status, "valid");
      assert.equal(run.persisted.status, "valid");
      assert.equal(run.persisted.validity.report, true);
      assert.equal(run.persisted.validity.inputs_unchanged, true);
      assert.deepEqual(
        run.persisted.protected_inputs.before,
        run.persisted.protected_inputs.after,
      );
      assert.equal(run.persisted.isolation.oracle_present, false);
      assert.notEqual(
        run.persisted.isolation.workspace,
        fixtureRoot,
      );
      assert.ok(run.persisted.isolation.runtime_homes.claude);
      assert.ok(run.persisted.isolation.runtime_homes.codex);
      assert.ok(run.persisted.evidence.raw_stdout_sha256);
      assert.ok(run.persisted.evidence.raw_stderr_sha256);
      assert.ok(run.persisted.evidence.raw_events_sha256);
      assert.ok(run.persisted.timing.total_ms >= 0);
      assert.ok(run.persisted.timing.intervals.reviewer_ms >= 0);
      assert.ok(run.persisted.timing.reconciliation_error_ms < 5);
      assert.deepEqual(
        (await readdir(run.outputDirectory)).filter((entry) =>
          entry.endsWith(".tmp"),
        ),
        [],
      );
    }

    assert.notEqual(
      early.persisted.isolation.workspace,
      quiet.persisted.isolation.workspace,
    );
    assert.equal(
      early.persisted.telemetry.cost.actual_runtime_usd.value,
      0.25,
    );
    assert.equal(
      quiet.persisted.telemetry.cost.actual_runtime_usd.value,
      null,
    );
    assert.match(
      quiet.persisted.telemetry.cost.actual_runtime_usd.unavailable_reason,
      /not exposed/i,
    );
    assert.equal(scored.persisted.quality.recall_by_severity.Blocker, 1);
    assert.equal(scored.persisted.quality.recall_by_severity.High, 0);
    assert.equal(scored.persisted.quality.unmatched_known.length, 39);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run blocks timeout, nonzero, missing or invalid reports, input mutation, reused output, and an active lock", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "task-review-evaluator-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const expectations = [
      ["timeout", "timeout", /timeout/i],
      ["nonzero", "nonzero", /exit 7/i],
      ["missing", "missing-report", /report.*missing/i],
      ["invalid", "invalid-report", /findings|metadata/i],
      ["mutation", "mutate-input", /protected input/i],
    ];

    for (const [name, scenario, reason] of expectations) {
      await t.test(scenario, async () => {
        const run = await runEvaluation(root, name, scenario);
        assert.equal(run.result.status, "blocked");
        assert.equal(run.persisted.status, "blocked");
        assert.match(run.persisted.blocked_reasons.join(" "), reason);
      });
    }

    const reused = join(root, "reused");
    await runEvaluation(root, "reused", "quiet-success");
    const { runCli } = await implementation();
    await assert.rejects(
      runCli([
        "run",
        "--fixture",
        fixtureRoot,
        "--variant",
        "baseline-opus-max",
        "--trial",
        "reused-again",
        "--output-dir",
        reused,
        "--price-basis",
        priceBasisPath,
        "--reviewer-command",
        fakeReviewerPath,
      ]),
      /output directory already exists/i,
    );

    await assert.rejects(
      runCli([
        "run",
        "--fixture",
        fixtureRoot,
        "--variant",
        "baseline-opus-max",
        "--trial",
        "locked",
        "--output-dir",
        join(root, "locked"),
        "--price-basis",
        priceBasisPath,
        "--reviewer-command",
        fakeReviewerPath,
        "--lock-file",
        join(root, ".held.lock"),
      ], {
        beforeLock: async ({ lockFile }) => {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(lockFile, "held\n");
        },
      }),
      /evaluation lock is held/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("normalizes Claude and Codex telemetry without inventing unavailable values", async () => {
  const { normalizeTelemetry } = await implementation();
  const priceBasis = JSON.parse(await readFile(priceBasisPath, "utf8"));
  const claude = normalizeTelemetry("claude-code", [
    {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Read" }],
      },
    },
    {
      type: "result",
      num_turns: 2,
      total_cost_usd: 0.125,
      duration_ms: 50,
      usage: {
        input_tokens: 100,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
        output_tokens: 40,
      },
    },
  ], priceBasis, "opus");
  assert.deepEqual(
    {
      input: claude.tokens.input.value,
      cached: claude.tokens.cached_input.value,
      cacheWrite: claude.tokens.cache_write_input.value,
      output: claude.tokens.output.value,
      reasoning: claude.tokens.reasoning_output.value,
      total: claude.tokens.total.value,
      tools: claude.tool_calls.value,
      messages: claude.messages.value,
      actual: claude.cost.actual_runtime_usd.value,
    },
    {
      input: 100,
      cached: 30,
      cacheWrite: 20,
      output: 40,
      reasoning: null,
      total: null,
      tools: 1,
      messages: 2,
      actual: 0.125,
    },
  );
  assert.match(
    claude.tokens.reasoning_output.unavailable_reason,
    /not exposed/i,
  );
  assert.equal(claude.cost.estimated_token_usd.label, "estimate");

  const codex = normalizeTelemetry("codex", [
    { type: "thread.started", thread_id: "thread-1" },
    { type: "turn.started" },
    {
      type: "item.completed",
      item: { type: "command_execution", command: "true" },
    },
    {
      type: "item.completed",
      item: { type: "agent_message", text: "done" },
    },
    {
      type: "turn.completed",
      usage: {
        input_tokens: 200,
        cached_input_tokens: 50,
        cache_write_input_tokens: 10,
        output_tokens: 30,
        reasoning_output_tokens: 7,
      },
    },
  ], priceBasis, "gpt-5.6-sol");
  assert.equal(codex.tokens.reasoning_output.value, 7);
  assert.equal(codex.tool_calls.value, 1);
  assert.equal(codex.messages.value, 1);
  assert.equal(codex.cost.actual_runtime_usd.value, null);
  assert.match(
    codex.cost.actual_runtime_usd.unavailable_reason,
    /not exposed/i,
  );
  assert.equal(codex.cost.estimated_token_usd.label, "estimate");
});

test("scores severity recall, weighted recall, duplicates, drift, scope errors, and adjudicated unmatched findings", async () => {
  const { scoreFindings } = await implementation();
  const oracle = [
    { id: "B", fingerprint: "b", severity: "Blocker" },
    { id: "H", fingerprint: "h", severity: "High" },
    { id: "M", fingerprint: "m", severity: "Medium" },
    { id: "L", fingerprint: "l", severity: "Low" },
  ];
  const candidates = [
    { id: "c1", fingerprint: "b", severity: "Blocker" },
    { id: "c2", fingerprint: "h", severity: "High" },
    { id: "c3", fingerprint: "h", severity: "High" },
    { id: "c4", fingerprint: "m", severity: "Low" },
    { id: "c5", severity: "High", scope_change: true },
    { id: "c6", severity: "Low" },
  ];
  const score = scoreFindings({
    oracleFindings: oracle,
    candidateFindings: candidates,
    adjudications: [
      {
        candidate_id: "c5",
        route_blind: true,
        disposition: "unsupported",
      },
    ],
  });

  assert.deepEqual(score.recall_by_severity, {
    Blocker: 1,
    High: 1,
    Medium: 1,
    Low: 0,
  });
  assert.equal(score.weighted_recall, 14 / 15);
  assert.equal(score.duplicate_count, 1);
  assert.deepEqual(score.severity_drift, [
    {
      candidate_id: "c4",
      oracle_id: "M",
      expected: "Medium",
      observed: "Low",
    },
  ]);
  assert.equal(score.false_scope_change_count, 1);
  assert.deepEqual(score.unmatched_known.map(({ id }) => id), ["L"]);
  assert.deepEqual(score.unmatched_candidates, [
    {
      id: "c5",
      status: "unsupported",
      route_blind: true,
    },
    {
      id: "c6",
      status: "unadjudicated",
      route_blind: false,
    },
  ]);
  assert.equal(score.supported_precision, 3 / 4);
});

test("summarizes valid runs with medians, ranges, and same-block paired deltas only", async () => {
  const { aggregateRuns } = await implementation();
  const summary = aggregateRuns([
    { id: "b1", variant: "baseline-opus-max", block: 1, status: "valid", timing: { total_ms: 100 } },
    { id: "c1", variant: "candidate-opus-medium", block: 1, status: "valid", timing: { total_ms: 60 } },
    { id: "b2", variant: "baseline-opus-max", block: 2, status: "valid", timing: { total_ms: 120 } },
    { id: "c2", variant: "candidate-opus-medium", block: 2, status: "blocked", timing: { total_ms: 50 } },
    { id: "b3", variant: "baseline-opus-max", block: 3, status: "invalid", timing: { total_ms: 80 } },
    { id: "c3", variant: "candidate-opus-medium", block: 3, status: "valid", timing: { total_ms: 70 } },
    { id: "s1", variant: "candidate-sol-medium", block: 1, status: "valid", timing: { total_ms: 80 } },
  ]);

  assert.deepEqual(summary.excluded.map(({ id }) => id), ["c2", "b3"]);
  assert.deepEqual(summary.variants["baseline-opus-max"].duration_ms, {
    individual: [100, 120],
    median: 110,
    range: [100, 120],
  });
  assert.deepEqual(
    summary.paired_deltas["candidate-opus-medium"],
    [{ block: 1, baseline_ms: 100, candidate_ms: 60, improvement_percent: 40 }],
  );
  assert.deepEqual(
    summary.paired_deltas["candidate-sol-medium"],
    [{ block: 1, baseline_ms: 100, candidate_ms: 80, improvement_percent: 20 }],
  );
});

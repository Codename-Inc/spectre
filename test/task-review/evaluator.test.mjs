import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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
    "--lock-file",
    join(root, `${name}.lock`),
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
    const authBridge = await runEvaluation(
      root,
      "auth-bridge",
      "auth-bridge",
      ["--timeout-ms", "1000"],
    );

    for (const run of [early, quiet, scored, authBridge]) {
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
    assert.deepEqual(authBridge.persisted.authentication.claude, {
      checked: false,
      logged_in: null,
      auth_method: null,
      api_provider: null,
      source: "default-secure-storage",
      unavailable_reason: "Custom reviewer command bypassed the real Claude auth preflight.",
    });
    const persistedEvidence = [
      await readFile(
        join(authBridge.outputDirectory, "result.json"),
        "utf8",
      ),
      await readFile(
        join(authBridge.outputDirectory, "raw", "reviewer.stdout.jsonl"),
        "utf8",
      ),
      await readFile(
        join(authBridge.outputDirectory, "raw", "reviewer.stderr.txt"),
        "utf8",
      ),
    ].join("\n");
    assert.doesNotMatch(
      persistedEvidence,
      /oauth[_-]?token|refresh[_-]?token|api[_-]?key|credentials?\.json/i,
    );
    await assert.rejects(
      stat(authBridge.persisted.isolation.runtime_homes.claude),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("authenticated real Claude host remains authenticated with isolated config and no copied credentials", async (t) => {
  const realClaudeBinary = process.env.CLAUDE_BIN || "claude";
  const ambient = spawnSync(
    realClaudeBinary,
    ["auth", "status", "--json"],
    { encoding: "utf8", timeout: 5_000 },
  );
  if (ambient.status !== 0) {
    t.skip("real Claude host is not authenticated");
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "task-review-claude-auth-"));
  const previousClaudeBinary = process.env.CLAUDE_BIN;
  try {
    const { probeClaudeAuthentication } = await implementation();
    assert.equal(typeof probeClaudeAuthentication, "function");
    const result = probeClaudeAuthentication(
      realClaudeBinary,
      root,
    );

    assert.deepEqual(result, {
      checked: true,
      logged_in: true,
      auth_method: "claude.ai",
      api_provider: "firstParty",
      source: "default-secure-storage",
      unavailable_reason: null,
    });
    assert.equal((await readdir(root)).includes(".credentials.json"), false);
    assert.doesNotMatch(
      JSON.stringify(result),
      /email|org(?:id|name)|oauth[_-]?token|refresh[_-]?token|api[_-]?key/i,
    );

    process.env.CLAUDE_BIN = fakeReviewerPath;
    let finalReviewerAuth;
    const outputDirectory = join(root, "constructed-reviewer-env");
    const run = await (await implementation()).runCli([
      "run",
      "--fixture",
      fixtureRoot,
      "--variant",
      "baseline-opus-max",
      "--trial",
      "constructed-reviewer-env",
      "--output-dir",
      outputDirectory,
      "--lock-file",
      join(root, "constructed-reviewer-env.lock"),
      "--price-basis",
      priceBasisPath,
      "--timeout-ms",
      "1000",
    ], {
      beforeReviewer: ({ environment }) => {
        finalReviewerAuth = spawnSync(
          realClaudeBinary,
          ["auth", "status", "--json"],
          { encoding: "utf8", env: environment, timeout: 5_000 },
        );
      },
    });
    assert.equal(run.status, "valid");
    assert.equal(
      finalReviewerAuth.status,
      0,
      finalReviewerAuth.stderr || finalReviewerAuth.stdout,
    );
    assert.equal(
      JSON.parse(finalReviewerAuth.stdout).loggedIn,
      true,
    );
    const persistedResult = await readFile(
      join(outputDirectory, "result.json"),
      "utf8",
    );
    assert.doesNotMatch(persistedResult, /"HOME"\s*:/);
    assert.doesNotMatch(
      persistedResult,
      /oauth[_-]?token|refresh[_-]?token|api[_-]?key|credentials?\.json/i,
    );
  } finally {
    if (previousClaudeBinary === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = previousClaudeBinary;
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude auth and reviewer use host HOME while writable runtime, temp, and XDG paths stay isolated", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-home-auth-"));
  const hostHome = join(root, "host-home");
  const previousHome = process.env.HOME;
  const previousClaudeBinary = process.env.CLAUDE_BIN;
  const previousHomeSensitiveAuth =
    process.env.TASK_REVIEW_FAKE_HOME_SENSITIVE_AUTH;
  await mkdir(hostHome);
  await writeFile(join(hostHome, ".home-sensitive-auth"), "present\n");
  await chmod(fakeReviewerPath, 0o755);
  process.env.HOME = hostHome;
  process.env.CLAUDE_BIN = fakeReviewerPath;
  process.env.TASK_REVIEW_FAKE_HOME_SENSITIVE_AUTH = "1";

  try {
    const { runCli } = await implementation();
    let reviewerContext;
    let debugMessage;
    const outputDirectory = join(root, "evidence");
    const result = await runCli([
      "run",
      "--fixture",
      fixtureRoot,
      "--variant",
      "baseline-opus-max",
      "--trial",
      "home-sensitive-auth",
      "--output-dir",
      outputDirectory,
      "--lock-file",
      join(root, "home-sensitive-auth.lock"),
      "--price-basis",
      priceBasisPath,
      "--timeout-ms",
      "1000",
    ], {
      beforeReviewer: (context) => {
        reviewerContext = context;
      },
      debugLog: (message) => {
        debugMessage = message;
      },
    });

    assert.equal(result.status, "valid");
    assert.equal(result.authentication.claude.logged_in, true);
    assert.equal(result.process.launched, true);
    assert.match(
      debugMessage,
      /^\[🪳 TEMP CLAUDE_AUTH_HOME\] host_home_bridge=true reviewer_home_keychain_bridge=true$/,
    );
    assert.doesNotMatch(debugMessage, new RegExp(
      hostHome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ));
    assert.equal(reviewerContext.environment.HOME, hostHome);
    const reviewerAuth = spawnSync(
      fakeReviewerPath,
      ["auth", "status", "--json"],
      {
        encoding: "utf8",
        env: reviewerContext.environment,
        timeout: 5_000,
      },
    );
    assert.equal(reviewerAuth.status, 0);
    assert.equal(JSON.parse(reviewerAuth.stdout).loggedIn, true);
    for (const key of [
      "TMPDIR",
      "TMP",
      "TEMP",
      "XDG_CONFIG_HOME",
      "XDG_CACHE_HOME",
      "XDG_DATA_HOME",
      "XDG_STATE_HOME",
      "XDG_RUNTIME_DIR",
      "CLAUDE_CONFIG_DIR",
      "CODEX_HOME",
      "SPECTRE_HOME",
    ]) {
      assert.ok(reviewerContext.environment[key], `${key} is isolated`);
      assert.equal(
        reviewerContext.environment[key].includes(hostHome),
        false,
      );
    }
    assert.equal(result.process.args.includes("--safe-mode"), true);
    assert.equal(
      result.process.args.includes("--dangerously-skip-permissions"),
      false,
    );
    assert.equal(result.process.args.includes("--add-dir"), false);
    assert.equal(
      result.process.args[result.process.args.indexOf("--tools") + 1],
      "Read,Glob,Grep,Write",
    );
    assert.equal(
      result.process.args[
        result.process.args.indexOf("--allowedTools") + 1
      ],
      "Read,Glob,Grep,Write",
    );
    const persistedEvidence = [
      await readFile(join(outputDirectory, "result.json"), "utf8"),
      await readFile(
        join(outputDirectory, "raw", "reviewer.stdout.jsonl"),
        "utf8",
      ),
      await readFile(
        join(outputDirectory, "raw", "reviewer.stderr.txt"),
        "utf8",
      ),
    ].join("\n");
    assert.doesNotMatch(
      persistedEvidence,
      new RegExp(hostHome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(
      persistedEvidence,
      /oauth[_-]?token|refresh[_-]?token|api[_-]?key|credentials?\.json/i,
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousClaudeBinary === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = previousClaudeBinary;
    if (previousHomeSensitiveAuth === undefined) {
      delete process.env.TASK_REVIEW_FAKE_HOME_SENSITIVE_AUTH;
    } else {
      process.env.TASK_REVIEW_FAKE_HOME_SENSITIVE_AUTH =
        previousHomeSensitiveAuth;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude command allows only review read tools and Write, persists the report, and keeps missing-report blocked", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-claude-command-"));
  const previousClaudeBinary = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = fakeReviewerPath;
  await chmod(fakeReviewerPath, 0o755);
  try {
    const { runCli } = await implementation();
    const outputDirectory = join(root, "standard-claude");
    const persisted = await runCli([
      "run",
      "--fixture",
      fixtureRoot,
      "--variant",
      "baseline-opus-max",
      "--trial",
      "standard-claude",
      "--output-dir",
      outputDirectory,
      "--lock-file",
      join(root, "standard-claude.lock"),
      "--price-basis",
      priceBasisPath,
      "--timeout-ms",
      "1000",
    ]);

    assert.equal(persisted.status, "valid");
    assert.equal(persisted.process.exit_code, 0);
    assert.equal(persisted.validity.report, true);
    assert.equal(
      persisted.process.args[persisted.process.args.indexOf("--tools") + 1],
      "Read,Glob,Grep,Write",
    );
    assert.equal(
      persisted.process.args[
        persisted.process.args.indexOf("--allowedTools") + 1
      ],
      "Read,Glob,Grep,Write",
    );
    assert.equal(persisted.process.args.includes("Bash"), false);
    assert.equal(persisted.process.args.includes("Edit"), false);

    const missing = await runEvaluation(root, "still-missing", "missing-report");
    assert.equal(missing.persisted.status, "blocked");
    assert.match(
      missing.persisted.blocked_reasons.join(" "),
      /report.*missing/i,
    );
  } finally {
    if (previousClaudeBinary === undefined) {
      delete process.env.CLAUDE_BIN;
    } else {
      process.env.CLAUDE_BIN = previousClaudeBinary;
    }
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
      [
        "historical-malformed",
        "historical-markdown-malformed",
        /timestamp|effort|route/i,
      ],
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

test("accepts numbered report headings and Markdown list/bold metadata without relaxing values", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-historical-report-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const run = await runEvaluation(
      root,
      "historical",
      "historical-markdown-report",
    );

    assert.equal(run.persisted.status, "blocked");
    assert.equal(run.persisted.validity.report, true);
    assert.deepEqual(run.persisted.validity.report_failures, []);
    assert.equal(run.persisted.quality.recall_by_severity.Blocker, 0);
    assert.match(
      run.persisted.blocked_reasons.join(" "),
      /Blocker recall.*100%/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps execution workspace and runtime homes outside a requested in-repo evidence directory", async () => {
  const inRepoRoot = await mkdtemp(
    join(repositoryRoot, ".task-review-isolation-test-"),
  );
  const previousClaudeBinary = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = fakeReviewerPath;
  await chmod(fakeReviewerPath, 0o755);
  try {
    const { runCli } = await implementation();
    const outputDirectory = join(inRepoRoot, "evidence");
    let reviewerContext;
    const result = await runCli([
      "run",
      "--fixture",
      fixtureRoot,
      "--variant",
      "baseline-opus-max",
      "--trial",
      "in-repo-output",
      "--output-dir",
      outputDirectory,
      "--lock-file",
      join(inRepoRoot, "evaluation.lock"),
      "--price-basis",
      priceBasisPath,
      "--timeout-ms",
      "1000",
    ], {
      beforeReviewer: (context) => {
        reviewerContext = context;
      },
    });

    assert.equal(result.status, "valid");
    assert.equal(
      result.isolation.execution_workspace.startsWith(repositoryRoot),
      false,
    );
    assert.equal(
      result.isolation.execution_cwd,
      result.isolation.execution_workspace,
    );
    assert.equal(result.isolation.workspace.startsWith(outputDirectory), true);
    assert.equal(
      Object.values(result.isolation.runtime_homes).some((path) =>
        path.startsWith(repositoryRoot),
      ),
      false,
    );
    assert.doesNotMatch(JSON.stringify(result.process.args), new RegExp(
      repositoryRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ));
    assert.equal(reviewerContext.workspace, result.isolation.execution_workspace);
    assert.equal(
      Object.values(reviewerContext.environment).some(
        (value) =>
          typeof value === "string" && value.includes(repositoryRoot),
      ),
      false,
    );
    assert.equal(
      reviewerContext.environment.HOME.startsWith(repositoryRoot),
      false,
    );
    assert.deepEqual(await readdir(result.isolation.workspace), ["docs"]);
    await assert.rejects(stat(result.isolation.execution_workspace), /ENOENT/);
    await assert.rejects(
      stat(result.isolation.runtime_homes.claude),
      /ENOENT/,
    );
    await assert.rejects(stat(join(outputDirectory, "runtime")), /ENOENT/);
  } finally {
    if (previousClaudeBinary === undefined) {
      delete process.env.CLAUDE_BIN;
    } else {
      process.env.CLAUDE_BIN = previousClaudeBinary;
    }
    await rm(inRepoRoot, { recursive: true, force: true });
  }
});

test("repairs a blocked historical result immutably without rerunning the model and gates on Blocker recall", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-repair-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const source = await runEvaluation(
      root,
      "source",
      "historical-markdown-scored-report",
    );
    const sourceResultPath = join(source.outputDirectory, "result.json");
    const blockedSource = {
      ...source.persisted,
      status: "blocked",
      blocked_reasons: [
        "report is missing a Findings section",
        "report metadata mode expected \"adversarial\", found null",
      ],
      validity: {
        ...source.persisted.validity,
        first_pass: false,
        report: false,
        report_failures: [
          "report is missing a Findings section",
          "report metadata mode expected \"adversarial\", found null",
        ],
      },
      quality: null,
    };
    await writeFile(
      sourceResultPath,
      `${JSON.stringify(blockedSource, null, 2)}\n`,
    );
    const sourceResultBefore = await readFile(sourceResultPath);
    const sourceReportPath = join(
      source.outputDirectory,
      source.persisted.evidence.report,
    );
    const sourceReportBefore = await readFile(sourceReportPath);

    const { runCli } = await implementation();
    const repairedDirectory = join(root, "repaired");
    const repaired = await runCli([
      "repair",
      "--source-result",
      sourceResultPath,
      "--fixture",
      fixtureRoot,
      "--output-dir",
      repairedDirectory,
    ]);

    assert.equal(repaired.status, "valid");
    assert.equal(repaired.validity.first_pass, false);
    assert.equal(repaired.validity.report, true);
    assert.equal(repaired.process.repairs, 1);
    assert.equal(repaired.repair.model_rerun, false);
    assert.ok(repaired.repair.elapsed_ms >= 0);
    assert.equal(
      repaired.derivation.source_total_ms,
      blockedSource.timing.total_ms,
    );
    assert.equal(repaired.quality.recall_by_severity.Blocker, 1);
    assert.ok(repaired.derivation.source_result_sha256);
    assert.equal(
      repaired.derivation.source_report_sha256,
      blockedSource.evidence.report_sha256,
    );
    assert.deepEqual(await readFile(sourceResultPath), sourceResultBefore);
    assert.deepEqual(await readFile(sourceReportPath), sourceReportBefore);
    assert.deepEqual(
      JSON.parse(
        await readFile(join(repairedDirectory, "result.json"), "utf8"),
      ),
      repaired,
    );

    const missingBlocker = await runEvaluation(
      root,
      "source-missing-blocker",
      "historical-markdown-report",
    );
    const missingBlockerResultPath = join(
      missingBlocker.outputDirectory,
      "result.json",
    );
    const blockedWithoutRecall = {
      ...missingBlocker.persisted,
      status: "blocked",
      blocked_reasons: ["report is missing a Findings section"],
      validity: {
        ...missingBlocker.persisted.validity,
        first_pass: false,
        report: false,
        report_failures: ["report is missing a Findings section"],
      },
      quality: null,
    };
    await writeFile(
      missingBlockerResultPath,
      `${JSON.stringify(blockedWithoutRecall, null, 2)}\n`,
    );
    const missingBlockerBefore = await readFile(missingBlockerResultPath);
    const blockedRepair = await runCli([
      "repair",
      "--source-result",
      missingBlockerResultPath,
      "--fixture",
      fixtureRoot,
      "--output-dir",
      join(root, "repaired-missing-blocker"),
    ]);

    assert.equal(blockedRepair.status, "blocked");
    assert.equal(blockedRepair.quality.recall_by_severity.Blocker, 0);
    assert.match(
      blockedRepair.blocked_reasons.join(" "),
      /Blocker recall.*100%/i,
    );
    assert.deepEqual(
      await readFile(missingBlockerResultPath),
      missingBlockerBefore,
    );

    const contaminated = await runEvaluation(
      root,
      "contaminated-source",
      "historical-markdown-scored-report",
    );
    const contaminatedResultPath = join(
      contaminated.outputDirectory,
      "result.json",
    );
    const contaminatedSource = {
      ...contaminated.persisted,
      status: "blocked",
      blocked_reasons: ["legacy execution workspace was inside the live repo"],
      isolation: {
        ...contaminated.persisted.isolation,
        execution_isolated: false,
        contamination: {
          live_repository_accessible_from_workspace_ancestors: true,
          oracle_present: false,
        },
      },
    };
    await writeFile(
      contaminatedResultPath,
      `${JSON.stringify(contaminatedSource, null, 2)}\n`,
    );
    const contaminatedRepairDirectory = join(root, "contaminated-repair");
    await assert.rejects(
      runCli([
        "repair",
        "--source-result",
        contaminatedResultPath,
        "--fixture",
        fixtureRoot,
        "--output-dir",
        contaminatedRepairDirectory,
      ]),
      /uncontaminated isolated-execution attestation/i,
    );
    await assert.rejects(stat(contaminatedRepairDirectory), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repair-model reruns the same route in isolation and derives valid evidence without changing a missing-report source", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-model-repair-"));
  const previousClaudeBinary = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = fakeReviewerPath;
  await chmod(fakeReviewerPath, 0o755);
  try {
    const source = await runEvaluation(
      root,
      "source-missing-report",
      "missing-report",
    );
    assert.equal(source.persisted.status, "blocked");
    assert.equal(source.persisted.evidence.report, null);
    const sourcePaths = [
      join(source.outputDirectory, "result.json"),
      join(source.outputDirectory, source.persisted.evidence.raw_stdout),
      join(source.outputDirectory, source.persisted.evidence.raw_stderr),
      join(source.outputDirectory, source.persisted.evidence.raw_events),
    ];
    const sourceBefore = await Promise.all(
      sourcePaths.map((path) => readFile(path)),
    );

    let reviewerContext;
    const { runCli } = await implementation();
    const outputDirectory = join(root, "derived");
    const repaired = await runCli([
      "repair-model",
      "--source-result",
      join(source.outputDirectory, "result.json"),
      "--fixture",
      fixtureRoot,
      "--output-dir",
      outputDirectory,
      "--lock-file",
      join(root, "repair.lock"),
      "--timeout-ms",
      "1000",
    ], {
      beforeReviewer: (context) => {
        reviewerContext = context;
      },
    });

    assert.equal(repaired.status, "valid");
    assert.equal(repaired.variant, source.persisted.variant);
    assert.deepEqual(repaired.route, source.persisted.route);
    assert.equal(repaired.process.attempts, 2);
    assert.equal(repaired.process.repairs, 1);
    assert.equal(repaired.process.fallback.value, null);
    assert.equal(repaired.repair.model_rerun, true);
    assert.equal(repaired.repair.kind, "same-route-report-only");
    assert.equal(repaired.validity.first_pass, false);
    assert.equal(repaired.validity.report, true);
    assert.equal(repaired.validity.inputs_unchanged, true);
    assert.equal(repaired.validity.allowed_writes, true);
    assert.equal(repaired.quality.recall_by_severity.Blocker, 1);
    assert.deepEqual(repaired.telemetry.source, source.persisted.telemetry);
    assert.equal(repaired.telemetry.repair.cost.actual_runtime_usd.label, "actual");
    assert.equal(
      repaired.telemetry.repair.cost.estimated_token_usd.label,
      "estimate",
    );
    assert.equal(
      repaired.timing.source_total_ms,
      source.persisted.timing.total_ms,
    );
    assert.ok(repaired.timing.repair_total_ms >= 0);
    assert.equal(
      repaired.timing.total_ms,
      repaired.timing.source_total_ms + repaired.timing.repair_total_ms,
    );
    assert.ok(repaired.derivation.source_result_sha256);
    assert.equal(repaired.derivation.source_report_sha256, null);
    assert.ok(repaired.evidence.raw_stdout_sha256);
    assert.ok(repaired.evidence.raw_stderr_sha256);
    assert.ok(repaired.evidence.raw_events_sha256);
    assert.ok(repaired.evidence.report_sha256);
    assert.equal(
      repaired.isolation.execution_workspace.startsWith(repositoryRoot),
      false,
    );
    assert.equal(repaired.isolation.oracle_present, false);
    assert.equal(
      Object.values(repaired.isolation.runtime_homes).some((path) =>
        path.startsWith(repositoryRoot),
      ),
      false,
    );
    assert.equal(repaired.process.args.includes("--safe-mode"), true);
    assert.equal(
      repaired.process.args[repaired.process.args.indexOf("--tools") + 1],
      "Read,Glob,Grep,Write",
    );
    assert.equal(
      repaired.process.args[
        repaired.process.args.indexOf("--allowedTools") + 1
      ],
      "Read,Glob,Grep,Write",
    );
    assert.equal(repaired.process.args.includes("Bash"), false);
    assert.equal(repaired.process.args.includes("Edit"), false);
    assert.match(reviewerContext.prompt, /report-only repair/i);
    assert.match(
      reviewerContext.prompt,
      new RegExp(`Reviewer Model: ${source.persisted.route.model}`),
    );
    assert.match(
      reviewerContext.prompt,
      new RegExp(`Reviewer Effort: ${source.persisted.route.effort}`),
    );
    assert.doesNotMatch(reviewerContext.prompt, /oracle|historical findings/i);
    assert.equal(
      reviewerContext.workspace,
      repaired.isolation.execution_workspace,
    );
    assert.deepEqual(
      await Promise.all(sourcePaths.map((path) => readFile(path))),
      sourceBefore,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(outputDirectory, "result.json"), "utf8")),
      repaired,
    );
    await assert.rejects(
      stat(repaired.isolation.execution_workspace),
      /ENOENT/,
    );

    const invalidSource = await runEvaluation(
      root,
      "source-invalid-report",
      "invalid-report",
    );
    const invalidReportPath = join(
      invalidSource.outputDirectory,
      invalidSource.persisted.evidence.report,
    );
    const invalidReportBefore = await readFile(invalidReportPath);
    const repairedInvalid = await runCli([
      "repair-model",
      "--source-result",
      join(invalidSource.outputDirectory, "result.json"),
      "--fixture",
      fixtureRoot,
      "--output-dir",
      join(root, "derived-invalid"),
      "--lock-file",
      join(root, "repair-invalid.lock"),
      "--timeout-ms",
      "1000",
    ]);
    assert.equal(repairedInvalid.status, "valid");
    assert.deepEqual(await readFile(invalidReportPath), invalidReportBefore);
  } finally {
    if (previousClaudeBinary === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = previousClaudeBinary;
    await rm(root, { recursive: true, force: true });
  }
});

test("repair-model rejects contaminated or tampered sources and blocks non-report writes without mutating source evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-model-repair-guard-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const { runCli } = await implementation();
    const source = await runEvaluation(
      root,
      "source-invalid-report",
      "invalid-report",
    );
    const sourceResultPath = join(source.outputDirectory, "result.json");
    const sourceReportPath = join(
      source.outputDirectory,
      source.persisted.evidence.report,
    );
    const sourceBefore = {
      result: await readFile(sourceResultPath),
      report: await readFile(sourceReportPath),
      raw: await readFile(
        join(source.outputDirectory, source.persisted.evidence.raw_stdout),
      ),
    };
    const blocked = await runCli([
      "repair-model",
      "--source-result",
      sourceResultPath,
      "--fixture",
      fixtureRoot,
      "--output-dir",
      join(root, "write-violation"),
      "--lock-file",
      join(root, "write-violation.lock"),
      "--reviewer-command",
      fakeReviewerPath,
      "--reviewer-arg",
      "mutate-input",
      "--timeout-ms",
      "1000",
    ]);

    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.validity.allowed_writes, false);
    assert.equal(blocked.validity.inputs_unchanged, false);
    assert.match(
      blocked.blocked_reasons.join(" "),
      /protected input|non-report write/i,
    );
    assert.deepEqual(await readFile(sourceResultPath), sourceBefore.result);
    assert.deepEqual(await readFile(sourceReportPath), sourceBefore.report);
    assert.deepEqual(
      await readFile(
        join(source.outputDirectory, source.persisted.evidence.raw_stdout),
      ),
      sourceBefore.raw,
    );

    const cleanResultBytes = await readFile(sourceResultPath);
    await writeFile(
      sourceResultPath,
      `${JSON.stringify({
        ...source.persisted,
        isolation: {
          ...source.persisted.isolation,
          contamination: {
            ...source.persisted.isolation.contamination,
            oracle_present: true,
          },
          oracle_present: true,
        },
      }, null, 2)}\n`,
    );
    await assert.rejects(
      runCli([
        "repair-model",
        "--source-result",
        sourceResultPath,
        "--fixture",
        fixtureRoot,
        "--output-dir",
        join(root, "contaminated-output"),
      ]),
      /clean isolated-execution attestation/i,
    );
    await writeFile(sourceResultPath, cleanResultBytes);

    const tamperedRawPath = join(
      source.outputDirectory,
      source.persisted.evidence.raw_stdout,
    );
    await writeFile(tamperedRawPath, "tampered\n");
    await assert.rejects(
      runCli([
        "repair-model",
        "--source-result",
        sourceResultPath,
        "--fixture",
        fixtureRoot,
        "--output-dir",
        join(root, "tampered-output"),
      ]),
      /raw stdout hash mismatch/i,
    );

    await assert.rejects(
      runCli([
        "repair-model",
        "--source-result",
        sourceResultPath,
        "--fixture",
        fixtureRoot,
        "--output-dir",
        join(root, "write-violation"),
      ]),
      /output directory already exists/i,
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

test("route-blind matching recognizes a KS-001 paraphrase without an oracle fingerprint and records severity drift", async () => {
  const { scoreFindings } = await implementation();
  const oracle = JSON.parse(
    await readFile(join(fixtureRoot, "oracle", "findings.json"), "utf8"),
  );
  const score = scoreFindings({
    oracleFindings: oracle.findings,
    candidateFindings: [
      {
        id: "candidate-1",
        severity: "High",
        lens: "Integration + Coverage",
        location:
          "tasks.json 0.1.1, 0.1.2, 1.2.3; execute.md Wave Plan",
        finding:
          "The graph has no pre-migration real-host stop gate: the early tasks document or emit a probe, but never execute it before migration begins.",
        suggested_edit:
          "Add a real-host verification task after 1.2.3 and gate migration on its success.",
      },
    ],
  });

  assert.equal(score.recall_by_severity.Blocker, 1);
  assert.deepEqual(score.severity_drift, [
    {
      candidate_id: "candidate-1",
      oracle_id: "KS-001",
      expected: "Blocker",
      observed: "High",
    },
  ]);
  assert.deepEqual(score.matches, [
    {
      candidate_id: "candidate-1",
      oracle_id: "KS-001",
      method: "route-blind-semantic",
    },
  ]);

  const adjudicated = scoreFindings({
    oracleFindings: [oracle.findings[0]],
    candidateFindings: [
      {
        id: "candidate-ambiguous",
        severity: "Blocker",
        lens: "Coverage",
        location: "tasks.json",
        finding: "A broad finding requiring blinded human resolution.",
      },
    ],
    adjudications: [
      {
        candidate_id: "candidate-ambiguous",
        oracle_id: "KS-001",
        route_blind: true,
        disposition: "supported",
      },
    ],
  });
  assert.equal(adjudicated.recall_by_severity.Blocker, 1);
  assert.equal(adjudicated.matches[0].method, "route-blind-adjudication");

  const ambiguous = scoreFindings({
    oracleFindings: [
      oracle.findings[0],
      {
        ...oracle.findings[0],
        id: "KS-001-ambiguous-copy",
        fingerprint: "different-fingerprint",
      },
    ],
    candidateFindings: [
      {
        id: "candidate-ambiguous",
        severity: "Blocker",
        lens: "Integration + Coverage",
        location:
          "tasks.json 0.1.1, 0.1.2, 1.2.3; execute.md Wave Plan",
        finding:
          "The graph has no pre-migration real-host stop gate before migration.",
        suggested_edit:
          "Add real-host verification after 1.2.3 and gate migration.",
      },
    ],
  });
  assert.deepEqual(ambiguous.matches, []);
  assert.deepEqual(ambiguous.unmatched_candidates, [
    {
      id: "candidate-ambiguous",
      status: "unadjudicated",
      route_blind: false,
    },
  ]);
});

test("adjudication-packet emits only route-blind candidate and oracle evidence and rejects contaminated sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-adjudication-packet-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const source = await runEvaluation(
      root,
      "ambiguous-source",
      "ambiguous-blocker-report",
    );
    assert.equal(source.persisted.status, "blocked");
    assert.equal(source.persisted.validity.report, true);
    assert.equal(source.persisted.quality.recall_by_severity.Blocker, 0);

    const { runCli } = await implementation();
    const packetPath = join(root, "adjudication-packet.json");
    const packet = await runCli([
      "adjudication-packet",
      "--source-result",
      join(source.outputDirectory, "result.json"),
      "--fixture",
      fixtureRoot,
      "--output",
      packetPath,
    ]);

    assert.deepEqual(Object.keys(packet).sort(), [
      "candidates",
      "oracles",
      "schema_version",
      "source",
    ]);
    assert.deepEqual(Object.keys(packet.candidates[0]).sort(), [
      "candidate_id",
      "edit",
      "finding",
      "lens",
      "location",
    ]);
    assert.deepEqual(Object.keys(packet.oracles[0]).sort(), [
      "match",
      "oracle_id",
      "source_evidence",
    ]);
    assert.deepEqual(Object.keys(packet.oracles[0].match).sort(), [
      "defect_class",
      "lens",
      "locations",
    ]);
    assert.equal(packet.candidates[0].candidate_id, "1");
    assert.equal(packet.oracles[0].oracle_id, "KS-001");
    const packetFields = JSON.stringify(packet, (_key, value) => value);
    for (const forbidden of [
      '"severity"',
      '"fingerprint"',
      '"route"',
      '"variant"',
      '"model"',
      '"runtime"',
      '"cost"',
      '"timing"',
    ]) {
      assert.equal(packetFields.includes(forbidden), false, forbidden);
    }
    assert.deepEqual(
      JSON.parse(await readFile(packetPath, "utf8")),
      packet,
    );

    const contaminatedResultPath = join(
      source.outputDirectory,
      "result.json",
    );
    await writeFile(
      contaminatedResultPath,
      `${JSON.stringify({
        ...source.persisted,
        isolation: {
          ...source.persisted.isolation,
          contamination: {
            ...source.persisted.isolation.contamination,
            oracle_present: true,
          },
          oracle_present: true,
        },
      }, null, 2)}\n`,
    );
    await assert.rejects(
      runCli([
        "adjudication-packet",
        "--source-result",
        contaminatedResultPath,
        "--fixture",
        fixtureRoot,
        "--output",
        join(root, "contaminated-packet.json"),
      ]),
      /clean isolated-execution attestation/i,
    );
    await assert.rejects(
      runCli([
        "adjudication-packet",
        "--source-result",
        contaminatedResultPath,
        "--fixture",
        fixtureRoot,
        "--output",
        packetPath,
      ]),
      /already exists/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("adjudicate resolves an ambiguous known Blocker route-blindly while preserving source evidence and severity drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-adjudicate-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const source = await runEvaluation(
      root,
      "ambiguous-source",
      "ambiguous-blocker-report",
    );
    assert.equal(source.persisted.status, "blocked");
    assert.deepEqual(source.persisted.quality.matches, []);
    const sourceResultPath = join(source.outputDirectory, "result.json");
    const sourcePaths = [
      sourceResultPath,
      join(source.outputDirectory, source.persisted.evidence.raw_stdout),
      join(source.outputDirectory, source.persisted.evidence.raw_stderr),
      join(source.outputDirectory, source.persisted.evidence.raw_events),
      join(source.outputDirectory, source.persisted.evidence.report),
    ];
    const sourceBefore = await Promise.all(
      sourcePaths.map((path) => readFile(path)),
    );
    const adjudicationsPath = join(root, "adjudications.json");
    await writeFile(
      adjudicationsPath,
      `${JSON.stringify([
        {
          candidate_id: "1",
          oracle_id: "KS-001",
          route_blind: true,
          disposition: "supported",
        },
      ], null, 2)}\n`,
    );

    const { runCli } = await implementation();
    const outputDirectory = join(root, "adjudicated");
    const result = await runCli([
      "adjudicate",
      "--source-result",
      sourceResultPath,
      "--fixture",
      fixtureRoot,
      "--adjudications",
      adjudicationsPath,
      "--output-dir",
      outputDirectory,
    ]);

    assert.equal(result.status, "valid");
    assert.equal(result.validity.first_pass, false);
    assert.equal(result.validity.report, true);
    assert.equal(result.quality.recall_by_severity.Blocker, 1);
    assert.deepEqual(result.quality.matches, [
      {
        candidate_id: "1",
        oracle_id: "KS-001",
        method: "route-blind-adjudication",
      },
    ]);
    assert.deepEqual(result.quality.severity_drift, [
      {
        candidate_id: "1",
        oracle_id: "KS-001",
        expected: "Blocker",
        observed: "High",
      },
    ]);
    assert.equal(result.blocked_reasons.length, 0);
    assert.equal(result.derivation.kind, "route-blind-adjudication");
    assert.ok(result.derivation.source_result_sha256);
    assert.ok(result.derivation.source_report_sha256);
    assert.ok(result.derivation.adjudication_packet_sha256);
    assert.ok(result.derivation.adjudications_sha256);
    assert.deepEqual(
      await Promise.all(sourcePaths.map((path) => readFile(path))),
      sourceBefore,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(outputDirectory, "result.json"), "utf8")),
      result,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("adjudicate rejects malformed, duplicate, unknown, or route-revealing records without reusing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-adjudicate-guard-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const source = await runEvaluation(
      root,
      "ambiguous-source",
      "ambiguous-blocker-report",
    );
    const sourceResultPath = join(source.outputDirectory, "result.json");
    const sourceBefore = await readFile(sourceResultPath);
    const { runCli } = await implementation();
    const cases = [
      {
        name: "malformed",
        records: [{
          candidate_id: "",
          oracle_id: "KS-001",
          route_blind: true,
          disposition: "supported",
        }],
        error: /malformed candidate id/i,
      },
      {
        name: "duplicate",
        records: [
          {
            candidate_id: "1",
            oracle_id: "KS-001",
            route_blind: true,
            disposition: "supported",
          },
          {
            candidate_id: "1",
            route_blind: true,
            disposition: "unsupported",
          },
        ],
        error: /duplicate candidate id/i,
      },
      {
        name: "unknown",
        records: [{
          candidate_id: "missing",
          route_blind: true,
          disposition: "unsupported",
        }],
        error: /unknown candidate id/i,
      },
      {
        name: "unknown-oracle",
        records: [{
          candidate_id: "1",
          oracle_id: "KS-999",
          route_blind: true,
          disposition: "supported",
        }],
        error: /unknown oracle id/i,
      },
      {
        name: "route-revealing",
        records: [{
          candidate_id: "1",
          oracle_id: "KS-001",
          route_blind: true,
          disposition: "supported",
          reviewer_runtime: "Claude Code",
        }],
        error: /forbidden.*runtime|unknown field/i,
      },
      {
        name: "not-route-blind",
        records: [{
          candidate_id: "1",
          oracle_id: "KS-001",
          route_blind: false,
          disposition: "supported",
        }],
        error: /route_blind.*true/i,
      },
    ];
    for (const item of cases) {
      const adjudicationsPath = join(root, `${item.name}.json`);
      await writeFile(
        adjudicationsPath,
        `${JSON.stringify(item.records, null, 2)}\n`,
      );
      await assert.rejects(
        runCli([
          "adjudicate",
          "--source-result",
          sourceResultPath,
          "--fixture",
          fixtureRoot,
          "--adjudications",
          adjudicationsPath,
          "--output-dir",
          join(root, item.name),
        ]),
        item.error,
      );
    }
    assert.deepEqual(await readFile(sourceResultPath), sourceBefore);

    const supportedPath = join(root, "supported.json");
    await writeFile(
      supportedPath,
      `${JSON.stringify([{
        candidate_id: "1",
        oracle_id: "KS-001",
        route_blind: true,
        disposition: "supported",
      }], null, 2)}\n`,
    );
    const reusedOutput = join(root, "reused");
    await mkdir(reusedOutput);
    await assert.rejects(
      runCli([
        "adjudicate",
        "--source-result",
        sourceResultPath,
        "--fixture",
        fixtureRoot,
        "--adjudications",
        supportedPath,
        "--output-dir",
        reusedOutput,
      ]),
      /output directory already exists/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("adjudicate preserves process, report, and input blockers after resolving quality recall", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-review-adjudicate-blockers-"));
  await chmod(fakeReviewerPath, 0o755);
  try {
    const source = await runEvaluation(
      root,
      "ambiguous-source",
      "ambiguous-blocker-report",
    );
    const sourceResultPath = join(source.outputDirectory, "result.json");
    const sourceWithProcessFailure = {
      ...source.persisted,
      blocked_reasons: [
        ...source.persisted.blocked_reasons,
        "reviewer exit 7",
      ],
      process: {
        ...source.persisted.process,
        exit_code: 7,
      },
    };
    await writeFile(
      sourceResultPath,
      `${JSON.stringify(sourceWithProcessFailure, null, 2)}\n`,
    );
    const adjudicationsPath = join(root, "adjudications.json");
    await writeFile(
      adjudicationsPath,
      `${JSON.stringify([{
        candidate_id: "1",
        oracle_id: "KS-001",
        route_blind: true,
        disposition: "supported",
      }], null, 2)}\n`,
    );

    const { runCli } = await implementation();
    const result = await runCli([
      "adjudicate",
      "--source-result",
      sourceResultPath,
      "--fixture",
      fixtureRoot,
      "--adjudications",
      adjudicationsPath,
      "--output-dir",
      join(root, "derived"),
    ]);

    assert.equal(result.quality.recall_by_severity.Blocker, 1);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blocked_reasons, ["reviewer exit 7"]);
    assert.equal(result.process.exit_code, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

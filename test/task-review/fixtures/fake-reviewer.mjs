#!/usr/bin/env node

import {
  access,
  appendFile,
  readFile,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

const homeSensitiveAuth =
  process.env.TASK_REVIEW_FAKE_HOME_SENSITIVE_AUTH === "1";
const homeSensitiveMarker = ".home-sensitive-auth";

if (
  process.argv[2] === "auth" &&
  process.argv[3] === "status" &&
  process.argv.includes("--json")
) {
  if (homeSensitiveAuth) {
    try {
      await access(join(process.env.HOME ?? "", homeSensitiveMarker));
    } catch {
      process.stdout.write(
        `${JSON.stringify({
          loggedIn: false,
          authMethod: "none",
          apiProvider: "firstParty",
        })}\n`,
      );
      process.exit(1);
    }
  }
  process.stdout.write(
    `${JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
    })}\n`,
  );
  process.exit(0);
}

if (process.argv.includes("--version")) {
  process.stdout.write("fake-reviewer 1.0.0\n");
  process.exit(0);
}

const scenario = process.argv[2] ?? "early-success";
const reportPath = process.env.TASK_REVIEW_REPORT;
const taskRoot = process.env.TASK_REVIEW_WORKSPACE;
const runtime = process.env.TASK_REVIEW_RUNTIME ?? "Claude Code";
const model = process.env.TASK_REVIEW_MODEL ?? "opus";
const effort = process.env.TASK_REVIEW_EFFORT ?? "max";
const route = process.env.TASK_REVIEW_ROUTE ?? "Codex -> Claude Code";

const prompt = process.argv.at(-1) ?? "";
const requiredTimestamp = prompt.match(
  /^Timestamp:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/m,
)?.[1] ?? "2026-07-23T00:00:00Z";
const validReport = `# Task Review

## Findings

| # | Severity | Lens | Location | Finding | Suggested Edit |
|---|---|---|---|---|---|
| 1 | Blocker | Integration + Coverage | tasks.json 0.1.1, 0.1.2, 1.2.3; execute.md Wave Plan | The graph has no pre-migration real-host stop gate: early tasks document or emit a probe but never execute it before migration. | Add real-host verification after 1.2.3 and gate migration on success. |

## Review Metadata

Timestamp: ${requiredTimestamp}
Mode: adversarial
Reviewer Runtime: ${runtime}
Reviewer Model: ${model}
Reviewer Effort: ${effort}
Invocation Route: ${route}
`;

if (process.argv.includes("-p")) {
  const toolsIndex = process.argv.indexOf("--tools");
  const allowedToolsIndex = process.argv.indexOf("--allowedTools");
  const permissionIndex = process.argv.indexOf("--permission-mode");
  const expectedTools = "Read,Glob,Grep,Write";
  const reviewerHome = process.env.HOME ?? "";
  const reviewerRoot = dirname(process.env.TMPDIR ?? "");
  const isolatedEnvironmentPaths = [
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
  ];
  const isWithinReviewerRoot = (path) => {
    const difference = relative(resolve(reviewerRoot), resolve(path));
    return (
      difference === "" ||
      (!difference.startsWith("..") && !isAbsolute(difference))
    );
  };
  if (
    !process.argv.includes("--safe-mode") ||
    toolsIndex === -1 ||
    process.argv[toolsIndex + 1] !== expectedTools ||
    allowedToolsIndex === -1 ||
    process.argv[allowedToolsIndex + 1] !== expectedTools ||
    permissionIndex === -1 ||
    process.argv[permissionIndex + 1] !== "dontAsk"
  ) {
    process.stderr.write("Claude reviewer command permissions are invalid\n");
    process.exit(9);
  }
  if (
    homeSensitiveAuth &&
    (
      !(await access(join(reviewerHome, homeSensitiveMarker))
        .then(() => true, () => false)) ||
      (
        await Promise.all(
          isolatedEnvironmentPaths.map(async (key) => {
            const value = process.env[key];
            return Boolean(value && isWithinReviewerRoot(value));
          }),
        )
      ).includes(false)
    )
  ) {
    process.stderr.write("Claude reviewer environment is not isolated\n");
    process.exit(10);
  }
  await writeFile(reportPath, validReport);
  process.stdout.write(
    `${JSON.stringify({
      type: "result",
      subtype: "success",
      num_turns: 1,
      usage: {
        input_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 1,
      },
    })}\n`,
  );
  process.exit(0);
}

switch (scenario) {
  case "early-success":
    process.stdout.write(
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        num_turns: 1,
        total_cost_usd: 0.25,
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3,
          output_tokens: 4,
        },
        duration_ms: 5,
      })}\n`,
    );
    await writeFile(reportPath, validReport);
    break;
  case "retry-success":
    process.stdout.write(
      `${JSON.stringify({
        type: "retry",
        attempt: 1,
      })}\n`,
    );
    process.stdout.write(
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        num_turns: 1,
        total_cost_usd: 0.25,
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3,
          output_tokens: 4,
        },
        duration_ms: 5,
      })}\n`,
    );
    await writeFile(reportPath, validReport);
    break;
  case "quiet-success":
    await writeFile(reportPath, validReport);
    break;
  case "scored-report":
    await writeFile(
      reportPath,
      `# Task Review

## Findings

| # | Severity | Lens | Location | Finding | Suggested Edit |
|---|---|---|---|---|---|
| 1 | Blocker | Coverage | tasks.json | Missing stop gate. Fingerprint: 47120e3f2db60babc39082e50a7c11207558ebeeb4bfea0df9c862218e6fef42 | Add the gate. |

## Review Metadata

Timestamp: 2026-07-23T00:00:00Z
Mode: adversarial
Reviewer Runtime: ${runtime}
Reviewer Model: ${model}
Reviewer Effort: ${effort}
Invocation Route: ${route}
`,
    );
    break;
  case "historical-markdown-report":
    await writeFile(
      reportPath,
      `# Task Review

## 1. Findings

No findings.

## 4. Review Metadata

- **Timestamp:** \`2026-07-23T17:12:00Z\`
- **Mode:** \`adversarial\`
- **Reviewer Runtime:** \`${runtime}\`
- **Reviewer Model:** \`${model}\`
- **Reviewer Effort:** \`${effort}\`
- **Invocation Route:** \`${route}\`
`,
    );
    break;
  case "historical-markdown-scored-report":
    await writeFile(
      reportPath,
      `# Task Review

## 1. Findings

| # | Severity | Lens | Location | Finding | Suggested Edit |
|---|---|---|---|---|---|
| 1 | Blocker | Coverage | tasks.json | Missing stop gate. Fingerprint: 47120e3f2db60babc39082e50a7c11207558ebeeb4bfea0df9c862218e6fef42 | Add the gate. |

## 4. Review Metadata

- **Timestamp:** 2026-07-23T17:12:00Z
- **Mode:** adversarial
- **Reviewer Runtime:** ${runtime}
- **Reviewer Model:** ${model}
- **Reviewer Effort:** ${effort}
- **Invocation Route:** ${route}
`,
    );
    break;
  case "ambiguous-blocker-report":
    await writeFile(
      reportPath,
      `# Task Review

## Findings

| # | Severity | Lens | Location | Finding | Suggested Edit |
|---|---|---|---|---|---|
| 1 | High | Semantic Coverage / Integration | plan.md §2.5 and §9 "Phase 1 Succeeds when (c)/(d)" vs tasks.json Phase 0 (0.1.1, 0.1.2) and 1.2.3; the only real-host task 6.2.2; execute.md Wave 0 / Wave 9; tasks.json REQ-017.tasks = ["0.1", "6.2"] | The plan makes a real-host payload probe a hard precondition for migration: §2.5 states "This is a required manual gate… On failure, stop before migration," and §9 Phase 1 succeeds only when "(c) at least one prose-heavy and one code-heavy accepted fixture arrive inline in a real Codex run under the §2.5 protocol; and (d) the dated evidence artifact is saved," with the failure branch stopping "before migration or user-data changes." The task graph never encodes this gate before migration. 0.1.1 only records CLI versions/commands; 0.1.2 only adds RED estimator/fixture tests; 1.2.3 only builds the measurement + verify-knowledge-hosts.mjs generator (its acceptance is test/observable, i.e. harness emission, not an executed real-host run). The sole real-host execution is 6.2.2 (Wave 9), which runs after Phase 2 migration (2.1/2.2, Waves 3–4) and after Phase 5 install-time migration (5.1.3). A fixture that falls back would surface only in the terminal wave, defeating the plan's primary risk mitigation ("make payload feasibility Phase 1… stop for redesign if inline delivery cannot be guaranteed"). Compounding this, REQ-017 maps real-host evidence to 0.1, but 0.1 produces no real-host evidence. | Add a gating subtask under 0.1 (or a real-host observable acceptance criterion on 0.1/1.2) that executes the §2.5 Codex probe on at least one prose and one code boundary fixture, saves the dated verification/host-payload-YYYY-MM-DD.md artifact, and declare it a predecessor of 2.1 in both tasks.json and execute.md. Encode the failure branch ("stop before migration; append measured values + observed behavior to task_context.md") as an explicit exit condition, and correct REQ-017's 0.1 mapping to point at the new gating task. |

## Review Metadata

Timestamp: 2026-07-23T00:00:00Z
Mode: adversarial
Reviewer Runtime: ${runtime}
Reviewer Model: ${model}
Reviewer Effort: ${effort}
Invocation Route: ${route}
`,
    );
    break;
  case "historical-markdown-malformed":
    await writeFile(
      reportPath,
      `# Task Review

## 1. Findings

No findings.

## 4. Review Metadata

- **Timestamp:** yesterday
- **Mode:** adversarial
- **Reviewer Runtime:** ${runtime}
- **Reviewer Model:** ${model}
- **Reviewer Effort:** low
`,
    );
    break;
  case "auth-bridge":
    if (!process.env.CLAUDE_CONFIG_DIR) {
      throw new Error("isolated Claude config is missing");
    }
    if (process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR !== "") {
      throw new Error("Claude secure storage does not use the default namespace");
    }
    if (
      process.env.CLAUDE_CODE_OAUTH_TOKEN ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN
    ) {
      throw new Error("ambient credential material reached the reviewer");
    }
    await writeFile(reportPath, validReport);
    break;
  case "timeout":
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    break;
  case "nonzero":
    process.stderr.write("review failed\n");
    process.exitCode = 7;
    break;
  case "missing-report":
    break;
  case "invalid-report":
    await writeFile(reportPath, "# incomplete\n");
    break;
  case "mutate-input": {
    const planPath = join(taskRoot, "specs", "plan.md");
    const plan = await readFile(planPath, "utf8");
    await appendFile(planPath, `${plan.endsWith("\n") ? "" : "\n"}mutation\n`);
    await writeFile(reportPath, validReport);
    break;
  }
  default:
    throw new Error(`unknown fake reviewer scenario: ${scenario}`);
}

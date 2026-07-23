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

const validReport = `# Task Review

## Findings

| # | Severity | Lens | Location | Finding | Suggested Edit |
|---|---|---|---|---|---|
| 1 | Blocker | Integration + Coverage | tasks.json 0.1.1, 0.1.2, 1.2.3; execute.md Wave Plan | The graph has no pre-migration real-host stop gate: early tasks document or emit a probe but never execute it before migration. | Add real-host verification after 1.2.3 and gate migration on success. |

## Review Metadata

Timestamp: 2026-07-23T00:00:00Z
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
  const reviewerRoot = dirname(reviewerHome);
  const isolatedEnvironmentPaths = [
    "HOME",
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
      await Promise.all(
        isolatedEnvironmentPaths.map(async (key) => {
          const value = process.env[key];
          if (!value || !isWithinReviewerRoot(value)) return false;
          if (key === "HOME") {
            try {
              await access(join(value, homeSensitiveMarker));
              return false;
            } catch {
              // The host-home auth marker must not reach the reviewer HOME.
            }
          }
          return true;
        }),
      )
    ).includes(false)
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

- **Timestamp:** 2026-07-23T17:12:00Z
- **Mode:** adversarial
- **Reviewer Runtime:** ${runtime}
- **Reviewer Model:** ${model}
- **Reviewer Effort:** ${effort}
- **Invocation Route:** ${route}
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

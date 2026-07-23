#!/usr/bin/env node

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

No findings.

## Review Metadata

Mode: adversarial
Reviewer Runtime: ${runtime}
Reviewer Model: ${model}
Reviewer Effort: ${effort}
Invocation Route: ${route}
`;

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

Mode: adversarial
Reviewer Runtime: ${runtime}
Reviewer Model: ${model}
Reviewer Effort: ${effort}
Invocation Route: ${route}
`,
    );
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

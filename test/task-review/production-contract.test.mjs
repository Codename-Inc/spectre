import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const canonicalSkillDir = join(
  repositoryRoot,
  "plugins",
  "spectre",
  "skills",
  "spectre-task_review",
);
const taskReview = readFileSync(join(canonicalSkillDir, "SKILL.md"), "utf8");

test("production task review owns the explicit medium-effort orchestration sequence", () => {
  assert.match(
    taskReview,
    /claude -p --model opus --effort medium .*"\$REVIEW_PROMPT"/,
  );
  assert.match(
    taskReview,
    /codex exec -C "\$PWD" -m gpt-5\.6-sol -c 'model_reasoning_effort="medium"' .*"\$REVIEW_PROMPT"/,
  );
  assert.match(
    taskReview,
    /Reviewer Model: opus`, `Reviewer Effort: medium`/,
  );
  assert.match(
    taskReview,
    /Reviewer Model: gpt-5\.6-sol`, `Reviewer Effort: medium`/,
  );

  const orderedContract = [
    "task-review-safety.mjs` `preflight",
    "Launch the selected opposite-runtime command",
    "poll",
    "task-review-safety.mjs` `validate-report",
    "one repair attempt",
    "native fallback",
    "Read `REVIEW_REPORT` fully",
    "apply scope-safe",
    "focused post-check",
  ];
  let previousIndex = -1;
  for (const phrase of orderedContract) {
    const index = taskReview.indexOf(phrase, previousIndex + 1);
    assert.ok(index > previousIndex, `${phrase} must appear in orchestration order`);
    previousIndex = index;
  }

  assert.match(taskReview, /Exit `2` stops reviewer launch/);
  assert.match(taskReview, /advisories never block reviewer launch/i);
  assert.match(taskReview, /closed consumer-safety report gate requires/);
  assert.match(
    taskReview,
    /Missing Coverage or Index Alignment summaries request repair or become an advisory/,
  );
  assert.match(taskReview, /Allow up to 20 minutes for completion/);
  assert.match(taskReview, /atomically persists any review-state payload/);
  assert.match(taskReview, /failed post-check invalidates that state/);
  assert.match(
    taskReview,
    /Do not pass launcher timeout or duration guidance to the reviewer/,
  );
});

test("production task review keeps semantic judgment with a non-delegating reviewer", () => {
  assert.match(taskReview, /Deterministic \/ mixed \/ semantic ownership/);
  assert.match(taskReview, /Requirement and Out-of-Bounds fidelity/);
  assert.match(taskReview, /Acceptance-criterion adequacy and falsifiability/);
  assert.match(taskReview, /Genuine RED behavior/);
  assert.match(taskReview, /Real producer\/consumer meaning/);
  assert.match(taskReview, /Reference relevance/);
  assert.match(taskReview, /Severity and scope-safe classification/);
  assert.match(
    taskReview,
    /Adversarial mode:.*does not delegate/is,
  );
  assert.match(taskReview, /save it unchanged, then rerun `validate-report`/);

  const reviewerPrompt = taskReview.match(
    /`REVIEW_PROMPT` includes:([^\n]+)/,
  )?.[1];
  assert.ok(reviewerPrompt, "reviewer prompt contract must be present");
  assert.doesNotMatch(
    reviewerPrompt,
    /at least 20 minutes|do not stop early|launcher timeout|duration guidance/i,
  );
  assert.doesNotMatch(taskReview, /--model fable|model_reasoning_effort="high"/);
  assert.deepEqual(
    readdirSync(join(canonicalSkillDir, "scripts")).sort(),
    ["task-review-safety.mjs"],
    "production must not gain a reviewer-launcher CLI",
  );
});

test("task-review routing changes without changing plan-review or code-review routes", () => {
  const planReview = readFileSync(
    join(
      repositoryRoot,
      "plugins",
      "spectre",
      "skills",
      "spectre-plan_review",
      "SKILL.md",
    ),
    "utf8",
  );
  const codeReview = readFileSync(
    join(
      repositoryRoot,
      "plugins",
      "spectre",
      "skills",
      "spectre-code_review",
      "SKILL.md",
    ),
    "utf8",
  );
  const knowledge = readFileSync(
    join(
      repositoryRoot,
      ".agents",
      "skills",
      "feature-codex-spectre-implementation",
      "SKILL.md",
    ),
    "utf8",
  );

  assert.match(planReview, /claude -p --model opus --effort high/);
  assert.match(
    planReview,
    /-m gpt-5\.6-sol -c 'model_reasoning_effort="high"'/,
  );
  assert.match(codeReview, /claude -p --model fable --effort high/);
  assert.match(
    codeReview,
    /-m gpt-5\.6-sol -c 'model_reasoning_effort="high"'/,
  );
  assert.match(
    knowledge,
    /`spectre-task_review`[^\n]*`--model opus --effort medium`[^\n]*model_reasoning_effort="medium"/,
  );
  assert.match(
    knowledge,
    /`spectre-code_review`[^\n]*`--model fable --effort high`[^\n]*model_reasoning_effort="high"/,
  );
});

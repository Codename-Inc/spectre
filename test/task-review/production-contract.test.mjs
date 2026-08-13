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

test("production task review owns safety, semantic review, and deterministic closure", () => {
  const orderedContract = [
    "helper's `preflight`",
    "available opposite runtime",
    "Write all findings before edits",
    "helper `validate-report`",
    "runs `validate-pair`",
  ];
  let previousIndex = -1;
  for (const phrase of orderedContract) {
    const index = taskReview.indexOf(phrase, previousIndex + 1);
    assert.ok(index > previousIndex, `${phrase} must appear in orchestration order`);
    previousIndex = index;
  }

  assert.match(taskReview, /Hard failures stop; advisories inform the semantic reviewer/);
  assert.doesNotMatch(taskReview, /Index Alignment Summary/);
  assert.match(taskReview, /Allow up to 20 minutes; quiet output alone is not failure/);
  assert.match(taskReview, /primary may repair mechanical report\/schema metadata/i);
  assert.match(taskReview, /attempt is `complete`/);
});

test("task review runs one authorized review while recovering incomplete routes", () => {
  assert.match(taskReview, /one semantic review per authorized round/i);
  assert.match(taskReview, /--review-again/);
  assert.match(taskReview, /task_review_attempt\.json/);
  assert.match(taskReview, /A completed report ends the round/);
  assert.match(taskReview, /fallback under the same ledger\/report/);
  assert.match(taskReview, /Resume incomplete or `report_ready` state instead of starting another review/);
  assert.match(taskReview, /do not use its retired `impact` operation/);
  assert.match(taskReview, /unresolved\|applied\|skipped\|scope-change/);
  assert.match(taskReview, /pre\/post task hashes/);
  assert.doesNotMatch(taskReview, /task_review_state\.json|task-review-state\/v1/);
  assert.doesNotMatch(taskReview, /IMPACT_JSON|Rerun Parents:|Reused Findings:/);
});

test("production task review gives broad guidance without limiting reviewer judgment", () => {
  assert.match(taskReview, /goal is not checklist completion/i);
  assert.match(taskReview, /correctly and completely translates the reviewed plan/i);
  assert.match(taskReview, /guidance, not an exhaustive taxonomy or a limit/i);
  assert.match(taskReview, /Coverage:/);
  assert.match(taskReview, /Executability:/);
  assert.match(taskReview, /Integration graph:/);
  assert.match(taskReview, /Reference quality:/);
  assert.match(taskReview, /any evidence-backed translation risk/i);
  assert.match(taskReview, /without avoidable rework/i);
  assert.match(taskReview, /Canonical scope and `plan\.md` remain immutable/);
  assert.match(taskReview, /reviewer owns `TASKS_JSON` and `REVIEW_REPORT`/i);
  assert.match(taskReview, /may not invent findings, reinterpret them, or perform semantic task edits/i);
  assert.doesNotMatch(taskReview, /claude -p|codex exec|REVIEW_PROMPT/);
  assert.deepEqual(
    readdirSync(join(canonicalSkillDir, "scripts")).sort(),
    ["task-review-safety.mjs"],
    "production must not gain a reviewer-launcher CLI",
  );
});

test("review gates retain their route-specific models and efforts", () => {
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

  assert.match(planReview, /high effort \(20-minute limit\)/);
  assert.match(planReview, /Codex -> Claude Code `opus`/);
  assert.match(planReview, /Claude Code -> Codex `gpt-5\.6-sol`/);
  assert.match(planReview, /Reviewers write only their report and `plan\.md`/);
  assert.match(codeReview, /claude -p --model opus --effort high/);
  assert.match(
    codeReview,
    /-m gpt-5\.6-sol -c 'model_reasoning_effort="high"'/,
  );
  assert.match(
    knowledge,
    /`spectre-task_review`[^\n]*`--model opus --effort medium`[^\n]*model_reasoning_effort="medium"/,
  );
  assert.match(taskReview, /pinned medium effort/);
  assert.match(taskReview, /Codex → Claude `opus`/);
  assert.match(taskReview, /Claude → Codex `gpt-5\.6-sol`/);
  assert.match(taskReview, /no other canonical artifact may change/i);
  assert.match(
    knowledge,
    /`spectre-code_review`[^\n]*`--model opus --effort high`[^\n]*model_reasoning_effort="high"/,
  );
});

test("plan review runs correctness before simplification and applies only scope-safe plan edits", () => {
  const plan = readFileSync(
    join(repositoryRoot, "plugins", "spectre", "skills", "spectre-plan", "SKILL.md"),
    "utf8",
  );
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

  assert.match(plan, /Single automatic plan-review pipeline/);
  assert.match(plan, /invokes `spectre-plan_review` at most once, before task generation \(structured\) or goal generation \(direct\)/);
  assert.match(plan, /exactly one correctness stage followed by one simplification stage/);
  assert.match(plan, /Later artifact edits or scope-preserving feedback never trigger another pipeline/);
  assert.match(plan, /do not re-run `plan_review` or `task_review`/);
  assert.match(plan, /Explicit review request/);
  assert.match(plan, /invoke `spectre-plan_review` normally/);
  assert.doesNotMatch(
    plan,
    /apply the smallest `plan\.md` edit, re-run `plan_review/,
  );

  assert.match(planReview, /reviews\/plan_correctness\.md/);
  assert.match(planReview, /reviews\/plan_review\.md/);
  assert.match(planReview, /post-edit hash matches `plan\.md`/i);
  assert.match(planReview, /Write `plan_correctness\.md` first, then edit `plan\.md`/i);
  assert.match(planReview, /Write `plan_review\.md` first, then edit `plan\.md`/i);
  assert.match(planReview, /Reviewers write only their report and `plan\.md`/i);
  assert.match(planReview, /addressed.*skipped.*unresolved.*scope-change/is);
  assert.match(planReview, /addressed edit named/i);
  assert.match(planReview, /continue on the same route/i);
  assert.match(planReview, /failed schema\/hash\/scope checks/i);
  assert.match(planReview, /primary may normalize mechanics, never semantics/i);
  assert.match(planReview, /Usable review is terminal/i);
  assert.match(planReview, /normalization never launches fallback/i);
  assert.doesNotMatch(planReview, /same-route report-only repair/i);
  assert.doesNotMatch(planReview, /primary directly edits `plan\.md`/i);
  assert.doesNotMatch(planReview, /Completed-review hard stop/i);
  assert.doesNotMatch(planReview, /--review-again/);
  assert.doesNotMatch(planReview, /plan_review_attempt\.json/);
  assert.doesNotMatch(planReview, /round_status/);
});

test("usable review reports are normalized by the primary without reviewer repair", () => {
  const skill = (name) =>
    readFileSync(
      join(repositoryRoot, "plugins", "spectre", "skills", name, "SKILL.md"),
      "utf8",
    );

  for (const name of ["spectre-plan_review", "spectre-task_review", "spectre-code_review"]) {
    const review = skill(name);
    if (name === "spectre-plan_review") {
      assert.match(review, /Usable review is terminal/i);
      assert.match(review, /primary may normalize mechanics, never semantics/i);
      assert.doesNotMatch(review, /same-route report-only repair/i);
      continue;
    } else if (name === "spectre-task_review") {
      assert.match(review, /primary may repair mechanical report\/schema metadata/i);
      assert.match(review, /may not invent findings, reinterpret them, or perform semantic task edits/i);
      assert.doesNotMatch(review, /same-route report-only repair/i);
      continue;
    } else {
      assert.match(review, /A usable review ends semantic review/i);
    }
    assert.match(review, /primary may mechanically normalize report-only/i);
    assert.match(review, /severity enums/i);
    assert.doesNotMatch(review, /same-route report-only repair/i);
  }
});

test("comprehensive planning reviews tasks before finalizing execute.md", () => {
  const plan = readFileSync(
    join(repositoryRoot, "plugins", "spectre", "skills", "spectre-plan", "SKILL.md"),
    "utf8",
  );
  const createTasks = readFileSync(
    join(
      repositoryRoot,
      "plugins",
      "spectre",
      "skills",
      "spectre-create_tasks",
      "SKILL.md",
    ),
    "utf8",
  );
  const comprehensive = plan.match(/\*\*COMPREHENSIVE\*\* → ([^\n]+)/)?.[1] ?? "";

  const tasksOnly = comprehensive.indexOf("--tasks-only");
  const taskReviewIndex = comprehensive.indexOf("spectre-task_review");
  const finalizeIndex = comprehensive.indexOf("--finalize-index");
  const pairValidation = comprehensive.indexOf("validate-pair");
  const goal = comprehensive.indexOf("spectre-goal");
  assert.ok(tasksOnly >= 0);
  assert.ok(taskReviewIndex > tasksOnly);
  assert.ok(finalizeIndex > taskReviewIndex);
  assert.ok(pairValidation > finalizeIndex);
  assert.ok(goal > pairValidation);

  assert.match(createTasks, /--tasks-only/);
  assert.match(createTasks, /--finalize-index/);
  assert.match(
    createTasks,
    /project only `meta`.*phase ids\/titles.*parent ids\/titles.*subtask ids.*`predecessor`.*`unblocks`.*`risk`/is,
  );
  assert.match(createTasks, /leave JSON byte-for-byte unchanged/i);
  assert.match(createTasks, /Phase 0.*real external dependency or capability precondition/is);
  assert.doesNotMatch(createTasks, /always include for COMPREHENSIVE/);
  assert.doesNotMatch(createTasks, /COMPREHENSIVE = full graph with Phase 0/);
  assert.match(taskReview, /continue the same reviewer route for writeback only/i);
  assert.match(taskReview, /one semantic review per authorized round/i);
});

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
  assert.match(planReview, /Codex (?:→|->) Claude Code `opus`/);
  assert.match(planReview, /Claude Code (?:→|->) Codex `gpt-5\.6-sol`/);
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

test("Execute preflight owns scope-safe plan review before unchanged task creation", () => {
  const plan = readFileSync(
    join(repositoryRoot, "plugins", "spectre", "skills", "spectre-plan", "SKILL.md"),
    "utf8",
  );
  const planReviewDir = join(
    repositoryRoot,
    "plugins",
    "spectre",
    "skills",
    "spectre-plan_review",
  );
  const execute = readFileSync(
    join(repositoryRoot, "plugins", "spectre", "skills", "spectre-execute", "SKILL.md"),
    "utf8",
  );
  const planReview = readFileSync(
    join(planReviewDir, "SKILL.md"),
    "utf8",
  );
  const correctness = readFileSync(
    join(planReviewDir, "references", "correctness-review.md"),
    "utf8",
  );
  const simplification = readFileSync(
    join(planReviewDir, "references", "simplification-review.md"),
    "utf8",
  );

  assert.match(plan, /aligned draft/i);
  assert.match(plan, /spectre-execute <repo-relative plan\.md> --origin plan --preflight-plan <xs\|light\|standard\|comprehensive>/);
  assert.doesNotMatch(plan, /spectre-plan_review/);
  assert.doesNotMatch(plan, /spectre-create_tasks/);
  assert.doesNotMatch(plan, /spectre-task_review/);
  assert.doesNotMatch(plan, /spectre-goal/);
  const reviewIndex = execute.indexOf("Skill(spectre-plan_review) --auto-apply scope-safe --orchestrated");
  const parallelismIndex = execute.indexOf("maximize safe parallelism");
  const tasksIndex = execute.indexOf("Skill(spectre-create_tasks) --depth <mapped depth> --orchestrated");
  assert.ok(reviewIndex >= 0);
  assert.ok(parallelismIndex > reviewIndex);
  assert.ok(tasksIndex > parallelismIndex);
  assert.match(execute, /`--preflight-plan <depth>` with an explicit readable plan enters preflight/i);
  assert.match(execute, /valid structured pair[\s\S]*skip preflight entirely/i);
  assert.match(execute, /No automatic task review/i);
  assert.match(execute, /Scope change, unresolved Blocker\/High, explicit-design contradiction, or unavailable authority stops preflight before task generation/i);
  assert.match(execute, /scope-safe result proceeds without a second user gate/i);

  assert.match(planReview, /reviews\/plan_correctness\.md/);
  assert.match(planReview, /reviews\/plan_review\.md/);
  assert.match(planReview, /post-edit hash matches `plan\.md`/i);
  assert.match(planReview, /references\/correctness-review\.md/);
  assert.match(planReview, /references\/simplification-review\.md/);
  assert.match(planReview, /send it verbatim to a fresh reviewer/i);
  assert.match(planReview, /report written before plan edits/i);
  assert.match(correctness, /Write the report before authorized plan edits/i);
  assert.match(simplification, /Write the report before authorized plan edits/i);
  assert.match(planReview, /Reviewers write only their report and `plan\.md`/i);
  assert.match(planReview, /addressed.*skipped.*unresolved.*scope-change/is);
  assert.match(correctness, /dispositions\/resulting edits/i);
  assert.match(planReview, /continue on the same route/i);
  assert.match(planReview, /failed schema\/hash\/scope\/Out-of-Bounds checks/i);
  assert.match(planReview, /primary may normalize mechanics, never semantics/i);
  assert.match(planReview, /A usable review is terminal/i);
  assert.match(planReview, /Reports are deltas; never restate the plan/i);
  assert.match(correctness, /concrete risks created by the changed boundaries/i);
  assert.match(correctness, /required now by \| simpler local option \| why it fails now \| verification/i);
  assert.match(simplification, /delete, collapse, reuse, or defer/i);
  assert.match(simplification, /High` for untraceable complexity or an invalid exception/i);
  assert.match(planReview, /plan is smaller in mechanisms, surfaces, process, or tests/i);
  assert.doesNotMatch(planReview, /Shrinkage is optional/i);
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
      assert.match(review, /A usable review is terminal/i);
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

test("preflight leaves task-review and task-definition contracts unchanged", () => {
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

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const helperPath = join(
  repositoryRoot,
  "plugins",
  "spectre",
  "skills",
  "spectre-task_review",
  "scripts",
  "task-review-safety.mjs",
);

const ALL_PARENTS = ["0.1", "1.1", "1.2", "1.3", "2.1"];
const ALL_LENSES = [
  "coverage",
  "executability",
  "integration",
  "reference-quality",
];
const LOCAL_LENSES = ["coverage", "executability"];

function subtask(parentId, requirement, consumedBy = "terminal") {
  return {
    id: `${parentId}.1`,
    title: `Implement ${parentId}`,
    type: "Build",
    status: "pending",
    produces: `${parentId} output`,
    consumed_by: consumedBy,
    replaces: "none",
    requirements: [requirement],
    context: [
      {
        path: "src/fixture.mjs",
        anchor: `parent-${parentId}`,
        note: "Fixture context.",
      },
    ],
    acceptance_criteria: [
      {
        type: "test",
        text: `REQ-${requirement} is observably delivered by ${parentId}.`,
      },
    ],
  };
}

function parent(
  id,
  predecessor,
  unblocks,
  requirement,
  consumedBy = "terminal",
) {
  return {
    id,
    title: `Parent ${id}`,
    description: `Deliver requirement ${requirement}.`,
    status: "pending",
    predecessor,
    unblocks,
    requirements: [`REQ-${requirement}`],
    subtasks: [subtask(id, requirement, consumedBy)],
  };
}

function baseTasks() {
  return {
    meta: {
      feature: "task-review-impact-fixture",
      manifest_version: "v1",
      coverage_summary: {
        phases: 3,
        parent_tasks: 5,
        subtasks: 5,
        waves: 4,
      },
    },
    phases: [
      {
        id: "0",
        title: "Phase 0",
        summary: "Global prerequisite.",
        status: "done",
        parents: [parent("0.1", "none", "terminal", "0")],
      },
      {
        id: "1",
        title: "Local work",
        summary: "Contains local and graph-neighbor mutations.",
        status: "pending",
        parents: [
          parent("1.1", "none", "1.2", "1", ["1.2", "2.1"]),
          parent("1.2", "1.1", "2.1", "2"),
          parent("1.3", "none", "terminal", "3"),
        ],
      },
      {
        id: "2",
        title: "Integration",
        summary: "Consumes local work.",
        status: "pending",
        parents: [parent("2.1", "1.2", "terminal", "4")],
      },
    ],
  };
}

function executeIndex(paths) {
  return `# Execute Index

## Document Manifest
- Scope: \`${paths.scopePath}\`
- Plan: \`${paths.planPath}\`
- Requirements: \`${paths.requirementsPath}\`
- PRD: \`${paths.prdPath}\`
- UX: \`${paths.uxPath}\`
- Out-of-Bounds: \`${paths.outOfBoundsPath}\`
- Artifact Manifest: \`${paths.manifestPath}\`

## Task Detail Source
- Tasks JSON: \`${paths.tasksPath}\`

## Execution Summary
- Phases: 3
- Parent tasks: 5
- Subtasks: 5
- Waves: 4

## Requirement Coverage
- REQ-0 -> parent 0.1
- REQ-1 -> parent 1.1
- REQ-2 -> parent 1.2
- REQ-3 -> parent 1.3
- REQ-4 -> parent 2.1

## Wave Plan
- Wave 0: \`{ id: "wave-0", parent_task_ids: ["0.1"], after: [] }\`
- Wave 1: \`{ id: "wave-1", parent_task_ids: ["1.1", "1.3"], after: [] }\`
- Wave 2: \`{ id: "wave-2", parent_task_ids: ["1.2"], after: ["wave-1"] }\`
- Wave 3: \`{ id: "wave-3", parent_task_ids: ["2.1"], after: ["wave-2"] }\`

## Parent Task Index
- \`{ id: "0.1", predecessor: "none", unblocks: "terminal" }\`
- \`{ id: "1.1", predecessor: "none", unblocks: "1.2" }\`
- \`{ id: "1.2", predecessor: "1.1", unblocks: "2.1" }\`
- \`{ id: "1.3", predecessor: "none", unblocks: "terminal" }\`
- \`{ id: "2.1", predecessor: "1.2", unblocks: "terminal" }\`

## Slicing Rules
Slice selected parents and preserve direct dependency boundaries.
`;
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "task-review-impact-"));
  const taskDir = join(root, "feature");
  const specsDir = join(taskDir, "specs");
  const conceptsDir = join(taskDir, "concepts");
  const contextDir = join(taskDir, "context");
  const reviewsDir = join(taskDir, "reviews");
  const paths = {
    root,
    taskDir,
    specsDir,
    reviewsDir,
    planPath: join(specsDir, "plan.md"),
    executePath: join(specsDir, "execute.md"),
    tasksPath: join(specsDir, "tasks.json"),
    scopePath: join(conceptsDir, "scope.md"),
    requirementsPath: join(contextDir, "requirements.md"),
    prdPath: join(contextDir, "prd.md"),
    uxPath: join(contextDir, "ux.md"),
    outOfBoundsPath: join(conceptsDir, "out-of-bounds.md"),
    manifestPath: join(contextDir, "manifest.json"),
    statePath: join(reviewsDir, "task_review_state.json"),
  };

  await mkdir(specsDir, { recursive: true });
  await mkdir(conceptsDir, { recursive: true });
  await mkdir(contextDir, { recursive: true });
  await mkdir(reviewsDir, { recursive: true });
  await writeFile(
    paths.planPath,
    "# Plan\n\n## Requirements\n\nREQ-0 through REQ-4.\n",
  );
  await writeFile(
    paths.scopePath,
    "# Scope\n\nAll five fixture parents are in scope.\n",
  );
  await writeFile(
    paths.requirementsPath,
    "# Requirements\n\nREQ-0\nREQ-1\nREQ-2\nREQ-3\nREQ-4\n",
  );
  await writeFile(paths.prdPath, "# PRD\n\nFixture behavior.\n");
  await writeFile(paths.uxPath, "# UX\n\nNo visual surface.\n");
  await writeFile(
    paths.outOfBoundsPath,
    "# Out-of-Bounds\n\nDo not add a production reviewer runner.\n",
  );
  await writeFile(
    paths.manifestPath,
    `${JSON.stringify({ schema_version: "v1", requirements: 5 }, null, 2)}\n`,
  );
  await writeFile(
    paths.tasksPath,
    `${JSON.stringify(baseTasks(), null, 2)}\n`,
  );
  await writeFile(paths.executePath, executeIndex(paths));
  return paths;
}

function runImpact(fixture, previousState = fixture.statePath) {
  const result = spawnSync(
    process.execPath,
    [
      helperPath,
      "impact",
      "--task-dir",
      fixture.taskDir,
      "--previous-state",
      previousState,
      "--json",
    ],
    {
      cwd: fixture.root,
      encoding: "utf8",
    },
  );
  let output = null;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    // The assertion below reports stdout/stderr when the operation is absent.
  }
  return { ...result, output };
}

function absenceContractMessage(result) {
  return [
    "The proposed read-only impact operation is not implemented.",
    `exit=${result.status}`,
    `stdout=${result.stdout.trim()}`,
    `stderr=${result.stderr.trim()}`,
  ].join("\n");
}

function assertImpactAvailable(result) {
  assert.equal(result.status, 0, absenceContractMessage(result));
  assert.equal(result.output?.operation, "impact");
  assert.equal(result.output?.status, "pass");
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertSet(actual, expected, label) {
  assert.deepEqual(sorted(actual ?? []), sorted(expected), label);
}

function assertReason(result, pattern) {
  assert.match(JSON.stringify(result.output?.impact?.reasons ?? []), pattern);
}

function assertFull(result, reason, expectedParents = ALL_PARENTS) {
  assertImpactAvailable(result);
  assert.equal(result.output.impact.mode, "full");
  assertSet(result.output.impact.parents, expectedParents, "whole graph parents");
  assertSet(result.output.impact.lenses, ALL_LENSES, "whole graph lenses");
  assertReason(result, reason);
}

function assertSlice(result, parents, lenses) {
  assertImpactAvailable(result);
  assert.equal(result.output.impact.mode, "slice");
  assertSet(result.output.impact.parents, parents, "selected parents");
  assertSet(result.output.impact.lenses, lenses, "selected lenses");
  assert.ok(result.output.impact.reasons.length > 0);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function mutateTasks(fixture, mutate) {
  const tasks = JSON.parse(await readFile(fixture.tasksPath, "utf8"));
  mutate(tasks);
  await writeJson(fixture.tasksPath, tasks);
}

function taskParent(tasks, id) {
  return tasks.phases
    .flatMap((phase) => phase.parents)
    .find((candidate) => candidate.id === id);
}

async function mutateText(path, mutate) {
  await writeFile(path, mutate(await readFile(path, "utf8")));
}

async function snapshot(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        const bytes = await readFile(path);
        files.push([
          relative(root, path),
          createHash("sha256").update(bytes).digest("hex"),
        ]);
      }
    }
  }
  await visit(root);
  return files.sort(([left], [right]) => left.localeCompare(right));
}

function completedStateFrom(result) {
  assertImpactAvailable(result);
  const state = structuredClone(result.output.proposed_state);
  state.schema_version = "task-review-state/v1";
  state.prompt_version = "task-review-prompt/v1";
  state.pre_review_hashes = structuredClone(result.output.pre_review_hashes);
  state.post_write_hashes = structuredClone(result.output.pre_review_hashes);
  state.reviewed_regions = [
    {
      parents: [...ALL_PARENTS],
      lenses: [...ALL_LENSES],
      complete: true,
    },
  ];
  state.prior_report = {
    sha256: "a".repeat(64),
    finding_ids: [],
  };
  state.finding_dispositions = [];
  state.unresolved_findings = [];
  state.writeback = { status: "complete" };
  state.post_check = { status: "pass" };
  return state;
}

async function bootstrapState(fixture, mutateState = () => {}) {
  const missingState = join(fixture.reviewsDir, "missing-state.json");
  const bootstrap = runImpact(fixture, missingState);
  const state = completedStateFrom(bootstrap);
  mutateState(state, bootstrap.output);
  await writeJson(fixture.statePath, state);
  return state;
}

async function withFixture(run) {
  const fixture = await createFixture();
  try {
    await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

const invalidStateCases = [
  {
    name: "missing state selects the whole graph",
    prepare: async (fixture) => join(fixture.reviewsDir, "absent.json"),
    reason: /missing|absent|no previous/i,
  },
  {
    name: "malformed state selects the whole graph",
    prepare: async (fixture) => {
      await writeFile(fixture.statePath, "{");
      return fixture.statePath;
    },
    reason: /malformed|invalid|parse/i,
  },
  {
    name: "wrong state schema version selects the whole graph",
    prepare: async (fixture) => {
      await bootstrapState(fixture, (state) => {
        state.schema_version = "task-review-state/v999";
      });
      return fixture.statePath;
    },
    reason: /schema|version|incompatible/i,
  },
  {
    name: "stale prompt state selects the whole graph",
    prepare: async (fixture) => {
      await bootstrapState(fixture, (state) => {
        state.prompt_version = "task-review-prompt/v0";
      });
      return fixture.statePath;
    },
    reason: /prompt|stale|incompatible/i,
  },
];

for (const stateCase of invalidStateCases) {
  test(stateCase.name, async () => {
    await withFixture(async (fixture) => {
      const statePath = await stateCase.prepare(fixture);
      assertFull(runImpact(fixture, statePath), stateCase.reason);
    });
  });
}

const localMutationCases = [
  {
    name: "parent title changes rerun only that mapped parent",
    mutate: (parentValue) => {
      parentValue.title = "Changed parent title";
    },
  },
  {
    name: "subtask type changes rerun only that mapped parent",
    mutate: (parentValue) => {
      parentValue.subtasks[0].type = "Integration";
    },
  },
  {
    name: "criterion changes rerun only that mapped parent",
    mutate: (parentValue) => {
      parentValue.subtasks[0].acceptance_criteria[0].text =
        "Changed observable criterion.";
    },
  },
  {
    name: "context changes rerun only that mapped parent",
    mutate: (parentValue) => {
      parentValue.subtasks[0].context[0].anchor = "changed-anchor";
    },
  },
  {
    name: "output changes rerun only that mapped parent",
    mutate: (parentValue) => {
      parentValue.subtasks[0].produces = "Changed local output";
    },
  },
];

for (const mutation of localMutationCases) {
  test(mutation.name, async () => {
    await withFixture(async (fixture) => {
      await bootstrapState(fixture);
      await mutateTasks(fixture, (tasks) => {
        mutation.mutate(taskParent(tasks, "1.2"));
      });
      assertSlice(runImpact(fixture), ["1.2"], LOCAL_LENSES);
    });
  });
}

test("graph-edge changes rerun the changed parent and direct old/new neighbors", async () => {
  await withFixture(async (fixture) => {
    await bootstrapState(fixture);
    await mutateTasks(fixture, (tasks) => {
      taskParent(tasks, "1.2").predecessor = "1.3";
    });
    assertSlice(
      runImpact(fixture),
      ["1.1", "1.2", "1.3", "2.1"],
      ["integration"],
    );
  });
});

const globalMutationCases = [
  {
    name: "scope changes force whole-graph review",
    mutate: (fixture) =>
      mutateText(fixture.scopePath, (text) => `${text}\nChanged scope.\n`),
    reason: /scope/i,
  },
  {
    name: "plan changes force whole-graph review",
    mutate: (fixture) =>
      mutateText(fixture.planPath, (text) => `${text}\nChanged plan.\n`),
    reason: /plan/i,
  },
  {
    name: "requirement changes force whole-graph review",
    mutate: (fixture) =>
      mutateText(
        fixture.requirementsPath,
        (text) => `${text}\nREQ-5 changed.\n`,
      ),
    reason: /requirement/i,
  },
  {
    name: "Out-of-Bounds changes force whole-graph review",
    mutate: (fixture) =>
      mutateText(
        fixture.outOfBoundsPath,
        (text) => `${text}\nNew fence.\n`,
      ),
    reason: /out.?of.?bounds|boundary/i,
  },
  {
    name: "coverage-map changes force whole-graph review",
    mutate: (fixture) =>
      mutateText(fixture.executePath, (text) =>
        text.replace("REQ-4 -> parent 2.1", "REQ-4 -> parents 1.2 and 2.1"),
      ),
    reason: /coverage|requirement/i,
  },
  {
    name: "manifest changes force whole-graph review",
    mutate: async (fixture) => {
      await writeJson(fixture.manifestPath, {
        schema_version: "v1",
        requirements: 6,
      });
    },
    reason: /manifest/i,
  },
  {
    name: "Phase-0 changes force whole-graph review",
    mutate: (fixture) =>
      mutateTasks(fixture, (tasks) => {
        taskParent(tasks, "0.1").title = "Changed global prerequisite";
      }),
    reason: /phase.?0|global|prerequisite/i,
  },
  {
    name: "broad parent renumbering forces whole-graph review",
    expectedParents: ["0.1", "9.1", "9.2", "9.3", "2.1"],
    mutate: async (fixture) => {
      await mutateTasks(fixture, (tasks) => {
        for (const phase of tasks.phases) {
          for (const parentValue of phase.parents) {
            parentValue.id = parentValue.id.replace(/^1\./, "9.");
            parentValue.predecessor = String(parentValue.predecessor).replace(
              /^1\./,
              "9.",
            );
            parentValue.unblocks = String(parentValue.unblocks).replace(
              /^1\./,
              "9.",
            );
            for (const child of parentValue.subtasks) {
              child.id = child.id.replace(/^1\./, "9.");
              child.consumed_by = Array.isArray(child.consumed_by)
                ? child.consumed_by.map((id) => id.replace(/^1\./, "9."))
                : String(child.consumed_by).replace(/^1\./, "9.");
            }
          }
        }
      });
      await mutateText(fixture.executePath, (text) =>
        text.replaceAll('"1.', '"9.').replaceAll("parent 1.", "parent 9."),
      );
    },
    reason: /renumber|identity|broad/i,
  },
  {
    name: "cross-cutting output changes force whole-graph review",
    mutate: (fixture) =>
      mutateTasks(fixture, (tasks) => {
        taskParent(tasks, "1.1").subtasks[0].produces =
          "Changed output consumed by multiple regions";
      }),
    reason: /cross.?cutting|reachability|multiple/i,
  },
  {
    name: "ambiguous semantic changes force whole-graph review",
    mutate: (fixture) =>
      mutateTasks(fixture, (tasks) => {
        taskParent(tasks, "1.2").semantic_contract =
          "Meaning changed outside a classified field";
      }),
    reason: /ambiguous|unknown|unclassified/i,
  },
];

for (const mutation of globalMutationCases) {
  test(mutation.name, async () => {
    await withFixture(async (fixture) => {
      await bootstrapState(fixture);
      await mutation.mutate(fixture);
      assertFull(
        runImpact(fixture),
        mutation.reason,
        mutation.expectedParents,
      );
    });
  });
}

test("only unresolved findings with unchanged complete regions are reusable", async () => {
  await withFixture(async (fixture) => {
    await bootstrapState(fixture, (state, initial) => {
      const parentHashes = initial.pre_review_hashes.parents;
      state.prior_report.finding_ids = [
        "U-unchanged",
        "U-changed",
        "U-incomplete",
        "A-applied",
        "S-skipped",
        "SC-scope-change",
      ];
      state.finding_dispositions = [
        { id: "U-unchanged", disposition: "unresolved" },
        { id: "U-changed", disposition: "unresolved" },
        { id: "U-incomplete", disposition: "unresolved" },
        { id: "A-applied", disposition: "applied" },
        { id: "S-skipped", disposition: "skipped" },
        { id: "SC-scope-change", disposition: "scope-change" },
      ];
      state.unresolved_findings = [
        {
          id: "U-unchanged",
          affected_region: {
            parents: ["2.1"],
            lenses: ["coverage"],
            complete: true,
          },
          source_parent_hashes: { "2.1": parentHashes["2.1"] },
        },
        {
          id: "U-changed",
          affected_region: {
            parents: ["1.2"],
            lenses: ["executability"],
            complete: true,
          },
          source_parent_hashes: { "1.2": parentHashes["1.2"] },
        },
        {
          id: "U-incomplete",
          affected_region: {
            parents: ["1.3"],
            lenses: ["coverage"],
            complete: false,
          },
          source_parent_hashes: { "1.3": parentHashes["1.3"] },
        },
      ];
    });
    await mutateTasks(fixture, (tasks) => {
      taskParent(tasks, "1.2").subtasks[0].produces =
        "Changed local output";
    });

    const result = runImpact(fixture);
    assertSlice(result, ["1.2"], LOCAL_LENSES);
    assert.equal(result.output.impact.reuse.eligible, true);
    assertSet(result.output.impact.reuse.finding_ids, ["U-unchanged"]);
    assertSet(
      result.output.impact.reuse.excluded_finding_ids,
      [
        "U-changed",
        "U-incomplete",
        "A-applied",
        "S-skipped",
        "SC-scope-change",
      ],
    );
  });
});

const invalidLifecycleCases = [
  {
    name: "missing finding disposition invalidates state",
    mutate: (state) => {
      state.prior_report.finding_ids = ["F-1"];
      state.finding_dispositions = [];
    },
    reason: /disposition|finding/i,
  },
  {
    name: "interrupted write-back invalidates state",
    mutate: (state) => {
      state.writeback.status = "interrupted";
    },
    reason: /write.?back|interrupted/i,
  },
  {
    name: "post-write hash mismatch invalidates state",
    mutate: (state) => {
      state.post_write_hashes.sources.plan.sha256 = "0".repeat(64);
    },
    reason: /hash|mismatch/i,
  },
  {
    name: "failed focused post-check invalidates state",
    mutate: (state) => {
      state.post_check.status = "failed";
    },
    reason: /post.?check|failed/i,
  },
];

for (const lifecycleCase of invalidLifecycleCases) {
  test(lifecycleCase.name, async () => {
    await withFixture(async (fixture) => {
      await bootstrapState(fixture, lifecycleCase.mutate);
      assertFull(runImpact(fixture), lifecycleCase.reason);
    });
  });
}

test("impact returns mode, region, reuse, reasons, hashes, and proposed v1 state read-only", async () => {
  await withFixture(async (fixture) => {
    const before = await snapshot(fixture.root);
    const absentState = join(fixture.reviewsDir, "absent.json");
    const result = runImpact(fixture, absentState);
    assertFull(result, /missing|absent|no previous/i);

    assert.equal(result.output.schema_version, "task-review-safety/v1");
    assert.equal(result.output.preflight.status, "pass");
    assertSet(
      result.output.preflight.projection.parents.map(({ id }) => id),
      ALL_PARENTS,
    );
    assert.deepEqual(
      Object.keys(result.output.pre_review_hashes.parents).sort(),
      [...ALL_PARENTS].sort(),
    );
    for (const source of [
      "plan",
      "execute",
      "tasks",
      "scope",
      "requirements",
      "prd",
      "ux",
      "out_of_bounds",
      "manifest",
      "coverage",
    ]) {
      assert.ok(
        result.output.pre_review_hashes.sources[source],
        `missing pre-review source hash: ${source}`,
      );
    }
    assert.equal(
      result.output.proposed_state.schema_version,
      "task-review-state/v1",
    );
    assert.deepEqual(
      result.output.proposed_state.pre_review_hashes,
      result.output.pre_review_hashes,
    );
    assert.equal(result.output.impact.reuse.eligible, false);
    assert.deepEqual(result.output.impact.reuse.finding_ids, []);
    assert.deepEqual(await snapshot(fixture.root), before);
  });
});

test("impact always runs the complete global consumer-safety preflight first", async () => {
  await withFixture(async (fixture) => {
    await bootstrapState(fixture);
    await mutateTasks(fixture, (tasks) => {
      taskParent(tasks, "1.2").predecessor = "missing-parent";
    });

    const result = runImpact(fixture);
    assert.equal(
      result.status,
      2,
      `impact must surface the global preflight hard failure\n${result.stdout}\n${result.stderr}`,
    );
    assert.equal(result.output?.operation, "impact");
    assert.equal(result.output?.status, "hard_failure");
    assert.ok(
      result.output.hard_failures.some(
        ({ code }) => code === "DEPENDENCY_PARENT_UNRESOLVED",
      ),
    );
    assert.equal(result.output.impact, undefined);
  });
});

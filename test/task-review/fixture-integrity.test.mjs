import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
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

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "task-review",
  "knowledge-surfacing-before",
);

const expectedCandidateFiles = [
  "specs/execute.md",
  "specs/plan.md",
  "specs/tasks.json",
];

const expectedFrozenComponents = [
  "baseline/contract.json",
  "candidate/contract.json",
  "input/specs/execute.md",
  "input/specs/plan.md",
  "input/specs/tasks.json",
  "oracle/findings.json",
  "oracle/historical-task-review.md",
  "pricing/basis.json",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function filesBelow(root) {
  const files = [];

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

function graphCounts(tasks, execute) {
  const parents = tasks.phases.flatMap((phase) => phase.parents);
  const subtasks = parents.flatMap((parent) => parent.subtasks);
  const waves = execute.match(/^- Wave \d+:/gm) ?? [];
  return {
    phases: tasks.phases.length,
    parent_tasks: parents.length,
    subtasks: subtasks.length,
    waves: waves.length,
  };
}

async function verifyFixture(root) {
  const errors = [];
  let manifest;

  try {
    manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  } catch (error) {
    return [`manifest unavailable: ${error.code ?? error.message}`];
  }

  assert.equal(manifest.schema_version, "task-review-fixture-manifest/v1");
  assert.equal(manifest.fixture_id, "knowledge-surfacing-before");
  assert.ok(manifest.provenance?.source_transcript_sha256);

  const componentPaths = Object.keys(manifest.components).sort();
  assert.deepEqual(componentPaths, expectedFrozenComponents);

  for (const componentPath of componentPaths) {
    const bytes = await readFile(join(root, componentPath));
    if (sha256(bytes) !== manifest.components[componentPath].sha256) {
      errors.push(`hash mismatch: ${componentPath}`);
    }
    assert.equal(bytes.byteLength, manifest.components[componentPath].bytes);
  }
  if (errors.length > 0) {
    return errors;
  }

  const candidateFiles = await filesBelow(join(root, "input"));
  assert.deepEqual(candidateFiles, expectedCandidateFiles);
  assert.equal(
    candidateFiles.some((path) => /oracle|finding|review/i.test(path)),
    false,
  );

  const tasks = JSON.parse(
    await readFile(join(root, "input/specs/tasks.json"), "utf8"),
  );
  const execute = await readFile(
    join(root, "input/specs/execute.md"),
    "utf8",
  );
  const counts = graphCounts(tasks, execute);
  assert.deepEqual(counts, {
    phases: 7,
    parent_tasks: 13,
    subtasks: 32,
    waves: 10,
  });
  assert.deepEqual(manifest.graph_counts, counts);

  const oracle = JSON.parse(
    await readFile(join(root, "oracle/findings.json"), "utf8"),
  );
  assert.equal(oracle.schema_version, "task-review-finding-oracle/v1");
  assert.equal(oracle.findings.length, 40);
  assert.deepEqual(oracle.severity_counts, {
    Blocker: 1,
    High: 5,
    Medium: 15,
    Low: 19,
  });
  assert.deepEqual(manifest.severity_counts, oracle.severity_counts);

  const fingerprints = new Set();
  for (const finding of oracle.findings) {
    assert.match(finding.id, /^KS-\d{3}$/);
    assert.ok(finding.fingerprint_key);
    assert.equal(finding.fingerprint, sha256(finding.fingerprint_key));
    assert.equal(fingerprints.has(finding.fingerprint), false);
    fingerprints.add(finding.fingerprint);
    assert.ok(finding.match.defect_class);
    assert.ok(finding.match.locations.length > 0);
    assert.ok(finding.source_evidence.historical_finding_id);
    assert.ok(finding.source_evidence.finding);
    assert.ok(finding.source_evidence.suggested_edit);
  }

  const baseline = JSON.parse(
    await readFile(join(root, "baseline/contract.json"), "utf8"),
  );
  assert.equal(baseline.schema_version, "task-review-baseline-contract/v1");
  assert.equal(baseline.route.runtime, "claude-code");
  assert.equal(baseline.route.model, "opus");
  assert.equal(baseline.route.effort, "max");
  assert.equal(baseline.historical_prompt.preserved, true);
  assert.match(baseline.historical_prompt.text, /at least 20 minutes/);

  const candidate = JSON.parse(
    await readFile(join(root, "candidate/contract.json"), "utf8"),
  );
  assert.equal(candidate.schema_version, "task-review-candidate-contract/v1");
  assert.deepEqual(
    candidate.variants.map(({ id }) => id),
    ["candidate-opus-medium/v1", "candidate-sol-medium/v1"],
  );
  assert.equal(
    candidate.variants.every(({ effort }) => effort === "medium"),
    true,
  );

  const pricing = JSON.parse(
    await readFile(join(root, "pricing/basis.json"), "utf8"),
  );
  assert.equal(pricing.schema_version, "task-review-price-basis/v1");
  assert.equal(pricing.retrieved_at, "2026-07-23");
  assert.equal(pricing.runtime_reported_cost.kind, "actual");
  assert.equal(pricing.public_price_estimate.kind, "estimate");
  assert.ok(pricing.public_price_estimate.rates.length >= 2);

  return errors;
}

test("frozen fixture has exact graph, oracle, contracts, and candidate isolation", async () => {
  assert.deepEqual(await verifyFixture(fixtureRoot), []);
});

test("manifest detects a one-byte mutation in every frozen component", async () => {
  const manifest = JSON.parse(
    await readFile(join(fixtureRoot, "manifest.json"), "utf8"),
  );

  for (const componentPath of Object.keys(manifest.components)) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "task-review-fixture-"));
    try {
      await cp(fixtureRoot, temporaryRoot, { recursive: true });
      const target = join(temporaryRoot, componentPath);
      const original = await readFile(target);
      const mutated = Buffer.from(original);
      mutated[0] ^= 1;
      await writeFile(target, mutated);
      assert.ok(
        (await verifyFixture(temporaryRoot)).includes(
          `hash mismatch: ${componentPath}`,
        ),
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

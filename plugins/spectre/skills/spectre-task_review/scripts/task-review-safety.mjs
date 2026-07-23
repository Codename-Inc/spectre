#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

const SCHEMA_VERSION = "task-review-safety/v1";
const TERMINAL_REFS = new Set(["", "none", "terminal"]);

function parseArguments(argv) {
  const [operation, ...tokens] = argv;
  const options = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const name = token.slice(2);
    if (name === "json") {
      options.json = true;
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    options[name] = value;
    index += 1;
  }

  if (!operation) {
    throw new Error("Missing operation");
  }
  if (!options["task-dir"]) {
    throw new Error("Missing --task-dir");
  }

  return { operation, options };
}

function hardFailure(code, message, details = {}) {
  return { code, message, ...details };
}

function resultFor(operation) {
  return {
    schema_version: SCHEMA_VERSION,
    operation,
    status: "pass",
    hard_failures: [],
    advisories: [],
  };
}

function finish(result) {
  const exitCode =
    result.status === "pass"
      ? 0
      : result.status === "hard_failure"
        ? 2
        : 3;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = exitCode;
}

async function isReadableFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function resolveReadable(candidates) {
  const seen = new Set();
  for (const candidate of candidates) {
    const path = resolve(candidate);
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    if (await isReadableFile(path)) {
      return path;
    }
  }
  return null;
}

function section(markdown, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(
      `^##\\s+(?:\\d+\\.\\s*)?${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`,
      "im",
    ),
  );
  return match?.[1] ?? "";
}

function referencedPath(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(`${escaped}\\s*:\\s*(?:\`([^\`]+)\`|([^\\s]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? null;
}

async function resolveReference(rawPath, executePath, taskDir) {
  if (!rawPath) {
    return null;
  }
  const candidates = isAbsolute(rawPath)
    ? [rawPath]
    : [
        resolve(process.cwd(), rawPath),
        resolve(dirname(executePath), rawPath),
        resolve(taskDir, rawPath),
      ];
  return resolveReadable(candidates);
}

function inlineObjects(markdownSection) {
  return [...markdownSection.matchAll(/`\{([^`\n]+)\}`/g)].map(
    ([, body]) => body,
  );
}

function stringProperty(objectText, name) {
  const match = objectText.match(
    new RegExp(`\\b${name}\\s*:\\s*"([^"]*)"`, "i"),
  );
  return match?.[1] ?? null;
}

function arrayProperty(objectText, name) {
  const match = objectText.match(
    new RegExp(`\\b${name}\\s*:\\s*\\[([^\\]]*)\\]`, "i"),
  );
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map(([, value]) => value);
}

function splitReferences(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return values
    .map((entry) => String(entry).trim())
    .filter((entry) => !TERMINAL_REFS.has(entry.toLowerCase()));
}

function hasCycle(nodes, adjacency) {
  const visiting = new Set();
  const visited = new Set();

  function visit(node) {
    if (visiting.has(node)) {
      return true;
    }
    if (visited.has(node)) {
      return false;
    }
    visiting.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (visit(neighbor)) {
        return true;
      }
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  return nodes.some(visit);
}

function parentProjection(tasks, failures) {
  const parents = [];
  const seen = new Set();

  for (const phase of Array.isArray(tasks?.phases) ? tasks.phases : []) {
    for (const parent of Array.isArray(phase?.parents) ? phase.parents : []) {
      const id = typeof parent?.id === "string" ? parent.id.trim() : "";
      if (!id) {
        failures.push(
          hardFailure(
            "PARENT_ID_UNRESOLVABLE",
            "A parent required for targeted slicing has no resolvable id.",
          ),
        );
        continue;
      }
      if (seen.has(id)) {
        failures.push(
          hardFailure(
            "PARENT_ID_DUPLICATE",
            `Parent id ${id} is duplicated in the task graph.`,
            { parent_id: id },
          ),
        );
        continue;
      }
      seen.add(id);
      parents.push({
        id,
        predecessor: splitReferences(parent.predecessor),
        unblocks: splitReferences(parent.unblocks),
      });
    }
  }

  return parents;
}

function validateParentDependencies(parents, failures) {
  const parentIds = new Set(parents.map(({ id }) => id));
  const adjacency = new Map(
    parents.map(({ id }) => [id, new Set()]),
  );

  for (const parent of parents) {
    for (const predecessor of parent.predecessor) {
      if (!parentIds.has(predecessor)) {
        failures.push(
          hardFailure(
            "DEPENDENCY_PARENT_UNRESOLVED",
            `Parent ${parent.id} references missing predecessor ${predecessor}.`,
            { parent_id: parent.id, reference: predecessor },
          ),
        );
      } else {
        adjacency.get(predecessor).add(parent.id);
      }
    }
    for (const unblocked of parent.unblocks) {
      if (!parentIds.has(unblocked)) {
        failures.push(
          hardFailure(
            "DEPENDENCY_PARENT_UNRESOLVED",
            `Parent ${parent.id} references missing unblocked parent ${unblocked}.`,
            { parent_id: parent.id, reference: unblocked },
          ),
        );
      } else {
        adjacency.get(parent.id).add(unblocked);
      }
    }
  }

  if (
    !failures.some(
      ({ code }) => code === "DEPENDENCY_PARENT_UNRESOLVED",
    ) &&
    hasCycle([...parentIds], adjacency)
  ) {
    failures.push(
      hardFailure(
        "DEPENDENCY_CYCLE",
        "Declared parent dependencies contain a cycle.",
        { graph: "parents" },
      ),
    );
  }
}

function executeProjection(execute, parents, failures) {
  const parentIds = new Set(parents.map(({ id }) => id));
  const indexEntries = inlineObjects(section(execute, "Parent Task Index"))
    .map((objectText) => stringProperty(objectText, "id"))
    .filter(Boolean);
  const seenIndex = new Set();

  for (const id of indexEntries) {
    if (seenIndex.has(id)) {
      failures.push(
        hardFailure(
          "INDEX_PARENT_DUPLICATE",
          `Parent Task Index repeats parent ${id}.`,
          { parent_id: id },
        ),
      );
    }
    seenIndex.add(id);
    if (!parentIds.has(id)) {
      failures.push(
        hardFailure(
          "INDEX_PARENT_UNRESOLVED",
          `Parent Task Index references missing parent ${id}.`,
          { parent_id: id },
        ),
      );
    }
  }

  const waves = inlineObjects(section(execute, "Wave Plan")).map(
    (objectText) => ({
      id: stringProperty(objectText, "id"),
      parent_task_ids: arrayProperty(objectText, "parent_task_ids"),
      after: arrayProperty(objectText, "after"),
    }),
  );
  const waveIds = new Set();
  for (const wave of waves) {
    if (!wave.id) {
      continue;
    }
    if (waveIds.has(wave.id)) {
      failures.push(
        hardFailure(
          "WAVE_ID_DUPLICATE",
          `Wave id ${wave.id} is duplicated.`,
          { wave_id: wave.id },
        ),
      );
    }
    waveIds.add(wave.id);
  }

  const selectedParents = new Set();
  for (const wave of waves) {
    for (const id of wave.parent_task_ids) {
      if (selectedParents.has(id)) {
        failures.push(
          hardFailure(
            "WAVE_PARENT_DUPLICATE",
            `Parent ${id} is selected more than once by the Wave Plan.`,
            { parent_id: id },
          ),
        );
      }
      selectedParents.add(id);
      if (!parentIds.has(id)) {
        failures.push(
          hardFailure(
            "WAVE_PARENT_UNRESOLVED",
            `Wave ${wave.id ?? "(missing id)"} references missing parent ${id}.`,
            { wave_id: wave.id, parent_id: id },
          ),
        );
      }
    }
    for (const dependency of wave.after) {
      if (!waveIds.has(dependency)) {
        failures.push(
          hardFailure(
            "WAVE_REFERENCE_UNRESOLVED",
            `Wave ${wave.id ?? "(missing id)"} references missing wave ${dependency}.`,
            { wave_id: wave.id, reference: dependency },
          ),
        );
      }
    }
  }

  const waveAdjacency = new Map(
    [...waveIds].map((id) => [id, new Set()]),
  );
  for (const wave of waves) {
    if (!wave.id) {
      continue;
    }
    for (const dependency of wave.after) {
      if (waveIds.has(dependency)) {
        waveAdjacency.get(dependency).add(wave.id);
      }
    }
  }
  if (
    !failures.some(
      ({ code }) => code === "WAVE_REFERENCE_UNRESOLVED",
    ) &&
    hasCycle([...waveIds], waveAdjacency)
  ) {
    failures.push(
      hardFailure(
        "DEPENDENCY_CYCLE",
        "Declared wave dependencies contain a cycle.",
        { graph: "waves" },
      ),
    );
  }

  return { index_parent_ids: indexEntries, waves };
}

async function hashDescriptor(path) {
  const bytes = await readFile(path);
  return {
    path: await realpath(path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function preflight(options) {
  const result = resultFor("preflight");
  const taskDir = resolve(options["task-dir"]);
  const executeRequested = options.execute
    ? resolve(options.execute)
    : resolve(taskDir, "specs", "execute.md");
  const executePath = await resolveReadable([executeRequested]);
  const planCandidates = [
    resolve(taskDir, "specs", "plan.md"),
    resolve(dirname(executeRequested), "plan.md"),
  ];
  if (basename(executeRequested).endsWith(".execute.md")) {
    planCandidates.push(
      resolve(
        dirname(executeRequested),
        basename(executeRequested).replace(/\.execute\.md$/, ".plan.md"),
      ),
    );
  }
  const planPath = await resolveReadable(planCandidates);

  if (!planPath) {
    result.hard_failures.push(
      hardFailure(
        "ARTIFACT_MISSING",
        "Required plan artifact is missing or unreadable.",
        { artifact: "plan" },
      ),
    );
  }
  if (!executePath) {
    result.hard_failures.push(
      hardFailure(
        "ARTIFACT_MISSING",
        "Required execute index is missing or unreadable.",
        { artifact: "execute" },
      ),
    );
  }
  if (!executePath) {
    result.status = "hard_failure";
    return result;
  }

  const execute = await readFile(executePath, "utf8");
  const sourceSection = section(execute, "Task Detail Source");
  const declaredSource = referencedPath(sourceSection, "Tasks JSON");
  const fallbackSource = basename(executePath).endsWith(".execute.md")
    ? basename(executePath).replace(/\.execute\.md$/, ".tasks.json")
    : "tasks.json";
  const tasksPath = await resolveReference(
    declaredSource ?? fallbackSource,
    executePath,
    taskDir,
  );
  if (!tasksPath) {
    result.hard_failures.push(
      hardFailure(
        "TASK_SOURCE_UNRESOLVABLE",
        "Task Detail Source does not resolve to a readable task graph.",
        { source: declaredSource ?? fallbackSource },
      ),
    );
    result.status = "hard_failure";
    return result;
  }

  let tasks;
  try {
    tasks = JSON.parse(await readFile(tasksPath, "utf8"));
  } catch (error) {
    result.hard_failures.push(
      hardFailure(
        "TASK_JSON_INVALID",
        "Task detail JSON does not parse.",
        { error: error.message },
      ),
    );
    result.status = "hard_failure";
    return result;
  }

  const parents = parentProjection(tasks, result.hard_failures);
  validateParentDependencies(parents, result.hard_failures);
  const executeData = executeProjection(
    execute,
    parents,
    result.hard_failures,
  );

  result.projection = {
    parents,
    index_parent_ids: executeData.index_parent_ids,
    waves: executeData.waves,
  };
  result.protected_hashes = {};
  if (planPath) {
    result.protected_hashes.plan = await hashDescriptor(planPath);
  }
  result.protected_hashes.execute = await hashDescriptor(executePath);
  result.protected_hashes.tasks = await hashDescriptor(tasksPath);

  const scopeSource = referencedPath(
    section(execute, "Document Manifest"),
    "Scope",
  );
  const scopePath = await resolveReference(
    scopeSource,
    executePath,
    taskDir,
  );
  if (scopePath) {
    result.protected_hashes.scope = await hashDescriptor(scopePath);
  } else if (scopeSource) {
    result.advisories.push({
      code: "OPTIONAL_SCOPE_UNRESOLVABLE",
      message: "The listed scope artifact was not available for hashing.",
      source: scopeSource,
    });
  }

  if (result.hard_failures.length > 0) {
    result.status = "hard_failure";
  }
  return result;
}

function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function reportFindings(report, failures) {
  const findingsSection = section(report, "Findings");
  if (/\bno findings\b/i.test(findingsSection)) {
    return { count: 0, explicit_no_findings: true };
  }

  const rows = findingsSection
    .split(/\r?\n/)
    .filter((line) => /^\s*\|.*\|\s*$/.test(line))
    .map((line) =>
      line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) =>
      cell.toLowerCase().replace(/[^a-z]/g, ""),
    );
    return (
      normalized.includes("location") &&
      normalized.includes("finding") &&
      (normalized.includes("suggestededit") || normalized.includes("edit"))
    );
  });
  if (headerIndex < 0) {
    failures.push(
      hardFailure(
        "REPORT_FINDINGS_INVALID",
        "Report must contain a parseable Findings table or explicit no-findings form.",
      ),
    );
    return { count: 0, explicit_no_findings: false };
  }

  const headers = rows[headerIndex].map((cell) =>
    cell.toLowerCase().replace(/[^a-z]/g, ""),
  );
  const locationIndex = headers.indexOf("location");
  const findingIndex = headers.indexOf("finding");
  const editIndex = headers.includes("suggestededit")
    ? headers.indexOf("suggestededit")
    : headers.indexOf("edit");
  const findings = rows.slice(headerIndex + 1).filter((row) => {
    return !row.every((cell) => /^:?-{3,}:?$/.test(cell));
  });

  if (findings.length === 0) {
    failures.push(
      hardFailure(
        "REPORT_FINDINGS_INVALID",
        "Findings table contains no findings.",
      ),
    );
  } else if (
    findings.some(
      (row) =>
        !row[locationIndex]?.trim() ||
        !row[findingIndex]?.trim() ||
        !row[editIndex]?.trim(),
    )
  ) {
    failures.push(
      hardFailure(
        "REPORT_FINDING_FIELDS_MISSING",
        "Every finding requires nonempty location, finding, and edit fields.",
      ),
    );
  }

  return {
    count: findings.length,
    explicit_no_findings: false,
  };
}

function metadataValue(report, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = report.match(
    new RegExp(
      `^\\s*[-*]?\\s*(?:\\*\\*)?${escaped}\\s*:(?:\\*\\*)?\\s*(.+?)\\s*$`,
      "im",
    ),
  );
  return match?.[1]?.replace(/\*\*$/u, "").trim() ?? "";
}

async function validateProtectedHashes(path, failures) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    failures.push(
      hardFailure(
        "PROTECTED_HASHES_INVALID",
        "Protected hash record is missing or invalid.",
        { error: error.message },
      ),
    );
    return {};
  }
  const hashes = parsed.protected_hashes ?? parsed;
  if (!hashes || typeof hashes !== "object" || Array.isArray(hashes)) {
    failures.push(
      hardFailure(
        "PROTECTED_HASHES_INVALID",
        "Protected hash record has no hash mapping.",
      ),
    );
    return {};
  }

  for (const [name, descriptor] of Object.entries(hashes)) {
    if (
      typeof descriptor?.path !== "string" ||
      typeof descriptor?.sha256 !== "string"
    ) {
      failures.push(
        hardFailure(
          "PROTECTED_HASHES_INVALID",
          `Protected hash descriptor ${name} is invalid.`,
          { artifact: name },
        ),
      );
      continue;
    }
    let actual = null;
    try {
      actual = (await hashDescriptor(descriptor.path)).sha256;
    } catch {
      // A missing protected artifact is a mismatch, not an internal error.
    }
    if (actual !== descriptor.sha256) {
      failures.push(
        hardFailure(
          "PROTECTED_HASH_MISMATCH",
          `Protected artifact ${name} changed or became unreadable.`,
          { artifact: name, path: descriptor.path },
        ),
      );
    }
  }
  return hashes;
}

async function validateReport(options) {
  if (!options.report || !options["protected-hashes"]) {
    throw new Error(
      "validate-report requires --report and --protected-hashes",
    );
  }
  const result = resultFor("validate-report");
  const taskDir = resolve(options["task-dir"]);
  const allowedDirectory = resolve(taskDir, "reviews");
  const reportPath = resolve(options.report);

  if (!isWithin(allowedDirectory, reportPath)) {
    result.hard_failures.push(
      hardFailure(
        "REPORT_PATH_OUTSIDE",
        "Report path escapes the allowed reviews directory.",
        { path: reportPath },
      ),
    );
  }

  let report = null;
  if (result.hard_failures.length === 0) {
    try {
      report = await readFile(reportPath, "utf8");
      const [allowedRealPath, reportRealPath] = await Promise.all([
        realpath(allowedDirectory),
        realpath(reportPath),
      ]);
      if (!isWithin(allowedRealPath, reportRealPath)) {
        result.hard_failures.push(
          hardFailure(
            "REPORT_PATH_OUTSIDE",
            "Report resolves outside the allowed reviews directory.",
            { path: reportRealPath },
          ),
        );
      }
    } catch (error) {
      result.hard_failures.push(
        hardFailure(
          "REPORT_UNREADABLE",
          "Report is missing or unreadable.",
          { error: error.message },
        ),
      );
    }
  }

  if (report !== null && result.hard_failures.length === 0) {
    result.report = reportFindings(report, result.hard_failures);
    const requiredMetadata = [
      "Mode",
      "Reviewer Runtime",
      "Reviewer Model",
      "Reviewer Effort",
      "Invocation Route",
    ];
    const missing = requiredMetadata.filter(
      (label) => !metadataValue(report, label),
    );
    if (missing.length > 0) {
      result.hard_failures.push(
        hardFailure(
          "REPORT_METADATA_MISSING",
          `Report is missing required route metadata: ${missing.join(", ")}.`,
          { fields: missing },
        ),
      );
    }
  }

  await validateProtectedHashes(
    options["protected-hashes"],
    result.hard_failures,
  );
  result.validated_report = reportPath;
  if (result.hard_failures.length > 0) {
    result.status = "hard_failure";
  }
  return result;
}

async function main() {
  let operation = "unknown";
  try {
    const parsed = parseArguments(process.argv.slice(2));
    operation = parsed.operation;
    if (operation === "preflight") {
      finish(await preflight(parsed.options));
      return;
    }
    if (operation === "validate-report") {
      finish(await validateReport(parsed.options));
      return;
    }
    throw new Error(`Unknown operation: ${operation}`);
  } catch (error) {
    finish({
      ...resultFor(operation),
      status: "internal_error",
      hard_failures: [
        hardFailure("INTERNAL_ERROR", error.message),
      ],
    });
  }
}

await main();

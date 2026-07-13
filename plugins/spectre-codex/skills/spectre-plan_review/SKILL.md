---
name: "spectre-plan_review"
description: "👻 | Independent multi-lens review of plan.md and/or tasks.json — finds overengineering, missing verification, hallucinated deps, weak references"
user-invocable: true
---

# plan_review

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# plan_review: Adversarial or Multi-Lens Review of Plan and/or Tasks

## Description

- **What** — `--mode adversarial` runs a fast execution-readiness attack; `--mode full` runs four independent review lenses plus compiler
- **Outcome** — Compiled findings with concrete edit suggestions; optional write-back to update the available artifacts
- **Artifact** — Always save the final Markdown review report before any write-back so pre-integration findings are auditable
- **Role** — Senior staff engineer + reviewer panel; bias toward pragmatic problem-solving, YAGNI enforcement, and verifiability

## Canonical Scope Invariant

`concepts/scope.md` is canonical when present. If absent, use `specs/prd.md`, `specs/ux.md`, and explicit requirements in `task_context.md` as the scope source, in that order.

Reviewers may recommend deleting unrequested implementation details, unnecessary abstractions, weak verification, hallucinated references, bad dependencies, or task sequencing problems. They MUST NOT cut, narrow, expand, or reinterpret agreed scope. If a reviewer believes the agreed scope itself is too large, internally inconsistent, or missing a requirement, phrase that as a **Scope Change Required** recommendation for the user. Do not apply it to `plan.md` or `tasks.json` during write-back.

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Review Mode

- Default: `full` unless ARGUMENTS contains `--mode adversarial`.
- **adversarial** — STANDARD planning path. One reviewer attacks likely execution failure: unrequested complexity, fake refs/deps, non-executable verification, and task gaps. It does not critique architectural optimality.
- **full** — COMPREHENSIVE/manual path. Four lenses plus compiler, including canonical reference quality and missed reuse.

## Why Four Lenses

Full mode uses four lenses because a single reviewer biases toward the issues it notices first. Published practice (Cognition, Anthropic, Osmani) converges on four high-yield review angles for AI-agent-authored plans.

| Lens | Subagent | Finds |
|------|----------|-------|
| **YAGNI / familiar-shape bias** | `@reviewer` | Mature-system patterns that crept in unprompted (auth → rate-limit, CRUD → soft-delete, etc.). Forces ONE "delete this" recommendation. |
| **Verifiability** | `@analyst` | Acceptance criteria that aren't executable; verification gaps between plan and tasks. |
| **Existence / hallucination** | `@finder` | File paths, packages, APIs, or symbols referenced that don't actually exist. The slopsquatting fence. |
| **Canonical reference quality** | `@patterns` | "Follow existing pattern" claims without a real file:line anchor; missed reuse opportunities. |

## Step 1 — Locate Artifacts

- **Action** — DetermineTaskDir:
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - `safe_branch={branch_name with path separators replaced by _}`
  - **If** user specifies path in ARGUMENTS → `TASK_DIR={that value}`
  - **Else** → `TASK_DIR=docs/tasks/{branch_name}`

- **Action** — ResolveArtifacts: Locate the available review inputs.
  - `PLAN=${TASK_DIR}/specs/plan.md` (or scoped name)
  - `TASKS=${TASK_DIR}/specs/tasks.json` (or scoped name)
  - `CONTEXT=${TASK_DIR}/task_context.md`
  - `SCOPE=${TASK_DIR}/concepts/scope.md` when present; otherwise use `specs/prd.md` / `specs/ux.md` as available
  - `REVIEWS_DIR=${TASK_DIR}/reviews`
  - `REVIEW_REPORT=${REVIEWS_DIR}/plan_review.md`; if that exists, use `plan_review_{YYYY-MM-DD_HHMMSS}.md` to avoid overwriting prior review evidence.
  - `TMP_REVIEW_DIR=${TMPDIR:-/tmp}/spectre-plan-review/{safe_branch}/{YYYY-MM-DD_HHMMSS}`; create it outside the repo for non-canonical lens reports.
  - `plan.md` and `tasks.json` are independently reviewable. It is valid to review only `plan.md`, only sliced task detail from `tasks.json`, or both.
  - `task_context.md` is helpful context but is not required. If it is missing, continue and note that requirements traceability is limited.
  - If both `plan.md` and `tasks.json` are missing, stop and suggest the user run `spectre-plan` or `spectre-create_tasks` first.
  - If exactly one of `plan.md` or `tasks.json` is missing, list it as absent context and continue. Do not decline, stop, or ask the user to create the missing artifact.

- **Action** — ReadAvailable: Read available scope, context, and plan files completely before dispatching reviewers. For `tasks.json`, do not read `specs/execute.md` and do not load the full task detail file into context; extract only the `phases[]` fields needed by reviewers:
  - parent task `id`, `title`, `description`, `status`, `predecessor`, and `unblocks`
  - subtask `id`, `title`, `type`, `status`, `produces`, `consumed_by`, `replaces`, `context`, `predecessor`, and `acceptance_criteria`
  Reviewers receive curated excerpts plus an artifact manifest that says which files are present and absent. Every reviewer must review the artifacts that exist and must not treat absent artifacts as a blocker. The manifest must label the canonical scope source and state that review findings may not remove or narrow scope.

## Step 2 — Dispatch Reviewers

### Adversarial Mode

If ARGUMENTS contains `--mode adversarial`, spawn one `@reviewer` subagent with write access to `${REVIEW_REPORT}`. Pass the artifact manifest, canonical scope source, and available artifact excerpts. The reviewer must write `${REVIEW_REPORT}` before returning.

Brief:
> Attack this plan and sliced `tasks.json` detail only for execution readiness. Find: (1) what will make implementation fail or produce wrong output, (2) unrequested overbuild or out-of-bounds work, (3) hallucinated files/packages/symbols/endpoints/env vars/CLI flags, (4) non-executable verification or missing acceptance criteria, (5) task gaps that leave producer output unwired to a consumer. Do not critique whether the architecture is optimal unless it creates one of those failures. Preserve canonical scope.
>
> Output:
> `## Review Findings — {feature}`
> `### Findings`
> table columns: `# | Severity | Location | Finding | Suggested Edit`
> `### Summary` with counts
> `### Review Metadata` with reviewed artifacts, canonical scope source, auto-apply mode, timestamp, and `Mode: adversarial`.
> Use severities Blocker/High/Medium/Low/Scope Change Required. Include concrete suggested edits. If no findings, say so explicitly.

Then skip Step 3 and continue to Step 4.

### Full Mode

Spawn all four subagents in one parallel dispatch. Each receives the same artifact excerpts/manifest, one review brief, and one assigned output path:
`01-yagni.md`, `02-verifiability.md`, `03-existence.md`, `04-references.md` under `${TMP_REVIEW_DIR}`.

Each reviewer MUST write its findings to its assigned tmp path and return only status + path. The primary agent must not synthesize reviewer messages; tmp reports are compiler inputs.

Missing-artifact rule for every lens: review what exists. If a finding depends on a missing artifact, phrase it as "not reviewable because `<artifact>` is absent" only when that context is necessary; do not fail the review or ask for the missing artifact.

### Lens 1 — YAGNI / Familiar-Shape Bias (`@reviewer`)

> Review the available plan and/or task list for unrequested complexity. Agents have a documented "familiar-shape bias": shown a feature, they reproduce the mature-system shape from their training data (auth → adds rate-limiting; CRUD → adds soft-delete; form → adds optimistic UI; service → adds telemetry; module → adds feature flags). Your job is to find that bias here.
>
> Find:
> 1. When `plan.md` is present: anything in Technical Approach that isn't traceable to a requirement in available context (`scope.md` / `task_context.md` / PRD / UX). If context is absent, use the plan's own requirements and boundaries.
> 2. When `tasks.json` is present: use `phases[].parents[]` and `phases[].parents[].subtasks[]` slices to find tasks that implement something the available requirements don't ask for. If requirements context is absent, use the task artifact's `meta`, parent descriptions, and stated boundaries.
> 3. Abstractions, interfaces, or layers introduced for a single concrete caller.
> 4. Generality (config files, plugin points, factories) where the actual need is one specific behavior.
> 5. Overlap with the `Out-of-Bounds — DO NOT add` list (if anything violates that list, it's a hard fail).
>
> Scope guard: you may nominate implementation detail to delete only when it is not required by canonical scope. Do not nominate an agreed requirement, user-approved behavior, or required task as the thing to delete. If the best "cut" would change canonical scope, label it **Scope Change Required** and do not include it as an auto-applicable deletion.
>
> Required output: nominate the SINGLE highest-leverage implementation detail to delete and justify it. You must pick one unless every possible deletion would change canonical scope; in that case, say "No scope-safe deletion found" and provide the nearest Scope Change Required recommendation separately. Then list other simplifications ranked by impact. For each finding, cite the exact file:line or section header it lives in.

### Lens 2 — Verifiability (`@analyst`)

> Review the available plan and/or task list for verification quality. The single highest-correlate of successful AI-agent execution is the ability to self-verify. Find every place where verification is missing, prose-only, or disconnected.
>
> Find:
> 1. When `plan.md` is present: items in "Verification — How We Know This Works" that are prose ("works correctly", "is consistent") rather than executable (test name / observable behavior / state condition).
> 2. When `plan.md` is present: phases that don't declare a verification signal.
> 3. When `tasks.json` is present: inspect `phases[].parents[].subtasks[].acceptance_criteria`; flag criteria that aren't one of the three executable types (test passes / observable behavior / state condition).
> 4. When both `plan.md` and `tasks.json` are present: verification signals in `plan.md` with no matching `acceptance_criteria` entry in the task slices.
> 5. When `tasks.json` is present: use `phases[].parents[].subtasks[].type` and predecessor order to find behavior-changing subtasks that lack a preceding RED test subtask.
>
> Required output: list every non-executable criterion with a proposed rewrite in one of the three types. Cite file:line for each.

### Lens 3 — Existence / Hallucination (`@finder`)

> Review the available plan and/or task list for references to things that may not exist. AI-generated plans hallucinate file paths, package names, function signatures, and API endpoints at measurable rates (~20% for packages per Snyk analysis). Your job is to verify every reference is real.
>
> Verify:
> 1. Every file path mentioned in available artifacts, including `plan.md` "Critical Files for Implementation" and `tasks.json` `phases[].parents[].subtasks[].context[].path` entries when present — does the file exist in the repo today? Use Glob/Read to confirm.
> 2. Every package in `plan.md` "External Dependencies" when `plan.md` is present — does it exist at the named version? (Note: actual install/registry check is the executor's Phase 0 job; your job is to flag suspicious names — typos, near-misses to well-known packages, lookalikes.)
> 3. Every function, class, or symbol named in available plan/tasks — grep the repo, confirm it exists where claimed.
> 4. Every API endpoint, env var, or CLI flag referenced — confirm it's defined in the codebase.
>
> Required output: list every reference that fails verification, with `expected: <plan claim>` and `actual: <repo state>`. If everything checks out, say so explicitly — don't pad.

### Lens 4 — Canonical Reference Quality (`@patterns`)

> Review the available plan and/or task list for the quality of "follow existing pattern" references. Anthropic's own guidance is to anchor plans with concrete examples (e.g., "HotDogWidget.php is a good example"). Vague "follow existing patterns" without a file:line anchor is a documented failure mode.
>
> Find:
> 1. When `plan.md` is present: places in Technical Approach that reference "existing patterns" or "similar features" without a specific file:line.
> 2. When `tasks.json` is present: sub-tasks whose `context[]` entries lack a canonical reference pointer (`path` plus `anchor` or equivalent file:line specificity).
> 3. Better canonical references that the plan missed — actual files in the codebase that more closely match the intended shape.
> 4. Reuse opportunities the plan ignored: utilities, hooks, helpers, or types already in the repo that the plan re-implements.
>
> Required output: for each weak/missing reference, propose a specific file:line that should be the anchor. For each missed reuse, cite the existing utility and which task should use it.

## Step 3 — Compile Final Review

Skip this step in adversarial mode because Step 2 wrote `${REVIEW_REPORT}` directly.

- **Action** — DispatchCompiler: Wait for all four reviewers to write tmp reports, then spawn a fifth subagent (`@reviewer`, which has scoped write access). Pass only: artifact manifest, canonical scope source, `${REVIEW_REPORT}`, `${TMP_REVIEW_DIR}`, and the four tmp report paths. The primary agent must not read or merge the tmp reports.

- **Compiler contract** — Read all four tmp reports, dedupe overlaps, assign severity, create `${REVIEWS_DIR}`, and write `${REVIEW_REPORT}` before any write-back. Do not overwrite an existing report:
  - **Blocker** — execution fails or wrong output
  - **High** — meaningfully reduces output quality
  - **Medium** — overengineering/reuse miss without functional blast radius
  - **Low** — stylistic or nice-to-have
  - **Scope Change Required** — valid only with explicit user scope approval

  ```markdown
  ## Review Findings — {feature name}

  ### Must-Delete (Lens 1 — YAGNI)
  > {The single nominated highest-leverage cut, with rationale.}

  ### Findings

  | # | Severity | Lens | Location | Finding | Suggested Edit |
  |---|----------|------|----------|---------|----------------|
  | 1 | Blocker  | Existence | plan.md `## External Dependencies` | `react-use-undocumented@2.4.0` doesn't exist on npm | Remove; the plan can use `useReducer` from React stdlib (see `src/hooks/useFormState.ts:18`) |
  | 2 | High     | Verifiability | tasks.json `phases[].parents[].subtasks[1.2.1]` | "Component renders correctly" is prose | Replace with: Test passes `<ProductCard /> renders product.title and product.price` |
  | 3 | High     | YAGNI | plan.md `## Technical Approach` | Adds retry-with-backoff for a sync internal call | Delete; not in requirements; Out-of-Bounds list already forbids retry logic |
  | … |          |       |          |         |                |

  ### Summary
  - Blockers: {N} — must resolve before /execute
  - High: {N}
  - Medium: {N}
  - Low: {N}

  ### Review Metadata
  - Reviewed artifacts: {present/absent exact paths}
  - Canonical scope source: {path}
  - Auto-apply mode: {enabled/disabled}
  - Timestamp: {ISO8601}
  - Tmp reports: {4 paths}
  - Note: This report captures plan_review findings before any write-back to plan.md or tasks.json.
  ```

- **Action** — ConfirmCompiledReport: Confirm `${REVIEW_REPORT}` exists. Include the saved report path in all subsequent summaries and in `ReportApplied`.

## Step 4 — Surface Findings & Apply Edits

- **Action** — PresentFindings: Read only `${REVIEW_REPORT}` (not tmp reports), render the findings table inline, and include `Review report saved: {REVIEW_REPORT}`.

- **Action** — DetectAutoApplyMode: If ARGUMENTS contains `--auto-apply scope-safe`, skip the user selection prompt and apply all scope-safe Blocker and High findings, plus Medium/Low findings only when the Suggested Edit is unambiguous and cannot change canonical scope. Do not apply findings marked Scope Change Required. Continue to ApplyEdits and SelfCheck, then return the applied/skipped summary to the invoking workflow.

- **Action** — OfferWriteBack: Unless `--auto-apply scope-safe` is present, after the table prompt:

  > Reply with which findings to apply:
  > - `all` — apply every suggested edit
  > - `blockers` — apply Blocker + High severity only
  > - `1,3,5` — apply specific finding numbers
  > - `skip` — leave artifacts unchanged
  >
  > For findings I apply, I'll edit the relevant available artifact(s) inline and re-run a fast self-check.

- **Wait** — User selects.

- **Action** — ApplyEdits: For each selected finding:
  - Open the named artifact (`plan.md` or `tasks.json`)
  - Apply the Suggested Edit verbatim where possible; if the edit needs adaptation, make the minimum change consistent with the finding's intent
  - Track which findings were applied
  - Before writing, confirm the edit preserves every requirement and boundary in the canonical scope source. If it would remove, narrow, expand, or reinterpret scope, skip it and record it as "skipped: requires scope change."

- **Action** — SelfCheck: After edits, run a fast pass over the modified sections:
  - Re-verify any file:line refs touched
  - Re-verify acceptance criteria are still executable
  - Confirm no edit introduced a new Out-of-Bounds violation
  - Confirm canonical scope is still fully represented by the resulting plan/tasks artifacts
  - If any check fails, surface it and ask the user before continuing

- **Action** — ReportApplied:

  > Applied: {list of finding numbers}. Skipped: {list}.
  > Review report: {REVIEW_REPORT}.
  > {Path to updated artifact(s)}.
  > Scope-change recommendations not applied: {list or "none"}.

## Step 5 — Next Steps

- **Action** — RenderFooter: Use `Skill(spectre-guide)` skill for Next Steps footer.

---

## Notes

- This skill does NOT generate plans or tasks. It reviews available planning artifacts. If only one of `plan.md` or `tasks.json` exists, review that artifact. Only route the user to `spectre-plan` or `spectre-create_tasks` when neither reviewable artifact exists.
- The four lenses are intentionally non-overlapping by design but will surface overlap in practice — dedupe at synthesis, don't ask reviewers to coordinate.
- The "Must-Delete" nomination from Lens 1 is mandatory output — even on a tight plan, naming the single weakest element is a forcing function against under-review.

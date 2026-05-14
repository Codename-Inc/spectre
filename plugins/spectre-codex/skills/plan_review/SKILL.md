---
name: "plan_review"
description: "👻 | Independent multi-lens review of plan.md + tasks.md — finds overengineering, missing verification, hallucinated deps, weak references"
user-invocable: true
---

# plan_review

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# plan_review: Multi-Lens Review of Plan & Tasks

## Description

- **What** — Independent review of `plan.md` + `tasks.md` from four specialized lenses, dispatched in parallel
- **Outcome** — Structured findings with concrete edit suggestions; optional write-back to update both artifacts
- **Role** — Senior staff engineer + reviewer panel; bias toward pragmatic problem-solving, YAGNI enforcement, and verifiability

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Why Four Lenses

A single reviewer biases toward the issues it notices first. Published practice (Cognition, Anthropic, Osmani) converges on four high-yield review angles for AI-agent-authored plans. We dispatch each as a parallel subagent so coverage is structurally guaranteed, not dependent on a single reviewer remembering everything.

| Lens | Subagent | Finds |
|------|----------|-------|
| **YAGNI / familiar-shape bias** | `@reviewer` | Mature-system patterns that crept in unprompted (auth → rate-limit, CRUD → soft-delete, etc.). Forces ONE "delete this" recommendation. |
| **Verifiability** | `@analyst` | Acceptance criteria that aren't executable; verification gaps between plan and tasks. |
| **Existence / hallucination** | `@finder` | File paths, packages, APIs, or symbols referenced that don't actually exist. The slopsquatting fence. |
| **Canonical reference quality** | `@patterns` | "Follow existing pattern" claims without a real file:line anchor; missed reuse opportunities. |

## Step 1 — Locate Artifacts

- **Action** — DetermineTaskDir:
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies path in ARGUMENTS → `TASK_DIR={that value}`
  - **Else** → `TASK_DIR=docs/tasks/{branch_name}`

- **Action** — ResolveArtifacts: Locate the three required inputs.
  - `PLAN=${TASK_DIR}/specs/plan.md` (or scoped name)
  - `TASKS=${TASK_DIR}/specs/tasks.md` (or scoped name)
  - `CONTEXT=${TASK_DIR}/task_context.md`
  - If any are missing, list what's missing and stop — do NOT review against a partial set. Suggest the user run `plan` or `create_tasks` first.

- **Action** — ReadAll: Read each file completely into context before dispatching reviewers. Reviewers receive curated excerpts, not raw paths.

## Step 2 — Dispatch Four Parallel Reviewers

Spawn all four subagents in a single message (parallel). Each receives the same artifact excerpts but a different review brief.

### Lens 1 — YAGNI / Familiar-Shape Bias (`@reviewer`)

> Review this plan and task list for unrequested complexity. Agents have a documented "familiar-shape bias": shown a feature, they reproduce the mature-system shape from their training data (auth → adds rate-limiting; CRUD → adds soft-delete; form → adds optimistic UI; service → adds telemetry; module → adds feature flags). Your job is to find that bias here.
>
> Find:
> 1. Anything in `plan.md` Technical Approach that isn't traceable to a requirement in `task_context.md` / scope / PRD.
> 2. Tasks in `tasks.md` that implement something the requirements don't ask for.
> 3. Abstractions, interfaces, or layers introduced for a single concrete caller.
> 4. Generality (config files, plugin points, factories) where the actual need is one specific behavior.
> 5. Overlap with the `Out-of-Bounds — DO NOT add` list (if anything violates that list, it's a hard fail).
>
> Required output: nominate the SINGLE highest-leverage thing to delete and justify it. You must pick one. Then list other simplifications ranked by impact. For each finding, cite the exact file:line or section header it lives in.

### Lens 2 — Verifiability (`@analyst`)

> Review this plan and task list for verification quality. The single highest-correlate of successful AI-agent execution is the ability to self-verify. Find every place where verification is missing, prose-only, or disconnected.
>
> Find:
> 1. Items in `plan.md` "Verification — How We Know This Works" that are prose ("works correctly", "is consistent") rather than executable (test name / observable behavior / state condition).
> 2. Phases in `plan.md` that don't declare a verification signal.
> 3. Sub-tasks in `tasks.md` whose acceptance criteria aren't one of the three executable types (test passes / observable behavior / state condition).
> 4. Verification signals in `plan.md` with no matching acceptance criterion in `tasks.md`.
> 5. Behavior-changing sub-tasks in `tasks.md` that lack a preceding RED test sub-task.
>
> Required output: list every non-executable criterion with a proposed rewrite in one of the three types. Cite file:line for each.

### Lens 3 — Existence / Hallucination (`@finder`)

> Review this plan and task list for references to things that may not exist. AI-generated plans hallucinate file paths, package names, function signatures, and API endpoints at measurable rates (~20% for packages per Snyk analysis). Your job is to verify every reference is real.
>
> Verify:
> 1. Every file path mentioned in `plan.md` "Critical Files for Implementation" and in `tasks.md` Context blocks — does the file exist in the repo today? Use Glob/Read to confirm.
> 2. Every package in `plan.md` "External Dependencies" — does it exist at the named version? (Note: actual install/registry check is the executor's Phase 0 job; your job is to flag suspicious names — typos, near-misses to well-known packages, lookalikes.)
> 3. Every function, class, or symbol named in plan/tasks — grep the repo, confirm it exists where claimed.
> 4. Every API endpoint, env var, or CLI flag referenced — confirm it's defined in the codebase.
>
> Required output: list every reference that fails verification, with `expected: <plan claim>` and `actual: <repo state>`. If everything checks out, say so explicitly — don't pad.

### Lens 4 — Canonical Reference Quality (`@patterns`)

> Review this plan and task list for the quality of "follow existing pattern" references. Anthropic's own guidance is to anchor plans with concrete examples (e.g., "HotDogWidget.php is a good example"). Vague "follow existing patterns" without a file:line anchor is a documented failure mode.
>
> Find:
> 1. Places in `plan.md` Technical Approach that reference "existing patterns" or "similar features" without a specific file:line.
> 2. Sub-tasks in `tasks.md` whose Context block lacks a canonical reference pointer.
> 3. Better canonical references that the plan missed — actual files in the codebase that more closely match the intended shape.
> 4. Reuse opportunities the plan ignored: utilities, hooks, helpers, or types already in the repo that the plan re-implements.
>
> Required output: for each weak/missing reference, propose a specific file:line that should be the anchor. For each missed reuse, cite the existing utility and which task should use it.

## Step 3 — Synthesize Findings

- **Action** — CollectFindings: Wait for all four reviewers to return. Read every finding.

- **Action** — DeduplicateAndPrioritize: Merge findings that overlap (e.g., a missing canonical reference may surface from both Lens 4 and Lens 2). Assign severity:
  - **Blocker** — would cause execution to fail or produce wrong output (hallucinated file path, criterion the executor can't check, Out-of-Bounds violation)
  - **High** — meaningfully reduces output quality (missing RED test, weak canonical reference, prose criterion)
  - **Medium** — overengineering or reuse miss without functional blast radius
  - **Low** — stylistic or nice-to-have

- **Action** — RenderFindingsTable: Output a single structured table. Schema is fixed.

  ```markdown
  ## Review Findings — {feature name}

  ### Must-Delete (Lens 1 — YAGNI)
  > {The single nominated highest-leverage cut, with rationale.}

  ### Findings

  | # | Severity | Lens | Location | Finding | Suggested Edit |
  |---|----------|------|----------|---------|----------------|
  | 1 | Blocker  | Existence | plan.md `## External Dependencies` | `react-use-undocumented@2.4.0` doesn't exist on npm | Remove; the plan can use `useReducer` from React stdlib (see `src/hooks/useFormState.ts:18`) |
  | 2 | High     | Verifiability | tasks.md `1.2.1` | "Component renders correctly" is prose | Replace with: Test passes `<ProductCard /> renders product.title and product.price` |
  | 3 | High     | YAGNI | plan.md `## Technical Approach` | Adds retry-with-backoff for a sync internal call | Delete; not in requirements; Out-of-Bounds list already forbids retry logic |
  | … |          |       |          |         |                |

  ### Summary
  - Blockers: {N} — must resolve before /execute
  - High: {N}
  - Medium: {N}
  - Low: {N}
  ```

## Step 4 — Surface Findings & Apply Edits

- **Action** — PresentFindings: Render the findings table inline.

- **Action** — OfferWriteBack: After the table, prompt:

  > Reply with which findings to apply:
  > - `all` — apply every suggested edit
  > - `blockers` — apply Blocker + High severity only
  > - `1,3,5` — apply specific finding numbers
  > - `skip` — leave artifacts unchanged
  >
  > For findings I apply, I'll edit plan.md and/or tasks.md inline and re-run a fast self-check.

- **Wait** — User selects.

- **Action** — ApplyEdits: For each selected finding:
  - Open the named artifact (plan.md or tasks.md)
  - Apply the Suggested Edit verbatim where possible; if the edit needs adaptation, make the minimum change consistent with the finding's intent
  - Track which findings were applied

- **Action** — SelfCheck: After edits, run a fast pass over the modified sections:
  - Re-verify any file:line refs touched
  - Re-verify acceptance criteria are still executable
  - Confirm no edit introduced a new Out-of-Bounds violation
  - If any check fails, surface it and ask the user before continuing

- **Action** — ReportApplied:

  > Applied: {list of finding numbers}. Skipped: {list}.
  > {Path to updated plan.md and tasks.md}.

## Step 5 — Next Steps

- **Action** — RenderFooter: Use `Skill(spectre-guide)` skill for Next Steps footer.

---

## Notes

- This skill does NOT generate plans or tasks. It reviews them. If `plan.md` or `tasks.md` doesn't exist, route the user to `plan` first.
- The four lenses are intentionally non-overlapping by design but will surface overlap in practice — dedupe at synthesis, don't ask reviewers to coordinate.
- The "Must-Delete" nomination from Lens 1 is mandatory output — even on a tight plan, naming the single weakest element is a forcing function against under-review.

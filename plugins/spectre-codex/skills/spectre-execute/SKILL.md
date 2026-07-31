---
name: "spectre-execute"
description: "Build and acceptance-prove a planned feature from either a compact execute.md/tasks.json work source or an explicit readable plan, dispatching parallel task waves through affected verification, review, autonomous repair/adaptation, and an optional parent-owned downstream finalization boundary. Trigger after structured task artifacts or an executable plan exist, or to resume a partial run. Do NOT trigger for scoping/planning, unplanned bug-fixing, or dead-code cleanup (spectre-prune)."
user-invocable: true
---

# execute

Execute work in parallel waves without loading or generating an exhaustive task graph in primary-agent context. Resolve structured task artifacts before generic plan input, verify each wave against its affected behavior and dependency boundary, adapt only for source-backed compliance, run one early adversarial checkpoint for material risk, and either own final cumulative review or return an explicit implementation-ready handoff to a parent.

## Inputs

- `$ARGUMENTS` — optional explicit feature name/root, descendant execute/task/plan artifact, wave/scope hints, plus `--orchestrated` when a parent goal owns the final user-facing handoff.
- Optional `--finalization-owner parent`. It is valid only with `--orchestrated`; otherwise stop. Without it, `FINALIZATION_OWNER=self` and execute preserves its cumulative affected verification/review/test-guide contract. With it, the named parent owns downstream cleanup, candidate review, and delivery. Execute always owns acceptance-proof closure before returning.
- Plan-direct input may also provide an explicit readable plan path and a confirmed canonical feature root.
- **Structured mode:** an explicit valid execute index with a resolvable `tasks.json`; preserve the existing indexed-task workflow.
- **Plan-direct mode:** an explicit argument naming another readable plan document; resolve it as `PLAN_SOURCE`. Plan-direct mode never routes to `spectre-create_tasks`.
- **No-argument execution:** use the feature-resolution rule below and proceed without a naming gate.

## Working Set

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- When a nested execute artifact is the sole locator, derive `FEATURE_ROOT` from its self-location metadata and physical enclosing feature directory; the physical directory wins on mismatch.
- `OUT_DIR = FEATURE_ROOT`. Pass the exact feature root unchanged to every routed child; a child never rederives it. Passing any produced artifact identifies the feature name and root without branch inference.
- An explicit legacy artifact under `docs/tasks/**` remains a readable input, and existing legacy execute/task status fields may update in place. Do not move or bulk-rewrite it. New canonical documents require a confirmed `.spectre/features/<feature-name>/` root and record the legacy source.
- Resolve an explicit readable path in precedence order:
  1. If it has execute-index structure and resolves an existing, parseable task detail file by the rules below, set `MODE = structured`, `EXECUTE_INDEX = arg path`, and `TASKS_JSON` to that file.
  2. If it has execute-index structure but task detail cannot be resolved or parsed, keep it in structured mode and use the structured missing-artifact escalation; do not reinterpret a broken execute index as a generic plan.
  3. Otherwise set `MODE = plan-direct` and `PLAN_SOURCE = arg path`. Generic readable-plan detection happens only after structured resolution.
- With no explicit work-source path, set `MODE = structured` and `EXECUTE_INDEX = {FEATURE_ROOT}/specs/execute.md`.
- Resolve structured `TASKS_JSON`:
  1. Use `## Task Detail Source` line `Tasks JSON: <path>` when present.
  2. Else if index basename is `execute.md`, use adjacent `tasks.json`.
  3. Else if basename ends `.execute.md`, use sibling `.tasks.json`.
  4. Otherwise stop and ask for the matching task detail JSON path.
- In structured mode, `SCOPE_DOCS` = existing paths listed in the execute index `## Document Manifest`. In plan-direct mode, `SCOPE_DOCS` = existing readable scope/UX/research paths explicitly referenced by `PLAN_SOURCE`, else an empty list; record them under **Source Plan**.
- Plan-direct `EXECUTION_STATE`:
  - Use `{FEATURE_ROOT}/execution_state.md`; if `PLAN_SOURCE` is a legacy input, record its repo-relative path under **Source Plan**.
  - If that path records a different source-plan path, use `{plan-stem}-{short-sha256-of-plan-path}.execution_state.md`.
- Wave diff per gate: `git diff <parent-of-first-wave-commit>..HEAD`; files-touched manifest; structured mode uses verbatim ACs/context from the selected parent-task slice, while plan-direct mode uses transient verbatim source-anchored plan text for the active-wave workstreams.
- Record `FINALIZATION_OWNER` (`self|parent`) in the structured execution summary or plan-direct **Runtime Status**. Plain `--orchestrated` changes handoff only; proof ownership never transfers.

## Method / guardrails

**Resolve + load the selected work source.**
- Structured mode is unchanged: read `EXECUTE_INDEX` whole as the token-efficient orchestration index. Do **not** read `TASKS_JSON` whole; use targeted parsing only for status projection, selected parent-task slices, reviewer criteria/context slices, and status updates. After any JSON write, re-parse `TASKS_JSON` before planning the next wave.
- Plan-direct mode begins execution without a plan-quality, approval, completeness, or Spectre-format gate. The source plan is the sole requirements authority. Never rewrite the source plan; do not edit, repair, approve, or reject it.
- Before the first dev dispatch, create or resume `execution_state.md` with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>` immediately below its title, followed by exactly these seven sections:
  1. **Source Plan** — canonical path; `sha256` of the full source-plan bytes; recorded byte length; Git HEAD at capture; mode; baseline Git SHA; resolved `SCOPE_DOCS`; and pointer-only anchors for objective, boundaries, phases/workstreams, and verification signals. Include the sentence `The source plan is the sole requirements authority.`
  2. **Runtime Status** — pending/running/repairing/needs-authority/done, current and last-completed waves, timestamps, current HEAD, and coarse-map coverage over the source plan. Derive cumulative diff only as `baseline..HEAD`.
  3. **Workstream & Parallelization Map** — one coarse row for every plan-native phase/workstream/work item at initial creation, with source anchor, status, dependencies/shared contracts/change surfaces, and ready/deferred/parallel-safe/sequential rationale. No fixed workstream count is imposed.
  4. **Active Wave** — only the currently dispatchable bounded assignments, owners, plan anchors, expected outputs/consumers/replacements, and verification signals.
  5. **Wave History** — completed assignments, commits, changed files, affected verification commands/results, sentinel/checkpoint classification/result, compact repair ledger (`invariant_family · finding_fingerprint · attempt · route · test topology · disposition`), routed unrelated findings, and E2E completeness signal.
  6. **Plan-Backed Adaptations** — discovered gap, source-plan relationship, disposition, and affected future workstream.
  7. **Final Quality State** — checkpoint/final code-review reports and verdicts, requirement-delivery coverage status, test-guide path, proof runs/result, and unresolved findings.
- The initial map must coarsely cover every plan-native workstream, preserving plan names and source order unless dependency evidence requires documented reordering. Keep detailed assignment content only in **Active Wave**; do not create a parallel JSON task graph, enumerate future subtasks, generate exhaustive acceptance criteria, or durably copy plan excerpts. Stop decomposing as soon as the next safe wave can be dispatched.
- Before resume, recompute `sha256` over the full source-plan bytes and compare the recorded byte length. If unchanged, continue from `EXECUTION_STATE`. If changed, treat the current plan as authoritative, refresh only affected derivative mappings, preserve **Wave History**, and record the reconciliation. Resume/adaptation updates only derivative state and never rewrites the plan.
- Re-read `EXECUTION_STATE` before each wave and update it after every dispatch/gate/adaptation.
- **Verification continuation invariant:** repository-wide baselines and full suites do not belong to execute. A verification failure is repair or routing work, never a blocker by itself. Attribute exact failing identities as `branch-caused`, `unrelated`, or `indeterminate`: repair branch-caused failures and reverify; record or route unrelated failures and continue; resolve indeterminate failures with the smallest focused reproduction, using the recorded base SHA only for that failing check when necessary. Expand affected verification across actual dependency, consumer, integration, and lifecycle boundaries, but never run a complete repository baseline or root suite. Stop only when no safe executable action exists without new user authority.

**Adaptive wave loop** — until the selected mode's completion projection is satisfied:

1. **Batch.**
   - Structured mode: use the execute index's Wave Plan + Parent Task Index to choose pending parent ids. Assign <=3 sequential parent tasks per `@spectre_dev`; batches may span phases when wave guidance allows. End a batch before any dependency boundary.
   - Plan-direct mode: select dependency-ready pending workstreams from the complete coarse map. Detail bounded assignments for the **Active Wave** only. Dispatch in parallel only when dependency, shared-contract, and likely change-surface evidence supports it; sequential execution is valid and its rationale is recorded.
2. **Dispatch wave.** Launch parallel `@spectre_dev` (one per batch).
   - Structured mode: extract only the selected parent task ids from `TASKS_JSON` using `jq`, `node -e`, or targeted read/edit mechanics. Include minimal phase labels plus assigned parents, subtasks, ACs, context, and status fields. Inline that slice under `<task_assignment>` and self-check that the prompt contains selected parent ids and no unrelated parent ids.
   - Plan-direct mode: build `<task_assignment>` from `PLAN_SOURCE` plus the exact **Active Wave** slice. Include transient verbatim source-anchored plan text for the active-wave workstreams, bounded outputs/consumers/replacements, and verification signals. Never persist that plan text in `EXECUTION_STATE`.
   - `@spectre_dev` receives: `<task_assignment>`, `SCOPE_DOCS` paths, and waves 2+ **Prior-Wave Context**; in plan-direct mode it also receives `PLAN_SOURCE`. It MUST read scope docs first, use `<task_assignment>` as the only task source, and **not read any tasks file**.
   - Then it loads `Skill(spectre-tdd)`, executes the bounded assignment sequentially with red/green TDD, commits after each structured parent task or plan-direct workstream assignment, uses native related-test commands, and returns compressed **Implementation Insights** + **E2E Completeness Check**.
   - E2E signal: ⚪ Complete · 🟡 Gap [missing functionality] · 🔴 Adaptation [needs other-task changes].
3. **Per-wave verification gate** (order is load-bearing):
   - **3a — Affected deterministic verification:** the primary—not an implementation-agent report—resolves commands from `package.json`/`pyproject.toml`/`Cargo.toml`/`Makefile` and repository-native test configuration. Independently run affected lint/typecheck/build plus native related/focused tests selected from the wave diff and its real dependency/consumer boundaries. Implementation-agent reports are supporting evidence only. When native selection is ambiguous or unavailable, run the smallest authoritative affected package/workspace command and record the selection uncertainty; do not widen to the repository root.
     - Save raw output outside child prompts. Persist only `fingerprint · failing check/test · attribution · disposition · repair status`.
     - `branch-caused` → set status `repairing`, group failures by invariant/root-cause family, repair, and rerun the failing plus affected checks.
     - `unrelated` → record or route follow-up work and continue; it cannot make the wave or execution `blocked`.
     - `indeterminate` → reproduce only the failing check/test, optionally at the recorded base SHA, then repair or route it. Never run a complete baseline for attribution.
     - Do not invoke reviewers while attributable deterministic failures remain; continue the repair loop instead of returning to the user.
   - **3b — Sentinel selector:** classify the wave before reviewer dispatch:
     - `skip`: deterministic checks passed; isolated implementation; no downstream dependency; no shared contract, replaced path, or E2E gap. Do not dispatch a reviewer; record `sentinel_review: skipped`.
     - `wiring`: default when the wave adds the first vertical slice, touches UI/data/control-flow integration, produces output consumed by later tasks, replaces an old path, exposes a feature, or reports 🟡/🔴 E2E status.
     - `risk`: use when source artifacts declare a matching risk or touched code involves auth, permissions, payments, PII, migrations, public APIs, secrets, network input, destructive actions, data correctness, persistent state, external side effects, shared infrastructure/build/test tooling, cross-package behavior, or the first complete lifecycle/trust-boundary crossing. Expand the affected checks across that demonstrated boundary before reviewer dispatch; do not promote to a full-suite profile.
     - If unsure, choose `wiring` rather than dual review.
   - **3c — Sentinel or one-time risk checkpoint:** persist whether the execution's adversarial risk checkpoint has run in the structured execution summary or plan-direct **Wave History**. At the first `risk` wave, replace—not supplement—the lightweight sentinel with `Skill(spectre-code_review)` using `{FEATURE_ROOT} --orchestrated --checkpoint wave-{N}` over the cumulative feature diff through that wave and only the completed/risk-relevant requirement slices. That skill owns the opposing-runtime route and checkpoint report. On later `risk` waves, and for every `wiring` wave, dispatch at most one lightweight `@spectre_reviewer`. Build a lightweight prompt only from wave diff, files manifest, relevant scope docs, and the mode-specific requirements source: verbatim ACs/context from the selected slice in structured mode, or the same transient verbatim source-anchored plan text for the active-wave workstreams in plan-direct mode. Forbidden: dev reports, implementer rationale, orchestrator paraphrase.
     - `wiring` lens: Defined -> Connected -> Reachable; grep usage, trace UI/API render or call path backward, flag dead computations, orphaned outputs, duplicate data sources, and old active paths.
     - `risk` lens: security + correctness, including scope adherence for the risk surface.
     - Lightweight reviewer output must be either `CLEAN` or CRITICAL/HIGH findings only. No Medium/Low/nits/style/speculative architecture. Every finding must include `file:line`, violated invariant, reproducible failure/exploit scenario, concrete evidence chain, smallest scope-safe fix shape, `finding_fingerprint = sha256(requirement anchor + primary symbol/boundary + normalized observable failure)`, and `invariant_family = sha256(requirement anchor + normalized violated invariant + lifecycle/data-flow boundary)`. Return all evidence-backed CRITICAL/HIGH findings discovered in the scoped pass, not only the first. No evidence chain means `CLEAN`.
   - **3d — Finding disposition + invariant-family repair:** Before repairing any CRITICAL/HIGH finding from a sentinel, checkpoint, or final review, the primary classifies it against the authoritative source as `defect` (the completed slice violates a current requirement), `scheduled` (the exact missing behavior is owned by explicit pending source work and is not required by the completed slice), or `scope-change` (repair would change product requirements or user authority). Record the evidence-backed disposition. Related-file or dependency growth needed to satisfy an existing requirement remains `defect`, not `scope-change`. `scheduled` consumes no attempt; genuine `scope-change` pauses only the action needing user authority while independent work continues. Track repair attempts by `invariant_family`, while `finding_fingerprint` preserves exact manifestation identity; distinct invariant families have independent histories and there is no global sentinel/fix cap. Attempt 1 uses one focused `@spectre_dev` repair. A second manifestation of the same invariant family—regardless of changed symbol or symptom—forces the primary to revalidate and own attempt 2, first producing and observing a RED regression at the invariant's actual level across the demonstrated transition chain (for example write -> reload -> reconcile), then changing both diagnosis and route: implement directly or use a clean-context, high-effort opposing runtime; never replay the same prompt, agent, or approach. If the invariant family survives attempt 2, promote it to source-backed Adapt work with revised implementation shape/dependencies and continue; attempt count alone never stops execution. Growth >25% or test-file changes >0.5x implementation-file changes may trigger Adapt sooner.
   - **3e — Exit:** affected checks have no attributable failure and no required CRITICAL/HIGH defect remains. Unrelated or routed findings do not prevent exit; otherwise Reflect/Adapt.
4. **Mark complete.** In structured mode, edit `TASKS_JSON` status fields for assigned subtasks/parents to `done`, preserve indented valid JSON, and re-parse immediately. In plan-direct mode, update mapped workstream status plus checks, sentinel result, commits/files, and the E2E signal in `EXECUTION_STATE`.
5. **Reflect.** Read completion reports for scope signals and E2E gaps. All ⚪ → next wave. Otherwise adapt.
6. **Adapt only for source compliance.**
   - Structured mode: edit `TASKS_JSON` directly to append gap tasks/subtasks with `status: "pending"`, mark obsolete work `skipped`, and add learned context to future tasks. If parent ids, titles, dependencies, or wave membership change, update only affected `Wave Plan` / `Parent Task Index` rows in `EXECUTE_INDEX`, then re-read the index.
   - Plan-direct mode: add or split derivative work only when demonstrably required for a `PLAN_SOURCE` outcome. Record its source-plan relationship under **Plan-Backed Adaptations** and update only affected map rows/future assignments. Never rewrite the plan or add a nice-to-have.
7. **Next wave.** Structured mode recomputes pending status from `TASKS_JSON` projections. Plan-direct mode re-reads `EXECUTION_STATE`, clears completed **Active Wave** detail into **Wave History**, and derives only the next safe assignments. Gather prior completion reports into `## Prior-Wave Context`, then repeat.

**Finalization ownership.** After the mode-specific work projection is `done`/`skipped`:
- `FINALIZATION_OWNER=parent`: validate that every wave completed affected verification, no attributable CRITICAL/HIGH remains, and the task/workstream completion projection is satisfied. Do not rerun affected commands, dispatch final `spectre-code_review`, or create a test guide. Prepare the `IMPLEMENTATION_READY` manifest with cumulative diff/base, commits/files, affected package/workspace and test roots, exact commands/results, sentinel/checkpoint evidence, compact repair/routing ledger, source requirement paths/slices, and unresolved Medium/Low findings. Return it only after acceptance closure; the parent must use these sources without implementer rationale.
- `FINALIZATION_OWNER=self`: run one cumulative affected verification over the registered changed surfaces and demonstrated dependency boundaries; never run the repository root suite. Then run the expensive review once over the cumulative feature diff:
  - Run `Skill(spectre-code_review)` with `{FEATURE_ROOT} --orchestrated` over the cumulative diff. Pass the exact feature root unchanged. That skill owns the pinned high-effort opposing-runtime reviewer, same-contract native fallback, adversarial lenses, evidence rules, and saved report.
  - Structured-mode reviewer inputs are limited to cumulative diff, files-touched manifest, `SCOPE_DOCS`, and every applicable completed `TASKS_JSON` requirement/AC slice. Plan-direct mode passes the source plan plus relevant execution-state evidence instead of `tasks.json` slices; `PLAN_SOURCE` remains requirements authority and `EXECUTION_STATE` is routing/evidence only. Do not use dev reports or implementer rationale as evidence.
  - The final code-review contract absorbs execute-time validation: it must produce exhaustive requirement delivery/reachability coverage plus scope-creep, dead-computation, old-active-path, and single-data-source audits. Do not separately dispatch `spectre-validate` from execute.
  - Read the saved report. CRITICAL/HIGH defects re-enter Reflect/Adapt under the same disposition and invariant-family repair policy; Medium/Low findings are summarized but do not prevent completion unless the user asks. After a repair, rerun affected verification and only the affected review gate; any cumulative change still requires a fresh final review.
  - After review is clean or accepted:
    - Structured mode runs `Skill(spectre-create_test_guide)` with `{FEATURE_ROOT} --orchestrated`.
    - Plan-direct mode runs `Skill(spectre-create_test_guide)` with `PLAN_SOURCE` and `{FEATURE_ROOT} --orchestrated`.
    - In both modes, pass the exact feature root unchanged.
  - In plan-direct mode, write the final review verdict, requirement-delivery coverage status, and test-guide result to **Final Quality State** without copying requirements from `PLAN_SOURCE`.

**Acceptance closure — always owned by execute.** Invoke `Skill(spectre-proof)` once with `{FEATURE_ROOT} --orchestrated` plus `PLAN_SOURCE` in plan-direct mode. `PASS` closes acceptance. Otherwise apply the disposition, repair, affected-verification/review rules above, then invoke a fresh pass using paths and failed/impact-linked row ids—not raw evidence or a candidate tuple. Attempt count and ordinary failure never stop; return `NEEDS_AUTHORITY` only for conflicting acceptance, unavailable authority/capability, or required scope change. Later observable-behavior repair resumes this execute source; formatting, lint, evidence, rebase, and commit-only changes do not.

## Outputs + DONE

- Complete implementation, committed per structured parent task or plan-direct workstream assignment.
- Structured mode: `TASKS_JSON` statuses reflect completed/skipped/adapted work and parse after final write.
- Plan-direct mode: `EXECUTION_STATE` retains pointer-only plan anchors, complete coarse-map/adaptation statuses, wave history, and final quality evidence.
- `{FEATURE_ROOT}/proof/{proof.json,proof.html}` with aggregate `PASS`.
- `FINALIZATION_OWNER=self`: `{FEATURE_ROOT}/testing/test_guide.md` from `Skill(spectre-create_test_guide)`.
- `FINALIZATION_OWNER=parent`: an `IMPLEMENTATION_READY` handoff with the manifest required above; no claim that downstream candidate review, delivery, or repository-wide CI verification has run.
- Completion summary: tasks done · waves · affected verification commands/results · routed unrelated findings · sentinel review counts (`skip`/`wiring`/`risk-checkpoint`) · invariant-family repair counts · finalization owner/status · final review status when self-owned · requirement-delivery coverage status when self-owned · test-guide path when self-owned · Task Evolution Summary · E2E Gaps Addressed · Unresolved Findings.
- **Structured DONE:** every structured task is `done`/`skipped`.
- **Plan-direct DONE:** every plan-native workstream in the initial coarse map plus every recorded adaptation is `done`/`skipped`, and **Runtime Status** states the map's source-plan coverage.
- **IMPLEMENTATION_READY when parent-owned:** the selected mode's completion rule holds; every wave completed affected verification plus any required sentinel/checkpoint review; no attributable CRITICAL/HIGH remains; proof aggregate is `PASS`; and the complete parent handoff manifest is returned.
- **DONE when self-owned:** the selected mode's completion rule holds; every wave completed affected verification plus any required sentinel/checkpoint review; cumulative affected verification has no attributable failure; final adversarial review's exhaustive delivery coverage is clean or gaps repaired/routed; test guide is written; proof aggregate is `PASS`; and the summary is returned.

## Handoff

Report the summary inline (counts, affected verification, repair/routing iterations, finalization owner/status, unresolved findings, and test-guide path when self-owned).

- `--orchestrated --finalization-owner parent` → after proof `PASS`, return `IMPLEMENTATION_READY`, the required manifest, unresolved findings, and artifact paths to the parent goal without user-facing Next Steps.
- Plain `--orchestrated` → preserve self-owned finalization and proof closure, then return DONE status, unresolved findings, and artifact paths to the parent goal without user-facing Next Steps.
- Standalone → choose the first applicable route:
  1. Unresolved CRITICAL/HIGH review or delivery-coverage gap → `spectre-fix`, then rerun the affected gate.
  2. A concrete automated-coverage risk remains → `spectre-test`.
  3. Otherwise → `spectre-clean`.

Render exactly one `Next (recommended): ... — because {observed execution status}.` Add at most one conditional alternative. If pausing after completed or `needs-authority` execution, offer `Pause: spectre-handoff {feature}` with task status, unresolved findings, and the selected next step.

## Escalate-If

- In structured or no-argument mode, `execute.md` missing/malformed or `tasks.json` unresolved/unparseable → stop; route to `spectre-create_tasks`.
- In plan-direct mode, an unreadable source or a genuine authority/safety impasse → report `NEEDS_AUTHORITY` against the authoritative plan; never route to `spectre-create_tasks` or introduce a plan-completeness gate.
- `--finalization-owner parent` without `--orchestrated`, or a parent that cannot accept the required implementation-ready manifest → stop before implementation.
- A subagent prompt slice contains unrelated parent task ids → fix the slice before dispatch.
- Never request approval solely because of a test/lint/type/build failure, red or unavailable baseline, repair count, reviewer count, diff growth, related-file changes, or a recurring invariant family. Checkpoint/final-review findings use the same disposition and invariant-family repair policy.
- Verification failures remain in repair/routing flow. Escalate only when no safe executable action exists without changing product requirements, using unavailable user authority, or taking an unauthorized destructive action.

## Codex Agent Preflight

Before dispatching any `@spectre_*` custom agent, run the bundled setup helper once:

```bash
node "${PLUGIN_ROOT}/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
```

If the helper reports agents were installed or updated in this session, continue directly only for lookup/scoping work that can be completed without a subagent. For other agent-dependent workflows, stop with a clear one-session restart requirement so Codex can discover the new custom agents.

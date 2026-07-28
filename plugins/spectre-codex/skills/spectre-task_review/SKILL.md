---
name: "spectre-task_review"
description: "Adversarial review of generated execute.md + tasks.json against a reviewed plan using a pinned medium-effort opposite runtime, with consumer-safety preflight and a same-contract native fallback. Checks translation, criteria, RED pairing, dependencies, waves, and alignment. Do NOT review plan quality, finished code, or change scope."
user-invocable: true
---

# task_review

Generated-task review: verify that `spectre-create_tasks` faithfully compiled the reviewed plan into `execute.md` + `tasks.json`. Clear on WHAT, silent on HOW. This is a translation gate, not a second plan review.

## Inputs

- `$ARGUMENTS` - explicit feature name/root or descendant execute/task artifact, `--mode adversarial` (default) or `--mode full`, optional `--auto-apply scope-safe`, and optional `--review-again` only when the user's latest instruction explicitly requests another task review.
- Required: `{FEATURE_ROOT}/specs/plan.md`, `{FEATURE_ROOT}/specs/execute.md`, `{FEATURE_ROOT}/specs/tasks.json` (or scoped `.execute.md` + `.tasks.json` pair).
- Helpful: scope/PRD/UX/context artifacts listed in `execute.md` `Document Manifest`.
- If task artifacts are absent -> stop, route to `spectre-create_tasks`. If `plan.md` is absent -> stop, route to `spectre-create_plan`.

## Working Set

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged to every routed child and external reviewer prompt; a child or reviewer never rederives it.
- An explicit legacy `docs/tasks/**` plan/execute/tasks artifact remains a readable input and existing workflow-owned task status may be updated in place, but do not move or bulk-rewrite legacy records. Require a confirmed `.spectre/features/<feature-name>/` root for new review reports/evidence and record legacy sources.
- `TASK_DIR = FEATURE_ROOT`.
- Resolve `EXECUTE_INDEX` as an explicit descendant artifact or `{FEATURE_ROOT}/specs/execute.md`; resolve `TASKS_JSON` from its `Task Detail Source`, adjacent `tasks.json`, or sibling `.tasks.json`.
- `REVIEW_REPORT = {FEATURE_ROOT}/reviews/task_review.md`; `mkdir -p`. A user-authorized `--review-again` writes `task_review_{YYYY-MM-DD_HHMMSS}.md`; no other condition may select a second report.
- `REVIEW_ATTEMPT = {FEATURE_ROOT}/reviews/task_review_attempt.json`; create it atomically immediately before the first reviewer launch with `status: started`, the report path, route, timestamp, and `authorization: initial|explicit-user-review-again`. Update it to `complete` or `failed` when the round ends.
- `PREFLIGHT_JSON = {FEATURE_ROOT}/reviews/task_review_safety.json`; the primary writes this helper evidence and passes it back for protected-hash validation.
- Every produced JSON evidence artifact (`PREFLIGHT_JSON`, `REVIEW_ATTEMPT`) carries `feature` and `feature_root`; populate them from the physical directory before consuming or persisting that artifact.
- Parse `TASKS_JSON` before review and after every write. Build a compact projection of the complete task graph for the one review brief; do not inline raw graph detail unless it is genuinely small.

## Scope Boundary

Task review may improve translation only: coverage, criteria, dependencies, waves, context anchors, producer/consumer wiring, and execute/json alignment. It may not add, remove, narrow, expand, or reinterpret canonical scope. Scope problems become **Scope Change Required** and remain unapplied.

## Method / guardrails

**One-review hard stop**

**Primary-owned orchestration**
1. Before running a helper, constructing a prompt, or launching any reviewer, check `REVIEW_ATTEMPT` and `REVIEW_REPORT`. If either shows that a task-review round already started, **do not launch, resume, repair, fall back, or synthesize another semantic review**. Return the existing report/attempt status. Artifact changes, final-gate feedback, discussion points, stale hashes, failed/partial prior attempts, and safety uncertainty never reopen the gate.
2. The only override is `--review-again` backed by the user's latest instruction explicitly asking for another task review. A planner, helper, or orchestrator **MUST NOT** infer, manufacture, or add this flag. Record the user's authorization in `REVIEW_ATTEMPT` before launching the explicitly requested round.
3. Resolve `SAFETY_HELPER` as this skill's adjacent `scripts/task-review-safety.mjs`. Run `task-review-safety.mjs` `preflight` before brief construction:
   ```bash
   node "$SAFETY_HELPER" preflight --task-dir "$TASK_DIR" --execute "$EXECUTE_INDEX" --json > "$PREFLIGHT_JSON"
   ```
   Exit `2` stops reviewer launch and surfaces the enumerated hard failures. Exit `3` surfaces an internal helper failure and does not fabricate safety. Incidental advisories are included compactly in the brief, but advisories never block reviewer launch.
4. The safety helper is deterministic validation only. Production task review **MUST NOT run its `impact` operation or use helper output to select, authorize, slice, or restart a semantic review**.
5. Construct one semantic review brief covering the complete task graph and all requested lenses. The one-round policy is the token boundary; small later deltas are handled by deterministic checks and direct edits, not sliced or full re-reviews.
6. If current runtime is Codex and `command -v claude` succeeds, select Claude Code. If current runtime is Claude Code and `command -v codex` succeeds, select Codex. Atomically write `REVIEW_ATTEMPT`, then launch the selected opposite-runtime command as a long-running process and poll it until it completes. Allow up to 20 minutes for completion; quiet output or completion before that maximum is not failure.
7. Run `task-review-safety.mjs` `validate-report` against `REVIEW_REPORT` and the protected hashes in `PREFLIGHT_JSON`:
   ```bash
   node "$SAFETY_HELPER" validate-report --task-dir "$TASK_DIR" --report "$REVIEW_REPORT" --protected-hashes "$PREFLIGHT_JSON" --json
   ```
8. If the report is missing or invalid, use the same external CLI for one report-only repair attempt that may edit only `REVIEW_REPORT`, then validate again.
9. If the opposite CLI is missing, exits non-zero, exceeds the launcher maximum, or still fails report validation, record the terminal reason and use the native fallback. The external attempt, report-only repair, and native fallback are one already-started review round; unavailable opposing runtimes never block completion.
10. Read `REVIEW_REPORT` fully. Record exactly one disposition for every finding ID: `unresolved`, `applied`, `skipped`, or `scope-change`. A report cannot advance without a disposition for every finding.
11. Write back only scope-safe selected findings under the contract below, then append a `## Dispositions` table to `REVIEW_REPORT`.
12. Run the focused post-check through global `preflight`, reparse `TASKS_JSON`, and verify protected scope/plan inputs. Record pass/failure in `REVIEW_ATTEMPT`; a failed post-check is surfaced but **never triggers another semantic review**.
13. Primary-agent self-review is prohibited except validating and persisting an explicit native fallback return.
14. Do not probe for startup commands. Use exactly the recipe below.

**Opposite-runtime initiation recipe**

From Codex primary:
```bash
claude -p --model opus --effort medium --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Write" --output-format text "$REVIEW_PROMPT"
```

From Claude Code primary:
```bash
codex exec -C "$PWD" -m gpt-5.6-sol -c 'model_reasoning_effort="medium"' -s workspace-write "$REVIEW_PROMPT"
```

External report metadata is fixed by route: Codex -> Claude Code records `Reviewer Runtime: Claude Code`, `Reviewer Model: opus`, `Reviewer Effort: medium`, `Invocation Route: Codex -> Claude Code`; Claude Code -> Codex records `Reviewer Runtime: Codex`, `Reviewer Model: gpt-5.6-sol`, `Reviewer Effort: medium`, `Invocation Route: Claude Code -> Codex`.

Run from repo root. The reviewer may write only REVIEW_REPORT; it may not edit plan, scope docs, `execute.md`, or `tasks.json`.

`REVIEW_PROMPT` includes: the exact feature root, feature name, TASK_DIR, EXECUTE_INDEX, TASKS_JSON, REVIEW_REPORT, mode, artifact manifest, Scope Boundary, compact preflight advisories, the complete task graph projection, write permission limited to REVIEW_REPORT, required report sections, and required review metadata (`Reviewer Runtime`, `Reviewer Model`, `Reviewer Effort`, `Invocation Route`). It says: "Use the supplied Feature Root unchanged. The reviewer must not rederive the feature root from the branch or repository activity." It directs the reviewer to evaluate every requested lens once, assign a stable finding ID to each finding, explain a concrete execution/correctness consequence for any mechanical imperfection it reports, and avoid redoing the consumer-safety checks.

Do not pass launcher timeout or duration guidance to the reviewer or its workers.

**Deterministic / mixed / semantic ownership**

| Owner | Responsibilities |
|---|---|
| Consumer-safety helper | Required artifact resolution; task JSON parse; sliced parent uniqueness/resolution; task-detail source, index, wave, and declared dependency resolution; dependency cycles; minimum report validity; protected-input hashes |
| Mixed evidence | Compact incidental advisories discovered by the hard parse/reference work; the reviewer decides whether they have a concrete semantic consequence |
| Semantic reviewer | Requirement and Out-of-Bounds fidelity; Acceptance-criterion adequacy and falsifiability; Genuine RED behavior; Real producer/consumer meaning and missing functional dependencies; Reference relevance; task sizing; Severity and scope-safe classification |

Count drift, anchor quality, optional headings/metadata, criterion/status enum irregularities, and incomplete producer/consumer declarations do not block launch unless they cause one of the closed consumer-safety failures. Do not add a separate exhaustive advisory scan.

**Review lenses**

| Lens | Fallback agent | Finds |
|---|---|---|
| Coverage | `@spectre_analyst` | missing or mistranslated plan verification and Out-of-Bounds obligations |
| Executability | `@spectre_reviewer` | criteria that do not prove behavior, weak RED pairing, oversized tasks, or mid-task scope judgment |
| Integration graph | `@spectre_patterns` | actual dependency, ordering, or wiring mistakes rather than string symmetry alone |
| Reference quality | `@spectre_finder` | context that is insufficient or irrelevant; imperfect anchors are advisory unless they create a concrete execution failure |

- **Adversarial mode:** one opposite-runtime pass using the four lenses as a checklist; it does not delegate.
- **Full mode:** opposite-runtime reviewer fans out one worker per lens only with pinned-model inheritance; otherwise the pinned parent reviews all four lenses, then writes the report.
- **Native fallback:** dispatch one clean-context `@spectre_reviewer` with the same artifact manifest, scope boundary, lenses, severity rules, evidence requirements, and report schema from `REVIEW_PROMPT`. In full mode this single reviewer evaluates every lens itself; it does not delegate. Replace only the persistence instruction: return the complete report in-thread so the primary can save it unchanged, then rerun `validate-report`. Record `Reviewer Runtime: native-subagent`, `Reviewer Model: runtime-native`, `Reviewer Effort: inherited`, `Invocation Route: native-fallback`, and `Fallback Reason: ...`.
- Severity: **Blocker**, **High**, **Medium**, **Low**, **Scope Change Required**.

**Write-back**
- Read `REVIEW_REPORT` fully before edits.
- `--auto-apply scope-safe`: apply scope-safe Blocker+High, plus Medium/Low only when unambiguous and translation-only. Never apply Scope Change Required.
- Otherwise present findings and ask `all` / `blockers` / `1,3,5` / `skip`; wait.
- Before editing, assign and preserve one disposition per finding: selected scope-safe edits are `applied`, deferred findings are `unresolved`, explicitly declined findings are `skipped`, and every Scope Change Required finding is `scope-change`.
- Edit only `TASKS_JSON` and affected `EXECUTE_INDEX` rows. Preserve task ids when possible; if parent ids/titles/dependencies/waves change, update `Wave Plan` + `Parent Task Index` in the same pass.
- Re-parse JSON after every write, run the focused post-check through `task-review-safety.mjs` `preflight`, and confirm applied findings did not violate the Scope Boundary. A failed post-check invalidates the write-back state and must be surfaced.
- Persist no state before this post-check. After success, the primary owns the atomic state replacement described above; the helper only supplies the proposed payload and post-write hashes.

## Outputs + DONE

`REVIEW_REPORT` required sections:
0. **Self-location metadata** - immediately below the title: `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`.
1. **Findings** - table `# | Severity | Lens | Location | Finding | Suggested Edit`.
2. **Coverage Summary** - plan signals covered/missing; Out-of-Bounds violations, if any.
3. **Index Alignment Summary** - `execute.md` vs `tasks.json` status.
4. **Review Metadata** - reviewed artifacts, auto-apply mode, ISO8601 timestamp, `Mode:`, `Reviewer Runtime:`, `Reviewer Model:`, `Reviewer Effort:`, `Invocation Route:`, and `Fallback Reason:` when applicable.

The closed consumer-safety report gate requires a confined/readable report, a parseable Findings table or explicit no-findings form, location/finding/edit fields, required route metadata, and unchanged protected hashes. Missing Coverage or Index Alignment summaries request repair or become an advisory unless the primary cannot determine what to apply; they do not silently expand the helper's hard-failure set.

DONE when one review round is recorded in `REVIEW_ATTEMPT`; the report exists before edits; every finding has a location + concrete suggested edit + disposition; runtime/model/effort/route metadata is recorded; any native fallback reason is recorded; applied edits touch only `TASKS_JSON` and affected `EXECUTE_INDEX` rows; JSON parses; scope-change recommendations are left unapplied; and the post-edit self-check result is recorded. Later edits do not invalidate the completed round or trigger another one.

## Handoff

Surface reviewer runtime, fallback reason, findings table, `Review report saved: {path}`, `Applied: {#s}. Skipped: {#s}. Scope-change recommendations not applied: {list or "none"}`, updated task artifact paths, and whether `tasks.json` parses.

- `--orchestrated` → return the review result and updated artifact paths to the caller without user-facing Next Steps.
- Existing attempt without explicit `--review-again` → return `Task review hard stop: prior round {status}; no reviewer launched`, plus the attempt/report paths and current deterministic parse status.
- Standalone + unresolved Blocker/High → remain in task remediation; scope-change findings route to `spectre-scope`.
- Standalone + resolved Blocker/High → `Next (recommended): spectre-execute — the reviewed task graph is executable.` Add `spectre-goal` only as the conditional autonomous execute→proof alternative. Offer `spectre-handoff` only when stopping at this durable review boundary.

## Escalate-If

- Cannot resolve or parse task artifacts -> stop; route to `spectre-create_tasks`.
- A finding requires changing agreed scope or `plan.md` -> emit Scope Change Required; do not apply it.
- Self-check fails after an applied edit -> surface the failure and ask before continuing.

## Codex Agent Preflight

Before dispatching any `@spectre_*` custom agent, run the bundled setup helper once:

```bash
node "${PLUGIN_ROOT}/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
```

If the helper reports agents were installed or updated in this session, continue directly only for lookup/scoping work that can be completed without a subagent. For other agent-dependent workflows, stop with a clear one-session restart requirement so Codex can discover the new custom agents.

---
name: "spectre-task_review"
description: "Adversarial semantic review of tasks.json against a reviewed plan using a pinned medium-effort opposite runtime, tasks-first safety preflight, direct scope-safe writeback, and a same-contract native fallback. Checks translation, criteria, RED pairing, dependencies, and context. Do NOT review plan quality, finished code, index formatting, or change scope."
user-invocable: true
---

# task_review

Generated-task review: verify that `spectre-create_tasks` faithfully translated the reviewed plan into the executable task graph before `execute.md` is finalized. Clear on WHAT, silent on HOW. This is a semantic translation gate, not a second plan review or an index-format review.

## Inputs

- `$ARGUMENTS` - explicit feature name/root or descendant task artifact, `--mode adversarial` (default) or `--mode full`, optional `--auto-apply scope-safe`, and optional `--review-again` only when the user's latest instruction explicitly requests another task review.
- Required: `{FEATURE_ROOT}/specs/plan.md` and `{FEATURE_ROOT}/specs/tasks.json` (or a scoped `.tasks.json`). `execute.md` is not an input to semantic task review.
- Helpful: canonical scope/PRD/UX/context/research artifacts under the exact feature root.
- If `tasks.json` is absent -> stop, route to `/spectre:create_tasks`. If `plan.md` is absent -> stop, route to `/spectre:create_plan`.

## Working Set

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged to every routed child and external reviewer prompt; a child or reviewer never rederives it.
- An explicit legacy `docs/tasks/**` plan/execute/tasks artifact remains a readable input and existing workflow-owned task status may be updated in place, but do not move or bulk-rewrite legacy records. Require a confirmed `.spectre/features/<feature-name>/` root for new review reports/evidence and record legacy sources.
- `TASK_DIR = FEATURE_ROOT`.
- Resolve `TASKS_JSON` as an explicit descendant artifact, `{FEATURE_ROOT}/specs/tasks.json`, or a scoped sibling `.tasks.json`. Never require or resolve `EXECUTE_INDEX` before review.
- `REVIEW_REPORT = {FEATURE_ROOT}/reviews/task_review.md`; `mkdir -p`. A user-authorized `--review-again` writes `task_review_{YYYY-MM-DD_HHMMSS}.md`; no other condition may select a second report.
- `REVIEW_ATTEMPT = {FEATURE_ROOT}/reviews/task_review_attempt.json`; initialize it atomically immediately before the first launch and persist it as the recovery ledger for one round. Record `round_status: in_progress|report_ready|complete|incomplete`, report path, authorization, timestamps, `pre_review_tasks_sha256`, `post_review_tasks_sha256`, authorized mutable paths, and `route_attempts[]` entries with route, status, launcher/task identity when available, and terminal reason. Atomically update every transition and preserve earlier route entries when falling back; a launcher attempt is not a completed semantic review.
- `PREFLIGHT_JSON = {FEATURE_ROOT}/reviews/task_review_safety.json`; the primary writes this helper evidence and passes it back for protected-hash validation.
- Every produced JSON evidence artifact (`PREFLIGHT_JSON`, `REVIEW_ATTEMPT`) carries `feature` and `feature_root`; populate them from the physical directory before consuming or persisting that artifact.
- Parse `TASKS_JSON` before review and after every write. Build a compact projection of the complete task graph for the one review brief; do not inline raw graph detail unless it is genuinely small.

## Scope Boundary

Task review may improve translation only: coverage, criteria, dependencies, context anchors, producer/consumer wiring, task sizing, and reintroduced overengineering. It may not add, remove, narrow, expand, or reinterpret canonical scope. Scope problems become **Scope Change Required** and remain unapplied.

## Method / guardrails

**Completed-review hard stop + incomplete-round recovery**

**Primary-owned orchestration**
1. Before running a helper, constructing a prompt, or launching a reviewer, inspect `REVIEW_ATTEMPT` and validate any `REVIEW_REPORT`. One completed semantic review means one semantically usable reviewer output, finalized as a valid report through primary-owned normalization when needed — not one launcher attempt.
2. A valid report with `round_status: complete` or legacy `status: complete` hard-stops another semantic review. Later artifact edits, final-gate feedback, discussion points, stale hashes, helper output, or safety uncertainty do not reopen it. The only override is `--review-again` backed by the user's latest instruction explicitly requesting another task review; a planner, helper, or orchestrator **MUST NOT** infer or add it.
3. Any other semantically usable report, including one with mechanical schema defects, consumes the semantic review: create/upgrade the ledger as needed, set `round_status: report_ready`, and resume only primary-owned report normalization, validation, dispositions, write-back, and finalization. Never launch another reviewer for that round.
4. A missing or semantically unusable report with `round_status: in_progress|incomplete`, or a legacy `status: started|failed`, is an incomplete round and **MUST be recovered without `--review-again`**. If its reviewer is still registered/running, reattach and poll it; otherwise record that route as failed and immediately dispatch the native fallback under the same round and report path. Never replay a terminal opposite-runtime route.
5. The external attempt and native fallback are route attempts inside one round. Do not return control between a confirmed external failure and fallback dispatch. If the native fallback also ends without a usable semantic review, record `round_status: incomplete` and the reason; a later normal invocation resumes this round rather than starting another.
6. Resolve `SAFETY_HELPER` as this skill's adjacent `scripts/task-review-safety.mjs`. Run `task-review-safety.mjs` `preflight` before brief construction:
   ```bash
   node "$SAFETY_HELPER" preflight --task-dir "$TASK_DIR" --tasks "$TASKS_JSON" --json > "$PREFLIGHT_JSON"
   ```
   Exit `2` stops reviewer launch and surfaces the enumerated hard failures. Exit `3` surfaces an internal helper failure and does not fabricate safety. Incidental advisories are included compactly in the brief, but advisories never block reviewer launch.
7. The safety helper is deterministic validation only. Production task review **MUST NOT run its `impact` operation or use helper output to select, authorize, slice, or restart a semantic review**.
8. Construct one semantic review brief covering the complete task graph and all requested lenses. The one-round policy is the token boundary; small later deltas are handled by deterministic checks and direct edits, not sliced or full re-reviews.
9. For a new round, select the available opposite runtime, atomically write `REVIEW_ATTEMPT`, then launch it as a long-running process and poll until completion. Allow up to 20 minutes for completion; quiet output or elapsed time below that maximum is not failure. For an incomplete round, follow the recovery gate above instead of starting another external route.
10. The reviewer writes the complete Findings section before editing `TASKS_JSON`, applies only authorized scope-safe changes, appends one disposition and resulting task edit per finding, and then finishes `REVIEW_REPORT`. Run `task-review-safety.mjs` `validate-report` against those outputs and the protected hashes in `PREFLIGHT_JSON`:
   ```bash
   node "$SAFETY_HELPER" validate-report --task-dir "$TASK_DIR" --report "$REVIEW_REPORT" --protected-hashes "$PREFLIGHT_JSON" --json
   ```
11. Once a route returns a semantically usable review, the semantic review is complete. The primary directly normalizes report-only contract defects — verified counts, paths, citations, route metadata, sections/tables, and invalid enum values — from the reviewer's existing finding, evidence, consequence, and the schema definitions, then reruns validation. This may normalize a severity enum only when the finding's meaning, evidence, recommendation, disposition, and resulting task edit stay unchanged. It never triggers another reviewer or fallback; the primary does not originate or materially reinterpret findings.
12. If the opposite CLI is missing, exits non-zero, exceeds the launcher maximum, or produces no semantically usable review, record the failed route and immediately use the native fallback; unavailable opposing runtimes never block completion.
13. Validate exactly one disposition for every finding ID: `unresolved`, `applied`, `skipped`, or `scope-change`. A report cannot advance without a disposition for every finding.
14. Run the post-write `preflight` with `--tasks "$TASKS_JSON"`, reparse `TASKS_JSON`, verify protected scope/plan inputs, and record `post_review_tasks_sha256`. On pass atomically set `round_status: complete`; on failure keep `report_ready` and surface it. A failed post-check **never triggers another semantic review**.
15. The primary owns deterministic validation, report-only normalization, and ledger transitions. The primary does not recreate or semantically reconfirm findings, apply semantic edits, or modify `TASKS_JSON` after a completed route.
16. The planning caller creates `execute.md` only after this round completes, then runs the helper's final `validate-pair` operation before goal generation.
17. Do not probe for startup commands. Use exactly the recipe below.

**Opposite-runtime initiation recipe**

From Codex primary:
```bash
claude -p --model opus --effort medium --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Write,Edit" --output-format text "$REVIEW_PROMPT"
```

From Claude Code primary:
```bash
codex exec -C "$PWD" -m gpt-5.6-sol -c 'model_reasoning_effort="medium"' -s workspace-write "$REVIEW_PROMPT"
```

External report metadata is fixed by route: Codex -> Claude Code records `Reviewer Runtime: Claude Code`, `Reviewer Model: opus`, `Reviewer Effort: medium`, `Invocation Route: Codex -> Claude Code`; Claude Code -> Codex records `Reviewer Runtime: Codex`, `Reviewer Model: gpt-5.6-sol`, `Reviewer Effort: medium`, `Invocation Route: Claude Code -> Codex`.

Run from repo root. The reviewer may write only `TASKS_JSON` and `REVIEW_REPORT`; it may not edit plan, scope docs, `execute.md`, or implementation files.

`REVIEW_PROMPT` includes: the exact feature root, feature name, TASK_DIR, TASKS_JSON, REVIEW_REPORT, mode, canonical artifact manifest, Scope Boundary, compact preflight advisories, the complete task graph projection, write permission limited to `TASKS_JSON` and `REVIEW_REPORT`, diagnosis-before-edit ordering, required report/disposition sections, and required review metadata (`Reviewer Runtime`, `Reviewer Model`, `Reviewer Effort`, `Invocation Route`). It says: "Use the supplied Feature Root unchanged. The reviewer must not rederive the feature root from the branch or repository activity." It directs the reviewer to evaluate every requested lens once, assign a stable finding ID to each finding, explain a concrete execution/correctness consequence for any mechanical imperfection it reports, write findings before edits, preserve task IDs where possible, apply only authorized scope-safe findings, record resulting task fields, and avoid redoing the consumer-safety checks.

Do not pass launcher timeout or duration guidance to the reviewer or its workers.

**Deterministic / mixed / semantic ownership**

| Owner | Responsibilities |
|---|---|
| Consumer-safety helper | Required plan/task resolution; task JSON parse; sliced parent uniqueness/resolution; declared dependency resolution; dependency cycles; minimum report/disposition validity; protected scope/plan hashes; final task/index pair validation after review |
| Mixed evidence | Compact incidental advisories discovered by the hard parse/reference work; the reviewer decides whether they have a concrete semantic consequence |
| Semantic reviewer | Requirement and Out-of-Bounds fidelity; Acceptance-criterion adequacy and falsifiability; Genuine RED behavior; Real producer/consumer meaning and missing functional dependencies; Reference relevance; task sizing; Severity and scope-safe classification |

Count drift, anchor quality, optional headings/metadata, criterion/status enum irregularities, and incomplete producer/consumer declarations do not block launch unless they cause one of the closed consumer-safety failures. Do not add a separate exhaustive advisory scan.

**Review lenses**

| Lens | Fallback agent | Finds |
|---|---|---|
| Coverage | `@spectre:analyst` | missing or mistranslated plan verification and Out-of-Bounds obligations |
| Executability | `@spectre:reviewer` | criteria that do not prove behavior, weak RED pairing, oversized tasks, or mid-task scope judgment |
| Integration graph | `@spectre:patterns` | actual dependency, ordering, or wiring mistakes rather than string symmetry alone |
| Reference quality | `@spectre:finder` | context that is insufficient or irrelevant; imperfect anchors are advisory unless they create a concrete execution failure |

- **Adversarial mode:** one opposite-runtime pass using the four lenses as a checklist; it does not delegate.
- **Full mode:** opposite-runtime reviewer fans out one worker per lens only with pinned-model inheritance; otherwise the pinned parent reviews all four lenses, then writes the report.
- **Native fallback:** dispatch one clean-context `@spectre:reviewer` with the same artifact manifest, scope boundary, lenses, severity rules, evidence requirements, report schema, and direct-write authority from `REVIEW_PROMPT`. In full mode this single reviewer evaluates every lens itself; it does not delegate. It edits only `TASKS_JSON` and `REVIEW_REPORT`, then the primary reruns validation. Record `Reviewer Runtime: native-subagent`, `Reviewer Model: runtime-native`, `Reviewer Effort: inherited`, `Invocation Route: native-fallback`, and `Fallback Reason: ...`. If native fallback cannot preserve this write contract, retain any report and stop with `round_status: incomplete`; do not transfer writeback to the primary.
- Severity: **Blocker**, **High**, **Medium**, **Low**, **Scope Change Required**.

**Write-back**
- The reviewer writes Findings before any task edit.
- `--auto-apply scope-safe`: the reviewer applies scope-safe Blocker+High, plus Medium/Low only when unambiguous and translation-only. It never applies Scope Change Required.
- Otherwise the reviewer remains report-only; the primary presents findings and asks `all` / `blockers` / `1,3,5` / `skip`, then waits without applying them itself. After selection, the same route receives a writeback-only continuation with the saved findings and selected IDs; it applies the selection and updates dispositions but does not repeat semantic review.
- The reviewer assigns and preserves one disposition per finding: selected scope-safe edits are `applied`, deferred findings are `unresolved`, explicitly declined findings are `skipped`, and every Scope Change Required finding is `scope-change`.
- The reviewer edits only `TASKS_JSON` and `REVIEW_REPORT`; preserve task ids when possible and record the resulting task IDs/fields in the disposition row. `execute.md` does not yet exist and is never edited during review.
- The primary reparses JSON, runs post-write `preflight`, validates protected inputs and dispositions, and atomically records hashes/state. A failed check invalidates writeback completion and must be surfaced without another semantic review.

## Outputs + DONE

`REVIEW_REPORT` required sections:
0. **Self-location metadata** - immediately below the title: `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`.
1. **Findings** - table `# | Severity | Lens | Location | Finding | Suggested Edit`.
2. **Coverage Summary** - plan signals covered/missing; Out-of-Bounds violations, if any.
3. **Dispositions** - table `Finding | Disposition | Resulting Task Edit`; one row for every finding.
4. **Review Metadata** - reviewed artifacts, auto-apply mode, ISO8601 timestamp, `Mode:`, `Reviewer Runtime:`, `Reviewer Model:`, `Reviewer Effort:`, `Invocation Route:`, and `Fallback Reason:` when applicable.

The closed consumer-safety report gate requires a confined/readable report, a parseable Findings table or explicit no-findings form, location/finding/edit fields, one valid disposition per finding, required route metadata, and unchanged protected scope/plan hashes. The primary directly adds a missing Coverage Summary from the reviewer's existing coverage evidence when that is mechanical; otherwise it remains an advisory. It does not silently expand the helper's hard-failure set or trigger another reviewer.

DONE when `REVIEW_ATTEMPT` has `round_status: complete`; Findings existed before edits; every finding has a location + concrete suggested edit + disposition + resulting task edit when applied; runtime/model/effort/route metadata is recorded; any native fallback reason is recorded; applied edits touch only `TASKS_JSON` and `REVIEW_REPORT`; JSON parses; protected plan/scope hashes match; pre/post task hashes and the post-write preflight result are recorded; and scope-change recommendations remain unapplied. Later edits do not invalidate the completed round or trigger another one.

## Handoff

Surface reviewer runtime, fallback reason, findings table, `Review report saved: {path}`, `Applied: {#s}. Skipped: {#s}. Scope-change recommendations not applied: {list or "none"}`, updated task artifact paths, and whether `tasks.json` parses.

- `--orchestrated` → return the review result and updated artifact paths to the caller without user-facing Next Steps.
- Completed valid report without explicit `--review-again` → return `Task review hard stop: prior round complete; no reviewer launched`, plus the attempt/report paths and current deterministic parse status.
- Incomplete round → reattach or fall back under the same round. Surface an operational blocker only when no route produced a valid report; never ask for `--review-again` to recover it.
- Standalone + unresolved Blocker/High → remain in task remediation; scope-change findings route to `/spectre:scope`.
- Standalone + resolved Blocker/High → `Next (recommended): /spectre:execute — the reviewed task graph is executable.` Add `/spectre:goal` only as the conditional autonomous execute→proof alternative. Offer `/spectre:handoff` only when stopping at this durable review boundary.

## Escalate-If

- Cannot resolve or parse task artifacts -> stop; route to `/spectre:create_tasks`.
- A finding requires changing agreed scope or `plan.md` -> emit Scope Change Required; do not apply it.
- Self-check fails after an applied edit -> surface the failure and ask before continuing.

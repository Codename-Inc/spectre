---
name: "spectre-task_review"
description: "Adversarial review of generated execute.md + tasks.json against a reviewed plan using a pinned medium-effort opposite runtime, with consumer-safety preflight and a same-contract native fallback. Checks translation, criteria, RED pairing, dependencies, waves, and alignment. Do NOT review plan quality, finished code, or change scope."
user-invocable: true
---

# task_review

Generated-task review: verify that `spectre-create_tasks` faithfully compiled the reviewed plan into `execute.md` + `tasks.json`. Clear on WHAT, silent on HOW. This is a translation gate, not a second plan review.

## Inputs

- `$ARGUMENTS` - `--mode adversarial` (default) or `--mode full`, optional `--auto-apply scope-safe`, optional explicit TASK_DIR.
- Required: `{TASK_DIR}/specs/plan.md`, `{TASK_DIR}/specs/execute.md`, `{TASK_DIR}/specs/tasks.json` (or scoped `.execute.md` + `.tasks.json` pair).
- Helpful: scope/PRD/UX/context artifacts listed in `execute.md` `Document Manifest`.
- If task artifacts are absent -> stop, route to `/spectre:create_tasks`. If `plan.md` is absent -> stop, route to `/spectre:create_plan`.

## Working Set

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`); `TASK_DIR = {arg path} || docs/tasks/{branch}`.
- Resolve `EXECUTE_INDEX` as arg path or `{TASK_DIR}/specs/execute.md`; resolve `TASKS_JSON` from its `Task Detail Source`, adjacent `tasks.json`, or sibling `.tasks.json`.
- `REVIEW_REPORT = {TASK_DIR}/reviews/task_review.md`; `mkdir -p`; if it exists, write `task_review_{YYYY-MM-DD_HHMMSS}.md`.
- `PREFLIGHT_JSON = {TASK_DIR}/reviews/task_review_safety.json`; the primary writes this helper evidence and passes it back for protected-hash validation.
- `REVIEW_STATE = {TASK_DIR}/reviews/task_review_state.json`; missing or invalid state is backward-compatible and selects a whole-graph semantic review.
- `IMPACT_JSON = {TASK_DIR}/reviews/task_review_impact.json`; the primary writes the read-only helper result used to construct the review brief.
- Parse `TASKS_JSON` before review and after every write. Use targeted projections/slices for reviewer briefs; do not inline the whole task graph unless it is genuinely small.

## Scope Boundary

Task review may improve translation only: coverage, criteria, dependencies, waves, context anchors, producer/consumer wiring, and execute/json alignment. It may not add, remove, narrow, expand, or reinterpret canonical scope. Scope problems become **Scope Change Required** and remain unapplied.

## Method / guardrails

**Primary-owned orchestration**
1. Resolve `SAFETY_HELPER` as this skill's adjacent `scripts/task-review-safety.mjs`. Run `task-review-safety.mjs` `preflight` before impact calculation or brief construction:
   ```bash
   node "$SAFETY_HELPER" preflight --task-dir "$TASK_DIR" --execute "$EXECUTE_INDEX" --json > "$PREFLIGHT_JSON"
   ```
   Exit `2` stops reviewer launch and surfaces the enumerated hard failures. Exit `3` surfaces an internal helper failure and does not fabricate safety. Incidental advisories are included compactly in the brief, but advisories never block reviewer launch.
2. Run `task-review-safety.mjs` `impact` with the prior state before selecting any semantic region:
   ```bash
   node "$SAFETY_HELPER" impact --task-dir "$TASK_DIR" --previous-state "$REVIEW_STATE" --json > "$IMPACT_JSON"
   ```
   `impact` always runs the complete global preflight first, even for a slice or reuse result. Exit `2` stops reviewer launch with those global hard failures; exit `3` surfaces an internal helper failure. The helper remains read-only and never persists state, launches a model, or applies a finding.
3. Construct the semantic review brief from `IMPACT_JSON`: state `full`, `slice`, or `reuse`; list rerun parents, rerun lenses, eligible reused finding IDs, excluded finding IDs, and every impact reason. Include complete targeted parent projections plus direct dependency boundaries for a slice. A full brief covers the whole graph. A reuse result carries forward only eligible unresolved findings with unchanged complete regions and launches no semantic reviewer when there are no rerun parents or lenses; the primary still performs dispositions, post-check, report persistence, and state lifecycle below.
4. If current runtime is Codex and `command -v claude` succeeds, select Claude Code. If current runtime is Claude Code and `command -v codex` succeeds, select Codex. For `full` or `slice`, Launch the selected opposite-runtime command as a long-running process and poll it until it completes. Allow up to 20 minutes for completion; quiet output or completion before that maximum is not failure. For `reuse`, treat the prior valid report plus the helper's eligible finding set as the review result and record that no model route was relaunched.
5. Run `task-review-safety.mjs` `validate-report` against `REVIEW_REPORT` and the protected hashes in `PREFLIGHT_JSON`:
   ```bash
   node "$SAFETY_HELPER" validate-report --task-dir "$TASK_DIR" --report "$REVIEW_REPORT" --protected-hashes "$PREFLIGHT_JSON" --json
   ```
6. If the report is missing or invalid, use the same external CLI for one repair attempt that may edit only `REVIEW_REPORT`, then validate again.
7. If the opposite CLI is missing, exits non-zero, exceeds the launcher maximum, or still fails report validation, record the terminal reason and use the native fallback. Unavailable opposing runtimes never block completion.
8. Read `REVIEW_REPORT` fully. Record exactly one disposition for every finding ID: `unresolved`, `applied`, `skipped`, or `scope-change`. A report cannot advance without a disposition for every finding. Applied findings never enter the reusable set.
9. Write back only scope-safe selected findings under the contract below. Preserve every disposition and the finding's complete affected parent/lens region; an ambiguous or incomplete region is not reusable.
10. Run the focused post-check through global `preflight`, reparse `TASKS_JSON`, and verify protected scope/plan inputs. A failure invalidates the state and stops persistence. After a passing post-check, rerun read-only `impact` to obtain post-write hashes and semantic snapshot; do not reinterpret its review decision.
11. Atomically persist `task-review-state/v1` from the primary only after successful write-back and post-check. After a successful post-check, the primary atomically persists any review-state payload; a failed post-check invalidates that state. Combine the original pre-review hashes with the post-check `impact` result's post-write hashes and semantic snapshot; include prompt version, report identity, reviewed parent/lens regions, every finding disposition, only reusable unresolved findings with complete affected-region hashes, impact reasons, `writeback: complete`, and `post_check: pass`. Write a same-directory temporary file, fsync it, then rename it over `REVIEW_STATE`. Interrupted write-back, hash mismatch, missing disposition, failed post-check, or interrupted atomic replacement leaves no valid new state and forces a whole-graph review next time.
12. Primary-agent self-review is prohibited except validating and persisting an explicit native fallback return.
13. Do not probe for startup commands. Use exactly the recipe below.

**Opposite-runtime initiation recipe**

From Codex primary:
```bash
claude -p --model opus --effort medium --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Write,Task" --output-format text "$REVIEW_PROMPT"
```

From Claude Code primary:
```bash
codex exec -C "$PWD" -m gpt-5.6-sol -c 'model_reasoning_effort="medium"' -s workspace-write "$REVIEW_PROMPT"
```

External report metadata is fixed by route: Codex -> Claude Code records `Reviewer Runtime: Claude Code`, `Reviewer Model: opus`, `Reviewer Effort: medium`, `Invocation Route: Codex -> Claude Code`; Claude Code -> Codex records `Reviewer Runtime: Codex`, `Reviewer Model: gpt-5.6-sol`, `Reviewer Effort: medium`, `Invocation Route: Claude Code -> Codex`.

Run from repo root. The reviewer may write only REVIEW_REPORT; it may not edit plan, scope docs, `execute.md`, or `tasks.json`.

`REVIEW_PROMPT` includes: TASK_DIR, EXECUTE_INDEX, TASKS_JSON, REVIEW_REPORT, mode, artifact manifest, Scope Boundary, compact preflight advisories, semantic review region, rerun/reuse reasons, eligible unresolved findings, write permission limited to REVIEW_REPORT, required report sections, and required review metadata (`Reviewer Runtime`, `Reviewer Model`, `Reviewer Effort`, `Invocation Route`). It directs the reviewer to use only the selected parents and lenses (or all four lenses for a full review), assign a stable finding ID and complete affected parent/lens region to each finding, explain a concrete execution/correctness consequence for any mechanical imperfection it reports, and avoid redoing the consumer-safety checks.

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
| Coverage | `@spectre:analyst` | missing or mistranslated plan verification and Out-of-Bounds obligations |
| Executability | `@spectre:reviewer` | criteria that do not prove behavior, weak RED pairing, oversized tasks, or mid-task scope judgment |
| Integration graph | `@spectre:patterns` | actual dependency, ordering, or wiring mistakes rather than string symmetry alone |
| Reference quality | `@spectre:finder` | context that is insufficient or irrelevant; imperfect anchors are advisory unless they create a concrete execution failure |

- **Adversarial mode:** one opposite-runtime pass using the four lenses as a checklist; it does not delegate.
- **Full mode:** opposite-runtime reviewer fans out one worker per lens only with pinned-model inheritance; otherwise the pinned parent reviews all four lenses, then writes the report.
- **Native fallback:** dispatch one clean-context `@spectre:reviewer` with the same artifact manifest, scope boundary, lenses, severity rules, evidence requirements, and report schema from `REVIEW_PROMPT`. In full mode this single reviewer evaluates every lens itself; it does not delegate. Replace only the persistence instruction: return the complete report in-thread so the primary can save it unchanged, then rerun `validate-report`. Record `Reviewer Runtime: native-subagent`, `Reviewer Model: runtime-native`, `Reviewer Effort: inherited`, `Invocation Route: native-fallback`, and `Fallback Reason: ...`.
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
1. **Findings** - table `# | Severity | Lens | Location | Finding | Suggested Edit`.
2. **Coverage Summary** - plan signals covered/missing; Out-of-Bounds violations, if any.
3. **Index Alignment Summary** - `execute.md` vs `tasks.json` status.
4. **Review Metadata** - reviewed artifacts, auto-apply mode, ISO8601 timestamp, `Mode:`, `Reviewer Runtime:`, `Reviewer Model:`, `Reviewer Effort:`, `Invocation Route:`, and `Fallback Reason:` when applicable.

Every full, sliced, or reused report also records `Semantic Review Mode:`, `Rerun Parents:`, `Rerun Lenses:`, `Reused Findings:`, and `Impact Reasons:`. These fields state exactly what was rerun or reused and why; use `none` rather than omitting an empty set.

The closed consumer-safety report gate requires a confined/readable report, a parseable Findings table or explicit no-findings form, location/finding/edit fields, required route metadata, and unchanged protected hashes. Missing Coverage or Index Alignment summaries request repair or become an advisory unless the primary cannot determine what to apply; they do not silently expand the helper's hard-failure set.

DONE when the report exists before edits; every finding has a location + concrete suggested edit + complete affected region + disposition; runtime/model/effort/route metadata is recorded; any native fallback reason is recorded; rerun/reuse regions and reasons are visible; applied edits touch only `TASKS_JSON` and affected `EXECUTE_INDEX` rows; JSON parses; scope-change recommendations are left unapplied; post-edit self-check passes; and the primary has atomically persisted a valid post-write `task-review-state/v1`.

## Handoff

Surface reviewer runtime, fallback reason, findings table, `Review report saved: {path}`, `Applied: {#s}. Skipped: {#s}. Scope-change recommendations not applied: {list or "none"}`, updated task artifact paths, and whether `tasks.json` parses. Next: `/spectre:execute` once Blocker/High findings are resolved.

## Escalate-If

- Cannot resolve or parse task artifacts -> stop; route to `/spectre:create_tasks`.
- A finding requires changing agreed scope or `plan.md` -> emit Scope Change Required; do not apply it.
- Self-check fails after an applied edit -> surface the failure and ask before continuing.

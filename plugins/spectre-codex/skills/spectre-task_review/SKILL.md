---
name: "spectre-task_review"
description: "Adversarial review of generated execute.md + tasks.json against a reviewed plan using a pinned high-effort opposite runtime, with a same-contract native fallback. Checks translation, criteria, RED pairing, dependencies, waves, and alignment. Do NOT review plan quality, finished code, or change scope."
user-invocable: true
---

# task_review

Generated-task review: verify that `spectre-create_tasks` faithfully compiled the reviewed plan into `execute.md` + `tasks.json`. Clear on WHAT, silent on HOW. This is a translation gate, not a second plan review.

## Inputs

- `$ARGUMENTS` - `--mode adversarial` (default) or `--mode full`, optional `--auto-apply scope-safe`, optional explicit TASK_DIR.
- Required: `{TASK_DIR}/specs/plan.md`, `{TASK_DIR}/specs/execute.md`, `{TASK_DIR}/specs/tasks.json` (or scoped `.execute.md` + `.tasks.json` pair).
- Helpful: scope/PRD/UX/context artifacts listed in `execute.md` `Document Manifest`.
- If task artifacts are absent -> stop, route to `spectre-create_tasks`. If `plan.md` is absent -> stop, route to `spectre-create_plan`.

## Working Set

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`); `TASK_DIR = {arg path} || docs/tasks/{branch}`.
- Resolve `EXECUTE_INDEX` as arg path or `{TASK_DIR}/specs/execute.md`; resolve `TASKS_JSON` from its `Task Detail Source`, adjacent `tasks.json`, or sibling `.tasks.json`.
- `REVIEW_REPORT = {TASK_DIR}/reviews/task_review.md`; `mkdir -p`; if it exists, write `task_review_{YYYY-MM-DD_HHMMSS}.md`.
- Parse `TASKS_JSON` before review and after every write. Use targeted projections/slices for reviewer briefs; do not inline the whole task graph unless it is genuinely small.

## Scope Boundary

Task review may improve translation only: coverage, criteria, dependencies, waves, context anchors, producer/consumer wiring, and execute/json alignment. It may not add, remove, narrow, expand, or reinterpret canonical scope. Scope problems become **Scope Change Required** and remain unapplied.

## Method / guardrails

**External-first selection**
1. If current runtime is Codex and `command -v claude` succeeds, run Claude Code.
2. If current runtime is Claude Code and `command -v codex` succeeds, run Codex.
3. If the opposite CLI is missing, exits non-zero, cannot write `REVIEW_REPORT`, or produces an invalid report after one repair attempt, record the reason and fall back to one native `@reviewer`; unavailable opposing runtimes never block completion.
4. Primary-agent self-review is prohibited except compiling explicit fallback subagent returns.
5. Do not probe for startup commands. Use exactly the recipe below.

**Opposite-runtime initiation recipe**

From Codex primary:
```bash
claude -p --model fable --effort high --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Write,Task" --output-format text "$REVIEW_PROMPT"
```

From Claude Code primary:
```bash
codex exec -C "$PWD" -m gpt-5.6-sol -c 'model_reasoning_effort="high"' -s workspace-write "$REVIEW_PROMPT"
```

External report metadata is fixed by route: Codex -> Claude Code records `Reviewer Runtime: Claude Code`, `Reviewer Model: fable`, `Reviewer Effort: high`, `Invocation Route: Codex -> Claude Code`; Claude Code -> Codex records `Reviewer Runtime: Codex`, `Reviewer Model: gpt-5.6-sol`, `Reviewer Effort: high`, `Invocation Route: Claude Code -> Codex`.

Run from repo root. The reviewer may write only REVIEW_REPORT; it may not edit plan, scope docs, `execute.md`, or `tasks.json`.

`REVIEW_PROMPT` includes: TASK_DIR, EXECUTE_INDEX, TASKS_JSON, REVIEW_REPORT, mode, artifact manifest, Scope Boundary, write permission limited to REVIEW_REPORT, required report sections, required review metadata (`Reviewer Runtime`, `Reviewer Model`, `Reviewer Effort`, `Invocation Route`), and: "This review may take at least 20 minutes; do not stop early. In full mode, dispatch one independent subagent per review lens only when each worker inherits the parent reviewer model and effort; otherwise review all lenses in this pinned parent process. Tell each dispatched worker that its review may take at least 20 minutes, wait for all lens returns, then synthesize the final report yourself."

**Review lenses**

| Lens | Fallback agent | Finds |
|---|---|---|
| Coverage | `@analyst` | every plan Verification signal maps to a `test`/`observable`/`state` AC; every in-scope requirement is represented; no Out-of-Bounds task exists |
| Executability | `@reviewer` | RED pairing for behavior changes, executable AC wording, subtask size cap, no mid-task scope judgment |
| Integration graph | `@patterns` | predecessor/unblocks, produces/consumed_by/replaces, Phase 0 dependency verification, no orphaned outputs |
| Index alignment | `@finder` | `execute.md` manifest/source/summary/waves/parent index match `tasks.json`; referenced files and context anchors exist |

- **Adversarial mode:** one opposite-runtime pass using the four lenses as checklist.
- **Full mode:** opposite-runtime reviewer fans out one worker per lens only with pinned-model inheritance; otherwise the pinned parent reviews all four lenses, then writes the report.
- **Native fallback:** dispatch one clean-context `@reviewer` with the same artifact manifest, scope boundary, lenses, severity rules, evidence requirements, and report schema from `REVIEW_PROMPT`. In full mode this single reviewer evaluates every lens itself; it does not delegate. Replace only the persistence instruction: return the complete report in-thread so the primary can save it unchanged. Record `Reviewer Runtime: native-subagent`, `Reviewer Model: runtime-native`, `Reviewer Effort: inherited`, `Invocation Route: native-fallback`, and `Fallback Reason: ...`.
- Severity: **Blocker**, **High**, **Medium**, **Low**, **Scope Change Required**.

**Write-back**
- Read `REVIEW_REPORT` fully before edits.
- `--auto-apply scope-safe`: apply scope-safe Blocker+High, plus Medium/Low only when unambiguous and translation-only. Never apply Scope Change Required.
- Otherwise present findings and ask `all` / `blockers` / `1,3,5` / `skip`; wait.
- Edit only `TASKS_JSON` and affected `EXECUTE_INDEX` rows. Preserve task ids when possible; if parent ids/titles/dependencies/waves change, update `Wave Plan` + `Parent Task Index` in the same pass.
- Re-parse JSON after every write and re-check: no Out-of-Bounds task, all plan Verification signals map to criteria, criteria use only `test`/`observable`/`state`, producer outputs have consumers, execute index matches JSON.

## Outputs + DONE

`REVIEW_REPORT` required sections:
1. **Findings** - table `# | Severity | Lens | Location | Finding | Suggested Edit`.
2. **Coverage Summary** - plan signals covered/missing; Out-of-Bounds violations, if any.
3. **Index Alignment Summary** - `execute.md` vs `tasks.json` status.
4. **Review Metadata** - reviewed artifacts, auto-apply mode, ISO8601 timestamp, `Mode:`, `Reviewer Runtime:`, `Reviewer Model:`, `Reviewer Effort:`, `Invocation Route:`, and `Fallback Reason:` when applicable.

DONE when the report exists before edits; every finding has a location + concrete suggested edit; runtime/model/effort/route metadata is recorded; any native fallback reason is recorded; applied edits touch only `TASKS_JSON` and affected `EXECUTE_INDEX` rows; JSON parses; scope-change recommendations are left unapplied; post-edit self-check passes.

## Handoff

Surface reviewer runtime, fallback reason, findings table, `Review report saved: {path}`, `Applied: {#s}. Skipped: {#s}. Scope-change recommendations not applied: {list or "none"}`, updated task artifact paths, and whether `tasks.json` parses. Next: `spectre-execute` once Blocker/High findings are resolved.

## Escalate-If

- Cannot resolve or parse task artifacts -> stop; route to `spectre-create_tasks`.
- A finding requires changing agreed scope or `plan.md` -> emit Scope Change Required; do not apply it.
- Self-check fails after an applied edit -> surface the failure and ask before continuing.

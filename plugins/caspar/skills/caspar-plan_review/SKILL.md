---
name: "caspar-plan_review"
description: "Independent adversarial review of plan/task artifacts. Prefer an opposite-runtime CLI reviewer that writes reviews/plan_review.md directly; fall back to Caspar subagents only when unavailable. Trigger after planning and before execute. Do NOT author plans/tasks, review finished code, or apply scope changes."
user-invocable: true
---

# plan_review

Adversarial review of planning artifacts - **clear on WHAT, silent on HOW.** Prefer an opposite-runtime reviewer that writes the review report directly, then the primary agent applies scope-safe fixes. Reviews artifacts; never authors plan/task artifacts or applies scope changes.

## Inputs

- `$ARGUMENTS` - `--mode adversarial` (else `full`), optional `--auto-apply scope-safe`, optional explicit TASK_DIR.
- `plan.md` and `tasks.json` are independently reviewable; `execute.md` is reviewable only as the compact execution index that locates `tasks.json` and carries wave/index metadata. `task_context.md` is helpful, not required (note traceability is limited if absent). If all plan/task artifacts are missing -> stop, route to `/caspar:plan` or `/caspar:create_tasks`. If any one is missing -> list it absent and continue; never decline or ask the user to create it.

## Working Set (late-bound - read at run-time, never inline)

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`); `TASK_DIR = {arg path} || docs/tasks/{branch}`.
- Inputs under `{TASK_DIR}`: `specs/plan.md`, `specs/execute.md`, `specs/tasks.json` (or scoped names), `task_context.md`.
- `REVIEW_REPORT = {TASK_DIR}/reviews/plan_review.md`; `mkdir -p`; if it exists, write `plan_review_{YYYY-MM-DD_HHMMSS}.md` (never overwrite prior evidence).
- Read every present artifact enough to build the manifest and identify the canonical scope source. External reviewers read artifacts directly from disk and write `REVIEW_REPORT`; fallback subagents receive curated excerpts + the same manifest.

## Canonical Scope Invariant (load-bearing)

- **Canonical scope source**, in order: `concepts/scope.md` when present, else `specs/prd.md`, else `specs/ux.md`, else explicit requirements in `task_context.md`.
- Reviewers MAY recommend deleting unrequested implementation, unnecessary abstractions, weak verification, hallucinated refs, bad deps, or sequencing problems. They **MUST NOT cut, narrow, expand, or reinterpret agreed scope.** If the agreed scope itself looks too large / inconsistent / missing a requirement, phrase it as a **Scope Change Required** recommendation for the user - **never auto-apply it to plan/task artifacts** during write-back.

## Method / guardrails

**External-first selection (required):**

1. If current runtime is Codex and `command -v claude` succeeds, run Claude Code non-interactively.
2. If current runtime is Claude Code and `command -v codex` succeeds, run Codex non-interactively.
3. If the opposite CLI is missing, exits non-zero, cannot write `REVIEW_REPORT`, or produces a report missing required sections after one repair attempt, record the reason and fall back to same-runtime Caspar subagents.
4. Primary-agent self-review is prohibited. The primary may only write `REVIEW_REPORT` when compiling explicit fallback subagent returns.
5. Do not spend tool calls discovering how to start the opposite runtime. Use exactly the initiation recipe below; only `command -v {opposite_cli}` is needed for availability.

**Opposite-runtime initiation recipe (copy exactly):**

From **Codex** primary, start a **Claude Code** review session:

```bash
claude -p --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Write,Task" --output-format text "$REVIEW_PROMPT"
```

From **Claude Code** primary, start a **Codex** review session:

```bash
codex exec -C "$PWD" -s workspace-write "$REVIEW_PROMPT"
```

Run both commands from the repository root (`$PWD`). Do not add approval flags, interactive resume flags, broad bypass flags, `codex review`, or project discovery commands. Do not wrap the prompt with `cat`, temp files, `tail`, or shell pipelines unless your execution environment cannot pass a long argument; if a temp prompt file is unavoidable, run the same command shape with `$(cat /tmp/plan_review_prompt.txt)` as the final argument and do not otherwise change flags.

Both commands must run with filesystem write capability for the final review document: Claude via the explicit `Write` tool and Codex via `-s workspace-write`. Claude must also allow `Task` so it can dispatch lens subagents. The reviewer prompt limits write capability to `REVIEW_REPORT`.

Allow the external reviewer run to take at least 20 minutes before treating it as hung or failed; if the invoking tool supports an explicit timeout, set it to at least 1200000 ms. Full mode deliberately fans out independent lens reviews and may take that long.

`REVIEW_PROMPT` must include: `TASK_DIR`, `REVIEW_REPORT`, mode, present/absent artifact manifest, canonical scope source, the Canonical Scope Invariant, write permission limited to `REVIEW_REPORT`, the required report sections below, and this runtime instruction: "This review may take at least 20 minutes; do not stop early. In full mode, dispatch one independent subagent per review lens, tell each lens worker that its review may take at least 20 minutes, wait for all lens returns, then synthesize the final report yourself. In adversarial mode, use a single clean-context reviewer pass unless the artifact set is large enough to benefit from subagents." The external reviewer may write only `REVIEW_REPORT` and may not edit `plan.md`, `execute.md`, `tasks.json`, scope, PRD, UX, or context files.

**External review method:**

- **Mode - adversarial (default):** one opposite-runtime reviewer attacks execution readiness: likely wrong output, unrequested overbuild/out-of-bounds work, hallucinated refs, non-executable verification/missing ACs, producer output left unwired, stale execute index entries, and missing canonical pattern anchors. Ignore architectural taste unless it causes those. The reviewer writes `REVIEW_REPORT` directly.
- **Mode - full:** one opposite-runtime reviewer orchestrates the **four lenses below as independent subagents**, waits for all lens returns, then writes `REVIEW_REPORT`. Each lens subagent receives the same manifest/scope invariant, reviews only its lens, and is told its review may take at least 20 minutes. The orchestrating reviewer may perform its own local reads/searches and synthesize findings, but must not edit anything except `REVIEW_REPORT`; the fallback-agent column also names the lens role for external subagent dispatch.
- After the command returns, verify the report exists, contains all required sections, names reviewed artifacts, and includes `Reviewer Runtime:` plus `Mode:` metadata. If invalid, retry once with a repair prompt to the same external CLI. If still invalid, fall back.

**Fallback subagent method (only after an explicit fallback reason):**

- **Mode - adversarial:** one `@caspar:reviewer` attacks execution readiness and returns compressed in-thread findings; primary compiles and writes `REVIEW_REPORT`.
- **Mode - full:** dispatch the **four lenses below in parallel** with the same excerpts/manifest and a note that each lens review may take at least 20 minutes. Each returns compressed in-thread findings (no files); primary compiles and writes `REVIEW_REPORT`.
- Missing-artifact rule: review what exists; mark "not reviewable because `<artifact>` absent" only when necessary.

| Lens | Fallback agent | Finds |
|------|-------|-------|
| **1 - YAGNI / familiar-shape bias** | `@caspar:reviewer` | Unprompted mature-system patterns, single-caller abstractions, speculative generality, **Out-of-Bounds**. Must nominate the SINGLE highest-leverage scope-safe deletion, or "No scope-safe deletion found" + nearest Scope Change Required. Cite file:line or JSON path + task id. |
| **2 - Verifiability** | `@caspar:analyst` | Prose verification, phases with no signal, `tasks.json` ACs not **test passes / observable behavior / state condition**, unmatched plan signals, missing preceding **RED test** sub-task. Propose executable rewrites; cite file:line or JSON path + task id. |
| **3 - Existence / hallucination** | `@caspar:finder` | Nonexistent paths, packages, symbols, endpoints, env-vars, CLI flags. Verify via Glob/Read/grep. Report `expected:<claim>` vs `actual:<repo>`; flag typo/lookalike packages. |
| **4 - Canonical reference quality** | `@caspar:patterns` | "Follow existing pattern" claims with no `file:line` anchor; `tasks.json` context blocks lacking canonical pointer; missed reuse. Propose a concrete file:line anchor or existing utility. |

**Severity rules:** **Blocker** (execution fails/wrong output); **High** (meaningful quality hit); **Medium** (overengineering/reuse miss, no functional blast radius); **Low**; **Scope Change Required** (never auto-applied).

**Compile (fallback only):** dedupe, assign severity, write `REVIEW_REPORT` **before write-back**. Include `Reviewer Runtime: fallback-subagents` and `Fallback Reason: ...` in metadata.

**Write-back:**
- Read the saved `REVIEW_REPORT` fully before edits.
- `--auto-apply scope-safe` -> skip prompt; apply scope-safe Blocker+High, plus Medium/Low only when unambiguous and scope-neutral. **Never apply Scope Change Required.** Then self-check, return applied/skipped.
- Else present the findings table inline (with `Review report saved: {path}`) and ask which to apply: `all` / `blockers` (Blocker+High) / `1,3,5` / `skip`; **WAIT**.
- ApplyEdits: edit named artifacts verbatim where possible (minimum change otherwise). Before each edit confirm it preserves canonical requirements/boundaries; otherwise **skip: requires scope change.** Preserve valid indented JSON and re-parse after `tasks.json` edits; if parent ids/titles/dependencies/waves change, update the affected `execute.md` index rows too.
- Self-check after edits: re-verify touched refs; ACs still executable; no new Out-of-Bounds violation; `tasks.json` parses; canonical scope still fully represented. Any failure -> surface and ask first.

## Outputs + DONE

`REVIEW_REPORT` (Markdown, written before any write-back), required sections:
1. **Must-Delete (Lens 1 - YAGNI)** - the single nominated highest-leverage cut + rationale (mandatory even on a tight plan).
2. **Findings** - table `# | Severity | Lens | Location | Finding | Suggested Edit`; concrete edits; if none, say so.
3. **Summary** - counts per severity (Blockers must resolve before execute).
4. **Review Metadata** - reviewed artifacts (present/absent paths); canonical scope source; auto-apply mode; ISO8601 timestamp; `Mode:`; `Reviewer Runtime:`; `Fallback Reason:` when applicable; note that this captures findings before any write-back.

**DONE when:** report exists with all sections and was saved before any edits; external reviewer wrote it directly or fallback reason is recorded; every finding has a location + concrete suggested edit; Lens-1 Must-Delete present; applied edits preserved canonical scope (scope-change recs left unapplied); post-edit self-check passed.

## Handoff

Surface inline: reviewer runtime, fallback reason if any, the findings table, `Review report saved: {path}`, and `Applied: {#s}. Skipped: {#s}. Scope-change recommendations not applied: {list or "none"}` + updated artifact path(s). Then suggest the next command (no wait): `/caspar:execute` once Blockers are resolved, or `/caspar:plan` / `/caspar:create_tasks` to address a Scope Change Required.

## Escalate-If

- All plan/task artifacts are absent -> stop; route to `/caspar:plan` or `/caspar:create_tasks`.
- A finding requires changing agreed scope -> emit it as **Scope Change Required** for the user; do not apply it.
- A self-check fails after an applied edit (broken ref, non-executable AC, new Out-of-Bounds, scope no longer represented) -> surface and ask before continuing.

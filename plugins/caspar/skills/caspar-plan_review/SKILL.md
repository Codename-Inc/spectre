---
name: "caspar-plan_review"
description: "Independent adversarial review of plan.md before task generation. Prefer an opposite-runtime CLI reviewer that writes reviews/plan_review.md directly; fall back to Caspar subagents only when unavailable. Trigger after create_plan and before create_tasks. Do NOT review generated tasks, finished code, or apply scope changes."
user-invocable: true
---

# plan_review

Plan-only adversarial review: stabilize intent before `execute.md`/`tasks.json` exist. Clear on WHAT, silent on HOW. Reviews scope/PRD/UX/context plus `plan.md`; never authors tasks or implementation.

## Inputs

- `$ARGUMENTS` - `--mode adversarial` (default) or `--mode full`, optional `--auto-apply scope-safe`, optional explicit TASK_DIR.
- Required: `{TASK_DIR}/specs/plan.md`. Helpful: `concepts/scope.md`, `specs/prd.md`, `specs/ux.md`, `task_context.md`, `research/*.md`.
- If `plan.md` is absent -> stop, route to `/caspar:create_plan`. Do not ask the user to create missing optional artifacts.

## Working Set

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`); `TASK_DIR = {arg path} || docs/tasks/{branch}`.
- `REVIEW_REPORT = {TASK_DIR}/reviews/plan_review.md`; `mkdir -p`; if it exists, write `plan_review_{YYYY-MM-DD_HHMMSS}.md`.
- Canonical scope source, in order: `concepts/scope.md`, `specs/prd.md`, `specs/ux.md`, explicit requirements in `task_context.md`.

## Canonical Scope Invariant

Reviewers may recommend deleting unrequested implementation, unnecessary abstractions, weak verification, hallucinated refs, bad deps, or bad sequencing. They **MUST NOT** cut, narrow, expand, or reinterpret agreed scope. If scope itself looks wrong or incomplete, emit **Scope Change Required**; never auto-apply it.

## Method / guardrails

**External-first selection**
1. If current runtime is Codex and `command -v claude` succeeds, run Claude Code.
2. If current runtime is Claude Code and `command -v codex` succeeds, run Codex.
3. If the opposite CLI is missing, exits non-zero, cannot write `REVIEW_REPORT`, or produces an invalid report after one repair attempt, record the reason and fall back to Caspar subagents.
4. Primary-agent self-review is prohibited except compiling explicit fallback subagent returns.
5. Do not probe for startup commands. Use exactly the recipe below.

**Opposite-runtime initiation recipe**

From Codex primary:
```bash
claude -p --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Write,Task" --output-format text "$REVIEW_PROMPT"
```

From Claude Code primary:
```bash
codex exec -C "$PWD" -s workspace-write "$REVIEW_PROMPT"
```

Run from repo root. Do not add approval flags, resume flags, broad bypass flags, `codex review`, project discovery commands, shell pipelines, or temp prompt files unless argument length requires a file. If a prompt file is unavoidable, keep the same command shape and pass `$(cat /tmp/plan_review_prompt.txt)` as the final argument.

`REVIEW_PROMPT` includes: TASK_DIR, REVIEW_REPORT, mode, present/absent manifest, canonical scope source, Canonical Scope Invariant, write permission limited to REVIEW_REPORT, required report sections, and: "This review may take at least 20 minutes; do not stop early. In full mode, dispatch one independent subagent per review lens, tell each lens worker that its review may take at least 20 minutes, wait for all lens returns, then synthesize the final report yourself." External reviewer may write only REVIEW_REPORT.

**Review lenses**

| Lens | Fallback agent | Finds |
|---|---|---|
| YAGNI / familiar-shape bias | `@caspar:reviewer` | unrequested abstractions, speculative generality, missing Out-of-Bounds fences; nominate the single highest-leverage scope-safe deletion or "none" |
| Verifiability | `@caspar:analyst` | prose verification, weak "succeeds when", missing test/observable/state signal, unreviewable assumptions |
| Existence / hallucination | `@caspar:finder` | nonexistent paths, symbols, packages, CLIs, env vars; cite expected vs actual |
| Canonical reference quality | `@caspar:patterns` | vague "follow existing pattern" claims; propose concrete file:line anchors or reuse targets |

- **Adversarial mode:** one opposite-runtime pass focused on execution readiness.
- **Full mode:** opposite-runtime reviewer fans out one worker per lens, waits, then writes the report.
- **Fallback:** adversarial uses one `@caspar:reviewer`; full dispatches the four lenses in parallel. Subagents return compressed findings in-thread; only the compiled report persists.
- Severity: **Blocker**, **High**, **Medium**, **Low**, **Scope Change Required**.

**Write-back**
- Read `REVIEW_REPORT` fully before edits.
- `--auto-apply scope-safe`: apply scope-safe Blocker+High to `plan.md`; Medium/Low only when unambiguous and scope-neutral. Never apply Scope Change Required.
- Otherwise present the findings table and ask `all` / `blockers` / `1,3,5` / `skip`; wait.
- Edit only `plan.md`; do not edit `execute.md`, `tasks.json`, scope, PRD, UX, or context files.
- Self-check: cited refs exist, plan verification remains executable, Out-of-Bounds preserved, canonical scope still fully represented.

## Outputs + DONE

`REVIEW_REPORT` required sections:
1. **Must-Delete (Lens 1 - YAGNI)** - one nominated scope-safe cut or "No scope-safe deletion found".
2. **Findings** - table `# | Severity | Lens | Location | Finding | Suggested Edit`.
3. **Summary** - counts per severity; Blocker/High must resolve before task generation.
4. **Review Metadata** - reviewed artifacts, canonical scope source, auto-apply mode, ISO8601 timestamp, `Mode:`, `Reviewer Runtime:`, `Fallback Reason:` when applicable.

DONE when the report exists before edits; every finding has a location + concrete suggested edit; external reviewer or fallback reason is recorded; applied edits touch only `plan.md`; scope-change recommendations are left unapplied; post-edit self-check passes.

## Handoff

Surface reviewer runtime, fallback reason, findings table, `Review report saved: {path}`, `Applied: {#s}. Skipped: {#s}. Scope-change recommendations not applied: {list or "none"}`, and updated `plan.md` path. Next: `/caspar:create_tasks` once Blocker/High findings are resolved.

## Escalate-If

- `plan.md` absent -> stop; route to `/caspar:create_plan`.
- A finding requires changing agreed scope -> emit Scope Change Required and do not apply it.
- Self-check fails after an applied edit -> surface the failure and ask before continuing.

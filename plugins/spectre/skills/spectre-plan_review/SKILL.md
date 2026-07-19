---
name: "spectre-plan_review"
description: "Independent adversarial review of plan.md before task generation. Use a pinned high-effort opposite-runtime reviewer; fall back to one native reviewer with the same contract when unavailable. Trigger after create_plan and before create_tasks. Do NOT review generated tasks, finished code, or apply scope changes."
user-invocable: true
---

# plan_review

Plan-only adversarial review: stabilize intent before `execute.md`/`tasks.json` exist. Clear on WHAT, silent on HOW. Reviews scope/PRD/UX/context plus `plan.md`; never authors tasks or implementation.

## Inputs

- `$ARGUMENTS` - `--mode adversarial` (default) or `--mode full`, optional `--auto-apply scope-safe`, optional explicit TASK_DIR.
- Required: `{TASK_DIR}/specs/plan.md`. Helpful: `concepts/scope.md`, `specs/prd.md`, `specs/ux.md`, `task_context.md`, `research/*.md`.
- If `plan.md` is absent -> stop, route to `/spectre:create_plan`. Do not ask the user to create missing optional artifacts.

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
3. If the opposite CLI is missing, exits non-zero, cannot write `REVIEW_REPORT`, or produces an invalid report after one repair attempt, record the reason and fall back to one native `@spectre:reviewer`; unavailable opposing runtimes never block completion.
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

Run from repo root. Do not add approval flags, resume flags, broad bypass flags, `codex review`, project discovery commands, shell pipelines, or temp prompt files unless argument length requires a file. If a prompt file is unavoidable, keep the same command shape and pass `$(cat /tmp/plan_review_prompt.txt)` as the final argument.

`REVIEW_PROMPT` includes: TASK_DIR, REVIEW_REPORT, mode, present/absent manifest, canonical scope source, Canonical Scope Invariant, write permission limited to REVIEW_REPORT, required report sections, required review metadata (`Reviewer Runtime`, `Reviewer Model`, `Reviewer Effort`, `Invocation Route`), and: "This review may take at least 20 minutes; do not stop early. In full mode, dispatch one independent subagent per review lens only when each worker inherits the parent reviewer model and effort; otherwise review all lenses in this pinned parent process. Tell each dispatched worker that its review may take at least 20 minutes, wait for all lens returns, then synthesize the final report yourself." External reviewer may write only REVIEW_REPORT.

**Review lenses**

| Lens | Fallback agent | Finds |
|---|---|---|
| YAGNI / familiar-shape bias | `@spectre:reviewer` | unrequested abstractions, speculative generality, missing Out-of-Bounds fences; nominate the single highest-leverage scope-safe deletion or "none" |
| Verifiability | `@spectre:analyst` | prose verification, weak "succeeds when", missing test/observable/state signal, unreviewable assumptions |
| Existence / hallucination | `@spectre:finder` | nonexistent paths, symbols, packages, CLIs, env vars; cite expected vs actual |
| Canonical reference quality | `@spectre:patterns` | vague "follow existing pattern" claims; propose concrete file:line anchors or reuse targets |

- **Adversarial mode:** one opposite-runtime pass focused on execution readiness.
- **Full mode:** opposite-runtime reviewer fans out one worker per lens only with pinned-model inheritance; otherwise the pinned parent reviews all four lenses, then writes the report.
- **Native fallback:** dispatch one clean-context `@spectre:reviewer` with the same artifact manifest, scope invariant, lenses, severity rules, evidence requirements, and report schema from `REVIEW_PROMPT`. In full mode this single reviewer evaluates every lens itself; it does not delegate. Replace only the persistence instruction: return the complete report in-thread so the primary can save it unchanged. Record `Reviewer Runtime: native-subagent`, `Reviewer Model: runtime-native`, `Reviewer Effort: inherited`, `Invocation Route: native-fallback`, and `Fallback Reason: ...`.
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
4. **Review Metadata** - reviewed artifacts, canonical scope source, auto-apply mode, ISO8601 timestamp, `Mode:`, `Reviewer Runtime:`, `Reviewer Model:`, `Reviewer Effort:`, `Invocation Route:`, and `Fallback Reason:` when applicable.

DONE when the report exists before edits; every finding has a location + concrete suggested edit; runtime/model/effort/route metadata is recorded; any native fallback reason is recorded; applied edits touch only `plan.md`; scope-change recommendations are left unapplied; post-edit self-check passes.

## Handoff

Surface reviewer runtime, fallback reason, findings table, `Review report saved: {path}`, `Applied: {#s}. Skipped: {#s}. Scope-change recommendations not applied: {list or "none"}`, and updated `plan.md` path. Next: `/spectre:create_tasks` once Blocker/High findings are resolved.

## Escalate-If

- `plan.md` absent -> stop; route to `/spectre:create_plan`.
- A finding requires changing agreed scope -> emit Scope Change Required and do not apply it.
- Self-check fails after an applied edit -> surface the failure and ask before continuing.

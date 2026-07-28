---
name: "spectre-plan_review"
description: "Independent adversarial review of plan.md before task generation. Use a pinned high-effort opposite-runtime reviewer; fall back to one native reviewer with the same contract when unavailable. Trigger after create_plan and before create_tasks. Do NOT review generated tasks, finished code, or apply scope changes."
user-invocable: true
---

# plan_review

Plan-only adversarial review: stabilize intent before `execute.md`/`tasks.json` exist. Clear on WHAT, silent on HOW. Reviews scope/PRD/UX/context plus `plan.md`; never authors tasks or implementation.

## Inputs

- `$ARGUMENTS` - explicit feature name/root or descendant plan artifact, `--mode adversarial` (default) or `--mode full`, optional `--auto-apply scope-safe`, and optional `--review-again` only when the user's latest instruction explicitly requests another plan review.
- Required: `{FEATURE_ROOT}/specs/plan.md`. Helpful: `concepts/scope.md`, `specs/prd.md`, `specs/ux.md`, `task_context.md`, `research/*.md`.
- If `plan.md` is absent -> stop, route to `/spectre:create_plan`. Do not ask the user to create missing optional artifacts.

## Working Set

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged to every routed child and external reviewer prompt; a child or reviewer never rederives it.
- An explicit legacy `docs/tasks/**` plan remains a readable input, but do not move or bulk-rewrite it. Require a confirmed `.spectre/features/<feature-name>/` root for the new review report and record the legacy source.
- `TASK_DIR = FEATURE_ROOT`.
- `REVIEW_REPORT = {FEATURE_ROOT}/reviews/plan_review.md`; `mkdir -p`. A user-authorized `--review-again` writes `plan_review_{YYYY-MM-DD_HHMMSS}.md`; no other condition may select a second report.
- `REVIEW_ATTEMPT = {FEATURE_ROOT}/reviews/plan_review_attempt.json`; create it atomically immediately before the first reviewer launch with `status: started`, the report path, route, timestamp, and `authorization: initial|explicit-user-review-again`. Update it to `complete` or `failed` when the round ends.
- Canonical scope source, in order: `concepts/scope.md`, `specs/prd.md`, `specs/ux.md`, explicit requirements in `task_context.md`.

## Canonical Scope Invariant

Reviewers may recommend deleting unrequested implementation, unnecessary abstractions, weak verification, hallucinated refs, bad deps, or bad sequencing. They **MUST NOT** cut, narrow, expand, or reinterpret agreed scope. If scope itself looks wrong or incomplete, emit **Scope Change Required**; never auto-apply it.

## Method / guardrails

**One-review hard stop**

1. Before constructing a prompt or launching any reviewer, check `REVIEW_ATTEMPT` and `REVIEW_REPORT`.
2. If either shows that a plan-review round already started, **do not launch, resume, repair, fall back, or synthesize another semantic review**. Return the existing report/attempt status to the caller. Artifact changes, final-gate feedback, discussion points, stale hashes, failed/partial prior attempts, and uncertainty never reopen the gate.
3. The only override is `--review-again` backed by the user's latest instruction explicitly asking for another plan review. A planner or orchestrator **MUST NOT** infer, manufacture, or add this flag. Record the user's authorization in `REVIEW_ATTEMPT` before launching the explicitly requested round.
4. An initial external attempt, its report-only repair, and its native fallback belong to one review round. They may finish that already-started round; they do not authorize a later round after the skill returns or is interrupted.

**External-first selection**
1. If current runtime is Codex and `command -v claude` succeeds, run Claude Code.
2. If current runtime is Claude Code and `command -v codex` succeeds, run Codex.
3. Launch each external review attempt as a long-running process and keep polling it. Allow up to 20 minutes for completion; quiet output or elapsed time below that limit is not failure. Do not pass launcher timeout or duration guidance to the reviewer.
4. If the opposite CLI is missing, exits non-zero, does not complete within that launcher window, cannot write `REVIEW_REPORT`, or produces an invalid report after one repair attempt, record the reason and fall back to one native `@spectre:reviewer`; unavailable opposing runtimes never block completion.
5. Primary-agent self-review is prohibited except compiling explicit fallback subagent returns.
6. Do not probe for startup commands. Use exactly the recipe below.

**Opposite-runtime initiation recipe**

From Codex primary:
```bash
claude -p --model opus --effort high --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Write,Task" --output-format text "$REVIEW_PROMPT"
```

From Claude Code primary:
```bash
codex exec -C "$PWD" -m gpt-5.6-sol -c 'model_reasoning_effort="high"' -s workspace-write "$REVIEW_PROMPT"
```

External report metadata is fixed by route: Codex -> Claude Code records `Reviewer Runtime: Claude Code`, `Reviewer Model: opus`, `Reviewer Effort: high`, `Invocation Route: Codex -> Claude Code`; Claude Code -> Codex records `Reviewer Runtime: Codex`, `Reviewer Model: gpt-5.6-sol`, `Reviewer Effort: high`, `Invocation Route: Claude Code -> Codex`.

Run from repo root. Do not add approval flags, resume flags, broad bypass flags, `codex review`, project discovery commands, shell pipelines, or temp prompt files unless argument length requires a file. If a prompt file is unavoidable, keep the same command shape and pass `$(cat /tmp/plan_review_prompt.txt)` as the final argument.

`REVIEW_PROMPT` includes the exact feature root, feature name, TASK_DIR, REVIEW_REPORT, mode, present/absent manifest, canonical scope source, Canonical Scope Invariant, write permission limited to REVIEW_REPORT, required report sections, required review metadata (`Reviewer Runtime`, `Reviewer Model`, `Reviewer Effort`, `Invocation Route`), and: "Use the supplied Feature Root unchanged. The reviewer must not rederive the feature root from the branch or repository activity. In full mode, dispatch one independent subagent per review lens only when each worker inherits the parent reviewer model and effort; otherwise review all lenses in this pinned parent process. Wait for all lens returns, then synthesize the final report yourself." External reviewer may write only REVIEW_REPORT.

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
0. **Self-location metadata** - immediately below the title: `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`.
1. **Must-Delete (Lens 1 - YAGNI)** - one nominated scope-safe cut or "No scope-safe deletion found".
2. **Findings** - table `# | Severity | Lens | Location | Finding | Suggested Edit`.
3. **Summary** - counts per severity; Blocker/High must resolve before task generation.
4. **Review Metadata** - reviewed artifacts, canonical scope source, auto-apply mode, ISO8601 timestamp, `Mode:`, `Reviewer Runtime:`, `Reviewer Model:`, `Reviewer Effort:`, `Invocation Route:`, and `Fallback Reason:` when applicable.

DONE when one review round is recorded in `REVIEW_ATTEMPT`; the report exists before edits; every finding has a location + concrete suggested edit; runtime/model/effort/route metadata is recorded; any native fallback reason is recorded; applied edits touch only `plan.md`; scope-change recommendations are left unapplied; post-edit self-check passes. Later edits do not invalidate the completed round or trigger another one.

## Handoff

Surface reviewer runtime, fallback reason, findings table, `Review report saved: {path}`, `Applied: {#s}. Skipped: {#s}. Scope-change recommendations not applied: {list or "none"}`, and updated `plan.md` path.

- `--orchestrated` → return the review result and updated plan path to the caller without user-facing Next Steps.
- Existing attempt without explicit `--review-again` → return `Plan review hard stop: prior round {status}; no reviewer launched`, plus the attempt/report paths.
- Standalone + unresolved Blocker/High → remain in remediation; scope-change findings route to `/spectre:scope`.
- Standalone + resolved Blocker/High → `Next (recommended): /spectre:create_tasks — the reviewed plan is ready for task compilation.` Offer `/spectre:handoff` only when stopping at this durable review boundary.

## Escalate-If

- `plan.md` absent -> stop; route to `/spectre:create_plan`.
- A finding requires changing agreed scope -> emit Scope Change Required and do not apply it.
- Self-check fails after an applied edit -> surface the failure and ask before continuing.

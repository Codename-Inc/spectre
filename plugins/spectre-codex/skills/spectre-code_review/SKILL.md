---
name: "spectre-code_review"
description: "Run an independent adversarial code review of completed work using a pinned high-effort opposing runtime, with a same-contract native fallback. Finds bugs, correctness and security failures, regressions, performance landmines, overengineering, and missing behavioral tests. Review only; never edits code."
user-invocable: true
---

# code_review

Adversarial review of what was just built. A clean-context reviewer tries to falsify correctness and production readiness, then returns only evidence-backed, severity-ranked findings. Review only; never edit code.

## Inputs

- `$ARGUMENTS` - optional explicit feature name/root or descendant artifact, focus guidance, explicit diff/base range, an explicit source-plan path, an optional immutable `BASE_SHA`/`HEAD_SHA`/`DIFF_SHA256` candidate tuple, and optional `--orchestrated` when another workflow will consume the report.
- Review scope = completed work plus modified/created/deleted files, their direct dependencies/importers, and relevant tests. Pull requirements and acceptance criteria from the matching `tasks.json` parent slices when present, else an explicitly passed source-plan path ahead of literal `plan.md`, else the user's request and actual diff. Use `execute.md` only to locate `tasks.json`.
- If the work scope is genuinely ambiguous after inspecting artifacts and git state, ask what to review before dispatching.

## Working Set

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- Pass the exact feature root unchanged to every routed child and external reviewer prompt; a child or reviewer never rederives it. Passing any produced artifact identifies the feature name and root without branch inference.
- An explicit legacy `docs/tasks/**` artifact remains a readable input, but do not move or bulk-rewrite it. Every new review document requires a confirmed canonical `.spectre/features/<feature-name>/` root and records the legacy source in its scope manifest.
- `REVIEW_REPORT = {FEATURE_ROOT}/reviews/comprehensive_code_review.md`; if it exists, use `comprehensive_code_review_{YYYY-MM-DD_HHMMSS}.md` and never overwrite prior evidence.
- Build a late-bound review manifest: diff/base range, optional candidate tuple, changed-file summary, in-scope requirement/AC paths, relevant `tasks.json` parent ids, direct dependencies/importers, relevant tests, and explicit exclusions. Do not inline an entire large diff or task graph; the reviewer reads them directly.

## Method / guardrails

**External-first selection**
1. If current runtime is Codex and `command -v claude` succeeds, run Claude Code.
2. If current runtime is Claude Code and `command -v codex` succeeds, run Codex.
3. If the opposite CLI is missing, exits non-zero, cannot write `REVIEW_REPORT`, or produces an invalid report after one repair attempt, record the reason and fall back to one native `@spectre_reviewer`; unavailable opposing runtimes never block completion.
4. Primary-agent self-review is prohibited except validating the saved report and persisting an explicit native fallback return.
5. Do not probe for startup commands. Use exactly the applicable recipe below from repo root.

**Opposite-runtime initiation recipe**

From Codex primary:
```bash
claude -p --model opus --effort high --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Bash(git diff *),Bash(git show *),Bash(git status *),Bash(git rev-parse *),Write" --output-format text "$REVIEW_PROMPT"
```

From Claude Code primary:
```bash
codex exec -C "$PWD" -m gpt-5.6-sol -c 'model_reasoning_effort="high"' -s workspace-write "$REVIEW_PROMPT"
```

External report metadata is fixed by route: Codex -> Claude Code records `Reviewer Runtime: Claude Code`, `Reviewer Model: opus`, `Reviewer Effort: high`, `Invocation Route: Codex -> Claude Code`; Claude Code -> Codex records `Reviewer Runtime: Codex`, `Reviewer Model: gpt-5.6-sol`, `Reviewer Effort: high`, `Invocation Route: Claude Code -> Codex`.

The external reviewer may write only `REVIEW_REPORT`; it may not edit code, tests, plans, tasks, scope docs, or other artifacts. Allow at least 20 minutes before treating the run as hung.

`REVIEW_PROMPT` includes the exact feature name/root and says to use that root unchanged without branch or repository-activity rederivation. It also includes: "Act as an adversarial code reviewer. Try to prove the completed work is wrong, unsafe, unnecessarily complex, or unable to meet its stated requirements. Do not defend the implementation and do not invent out-of-scope requirements." It includes the review manifest, report path, scope boundary, lenses, severity/evidence rules, required sections, write restriction, and required metadata (`Reviewer Runtime`, `Reviewer Model`, `Reviewer Effort`, `Invocation Route`).

**Adversarial lenses**

| Lens | Attack surface |
|---|---|
| Correctness | wrong outputs, broken invariants, edge cases, state/ordering/concurrency failures, error-path behavior |
| Regression / integration | broken callers, unreachable wiring, stale active paths, contract mismatches, incomplete migrations |
| Security | trust boundaries, auth/permissions, injection, secret/data exposure, unsafe input or destructive behavior |
| Performance / reliability | hot-path complexity, N+1 work, blocking I/O, leaks, unbounded memory/work, retry or failure amplification |
| Overengineering | speculative abstractions, duplicate paths, needless indirection, generality not required by scope; flag only when a materially simpler in-scope shape is evident |
| Test adequacy | changed behavior with no executable regression signal, untested failure/security paths, assertions that cannot catch the defect |

**Severity and evidence**

- **CRITICAL** - exploitable security failure, data loss/corruption, privilege bypass, or core execution failure.
- **HIGH** - concrete user-facing correctness/regression, serious security weakness, or demonstrated hot-path/reliability failure.
- **MEDIUM** - localized defect, meaningful maintainability/overengineering cost, non-critical performance issue, or material test gap with a concrete failure risk.
- **LOW** - small but actionable issue. Do not report style, naming, formatting, praise, or speculative future concerns.
- Every finding needs `file:line`, the violated behavior/requirement, concrete evidence, impact, and the smallest scope-safe fix.
- Every CRITICAL/HIGH also needs a reproducible failure, exploit, or performance path with observable behavior. No evidence chain means downgrade or omit; "could potentially" is not evidence.
- Stay within the completed work and its direct blast radius. Missing features from another scope and subjective architecture preferences are not findings.

**Native fallback**

- Dispatch one clean-context `@spectre_reviewer` with the same manifest, adversarial role, lenses, severity rules, evidence requirements, exclusions, and report schema from `REVIEW_PROMPT`.
- Replace only the persistence instruction: return the complete report in-thread so the primary can save it unchanged to `REVIEW_REPORT`.
- Record `Reviewer Runtime: native-subagent`, `Reviewer Model: runtime-native`, `Reviewer Effort: inherited`, `Invocation Route: native-fallback`, and `Fallback Reason: ...`.

When a candidate tuple is supplied, require all three fields, recompute the canonical hash using `git diff --binary --full-index --no-ext-diff --no-color --no-renames`, and verify the tuple before dispatch and after report creation. Record it in Scope Boundary; a mismatch makes the report stale. After either route, verify the report exists, contains every required section, names the reviewed scope, and includes all runtime/model metadata. Repair an invalid external report once with the same CLI; otherwise use the native fallback. Never fix findings inside this skill.

## Outputs + DONE

Required report sections:

`REVIEW_REPORT` begins with its title followed immediately by the Feature/Feature Root metadata below.

0. **Self-location metadata** - immediately below the title: `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`.
1. **Scope Boundary** - completed work, diff/base, supplied candidate tuple, requirements, in-scope files/dependencies/tests, explicit exclusions, and any legacy source path.
2. **Verdict** - `BLOCKED` for CRITICAL/HIGH, `PASS WITH FINDINGS` for MEDIUM/LOW only, or `CLEAN`.
3. **Findings** - table `# | Severity | Lens | Location | Evidence / Reproduction | Impact | Smallest Fix`, ordered CRITICAL to LOW. Say `No findings` when clean; do not pad.
4. **Coverage Record** - files/paths and tests inspected, plus material areas not verified and why.
5. **Prioritized Actions** - minimal ordered remediation list, or `None` when clean.
6. **Review Metadata** - ISO8601 timestamp, `Reviewer Runtime:`, `Reviewer Model:`, `Reviewer Effort:`, `Invocation Route:`, and `Fallback Reason:` when applicable.

DONE when the self-locating report exists with all six numbered sections plus metadata; scope and any candidate tuple are explicit and unchanged; runtime/model/effort/route metadata is present; any native fallback reason is recorded; findings satisfy evidence rules; no code or non-report artifact was modified.

## Handoff

- Standalone: return only CRITICAL/HIGH findings numbered for selection, the verdict, reviewer runtime/model, fallback reason if any, and `Review report saved: {path}`. Blockers → `spectre-fix`; otherwise choose `spectre-proof` for completed user-observable work, `spectre-test` for a concrete coverage gap, or `spectre-clean` only when proof is explicitly deferred. Emit one primary recommendation tied to the verdict, not an equal-weight menu.
- `--orchestrated`: return the verdict, CRITICAL/HIGH findings with their evidence chains, reviewer metadata, and report path to the calling workflow without pausing or suggesting a separate command.

## Escalate-If

- Diff/work scope remains ambiguous after reading available task/plan artifacts and git state -> ask what to review before dispatching.
- A proposed finding changes requirements rather than identifying a defect -> label it `Scope Change Required`; do not include it in the blocking verdict.

## Codex Agent Preflight

Before dispatching any `@spectre_*` custom agent, run the bundled setup helper once:

```bash
node "${PLUGIN_ROOT}/skills/spectre-scope/scripts/ensure-codex-agents.mjs" --ensure --json
```

If the helper reports agents were installed or updated in this session, continue directly only for lookup/scoping work that can be completed without a subagent. For other agent-dependent workflows, stop with a clear one-session restart requirement so Codex can discover the new custom agents.

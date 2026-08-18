---
name: "spectre-code_review"
description: "Run final adversarial review through a pinned high-effort opposing runtime with one native fallback. Use at the final boundary to falsify correctness, safety, production readiness, and requirement delivery. Do not use for partial checkpoints or implementation; review only."
user-invocable: true
---

# code_review

## Purpose

Try to prove the work wrong, unsafe, unreachable, or unable to meet requirements. Accept correctness only if evidence survives adversarial scrutiny; never defend the implementation.

## Inputs

- `$ARGUMENTS`: feature/root or descendant artifact, focus, diff/base range, source-plan path, immutable `BASE_SHA`/`HEAD_SHA`/`DIFF_SHA256` tuple, and `--orchestrated`.
- Scope: completed changes, changed files, direct dependencies/importers, tests, and requirements/ACs. Source requirements from matching `tasks.json` parents, else an explicit source-plan path before `plan.md`, then request+diff. `execute.md` only locates tasks.

## Working Set

- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `@skill-spectre:spectre-feature-root` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Repair stale feature/root metadata in artifacts this review touches.
- `REVIEW_REPORT={FEATURE_ROOT}/reviews/comprehensive_code_review.md`; replace it for the current candidate. Git history preserves prior decisions without accumulating sibling reports.
- Late-bind diff/base and tuple, changed files, requirement/AC paths and task ids, dependencies/importers, tests, and exclusions. Reviewers read diffs/task graphs.

## Outputs + DONE

`REVIEW_REPORT` contains:

0. title, `Feature:`, `Feature Root:`;
1. **Scope Boundary** — completed work, diff/base, tuple, requirements, files/dependencies/tests, exclusions;
2. **Verdict** — `BLOCKED` for CRITICAL/HIGH, `PASS WITH FINDINGS` for MEDIUM/LOW only, else `CLEAN`;
3. **Findings** — `# | Severity | Lens | Location | Evidence / Reproduction | Impact | Finding Fingerprint | Invariant Family | Smallest Fix`, severity-ordered or `No findings`;
4. **Coverage Record** — inspected/unverified areas and reasons;
5. **Requirement Delivery Coverage** — `Requirement/AC | Status | Consumer/outcome evidence | Gap/Finding` for every applicable item;
6. **Scope and Dead-Path Audit** — separate tables for scope creep, dead computations/orphaned outputs, old active paths, and duplicate data sources; empty categories say `None found`;
7. **Prioritized Actions** — ordered remediation or `None`;
8. **Review Metadata** — ISO8601 timestamp, `Review Mode: final`, runtime/model/effort/route, and fallback reason.

DONE when schema validation passes; scope/tuple are unchanged; every requirement/AC has one evidence-backed status; audit and route metadata exist; findings satisfy identity/evidence rules; and only the report changed.

## Method / guardrails

1. **Use one external-first review route from repo root; do not probe alternatives.** Codex primary runs:
   `claude -p --model opus --effort high --permission-mode dontAsk --allowedTools "Read,Grep,Glob,LS,Bash(mkdir -p *),Bash(git diff *),Bash(git show *),Bash(git status *),Bash(git rev-parse *),Write" --output-format text "$REVIEW_PROMPT"`
   Claude primary runs:
   `codex exec -C "$PWD" -m gpt-5.6-sol -c 'model_reasoning_effort="high"' -s workspace-write "$REVIEW_PROMPT"`
   Record route metadata as `Claude Code|opus|high|Codex -> Claude Code` or `Codex|gpt-5.6-sol|high|Claude Code -> Codex`. Keep a 20-minute launcher-side poll limit; do not pass duration guidance to the reviewer. Quiet output is not failure. The reviewer writes only `REVIEW_REPORT`. Primary semantic self-review is prohibited.
2. **Fallback once.** Missing/non-zero opposing CLI, report-write failure, or unusable review permits one clean-context `@spectre:reviewer` under the same manifest, contract, and schema. It returns the report in-thread for unchanged persistence. Record `native-subagent|runtime-native|inherited|native-fallback` plus reason. A usable review ends semantic review.
3. **Falsify; do not confirm.** Actively seek counterexamples, broken invariants, failure paths, false-positive tests, unreachable outcomes, and evidence contradicting claimed delivery. Cover correctness; regression/integration; security; performance/reliability; materially avoidable overengineering; test adequacy; requirement reachability; scope/dead paths. Stay within completed work and direct blast radius; omit style, praise, speculation, subjective preferences, and requirements from another scope.
4. **Require evidence.** Severity is `CRITICAL|HIGH|MEDIUM|LOW`: CRITICAL means exploit/data loss/corruption/privilege bypass/core failure; HIGH a concrete user-facing defect, serious security weakness, or demonstrated hot-path/reliability failure; MEDIUM a localized defect or material maintainability/performance/test risk; LOW a small actionable issue. Each finding cites `file:line`, violated behavior, evidence, impact, smallest scope-safe fix, `finding_fingerprint=sha256(requirement anchor + primary symbol/boundary + normalized observable failure)`, and `invariant_family=sha256(requirement anchor + normalized violated invariant + lifecycle/data-flow boundary)`. CRITICAL/HIGH also requires the normalized invariant and reproducible failure/exploit/performance path; otherwise downgrade or omit.
5. **Prove delivery.** Assign each requirement/AC one of `Delivered|Partial|Dead|Missing`. Delivered requires compact usage/consumer `file:line` evidence plus a reachable outcome; other statuses require a matching finding and action. Trace UI outcomes backward from render/action, and service/data outcomes through caller, boundary, side effect/persistence, and reload/reconciliation. Do not repeat requirement prose or evidence already cited elsewhere in the report.
6. **Verify deterministically.** A candidate tuple requires all fields and canonical hash recomputation with `git diff --binary --full-index --no-ext-diff --no-color --no-renames` before dispatch and after report creation; mismatch makes the report stale. Validate required sections, scope, exhaustive delivery coverage, and metadata. The primary may mechanically normalize report-only counts, paths, citations, metadata, sections/tables, and severity enums from existing reviewer semantics, but may not originate or materially reinterpret findings. An unusable native report remains incomplete.

## Handoff

- Standalone: return verdict, reviewer runtime/model, fallback reason, report path, and only numbered CRITICAL/HIGH findings. Blockers recommend `/spectre:fix`; otherwise recommend one of `/spectre:prove`, `/spectre:test` for a concrete gap, or `/spectre:clean` only when proof is explicitly deferred.
- `--orchestrated`: return verdict, delivery counts, CRITICAL/HIGH evidence chains and identities, reviewer metadata, and report path; do not pause or suggest another command.

## Escalate-If

- Scope remains ambiguous after artifacts and git state are inspected: ask what to review before dispatch.
- A proposed finding changes requirements: label `Scope Change Required` and exclude it from the blocking verdict.

Next step: follow the verdict-specific handoff.

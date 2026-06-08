---
name: "caspar-code_review"
description: "Run an independent, severity-ranked code review of completed work — scopes to the modified files + their related deps, dispatches a clean-room @caspar:reviewer, and writes a report with CRITICAL/HIGH/MEDIUM/LOW findings and a prioritized action plan. Trigger after a unit of work is implemented and you want a second-pass quality/security/correctness check before clean/test/ship. Do NOT trigger to perform the fixes (review only — it never edits code), to run tests (caspar-test), or to do dead-code removal (caspar-prune)."
user-invocable: true
---

# code_review

Independent, comprehensive review of **what was just built** — correctness, security, quality, production-readiness — returned as severity-ranked findings with evidence and a prioritized fix order. **Review only; never edit code.**

## Inputs

- `$ARGUMENTS` — optional focus areas / guidance; honor it but still review comprehensively.
- The completed work + the files it touched (created/modified/deleted, each with what changed) — the review scope. Pull from `tasks.json` parent/subtask slices when present, else `plan.md`, else infer from the diff and the user's request; trace to origin docs (PRD / task_summary) for acceptance criteria when available. Do not use `execute.md` as the review source except to locate `tasks.json`.

## Working Set (late-bound — read at run-time, never inline)

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`)
- `OUT_DIR = target_dir || docs/tasks/{branch}`; report goes under `{OUT_DIR}/reviews/`
- the actual diff / changed files and task artifacts under `{OUT_DIR}/` — read just-in-time. For `tasks.json`, extract only relevant `phases[].parents[]` and child subtask slices; do not load whole JSON into the review brief.

## Method / guardrails

- **Scope first, tightly.** Define the exact set under review = modified/created files + their direct deps, imports, and tests. State in-scope vs out-of-scope explicitly. This prevents adjacent-code drift.
- **Dispatch one `@reviewer`** with a clean-room brief: the work completed, the file list (path + what changed), extracted requirements/acceptance criteria, and the severity scale + evidence rule below. The reviewer reads the code itself; you give it scope, not your own findings.
- **Severity scale:**
  - **CRITICAL** — prevents execution; security vuln (injection, auth bypass, privilege escalation, data/secret exposure, insecure randomness); broken core logic.
  - **HIGH** — maintainability/structure, missing core functionality, resource leaks, perf on hot paths (N+1, blocking I/O, O(n²) on large data), error handling that blocks users or leaks internals, API/network security (SSRF, CORS, rate-limit, HTTPS).
  - **MEDIUM** — test coverage gaps, code quality/duplication, non-critical perf, config/CVEs/headers.
  - **LOW** — docs, logging hygiene, final polish (dead code, debug prints, scoped diff).
- **Evidence rule (YOU MUST):** every CRITICAL/HIGH finding carries `file:line` **and** a reproducible failure or exploit path describing observable behavior. No evidence chain → auto-downgrade one severity. "Could potentially" is not evidence.
- **Stay in scope (YOU MUST NOT over-flag).** Flag only problems that block delivering the *completed work*; suggest only changes that support its acceptance criteria. Do NOT flag missing features from incomplete/different scopes or enhancements beyond the minimal viable implementation. Early-stage product: YAGNI + KISS + DRY + SOLID — no over-engineering.
- **No fixes.** Report and hand back; the user decides what to act on.

## Outputs + DONE

Write the report to `{OUT_DIR}/reviews/comprehensive_code_review.md` (scoped filename like `{name}_comprehensive_code_review_{timestamp}.md` if one already exists, never overwrite); `mkdir -p` the dir. Required sections:

1. **Scope Boundary Validation** — completed work + modified files understood; in-scope vs out-of-scope stated; other/incomplete work explicitly excluded.
2. **Context Summary** — docs reviewed + code scope identified.
3. **Files Reviewed** — specific files/areas examined.
4. **Summary Assessment** — readiness, security posture, risk level.
5. **Findings by Severity** — CRITICAL / HIGH / MEDIUM / LOW, each finding `file:line` + description + fix (CRITICAL/HIGH obey the evidence rule).
6. **Scores (0–10)** — Security Posture · Logic Correctness · Code Quality · Production Readiness.
7. **Prioritized Action Plan** — ordered fixes (CRITICAL → HIGH → MEDIUM → LOW), related fixes grouped.

**DONE when:** the report exists with all 7 sections; findings are severity-ranked and every CRITICAL/HIGH has an evidence chain; in/out-of-scope is explicit; no code was modified.

## Handoff

Respond to the user with **only the high-priority items** (numbered for selection: brief description + `file:line` + impact + recommendation) and point to the report path. Do not perform fixes. Then suggest the next command inline — typically `caspar-fix` to address findings, or `caspar-clean` / `caspar-test` to continue the loop.

## Escalate-If

- The diff/work scope can't be determined (no tasks.json, no plan.md, ambiguous request) → ask the user what to review before dispatching.
- A finding implies a scope or requirements change rather than a defect → surface it to the user; do not silently expand the review.

---
name: "spectre-test"
description: "Triage a working set into risk tiers (P0–P3) and add risk-appropriate behavioral tests — thorough coverage where bugs hurt users (auth/payment/security/PII), light or none on low-risk code — fixing lint and committing per passing batch. Trigger after a feature is built or when asked to add/strengthen tests for recent changes; when invoked by spectre-clean, consume the primary's risk plan and execute the assigned test batch. Do NOT trigger for brute-force 100%-line-coverage demands, dead-code cleanup (spectre-prune), bug fixes (spectre-fix), final commit hygiene (spectre-sweep), or scoping/planning."
user-invocable: true
---

# test

Add risk-weighted test coverage to a working set and commit per passing batch — **clear on WHAT, silent on HOW.** Test behaviors at boundaries, not implementation; concentrate effort where breakage hurts users; skip code that can't break. Risk assessment is inline reasoning, not a separate phase. Lightweight flow — no intermediate report files.

## Inputs

- `$ARGUMENTS` — optional scope hint or specific files to focus on.
- Optional orchestrator-provided risk plan from `spectre-clean`: files already tiered P0-P3 plus batch assignment. When present, use it as the plan for this batch.
- `target_out_dir` — optional OUT_DIR override.

## Working Set (late-bound — read at run-time, never inline)

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`); `OUT_DIR = target_out_dir || docs/tasks/{branch}`.
- **Full Working Set = UNION** of: committed changes (validate any provided `commit_id`; invalid → STOP and ask), staged (`git diff --cached --name-only`), unstaged (`git diff --name-only`), untracked (`git ls-files --others --exclude-standard`). Record to `{OUT_DIR}/working_set.json`.
- Baseline-lint all files in the set; map import/dependency edges. All paths absolute from repo root.

## Method / guardrails

- **Orchestrated mode:** if `spectre-clean` supplied a risk plan, do not redo broad risk analysis. Sanity-check only for missing assigned files or obvious P0 underclassification; if found, stop and return the conflict to the primary. Otherwise execute the assigned batch using the supplied tiers and update `working_set.json` with results.
- **Triage every changed file into a risk tier (inline):**
  - **P0 Critical** (thorough) — path contains `auth`/`payment`/`security`/`crypto`/`session`/`token`; handles user-data mutations, financial transactions, PII, permissions; external-facing API handlers; DB migrations; `@critical` annotation. Requires 100% **behavioral** coverage (every user-facing outcome), all error paths with specific assertions, security-input edge cases (null/empty/malformed/overflow), public-API contract/schema tests, mutation-resistant assertions.
  - **P1 Core** (key behaviors) — feature components, internal API handlers, state management (stores/reducers/contexts), core business logic, data fetch/cache. Cover happy path of public functions + user-visible error paths + contract tests at exported boundaries. Skip internal helpers and exhaustive branches.
  - **P2 Supporting** (public surface only) — utils, helpers, formatters, validators, transformers, composed hooks, adapters/wrappers. Test exported functions' happy path only if they carry real logic; skip private and trivial functions.
  - **P3 Skip** (NO tests) — `.d.ts` types, configs (JSON/YAML), styles, docs, logic-free constants/enums, re-export barrels, pass-through wrappers, build/tooling config. Types + lint suffice; mark **SKIP — {reason}**.
- **Write or consume the test plan** (3–7 bullets, `- [P{tier}] {file}: {behavior}`): P0 → multiple bullets (behaviors + error paths); P1 → 1–2; P2 → 1; P3 → SKIP line. Update `working_set.json` with tier categorization/results.
- **Dispatch `@tester` subagents in parallel** (single message, multiple Task calls; 3–5 for medium scope, up to 8 for large). Partition the plan into independent batches: P0 = 1 agent/file (focus); P1 = 2–3 files/agent; P2 = 3–5 files/agent. Each agent gets its batch items, paths, tier context, and the instruction: **write behavioral tests, assert outcomes not calls, mutation-resistant.** Wait for all before verifying.
- **Test quality bar (all tiers):** one behavior per test; descriptive names (`when_[cond]_then_[outcome]`); assert outcomes not calls (call-count assertions only when verifying side-effect prevention); refactor-resilient; mutation-resistant ("would a real bug fail this?"). Do NOT mock internal implementation details, duplicate type coverage, or test framework behavior. Add contract/schema tests at team/module boundaries (API response + error shape; emitted-event schema).
- **Verify before commit:** run lint (autofix, then manual) → run full test suite (failures → fix via `@tester` or direct edit) → spot-check 1–2 tests for behavioral quality (rework via `@tester` if weak).
- **Commit guard:** `--no-verify`, `eslint-disable`, and committing code carrying `eslint-disable` are **expressly forbidden without the user's explicit permission.**

## Outputs + DONE

- Risk-appropriate behavioral tests added; lint clean; full suite green.
- `{OUT_DIR}/working_set.json` (scope + risk-tier categorization).
- Commits: planning/working artifacts first (`docs(test): add test planning artifacts for {branch}`), then code grouped into logical conventional commits (`type(scope): description`; tests bundled with feature or separate, your judgment).
- **DONE when:** every changed file has a P0–P3 tier from this skill or the orchestrator; plan written/consumed with P3 explicitly SKIP'd; `@tester` agents dispatched in parallel when running standalone or assigned batches completed when running as a test lead; P0 thorough / P1 key-path / P2 public-surface / P3 no tests; lint + all tests pass; quality spot-checked; changes committed conventionally; no `--no-verify`/`eslint-disable` introduced.

## Handoff

Report inline: files triaged by tier, tests added per tier, lint/test status, commit list. Then suggest the next command (no wait):

- `spectre-rebase` — tidy history before merge.

## Escalate-If

- A provided `commit_id` is invalid or scope is ambiguous → stop and ask before triaging.
- Tests can't be made to pass, or a fix would require touching out-of-scope code → surface it; don't force green.
- A commit would need `--no-verify` or `eslint-disable` → stop and ask the user; never bypass silently.

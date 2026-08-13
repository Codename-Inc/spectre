---
name: "spectre-test"
description: "Triage a working set into risk tiers (P0–P3) and add risk-appropriate behavioral tests — thorough coverage where bugs hurt users (auth/payment/security/PII), light or none on low-risk code — fixing lint and committing per passing batch. Trigger after a feature is built or when asked to add/strengthen tests for recent changes; when invoked by spectre-clean, consume the primary's risk plan and execute the assigned test batch. Do NOT trigger for brute-force 100%-line-coverage demands, dead-code cleanup (spectre-prune), bug fixes (spectre-fix), final commit hygiene (spectre-sweep), or scoping/planning."
user-invocable: true
---

# test

Add risk-weighted test coverage to a working set and commit per passing batch — **clear on WHAT, silent on HOW.** Test behaviors at boundaries, not implementation; concentrate effort where breakage hurts users; skip code that can't break. Risk assessment is inline reasoning, not a separate phase. Lightweight flow — no intermediate report files.

## Inputs

- `$ARGUMENTS` — optional explicit feature name/root or descendant artifact, scope hint, or specific files to focus on, plus `--orchestrated` when a parent workflow owns the next step.
- Optional orchestrator-provided risk plan from `spectre-clean`: files already tiered P0-P3 plus batch assignment. When present, use it as the plan for this batch.

## Working Set (late-bound — read at run-time, never inline)

- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `Skill(spectre-feature-root)` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Repair stale feature/root metadata in artifacts this workflow touches.
- **Full Working Set = UNION** of: committed changes (validate any provided `commit_id`; invalid → STOP and ask), staged (`git diff --cached --name-only`), unstaged (`git diff --name-only`), untracked (`git ls-files --others --exclude-standard`). Record to `{FEATURE_ROOT}/working_set.json`.
- Baseline-lint all files in the set; map import/dependency edges. All paths absolute from repo root.

## Method / guardrails

- **Orchestrated mode:** if `spectre-clean` supplied a risk plan, do not redo broad risk analysis. Sanity-check only for missing assigned files or obvious P0 underclassification; correct the tier/assignment with the primary and continue. Then execute the assigned batch using the supplied tiers and update `working_set.json` with results.
- **Triage every changed file into a risk tier (inline):**
  - **P0 Critical** (thorough) — path contains `auth`/`payment`/`security`/`crypto`/`session`/`token`; handles user-data mutations, financial transactions, PII, permissions; external-facing API handlers; DB migrations; `@critical` annotation. Requires 100% **behavioral** coverage (every user-facing outcome), all error paths with specific assertions, security-input edge cases (null/empty/malformed/overflow), public-API contract/schema tests, mutation-resistant assertions.
  - **P1 Core** (key behaviors) — feature components, internal API handlers, state management (stores/reducers/contexts), core business logic, data fetch/cache. Cover happy path of public functions + user-visible error paths + contract tests at exported boundaries. Skip internal helpers and exhaustive branches.
  - **P2 Supporting** (public surface only) — utils, helpers, formatters, validators, transformers, composed hooks, adapters/wrappers. Test exported functions' happy path only if they carry real logic; skip private and trivial functions.
  - **P3 Skip** (NO tests) — `.d.ts` types, configs (JSON/YAML), styles, docs, logic-free constants/enums, re-export barrels, pass-through wrappers, build/tooling config. Types + lint suffice; mark **SKIP — {reason}**.
- **Write or consume the test plan** (3–7 bullets, `- [P{tier}] {file}: {behavior}`): P0 → multiple bullets (behaviors + error paths); P1 → 1–2; P2 → 1; P3 → SKIP line. Update `working_set.json` with tier categorization/results.
- **Dispatch `@spectre_tester` subagents in parallel** (single message, multiple Task calls; 3–5 for medium scope, up to 8 for large). Partition the plan into independent batches: P0 = 1 agent/file (focus); P1 = 2–3 files/agent; P2 = 3–5 files/agent. Each agent gets its batch items, paths, tier context, and the instruction: **write behavioral tests, assert outcomes not calls, mutation-resistant.** Wait for all before verifying.
- **Test quality bar (all tiers):** one behavior per test; descriptive names (`when_[cond]_then_[outcome]`); assert outcomes not calls (call-count assertions only when verifying side-effect prevention); refactor-resilient; mutation-resistant ("would a real bug fail this?"). Do NOT mock internal implementation details, duplicate type coverage, or test framework behavior. Add contract/schema tests at team/module boundaries (API response + error shape; emitted-event schema).
- **Verify before commit:** run affected lint, new/changed plus related tests across demonstrated dependencies, then spot-check quality. Branch-caused → repair/reverify; unrelated → route/continue; indeterminate → reproduce only the failing check at base. Never run a repository-wide baseline or full suite from this skill.
- **Commit guard:** `--no-verify`, `eslint-disable`, and committing code carrying `eslint-disable` are **expressly forbidden without the user's explicit permission.**

## Outputs + DONE

- Risk-appropriate tests added; affected lint/related tests have no branch-caused failure; other findings are routed.
- `{FEATURE_ROOT}/working_set.json` with `feature` and `feature_root` in its owning metadata object, followed by scope + risk-tier categorization. The equivalent Markdown metadata contract is `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`.
- Commits: planning/working artifacts first (`docs(test): add test planning artifacts for {feature-name}`), then code grouped into logical conventional commits (`type(scope): description`; tests bundled with feature or separate, your judgment).
- **DONE when:** every changed file is P0–P3; the plan records P3 skips; tester batches finish; tier coverage holds; affected lint/related tests have no attributable failure; other findings are routed without stopping; quality is spot-checked; changes are committed without bypass/suppression.

## Handoff

Report inline: files triaged by tier, tests added per tier, lint/test status, commit list.

- `--orchestrated` or an orchestrator-provided risk plan → return results to the caller without user-facing Next Steps.
- Standalone → choose from live state: completed user-observable work not yet acceptance-proven → `spectre-prove`; remaining uncommitted hygiene → `spectre-sweep`; clean, proven-or-explicitly-deferred work → `spectre-rebase`.

Render one primary recommendation with its observed reason; never jump directly to rebase merely because tests passed.

## Escalate-If

- A provided `commit_id` is invalid or scope is ambiguous → stop and ask before triaging.
- Related-file repair growth is not a scope change; expand and continue.
- No safe executable repair/routing action exists without changing product requirements or using unavailable user authority → return `NEEDS_AUTHORITY` with the exact impasse.
- A commit would need `--no-verify` or `eslint-disable` → stop and ask the user; never bypass silently.

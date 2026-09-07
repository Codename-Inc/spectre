---
name: "spectre-test"
description: "Triage a working set into risk tiers (P0–P3) and add risk-appropriate behavioral tests. Trigger after a feature is built or when asked to add/strengthen tests; when orchestrated by spectre-clean/ship, consume the parent risk plan and assigned test/fixture batch. Do NOT trigger for brute-force coverage, cleanup (spectre-prune), bug fixes (spectre-fix), final commit hygiene (spectre-sweep), or scoping/planning."
user-invocable: true
---

# test

Add risk-weighted behavioral tests and commit standalone batches. Test boundaries, prioritize where breakage hurts, skip code that cannot break; risk assessment is inline and no intermediate report files exist.

## Inputs

- `$ARGUMENTS` — optional explicit feature name/root or descendant artifact, scope hint, or specific files to focus on, plus `--orchestrated` when a parent workflow owns the next step.
- Optional orchestrator-provided risk plan from `spectre-clean` or `spectre-ship`: files already tiered P0-P3 plus batch assignment. When present, use it as the plan for this batch.

## Working Set (late-bound — read at run-time, never inline)

- Reuse a managed `FEATURE_ROOT` only when explicit/current-thread evidence ties it to this work (physical directory wins; never branch/recency/lifecycle/scans); distinct work ignores ambient roots. Otherwise, including on collision, standalone MUST first load and follow `@skill-spectre:spectre-feature-root` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Repair stale feature/root metadata in artifacts this workflow touches.
- **Full Working Set = UNION** of: committed changes (validate any provided `commit_id`; invalid → STOP and ask), staged (`git diff --cached --name-only`), unstaged (`git diff --name-only`), untracked (`git ls-files --others --exclude-standard`). Keep the projection local/in-thread; write no working-set artifact.
- Standalone: baseline-lint the set and map import/dependency edges. All paths absolute from repo root.

## Method / guardrails

- **Orchestrated Ship/Clean mode:** consume the supplied unchanged set/risk plan; do not redo broad analysis. Edit tests/fixtures only—never production/source; do not stage or commit. The test lead may batch testers internally, runs only new/changed focused tests, and returns compact changed-path/check results plus cross-boundary needs to the parent.
- **Triage every changed file into a risk tier (inline):**
  - **P0 Critical** — `auth`/`payment`/`security`/`crypto`/`session`/`token`, PII/permissions/user-data mutation, external handlers, DB migrations, or `@critical`. Cover every user-facing outcome/error path, null/empty/malformed/overflow security inputs, public API/schema, and mutation-resistant assertions.
  - **P1 Core** — feature components, API/state/business logic, fetch/cache. Cover public happy/error paths and exported-boundary contracts; skip internal helpers/exhaustive branches.
  - **P2 Supporting** — real-logic utils/validators/transformers/hooks/adapters. Cover exported happy paths; skip private/trivial functions.
  - **P3 Skip** — types, config, styles/docs, logic-free constants/enums/barrels/pass-throughs, generated/build tooling. Types + lint suffice; mark **SKIP — {reason}**.
- **Write or consume the in-thread test plan** (3–7 bullets, `- [P{tier}] {file}: {behavior}`): P0 → multiple bullets (behaviors + error paths); P1 → 1–2; P2 → 1; P3 → SKIP line.
- **Dispatch `@spectre:tester` in parallel:** one message/multiple tasks; P0 = one agent/file, P1 = 2–3 files/agent, P2 = 3–5, up to 8 agents. Give batch paths/tier and require behavioral, outcome-not-call, mutation-resistant tests; wait before verifying.
- **Quality:** one behavior/test; descriptive `when_[cond]_then_[outcome]` names; outcome assertions (calls only for prevented side effects), refactor/mutation resilience. Do not mock internals, duplicate type/framework coverage; test API/event schemas at boundaries.
- **Verify before commit:** standalone runs affected lint plus new/changed and related tests across demonstrated dependencies, then spot-checks quality. Branch-caused → repair/reverify; unrelated → route/continue; indeterminate → reproduce only the failing check at base. Never run a repository-wide baseline or full suite from this skill.
- **Commit guard:** `--no-verify`, `eslint-disable`, and committing code carrying `eslint-disable` are **expressly forbidden without the user's explicit permission.**

## Outputs + DONE

- Risk-appropriate tests added; focused tests have no branch-caused failure; other findings are routed.
- No working-set, evidence, or test-plan artifact. Standalone commits contain reusable tests/fixtures and required product changes only, grouped logically (`type(scope): description`; tests bundled with feature or separate, your judgment).
- **DONE when:** every changed file is P0–P3; the plan records P3 skips; tester batches finish; tier coverage holds; focused tests have no attributable failure; other findings are routed without stopping; quality is spot-checked; and standalone changes are committed without bypass/suppression.

## Handoff

Report tiers/tests/lint/commits; `--orchestrated` or supplied risk plan: no step.

| Handoff | Details |
|---|---|
| 🧭 **Current phase** | Done |
| 📦 **What was just done** | Result |
| ▶️ **Proposed next step** | Render resolved action; no placeholders. |

Standalone: unproven work → Prove; uncommitted hygiene → Sweep; clean proven/deferred → Rebase; passing tests alone never jumps to Rebase.

## Escalate-If

- A provided `commit_id` is invalid or scope is ambiguous → stop and ask before triaging.
- Related-file repair growth is not a scope change; expand and continue.
- No safe executable repair/routing action exists without changing product requirements or using unavailable user authority → return `NEEDS_AUTHORITY` with the exact impasse.
- A commit would need `--no-verify` or `eslint-disable` → stop and ask the user; never bypass silently.

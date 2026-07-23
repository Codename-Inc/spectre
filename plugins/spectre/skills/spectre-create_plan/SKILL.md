---
name: "spectre-create_plan"
description: "Turn a PRD/scope into a technical implementation plan (`plan.md`) — codebase research, clarifications, then a verification-spine plan ready for task breakdown. Use when planning HOW to build an already-scoped feature, or when `plan` routes here with a depth tier. Do NOT trigger to define WHAT/why (that's `scope`), to break a plan into tasks (`create_tasks`), or for design/UX flows (`ux`)."
user-invocable: true
---

# create_plan

Transform a scoped PRD into a technical implementation plan. Role: senior staff engineer biasing to YAGNI · SOLID · KISS · DRY — clear on the plan, no gold-plating.

## Inputs
- `$ARGUMENTS` — explicit feature name/root or descendant scope/PRD artifact + optional flags: `--depth {light|standard|comprehensive}` (default `standard`), `--no-review` (orchestrated by `plan`).
- `{FEATURE_ROOT}/task_context.md` — reuse an existing `## Technical Research` section if comprehensive; skip new research. Under `--depth light`, also reuse substantive router research (file locations, code understanding, patterns, impact) if already present.

## Working Set
- Resolve `FEATURE_ROOT` in this exact order: (1) an explicit feature directory or feature name; (2) a supplied artifact beneath the feature root; (3) one unambiguous feature artifact already present in the current thread. A name maps to `.spectre/features/<feature-name>/`. If resolution is absent or ambiguous, ask for the feature name/path.
- Never use branch name, modification time, lifecycle completeness, or directory scanning to infer a feature. Arbitrary output roots are invalid for new canonical artifacts.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- `OUT_DIR = FEATURE_ROOT`. Pass the exact feature root unchanged to every routed child; a child never rederives it.
- An explicit legacy `docs/tasks/**` artifact remains a readable input, but do not move or bulk-rewrite it. Require a confirmed `.spectre/features/<feature-name>/` root for the new plan and record the legacy source in its manifest.
- Research agents: `@finder` (where code lives), `@analyst` (how it works + data access), `@patterns` (canonical "follow this file" anchors). Run in parallel, await all, then read the real code at each step — don't trust filenames or summaries.
- `CLAUDE.md` / `README.md` for rules + major components.

## Outputs + DONE
Write the plan to `{FEATURE_ROOT}/specs/plan.md` (scoped name if one exists). Every `plan.md` begins immediately below its title with:

```text
Feature: <feature-name>
Feature Root: .spectre/features/<feature-name>
```

Derive both values from the physical feature directory. The plan is DONE when it is self-locating, carries the **verification spine**, and every required section is present (header + `*N/A — reason*` if genuinely inapplicable; empty or absent headers are not acceptable).

**Required at every depth (the spine):**
1. **Overview** — problem, solution shape, why this approach.
2. **Technical Approach** — components touched, data flow, key decisions + rationale; cite `@patterns` anchors by `file:line`.
3. **Critical Files** — 1–7 real files from Step-1 research, each tagged *Core logic to modify / Pattern to follow / Interface to implement / Test to extend*. No guesses.
4. **External Dependencies — Verify Before Implementation** — every third-party package with exact version + one-line existence check (`pkg@1.2.3 — verify: npm view pkg@1.2.3`). State "no new packages" explicitly if so. (Slopsquatting fence: ~20% of AI-suggested packages don't exist.)
5. **Verification — How We Know This Works** — per major change, 1–3 falsifiable signals (`<change> → verifies by: <test | observable | state/file condition>`). These become acceptance criteria downstream. "It works" is not acceptable.
6. **Out-of-Bounds — DO NOT add** — 4–8 concrete things to NOT add (rate limiting, retry/backoff, caching, soft-delete, telemetry, feature flags, admin UI…). Specific to this feature. YAGNI fence against familiar-shape bias.
7. **Risks & Filled Assumptions** — *Risks*: what could break + one-line mitigation or "accept and monitor". *Filled Assumptions*: defaults taken because the spec was silent (reviewer-visible by design).

**`--depth comprehensive` adds:** 8. Current State (today's path, `file:line`) · 9. Implementation Phases (each with its own "succeeds when…", sequenced by dependency — migrations before consumers) · 10. Component/Data Architecture (schema deltas) · 11. API Design (signatures, request/response, error contracts — if any API surface changes) · 12. Migration Plan (up/down sketch, backfill, rollback — if any data-layer change) · 13. Testing Strategy (unit/integration/e2e coverage, where tests live, what's deferred).

**`--depth light`:** concise, not shallow — keep all seven spine sections, ~1 short paragraph or 3–5 bullets each. One clear path following existing patterns; no alternatives enumeration. No standalone clarification/review gates, no `plan_review`, no expanded architecture.

## Method / guardrails
- **Research first** (unless reused): `@finder`/`@analyst`/`@patterns` in parallel → trace entry points and data flow end-to-end → cross-reference `CLAUDE.md`/`README.md` → validate discoveries against real code. If research was newly done, update `task_context.md` `## Technical Research`.
- **Clarifications:** generate up to 10 technical questions, only for ambiguity not answered by the PRD or discoverable in code; present approach choices with Pros/Cons/Trade-offs. Prefer `AskUserQuestion` (batches ≤4, most critical first); fall back to intelligent defaults if unavailable. Return clarification findings in-thread — do not write clarification files.
- **`--depth light`:** do NOT stop for clarifications — use conservative, codebase-consistent defaults and record them under **Filled Assumptions**.
- Use judgment on section length, not on inclusion.

## Handoff
- **`--no-review` (orchestrated by `plan`):** save the plan, return control to `plan` — do NOT wait for user review, do NOT render the Next-Steps footer. Message: "Draft implementation plan saved to `{path}`. Returning to `plan`."
- **Standalone:** "Implementation plan saved to `{path}`. Review and reply with feedback or 'Approved' to proceed." Wait for user. On completion, render the inline Next-Steps line (suggest `/spectre:create_tasks`).

## Escalate-If
- **`--depth light` and** the plan needs >3 critical files, a new abstraction, data migration, public-API change, or an unresolved scope / security-privacy / data-correctness / public-API-behavior decision → STOP, return a **tier-reassessment recommendation to `plan`** instead of guessing.

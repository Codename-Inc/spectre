---
name: "spectre-create_plan"
description: "Turn a PRD/scope into a technical implementation plan (`plan.md`) — codebase research, clarifications, then a verification-spine plan ready for task breakdown. Use when planning HOW to build an already-scoped feature, or when `plan` routes here with a depth tier. Do NOT trigger to define WHAT/why (that's `scope`), to break a plan into tasks (`create_tasks`), or for design/UX flows (`ux`)."
user-invocable: true
---

# create_plan

Transform a scoped PRD into a technical implementation plan. The invoking primary owns synthesis and directly writes `plan.md`; research agents return evidence only. Role: senior staff engineer biasing to YAGNI · SOLID · KISS · DRY — clear on the plan, no gold-plating.

## Inputs
- `$ARGUMENTS` — explicit feature name/root or descendant scope/PRD artifact + optional flags: `--depth {xs|light|standard|comprehensive}` (default `standard`), `--no-review` (orchestrated by `plan`), `--execution {direct|structured}` (default `structured`; `plan` passes `direct` for XS/LIGHT/STANDARD-DIRECT routes that execute plan-direct without task artifacts).
- `{FEATURE_ROOT}/task_context.md` — at every depth, reuse an existing substantive `## Technical Research` section and skip new research. In orchestrated calls from `spectre-plan`, router research **MUST** be reused rather than re-dispatched.

## Working Set
- Resolve one managed `FEATURE_ROOT` for this work from explicit/current-thread evidence only (physical directory wins; never branch/recency/lifecycle/scans). If none is confirmed, including when the candidate path is occupied, standalone MUST first load and follow `Skill(spectre-feature-root)` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.
- Repair stale feature/root metadata in artifacts this workflow touches.
- `OUT_DIR = FEATURE_ROOT`. Pass the exact feature root unchanged into the loaded skill context and every research prompt; never rederive it.
- Research agents: `@spectre_finder` (where code lives), `@spectre_analyst` (how it works + data access), `@spectre_patterns` (canonical "follow this file" anchors). Research agents return evidence only; they never write or revise planning artifacts. Run in parallel, await all, then the primary reads the real code at each step — don't trust filenames or summaries.
- `CLAUDE.md` / `README.md` for rules + major components.

## Outputs + DONE
The primary directly writes `plan.md` to `{FEATURE_ROOT}/specs/plan.md` (scoped name if one exists); never delegate plan authoring or revision. Every `plan.md` begins immediately below its title with:

```text
Feature: <feature-name>
Feature Root: .spectre/features/<feature-name>
```

Derive both values from the physical feature directory. With `--execution direct` or `--depth xs`, add `Execution Mode: direct` as the third header line; downstream skills route on it (execute runs the plan plan-direct; `create_tasks` refuses it without explicit override). The plan is DONE when it is self-locating, carries the **verification spine**, includes `## Routing Observations`, and every required section is present (header + `*N/A — reason*` if genuinely inapplicable; empty or absent headers are not acceptable).

**Required at every depth (the spine):**
1. **Overview** — problem, solution shape, why this approach.
2. **Technical Approach** — components touched, data flow, key decisions + rationale; cite `@spectre_patterns` anchors by `file:line`.
3. **Critical Files** — 1–7 real files from Step-1 research, each tagged *Core logic to modify / Pattern to follow / Interface to implement / Test to extend*. No guesses.
4. **External Dependencies — Verify Before Implementation** — every third-party package with exact version + one-line existence check (`pkg@1.2.3 — verify: npm view pkg@1.2.3`). State "no new packages" explicitly if so. (Slopsquatting fence: ~20% of AI-suggested packages don't exist.)
5. **Verification — How We Know This Works** — per major change, 1–3 falsifiable signals (`<change> → verifies by: <test | observable | state/file condition>`). These become acceptance criteria downstream. "It works" is not acceptable. With `--execution direct`, every signal must be directly executable — a runnable command or a concrete observable/state condition — because no task-level acceptance criteria are generated downstream and this spine is the sole acceptance authority.
6. **Out-of-Bounds — DO NOT add** — 4–8 concrete things to NOT add (rate limiting, retry/backoff, caching, soft-delete, telemetry, feature flags, admin UI…). Specific to this feature. YAGNI fence against familiar-shape bias.
7. **Risks & Filled Assumptions** — *Risks*: what could break + one-line mitigation or "accept and monitor". *Filled Assumptions*: defaults taken because the spec was silent (reviewer-visible by design).

**`--depth comprehensive` adds:** 8. Current State (today's path, `file:line`) · 9. Implementation Phases (each with its own "succeeds when…", sequenced by dependency — migrations before consumers) · 10. Component/Data Architecture (schema deltas) · 11. API Design (signatures, request/response, error contracts — if any API surface changes) · 12. Migration Plan (up/down sketch, backfill, rollback — if any data-layer change) · 13. Testing Strategy (unit/integration/e2e coverage, where tests live, what's deferred).

**`--depth xs`:** direct, compact, and still complete — write `Execution Mode: direct`; keep the seven spine sections; describe one coherent change; cite known verification as a runnable command or concrete observable/state condition; preserve explicit Out-of-Bounds. No alternatives enumeration, standalone clarification gate, `plan_review`, expanded architecture, or task graph.

**`--depth light`:** concise, not shallow — keep all seven spine sections, ~1 short paragraph or 3–5 bullets each. One clear path following existing patterns; no alternatives enumeration. No standalone clarification/review gates, no `plan_review`, no expanded architecture.

**Routing Observations:** every plan includes `## Routing Observations` after the spine/comprehensive addenda. Record observations only; do not derive XS/S/M/L/XL, choose a route, escalate depth, or override the invoking depth. Include workstream count, independent workstreams, dependency sequencing, shared-contract consumers, staged rollout/migration, new abstraction, unresolved material decision, and observed uncertainty. These observations are consumed only by `spectre-plan-route`.

## Method / guardrails
- **Research first** (unless reused): an existing substantive `## Technical Research` section counts as reused at every depth; an orchestrated `spectre-plan` call never launches replacement research agents. Otherwise run `@spectre_finder`/`@spectre_analyst`/`@spectre_patterns` in parallel → trace entry points and data flow end-to-end → cross-reference `CLAUDE.md`/`README.md` → validate discoveries against real code. If research was newly done, update `task_context.md` `## Technical Research`.
- **Clarifications:** generate up to 10 technical questions, only for ambiguity not answered by the PRD or discoverable in code; present approach choices with Pros/Cons/Trade-offs. Prefer `AskUserQuestion` (batches ≤4, most critical first); fall back to intelligent defaults if unavailable. Return clarification findings in-thread — do not write clarification files.
- **`--depth xs` / `--depth light`:** do NOT stop for clarifications — use conservative, codebase-consistent defaults and record them under **Filled Assumptions**.
- Use judgment on section length, not on inclusion.

## Handoff
- **`--no-review` / `--orchestrated`:** save the plan, return its path, depth, filled assumptions, and unresolved findings to the caller. Do not wait for user review and do not render user-facing Next Steps.
- **Standalone:** "Implementation plan saved to `{path}`. Review and reply with feedback or 'Approved' to proceed." Wait for user.
  1. If approval exposes unresolved user-facing flows/states/copy/accessibility → `spectre-ux`; if behavior is settled but visual validation materially matters → `spectre-prototype`. Planning resumes after the product artifact is reconciled.
  2. Approved `Execution Mode: direct` plan → `spectre-execute` (plan-direct; no task artifacts).
  3. Approved LIGHT structured plan (or XS structured override) → `spectre-create_tasks`.
  4. Approved STANDARD/COMPREHENSIVE plan → `spectre-plan_review`.

Render exactly one primary recommendation tied to the observed plan/depth, at most one conditional alternative, and `Pause: spectre-handoff {feature}` when stopping at the approved standalone-plan boundary.

## Escalate-If
- Scope is impossible to plan from the confirmed artifacts, or a required artifact write would escape `FEATURE_ROOT` → stop and return the concrete blocker to the caller.

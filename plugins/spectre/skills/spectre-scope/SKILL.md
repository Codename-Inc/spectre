---
name: "spectre-scope"
description: "Interactively scope a feature or improvement into explicit IN / OUT / ANTI-SCOPE boundaries before any planning or code — grounds a hypothesis in repo reality, asks blocking + optional questions, and writes a scope.md. Trigger at the start of a new feature, when a request is fuzzy/unbounded, or to re-scope when boundaries shift. Do NOT trigger for technical/architecture design or research (that's spectre-plan), or for diagnosing a specific bug (spectre-fix)."
user-invocable: true
---

# scope

Turn an unstructured request into clear scope boundaries (IN / OUT / ANTI-SCOPE), user value, load-bearing assumptions, and decisions — **clear on WHAT, silent on HOW.** Boundaries and user value first; defer all technical/implementation questions to `/spectre:plan`.

## Inputs

- `$ARGUMENTS` — the feature/problem brain-dump. If empty → greet, ask for context, and **WAIT** for the user.
- Optional explicit managed feature name/root or an artifact beneath one.
- `FROM_KICKOFF=true` + `KICKOFF_DOC` → read the doc, extract (Core Problem, User Value, Decisions Made, Remaining Ambiguities, Key Code Refs), then **skip grounding + exploration** and go straight to clarifications. Already-grounded.
- Prior `{FEATURE_ROOT}/concepts/scope.md` → treat as a **re-scope**: read it fully, surface what's already settled, ask only about what's new or changed. scope.md is the **immutable anchor** for downstream phases — never silently narrow or expand it; surface the delta and get user confirmation before rewriting.

## Working Set (late-bound — read at run-time, never inline)

- `FEATURE_ROOT = .spectre/features/<feature-name>/`, resolved from the input or proposed below.
- captured session or current thread memory for this area, if present

## Feature root contract

- Resolve an explicit feature directory or feature name first, then a supplied artifact beneath the feature root, then one unambiguous feature artifact from the current thread. If unresolved or ambiguous, use the proposal flow below; never use branch name, modification time, lifecycle completeness, or directory scanning to infer a feature.
- For new work, propose a lowercase kebab-case feature name and `.spectre/features/<feature-name>/` alongside the existing boundary response. Silence on the name accepts it; never create a separate name-confirmation gate.
- When the user explicitly names an existing managed feature, continue or re-scope it under its existing overwrite safeguards. The physical directory is authoritative.
- Before the first write, inspect the proposed root. An unintended occupied directory must stop the workflow; never auto-suffix, reinterpret, or overwrite it. An explicitly selected directory without a valid `feature.json` is unmanaged and must also stop.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing only `{"schema_version":1,"created_at":"<ISO8601>"}`. Do not store a name, branch, status, active pointer, or absolute path.
- Create `.spectre/.gitignore` only when it is absent and the parent repository does not already ignore `.spectre/`; give it ignore patterns for `manifest.json`, `bin/`, and `handoffs/`, while retaining `!features/`. Never silently rewrite an arbitrary user root `.gitignore`. A blanket parent `.spectre/` ignore requires a warning that the selected feature records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid.

## Method / guardrails

- **Reply before tools.** Acknowledge first; never go silent to "think." No tool calls in the opening reply except reading `KICKOFF_DOC` when `FROM_KICKOFF=true`.
- **WHAT, not HOW.** Ask only about boundaries, user value, and anti-scope. Defer architecture/trade-offs/integration to `/spectre:plan`. Exception: scope that is inherently technical (e.g. "migrate DB X→Y").
- **Ground once.** Run exactly **one** fast lookup to anchor the hypothesis in repo reality — a single `@spectre:finder` query, or one `grep`/`glob`. One call only; skip it if slow. Needing more than one signal means this is bigger than a scope — gather context more fully before continuing rather than forcing it here.
- **Hypothesis + questions.** Lead with a grounded hypothesis (problem, who it affects, proposed IN / OUT / ANTI-SCOPE) and 5–8 questions tagged **(blocking)** / *(optional)*, drawn from: user & problem · UX feel · boundaries (IN/OUT) · anti-scope · alternatives · edge cases · success. Lean blocking for boundaries and anti-scope.
- **Iterate** boundaries on each reply (IN / OUT / ANTI-SCOPE / Unsure) until the user confirms they're accurate.
- **Clarify** remaining ambiguities with `AskUserQuestion` (≤4 at a time, batch the rest most-important-first; present trade-offs with concise pros/cons). No clarification files.

## Outputs + DONE

Write `{FEATURE_ROOT}/concepts/scope.md` (scoped filename if one already exists), user value & boundaries before technical detail, with **all** of:

 1. **The Problem** — pain, impact, current state
 2. **Target Users** — primary, secondary, needs
 3. **Success Criteria** — measurable assertions over prose
 4. **User Experience** — journeys, principles, trade-offs
 5. **Scope Boundaries** — **IN / OUT / ANTI-SCOPE / Maybe / Future**
 6. **Load-Bearing Assumptions** — each with a short *"if this is false, …"* consequence
 7. **Constraints** — platform/perf/a11y/scale (user-provided only)
 8. **Decisions** — choices + rationale
 9. **Risks** — UX, scope creep, open questions
10. **Next Steps** — recommended command + complexity S/M/L

**ANTI-SCOPE ≠ OUT.** OUT = not building it (yet/this release). ANTI-SCOPE = a problem we are *intentionally not solving* — the philosophical edge of what the feature is for. Both are required.

**DONE when:** scope.md exists with all 10 sections; IN / OUT / ANTI-SCOPE are explicit; every load-bearing assumption carries its "if false" consequence; the user has confirmed the boundaries.

## Handoff

Present final boundaries (IN / OUT / ANTI-SCOPE / Maybe + top 1–3 load-bearing assumptions) inline with the doc path, then suggest the next command — **do not wait for approval.** The user may reply with edits (apply them and re-present) or jump straight to a next step:

- `/spectre:plan` — design + research the approach (recommended for M/L with real architecture)
- `/spectre:create_tasks` — straight to tasks for simple, well-understood S work

## Escalate-If

- Grounding needs more than one lookup, or the request spans several unknowns → this exceeds a scope; gather context more fully before proceeding.
- The user pushes for implementation/architecture answers → note them and defer to `/spectre:plan`; keep this pass on WHAT.
- Boundaries won't converge after iterating → surface the specific unresolved tension and ask the user to decide before writing the doc.
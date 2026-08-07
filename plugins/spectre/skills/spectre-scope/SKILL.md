---
name: "spectre-scope"
description: "Scope a feature or improvement into explicit IN / OUT / ANTI-SCOPE boundaries before planning or code — grounds a hypothesis in repo reality, resolves blocking questions, and writes scope.md. Trigger for new or fuzzy work or re-scoping. Do NOT trigger for technical design/research (spectre-plan) or standalone bug diagnosis (spectre-fix)."
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

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature.
- When the user explicitly names an existing managed feature, continue or re-scope it under its existing overwrite safeguards. The physical directory is authoritative.
- For an inferred name, use the first free `.spectre/features/<name>[-N]/`; never overwrite or auto-continue a collision. An explicitly selected unmanaged directory remains a safety blocker.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`.
- Keep the marker lifecycle-neutral: never add branch, status, active-pointer, alias, or absolute-path state.
- Before writing the first artifact, initialize local-state tenancy. Create `.spectre/.gitignore` only when it is absent and the parent repository does not already ignore `.spectre/`; give it ignore patterns for `manifest.json`, `bin/`, and `handoffs/`, while retaining `!features/`. Never silently rewrite an arbitrary user root `.gitignore`. A blanket parent `.spectre/` ignore requires a warning that the selected feature records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid.

## Method / guardrails

- **Reply before tools.** Acknowledge first; never go silent to "think." No tool calls in the opening reply except reading `KICKOFF_DOC` when `FROM_KICKOFF=true`.
- **WHAT, not HOW.** Ask only about boundaries, user value, and anti-scope. Defer architecture/trade-offs/integration to `/spectre:plan`. Exception: scope that is inherently technical (e.g. "migrate DB X→Y").
- **Ground once.** Start with exactly **one** fast lookup to anchor the hypothesis in repo reality — a single `@spectre:finder` query, or one `grep`/`glob`; skip it if slow. Needing broader grounding exceeds this fast scope pass.
- Lead with a grounded hypothesis (problem, who it affects, proposed feature name/root, IN / OUT / ANTI-SCOPE) and 5–8 questions tagged **(blocking)** / *(optional)*. Iterate boundaries (IN / OUT / ANTI-SCOPE / Unsure) until confirmed, then clarify remaining ambiguity with `AskUserQuestion` (≤4 at a time). No clarification files.

## Outputs + DONE

Write `{FEATURE_ROOT}/concepts/scope.md` (scoped filename if one already exists), beginning immediately below the title with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`, then user value & boundaries before technical detail, with **all** of:

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

Present final boundaries (IN / OUT / ANTI-SCOPE / Maybe + top 1–3 load-bearing assumptions) inline with the doc path, then choose the **first applicable** route below — do not wait for approval:

1. Boundaries are not actually settled → remain in `/spectre:scope`; do not recommend a forward phase.
2. UI is load-bearing and journeys, segments, states, copy, or accessibility remain unresolved → `/spectre:ux`.
3. UI behavior is understood and uncomplicated, but interaction/layout/visual validation materially matters → `/spectre:prototype`.
4. Small, explicit, well-understood non-UI work following a known pattern → `/spectre:create_tasks`.
5. Otherwise → `/spectre:plan`.

Render exactly one primary line: `Next (recommended): /spectre:{command} — because {observed scope signal}.` Optionally add one `Alternative:` only when an explicit condition would change the route; never present an equal-weight command menu. If the user is stopping at this durable boundary, add `Pause: /spectre:handoff {feature} — save the confirmed scope and selected next step for another session.` The user may still reply with scope edits; apply and re-route from the revised artifact.

## Escalate-If

- Grounding needs more than one lookup, or the request spans several unknowns → this exceeds a fast scope pass; gather context more fully before proceeding.
- The user pushes for implementation/architecture answers → note them and defer to `/spectre:plan`; keep this pass on WHAT.
- Boundaries won't converge after iterating → surface the specific unresolved tension and ask the user to decide before writing the doc.

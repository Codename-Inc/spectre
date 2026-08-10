---
name: "spectre-ux"
description: "Define exactly how a feature behaves — user flows, screens, components, states, copy, and accessibility — producing a definitive ux.md spec for implementation. Two stages: align on user flows, then write the detailed spec. Trigger after scope/PRD when a feature needs a behavioral/UX spec before planning or building UI. Do NOT trigger for pure backend/non-UI work, for setting scope boundaries (spectre-scope), or for technical architecture (spectre-plan)."
user-invocable: true
disable-model-invocation: true
---

# ux

Transform product requirements into a definitive behavioral spec — **clear on WHAT the user sees/does and how the system responds**, silent on visual taste (trust the implementer for pixels). Two stages with a hard gate between them: (1) align on user flows, then (2) write the detailed `ux.md`.

## Inputs

- `$ARGUMENTS` — explicit feature name/root or descendant requirements artifact.
- Requirements doc — first that exists, read FULLY (no offset/limit):
  1. `{OUT_DIR}/concepts/scope.md` (canonical, preferred)
  2. `{OUT_DIR}/specs/prd.md`
  3. `{OUT_DIR}/task_summary.md`
- **If none exist → ask for scope context or recommend `spectre-scope` first; do not invent scope.**

## Working Set (late-bound — read at run-time, never inline)

- Resolve an explicit feature name/root, a descendant artifact, or one unambiguous current-thread artifact. Otherwise derive a concise lowercase kebab-case name from the requested work and proceed. Never ask for a feature name/root; mention the choice in an existing user gate or normal response without waiting.
- Never use branch name, recency, lifecycle state, or directory scanning to select an existing feature. For an inferred name, use the first free `.spectre/features/<name>[-N]/`; an explicitly selected unmanaged directory remains a safety blocker.
- Before the first artifact in a new root, create lifecycle-neutral `feature.json` with `schema_version`, `created_at`, `feature`, and `feature_root`. Create `.spectre/.gitignore` with `manifest.json`, `bin/`, `handoffs/`, `!features/` only when absent and the parent does not ignore `.spectre/`; never edit root `.gitignore`; warn if ignored.
- The physical feature directory is authoritative. If touched workflow artifacts contain stale Feature/Feature Root metadata after a rename, repair their feature name/root metadata before continuing.
- `OUT_DIR = FEATURE_ROOT`. Pass the exact feature root unchanged to every routed child; a child never rederives it.
- An explicit legacy `docs/tasks/**` requirements artifact remains a readable input, but do not move or bulk-rewrite it. Require a confirmed `.spectre/features/<feature-name>/` root for the new UX document and cite the legacy source.
- Existing UI: one `@spectre_patterns` dispatch (Stage 1) for similar screens/components, conventions, design tokens — return ≤~2K in-thread, no files.

## Method / guardrails

**Stage 1 — Flow discovery & alignment (align before specifying).**
- Identify **user segments** — flows diverge across these and missing them is the #1 cause of UX rework: first-time vs returning, anon vs signed-in, free vs paid, role-based.
- Identify journeys: user goals, entry points, completion states.
- Write each flow as a narrative: Goal · Entry point · Steps (**User sees → User does → System responds**) · Decision points + branches · Success state · open Questions. Call out where flows diverge per segment.
- Present flows, propose a specific take (N flows × M segments + key segmentation calls), and ask for pushback. **GATE: write no detailed spec until the user replies "Flows approved." On feedback → revise and re-present.**

**Stage 2 — Detailed spec (only after the flow gate clears).**
- Review approved flows for gaps (component behaviors, edge cases, state defs, segment variants); if significant, ask 3–5 targeted questions via `AskUserQuestion` (empty states, errors, loading, limits, segment differences) — no clarification files.
- Write `{OUT_DIR}/ux.md` with every required section + the domain specifics below.

## Outputs + DONE

Write `{FEATURE_ROOT}/ux.md` with **all 11 sections**. Immediately below the title, `ux.md` records:

```text
Feature: <feature-name>
Feature Root: .spectre/features/<feature-name>
```

Derive both values from the physical feature directory.

1. **Overview** — what it is, problem solved, primary user goal (1 para)
2. **User Segments** — each segment served + what's different about their UX
3. **Screens** — every screen: name, 1-line purpose, navigation relationships
4. **Flows** — formalized from Stage 1 with alternate paths (validation fail, cancel, network error) + per-segment branches
5. **Layouts** — per screen: header/main/footer structure + responsive behavior (**desktop >1024 · tablet 768–1024 · mobile <768**)
6. **Components** — each interactive element: purpose, location, applicable states (from the State Vocabulary)
7. **Interactions** — table: **Element | Action | Result** (exhaustive)
8. **States** — table: **State | Trigger | Appearance | Available Actions**
9. **Content** — exact copy: page titles, buttons, empty states, error messages, confirmation dialogs
10. **Edge Cases** — limits/boundaries, null/long data, permissions, offline/network failures, segment-specific
11. **Accessibility** — tab order, keyboard actions (Enter/Space/Escape), screen-reader announcements, focus management

**State Vocabulary** — pick what's relevant per component (not every component needs every state):
- **Visual** (per interactive element): default, hover, focus, active/pressed, disabled
- **Data** (per data view): empty, loading, partial-loaded, loaded, error, stale/refreshing
- **Form**: pristine, dirty, touched, submitting, submitted-success, submitted-error, per-field validation-error
- **Selection**: none, single, multi, partial-selection, all-selected
- **Sync** (collaborative/async): optimistic, pending, conflict, resolved
- **Network** (where relevant): online, offline, reconnecting

**DONE when:** the Stage-1 flow gate was cleared (user approved flows); `ux.md` exists with all 11 sections; segments addressed; flows carry alternate paths; Interactions and States tables use the exact column formats above; component states are drawn from the State Vocabulary; layouts state the responsive breakpoints; accessibility and edge cases covered.

## Handoff

Confirm completion inline (screens specified, segments addressed, flows documented, components+states, edge cases + a11y covered) with the doc path. Then choose one:

1. Material visual/interaction assumptions remain, stakeholder visual review is needed, or prose alone cannot validate the experience → `spectre-prototype`. Apply surfaced assumptions or contradictions back to `ux.md` before planning.
2. Otherwise → `spectre-plan`, the unified tier/research/review/task router.

Render `Next (recommended): /spectre:{command} — because {observed UX signal}.` Add at most one conditional alternative; direct `spectre-create_tasks` is valid only for explicitly small, settled, known-pattern work, and direct `spectre-tdd` only for a genuinely MICRO task. If stopping, offer `Pause: spectre-handoff {feature}` with the completed UX path and selected next step.

## Escalate-If

- No scope/PRD/summary found → stop; get scope context or route to `spectre-scope` before specifying.
- User pushes for implementation/architecture decisions → note them, defer to `spectre-plan`; keep this pass on behavior.
- Flows won't converge after iterating → surface the specific unresolved divergence (usually a segment conflict) and ask the user to decide before Stage 2.
- Feature has no user-facing surface → this spec adds nothing; route back to `spectre-plan`.

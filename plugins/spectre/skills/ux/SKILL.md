---
name: ux
description: 👻 | Define user flows, components, and UX behavior — generates the UX spec for a feature - primary agent
user-invocable: true
---

# ux

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# ux: Define Exactly How the Feature Works

Transform product requirements into a definitive behavioral specification. Two stages: align on user flows, then generate detailed spec. Output: `ux.md` ready for implementation.

<ARGUMENTS> $ARGUMENTS </ARGUMENTS>

---

# STAGE 1: Flow Discovery & Alignment

**Goal**: Align on HOW the feature works before specifying details.

## Step 1 — Understand the Feature

1. **Read scope and requirements** in this precedence (read whichever exist FULLY, no offset/limit):
   - `docs/tasks/{branch}/concepts/scope.md` — the canonical scope doc (preferred)
   - `docs/tasks/{branch}/specs/prd.md` — if a PRD was generated separately
   - `docs/tasks/{branch}/task_summary.md` — if present
   - **If none exist** → ask the user for scope context (or recommend `/spectre:scope` first) before proceeding.
2. **Research patterns**: Dispatch `@spectre:patterns` to find existing screens/components similar to what we're building. Note conventions, reusable elements, and any design tokens.
3. **Identify user segments**: List the user segments this feature serves — first-time vs returning, anonymous vs signed-in, free vs paid, role-based variants. UX often diverges across segments and missing this is a common cause of rework.
4. **Identify journeys**: List user goals, entry points, and completion states.

## Step 2 — Present User Flows

Write each flow as a narrative walkthrough.

**Per flow include**: Goal, Entry point, Journey steps (User sees → User does → System responds), Decision points with branches, Success state, Questions where ambiguity exists.

**Per user segment**: Call out where flows diverge (e.g., "First-time users see X tour; returning users skip directly to Y").

After writing all flows, propose a specific take rather than asking open-ended:

> **User Flows — Proposed**
>
> I've mapped {N} flows across {M} user segments: {list with one-line summaries}
>
> **Key segmentation calls**: [where flows diverge by user state and why]
>
> Push back on anything wrong, missing, or over-/under-segmented. Reply with feedback or **"Flows approved"** to proceed.

**Wait for approval. If feedback → revise and re-present. If approved → Stage 2.**

---

# STAGE 2: Detailed Specification

**Gate**: Only proceed after explicit flow approval.

## Step 3 — Clarify Remaining Details

Review approved flows for gaps: component behaviors, edge cases, state definitions, segment variants.

If significant gaps, ask 3–5 targeted questions (empty states, error handling, loading, limits, segment differences). Save to `clarifications/ux_clarifications_{timestamp}.md`, prompt user to read, incorporate answers.

## Step 4 — Write the Specification

Generate complete spec with these sections:

### Required Sections

1. **Overview** — What this feature is, problem it solves, primary user goal (1 paragraph)
2. **User Segments** — Each segment served, what's different about their UX (e.g., first-time onboarding, role-based permissions, free vs paid limits, anon vs signed-in)
3. **Screens** — Every screen: name, purpose (1 line), navigation relationships
4. **Flows** — Formalized from Stage 1 with alternate paths (validation fail, cancel, network error). Include per-segment branches where they diverge.
5. **Layouts** — Per screen: header/main/footer structure + responsive behavior (desktop >1024, tablet 768–1024, mobile <768)
6. **Components** — Each interactive element: purpose, location, applicable states (see State Vocabulary below)
7. **Interactions** — Table format: Element | Action | Result (exhaustive)
8. **States** — Table format: State | Trigger | Appearance | Available Actions
9. **Content** — Exact copy: page titles, buttons, empty states, error messages, confirmation dialogs
10. **Edge Cases** — Limits/boundaries, null/long data handling, permissions, offline/network failures, segment-specific edge cases
11. **Accessibility** — Tab order, keyboard actions (Enter/Space/Escape), screen reader announcements, focus management

### State Vocabulary

Use these state categories where applicable. Not every component needs every state — pick what's relevant for the feature.

- **Visual states** (per interactive element): default, hover, focus, active/pressed, disabled
- **Data states** (per data view): empty, loading, partial-loaded, loaded, error, stale/refreshing
- **Form states**: pristine, dirty, touched, submitting, submitted-success, submitted-error, validation-error per field
- **Selection states**: none, single, multi, partial-selection, all-selected
- **Sync states** (collaborative or async UI): optimistic, pending, conflict, resolved
- **Network states** (where relevant): online, offline, reconnecting

Save to `docs/tasks/{branch}/ux.md`

Prompt:

> **UX Specification Complete**
>
> Written to `{path}`. Please review: Any behaviors wrong or missing? Edge cases not covered? Segment differences captured?
>
> **Want a prototype to validate visually before approving?** `/spectre:prototype` will render this spec (high-fi, no synthesis) and flag assumptions where I had to fill in details — catches issues prose review misses. Reply `prototype` to run it now.
>
> Otherwise, reply with feedback, or **"Approved"** to finalize.

**Wait for approval, feedback, or prototype request.** If user replies `prototype`, invoke `/spectre:prototype` (the post-ux mode auto-detects the complete ux.md). Once prototype completes and any spec updates from filled assumptions are applied, return here for final approval.

## Step 5 — Handoff

Confirm completion with summary: screens specified, segments addressed, flows documented, components with states, edge cases and accessibility covered.

Read `.spectre/next_steps_guide.md` and render Next Steps footer:

```
Next Steps | Phase: Scope | Status: UX Complete
Recommendation: {contextual next action — if no prototype was generated, suggest /spectre:prototype to validate the spec visually before /plan}
Options: /spectre:prototype (validate spec visually), /spectre:create_plan, /spectre:create_tasks, /spectre:tdd
```

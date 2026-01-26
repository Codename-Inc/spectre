---
description: Define the User Flows and generate a UX Spec - primary agent
---
# ux_spec: Define Exactly How the Feature Works

Transform product requirements into a definitive behavioral specification. Two stages: align on user flows, then generate detailed spec. Output: `ux.md` ready for implementation.

<ARGUMENTS> $ARGUMENTS </ARGUMENTS>

---

# STAGE 1: Flow Discovery & Alignment

**Goal**: Align on HOW the feature works before specifying details.

## Step 1 — Understand the Feature

1. **Read requirements**: `docs/tasks/{branch}/task_summary.md` and `docs/tasks/{branch}/specs/prd.md`
2. **Research patterns**: Find existing screens/components similar to what we're building, note conventions
3. **Identify journeys**: List user goals, entry points, and completion states

## Step 2 — Present User Flows

Write each flow as a narrative walkthrough:

**Per flow include**: Goal, Entry point, Journey steps (User sees → User does → System responds), Decision points with branches, Success state, Questions where ambiguity exists

After writing all flows, prompt:

> **User Flows for Review**
>
> I've mapped {N} flows: {list with one-line summaries}
>
> Please review: Are these the right flows? Any missing? Do journeys feel right? Answer flagged questions.
>
> Reply with feedback, or **"Flows approved"** to proceed.

**Wait for approval. If feedback → revise and re-present. If approved → Stage 2.**

---

# STAGE 2: Detailed Specification

**Gate**: Only proceed after explicit flow approval.

## Step 3 — Clarify Remaining Details

Review approved flows for gaps: component behaviors, edge cases, state definitions.

If significant gaps, ask 3-5 targeted questions (empty states, error handling, loading, limits). Save to `clarifications/ux_clarifications_{timestamp}.md`, prompt user to read, incorporate answers.

## Step 4 — Write the Specification

Generate complete spec with these sections:

### Required Sections

1. **Overview** — What this feature is, problem it solves, primary user goal (1 paragraph)
2. **Screens** — Every screen: name, purpose (1 line), navigation relationships
3. **Flows** — Formalized from Stage 1 with alternate paths (validation fail, cancel, network error)
4. **Layouts** — Per screen: header/main/footer structure + responsive behavior (desktop >1024, tablet 768-1024, mobile <768)
5. **Components** — Each interactive element: purpose, location, states (default, hover, active, disabled, loading, error)
6. **Interactions** — Table format: Element | Action | Result (exhaustive)
7. **States** — Table format: State | Trigger | Appearance | Available Actions (empty, loading, loaded, error)
8. **Content** — Exact copy: page titles, buttons, empty states, error messages, confirmation dialogs
9. **Edge Cases** — Limits/boundaries, null/long data handling, permissions, offline/network failures
10. **Accessibility** — Tab order, keyboard actions (Enter/Space/Escape), screen reader announcements, focus management

Save to `docs/tasks/{branch}/ux.md`

Prompt:

> **UX Specification Complete**
>
> Written to `{path}`. Please review: Any behaviors wrong or missing? Edge cases not covered?
>
> Reply with feedback, or **"Approved"** to finalize.

**Wait for approval.**

## Step 5 — Handoff

Confirm completion with summary: screens specified, flows documented, components with states, edge cases and accessibility covered.

Read `.spectre/next_steps_guide.md` and render Next Steps footer:

```
Next Steps | Phase: Scope | Status: UX Complete
Recommendation: {contextual next action}
Options: /create_plan, /create_tasks, /tdd
```

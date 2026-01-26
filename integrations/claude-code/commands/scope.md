---
description: 👻 | Interactively scope a feature or improvement, generating a complete Scope document that clarifies what's IN and OUT -- primary agent
---
# scope: Interactive Feature Scoping

Collaborative workflow for structuring unstructured thoughts into clear scope boundaries through contextual brainstorming and targeted clarifications. Focuses on user value and scope boundaries before technical considerations. Output: comprehensive scope document with clear boundaries, user value, and key decisions saved to `{OUT_DIR}/concepts/scope.md`.

## ARGUMENTS

&lt;ARGUMENTS&gt; $ARGUMENTS &lt;/ARGUMENTS&gt;

## Step 1: Immediate Reply & Gather Context

- **Action** — ImmediateReply: Respond before any tools.
  - **If** `FROM_KICKOFF=true` → acknowledge kickoff context, read `KICKOFF_DOC`, extract (Core Problem, User Value, Decisions Made, Remaining Ambiguities, Key Code Refs), **SKIP to Step 3**
  - **Else If** ARGUMENTS empty → probe for context enthusiastically
  - **Else** → proceed to Step 2
  - **CRITICAL**: No tool calls except reading kickoff doc when FROM_KICKOFF=true

## Step 2: Interactive Scope Exploration

**SKIP IF FROM_KICKOFF=true**

- **Action** — ExploreScope: Collaborative dialogue focused on boundaries.

  **CRITICAL**: Focus on WHAT, not HOW. Defer all technical/implementation questions until scope boundaries are finalized. Only ask technical questions if the scope itself is inherently technical (e.g., "migrate database from X to Y").

  **Pattern**: Always propose concrete suggestions. "Based on \[context\], I'm thinking \[specific\]. Is that right?"

  **Topics** (priority order - complete each before moving on):

  1. **User Problem & Value**: Formulate hypothesis. "The core problem seems to be \[Y\]. Is that right?"
  2. **Scope Boundaries**: This is the core work. Propose both IN and OUT lists. "I'd suggest IN: ✅ \[list\] and OUT: ❌ \[list\]. What would you move?"
  3. **UX Assumptions:** Identify the primary user flows. Is anything ambiguous? “How do you imagine X working? I could see the user flow being 1)… 2)…."
  4. **Edge Cases**: Identify ambiguous items. "I'm unsure about \[X\] - should that be IN or OUT?"
  5. **Success Outcomes**: Present 2-4 criteria tied to IN items only.

  **DO NOT ask about**: implementation approach, technical trade-offs, architecture, or integration details until boundaries are confirmed. 


- **Action** — IterateBoundaries: Continue refining IN/OUT until user confirms.

  > **Current Boundaries**: ✅ **IN**: \[list\] ❌ **OUT**: \[list\] ⚠️ **Unsure**: \[edge cases\]
  >
  > Any items to move? Add exclusions? Clarify edges? Reply ‘looks good' to continue.

- **Wait** — User confirms Scope boundaries are accurate

## Step 3: Generate Targeted Clarifications

- **Action** — DetermineOutputDir:

  - **If** FROM_KICKOFF → use same dir as kickoff doc
  - **Else** → `OUT_DIR = user_specified || docs/tasks/{branch_name}`
  - `mkdir -p "$OUT_DIR"`

- **Action** — GenerateTargetedQuestions: Create 3-6 questions based ONLY on remaining scope ambiguities from Step 2 (or kickoff's "Remaining Ambiguities").

  **CRITICAL**: Only ask about unresolved scope ambiguities. Technical questions (architecture, trade-offs, integration) belong in `/spectre:plan`, not here.

- **Action** — SaveClarifications: Create `{OUT_DIR}/clarifications/scope_clarifications_{timestamp}.md`:

  - Header: concept name, confirmed boundaries so far
  - Questions: Each focused on a scope edge case with `<response></response>` block

- **Action** — PromptUser: "Saved clarifications to `{path}`. Answer in `<response>` blocks. Reply 'Read it' when ready."

- **Wait** — User replies

- **Action** — ReadClarifications: Read file, use responses (proceed with assumptions if empty)

## Step 4: Create Scope Document

- **Action** — CreateScopeDoc: Generate `{OUT_DIR}/concepts/scope.md` (use scoped filename if exists).

  **Priority**: User value and boundaries BEFORE technical details.

  **Sections**: The Problem (pain, impact, current state) → Target Users (primary, secondary, needs) → Success Criteria (outcomes, metrics) → User Experience (journeys, principles, trade-offs) → Scope Boundaries (in/out/maybe/future) → Constraints (platform, perf, a11y, scale) → Integration (touches, avoids, dependencies) → Decisions (from clarifications + rationale) → Risks (UX, scope creep, open questions) → Next Steps (`/spectre:plan` or `/spectre:create_tasks`, complexity S/M/L)

## Step 5: Document Review

- **Action** — PresentDocForReview: Show final boundaries from document.

  > **Final Boundaries**: ✅ **IN**: \[from doc\] ❌ **OUT**: \[from doc\] ⚠️ **Maybe/Future**: \[from doc\]
  >
  > Any final adjustments before we finalize? Reply with changes or 'Looks good'.

- **Action** — ApplyFeedback: Update scope doc if user provides changes.

- **Wait** — User confirms

## Step 6: Light Technical Context (Optional)

**Only if scope identifies specific technical/architecture integration points.**

- **Action** — IdentifyTouchpoints: Identify desired areas of research, and dispatch parallel @analyst subagents to research each area. Surface-level only (component names, NOT implementation). List features this interacts with, constraints worth documenting, areas to avoid.

- **Action** — UpdateScopeDoc: Add findings to Integration & Constraints sections if relevant.

## Step 7: Final Review & Complete

- **Action** — PromptFinalReview:

  > **Scope Complete**: `{OUT_DIR}/concepts/scope.md`
  >
  > Includes: Problem & value, scope boundaries, UX journeys, success criteria, decisions, integration points.
  >
  > Review and reply 'Approved' or provide feedback.

- **Wait** — User approves

- **Action** — ConfirmCompletion: "Scope complete. Docs: `{OUT_DIR}/concepts/scope.md`, `{OUT_DIR}/clarifications/scope_clarifications_{timestamp}.md`"

- **Action** — RenderFooter: Render Next Steps using `@skill-spectre:spectre` skill.
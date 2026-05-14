---
name: scope
description: 👻 | Interactively scope a feature or improvement, generating a complete Scope document with IN, OUT, and ANTI-SCOPE boundaries -- primary agent
user-invocable: true
---

# scope

## Input Handling

Treat the current command arguments as this workflow's input. When invoked from a slash command, use the forwarded `$ARGUMENTS` value.

# scope: Interactive Feature Scoping

Collaborative workflow for structuring unstructured thoughts into clear scope boundaries through a grounded hypothesis and targeted clarifications. Focuses on user value and scope boundaries before technical considerations. Output: scope document with clear boundaries (IN / OUT / ANTI-SCOPE), user value, load-bearing assumptions, and key decisions saved to `{OUT_DIR}/concepts/scope.md`.

## ARGUMENTS

<ARGUMENTS> $ARGUMENTS </ARGUMENTS>

## Step 1: Immediate Reply & Context Pickup

- **Action** — ImmediateReply: Respond before any tools.
  - **If** `FROM_KICKOFF=true` → acknowledge kickoff context, read `KICKOFF_DOC`, extract (Core Problem, User Value, Decisions Made, Remaining Ambiguities, Key Code Refs), **SKIP to Step 4**
  - **Else If** ARGUMENTS empty → probe for context enthusiastically and **WAIT** for user
  - **Else** → proceed with the steps below
  - **CRITICAL**: No tool calls in this step except reading the kickoff doc when `FROM_KICKOFF=true`.

- **Action** — DetectExistingArtifacts: Before proposing a hypothesis, check for prior context that may already answer questions.
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - Look for: `docs/tasks/{branch_name}/concepts/scope.md`, `docs/tasks/{branch_name}/task_context.md`
  - **If** prior `scope.md` exists → read fully; treat this invocation as a re-scope. Surface what was already settled and ask only about what's new or changed.
  - **If** captured project knowledge is available (via `/spectre:apply`-style memory or session logs) → surface decisions/patterns/gotchas relevant to this area before asking the user.

## Step 2: Ground the Hypothesis (Fast)

**SKIP IF FROM_KICKOFF=true** — kickoff already grounded.

- **Action** — FastGround: Run ONE fast lookup to ground the hypothesis in repo reality. Pick the most informative single call:
  - **`@spectre:finder` for one targeted query** — when you need to know what files/components exist for this area
  - **One `grep` or `glob`** — when you need to verify a specific assumption ("does X already exist?")

  **Constraints**:
  - **One call only.** This is grounding, not research. Tech research is `/spectre:plan`'s job.
  - **Fast.** If the call would take more than a few seconds, skip it and ask the user instead.
  - If you need more than one signal, that's a sign this should be a `/spectre:kickoff` rather than a `/spectre:scope`.

## Step 3: Interactive Scope Exploration

**SKIP IF FROM_KICKOFF=true**

- **Action** — ExploreScope: Collaborative dialogue focused on boundaries, user experience, and anti-scope.

  **CRITICAL**: Focus on WHAT, not HOW. Defer all technical/implementation questions to `/spectre:plan`. Only ask technical questions if the scope itself is inherently technical (e.g., "migrate database from X to Y").

  **PATTERN**: Lead with a grounded hypothesis (informed by Step 2's lookup) AND ask 5–8 questions across multiple dimensions. Mark each question as **(blocking)** or *(optional)* so the user can skim and skip.

  **FIRST RESPONSE FORMAT**:

  > Here's my read on this, grounded in {one-line of what Step 2 surfaced}:
  >
  > **Hypothesis**: [problem statement, who it affects, proposed IN / OUT / ANTI-SCOPE]
  >
  > **Questions**:
  > 1. **(blocking)** [User problem question]
  > 2. **(blocking)** [Boundary edge question]
  > 3. **(blocking)** [Anti-scope question]
  > 4. *(optional)* [UX flow question]
  > 5. *(optional)* [Alternative approach question]
  > 6. *(optional)* [Edge case question]
  > 7. *(optional)* [Success criteria question]
  >
  > Answer the blocking ones; skip optional if obvious.

  **Question types** (mix from these; lean on blocking for boundaries and anti-scope):

  - **User & Problem**: Who feels this most? What triggers the need? What's the cost of not solving it?
  - **UX & Feel**: Should this feel fast or thorough? Guided or flexible? What's the ideal flow?
  - **Boundaries (IN/OUT)**: What about [adjacent thing]—IN or OUT? What's essential for v1?
  - **Anti-Scope**: What problem are we *intentionally not solving* here? (Different from OUT — anti-scope clarifies the philosophical edge of the feature, not just deferred work.)
  - **Alternatives**: I could see this as [A] or [B]. Which direction?
  - **Edge cases**: What happens when [unusual situation]?
  - **Success**: What makes you say "this shipped well"?

  **DO NOT ask about**: implementation approach, technical trade-offs, architecture, or integration details — those belong in `/spectre:plan`.

- **Action** — IterateBoundaries: After user responds, refine boundaries and ask targeted follow-ups on gaps.

  > **Current Scope**:
  > ✅ **IN**: [list]
  > ❌ **OUT**: [list]
  > 🚫 **ANTI-SCOPE**: [problems we're intentionally not solving]
  > ⚠️ **Unsure**: [edge cases]
  >
  > Any items to move? Add exclusions? Clarify edges? Reply 'looks good' to continue.

- **Wait** — User confirms scope boundaries are accurate.

## Step 4: Targeted Clarifications

- **Action** — DetermineOutputDir:
  - **If** FROM_KICKOFF → use same dir as kickoff doc
  - **Else** → `OUT_DIR = user_specified || docs/tasks/{branch_name}`
  - `mkdir -p "$OUT_DIR/concepts" "$OUT_DIR/clarifications"`

- **Action** — DetectClarificationMethod: Check if `AskUserQuestion` tool is available.
  - **If available** → use inline clarification flow (Path A)
  - **If not available** → use file-based clarification flow (Path B)

### Path A: Inline Clarifications (AskUserQuestion available)

- **Action** — AskInline: Generate 3–6 questions based ONLY on remaining scope ambiguities from Step 3 (or kickoff's "Remaining Ambiguities").
  - Ask the most critical first (up to 4 at a time, the tool limit).
  - For trade-off decisions, present options with concise pros/cons.
  - If more than 4 questions, ask in batches — most important first.

  **CRITICAL**: Only ask about unresolved scope ambiguities. Technical questions belong in `/spectre:plan`, not here.

### Path B: File-Based Clarifications (no AskUserQuestion)

- **Action** — GenerateTargetedQuestions: Create 3–6 questions in `{OUT_DIR}/clarifications/scope_clarifications_{YYYY-MM-DD_HHMMSS}.md`:
  - Header: concept name, confirmed boundaries so far
  - Each question with a `<response></response>` block

- **Action** — PromptUser: "Saved clarifications to `{path}`. Answer in `<response>` blocks. Reply 'Read it' when ready."

- **Wait** — User replies.

- **Action** — ReadClarifications: Read the file; use responses (proceed with intelligent assumptions if blocks are empty).

## Step 5: Create Scope Document

- **Action** — CreateScopeDoc: Generate `{OUT_DIR}/concepts/scope.md` (use scoped filename if one exists).

  **Priority**: User value and boundaries BEFORE technical details.

  **Sections**:

  1. **The Problem** — pain, impact, current state
  2. **Target Users** — primary, secondary, needs
  3. **Success Criteria** — outcomes; prefer measurable assertions over prose
  4. **User Experience** — journeys, principles, trade-offs
  5. **Scope Boundaries** — IN / OUT / ANTI-SCOPE / Maybe / Future
  6. **Load-Bearing Assumptions** — assumptions that, if wrong, invalidate this scope. Each assumption gets a short *"if this is false, …"* consequence so future-you can recognize when to come back.
  7. **Constraints** — platform, perf, a11y, scale (user-provided only)
  8. **Decisions** — from clarifications + rationale
  9. **Risks** — UX, scope creep, open questions
  10. **Next Steps** — `/spectre:plan` or `/spectre:create_tasks`, complexity S/M/L

  **Note on ANTI-SCOPE vs OUT**:
  - **OUT** = we're not building it (yet, or for this release).
  - **ANTI-SCOPE** = we're intentionally not solving this *problem* — it clarifies the philosophical edge of what this feature is for.

## Step 6: Final Review & Next Steps

- **Action** — PresentDocForReview: Show final boundaries and next steps together.

  > **Scope Complete**: `{OUT_DIR}/concepts/scope.md`
  >
  > **Final Boundaries**:
  > ✅ **IN**: [from doc]
  > ❌ **OUT**: [from doc]
  > 🚫 **ANTI-SCOPE**: [from doc]
  > ⚠️ **Maybe/Future**: [from doc]
  >
  > **Load-Bearing Assumptions** (top 1–3 — if any prove false, return to scope): [from doc]
  >
  > Docs saved: `{OUT_DIR}/concepts/scope.md`, clarifications under `{OUT_DIR}/clarifications/`
  >
  > Reply with edits — otherwise pick a next step:

- **Action** — RenderFooter: Render Next Steps using `@skill-spectre:spectre-guide` skill.

  > **NOTE**: Do NOT wait for explicit approval. Present next steps inline with the review. The user can reply with scope edits OR jump straight into a next step command. If they reply with edits, apply them to the scope doc and re-present.

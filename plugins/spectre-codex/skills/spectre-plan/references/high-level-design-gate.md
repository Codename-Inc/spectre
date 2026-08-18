# High-level design gate

## Purpose

Give the user one concise, informed opportunity to understand, question, veto, or approve the proposed system shape before detailed planning. This is an alignment brief, not a complete design review.

## Proposal contract

Present one inline proposal targeting 250–350 words with a hard maximum of 400 words, counting bullets and tables. Use exactly these sections:

1. **Approach** — the system shape and why it fits.
2. **How it works** — one compact component map or end-to-end flow; distinguish new, modified, and unchanged parts when material.
3. **Decisions for approval** — at most three material choices, each with the chosen option, rationale, and meaningful downside.
4. **Boundaries** — what changes, remains unchanged, and is intentionally excluded; include at most three high-level verification signals.
5. **Open questions** — at most three unresolved user-owned questions, each with a recommended default and consequence; state `None` when resolved.

Exclude file inventories, implementation phases, task decomposition, exhaustive risks or verification, generic bullet summaries, and menus of speculative alternatives. The brief is DONE only when a user can identify what will exist, how its major parts interact, which trade-offs they are accepting, and what they may veto.

## Approval gate

Place any valid planning-time estimate immediately before this exact final sentence:

> High-level design proposed. Reply `Approved` to continue to detailed planning, or give design feedback.

Stop before child planning. Only `Approved` or an unambiguous affirmative approval of the displayed proposal counts; questions, feedback, silence, or a generic continuation request do not. Feedback is not approval: incorporate it, re-present the complete revised proposal within the same cap, and request approval again. After approval, record the approved proposal verbatim plus the approval fact under `## Selected Design` in `task_context.md`; downstream planning treats it as authoritative. Scope-changing feedback returns to Scope instead.

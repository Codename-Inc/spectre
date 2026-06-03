---
name: "caspar-quick_dev"
description: "Lightweight scope→research→plan workflow for small/medium tasks (bug fixes, small features). Confirms functional scope with the user, runs parallel read-only research, then writes a quick_task_plan.md with phased parent/sub-task structure. Trigger when the user wants a quick plan for a bounded change and full /caspar:plan task-generation would be overkill. Do NOT trigger for large/multi-area features (route to /caspar:plan + /caspar:create_tasks) or for pure execution with a plan already in hand."
user-invocable: true
---

# quick_dev — Scope → Research → Plan (small/medium tasks)

**Purpose:** Take a small/medium task (bug fix, small feature) from a rough ask to a confirmed scope, a grounded research synthesis, and a phased `quick_task_plan.md` — without the full plan/create_tasks pipeline.

**Inputs:**
- `$ARGUMENTS` — the task description (current command args). Read any files the user mentions in full (no limit/offset).
- Output dir: `docs/tasks/{branch_name}` unless the user specifies one.

**Working set:** the user's task + referenced files; the codebase (via research agents); `{OUT_DIR}/specs/`. Resolve branch/paths via tool reads at runtime, not inline.

**Outputs + DONE:** `{OUT_DIR}/specs/quick_task_plan.md` (scoped filename if one exists), containing exactly these sections:
1. **Agreed Scope** — Objective · In Scope · Out of Scope · Constraints
2. **Research Summary** — key codebase findings (file paths, patterns)
3. **Approach Summary** — strategy, integration points
4. **Implementation Tasks** — phased, format below
5. **Success Criteria**

- **Task format:** `## Phase` → `### [1.1] Parent Task` → `- [ ] **1.1.1** Sub-task` → `- [ ] Criterion`. Sub-tasks start with an action verb, name files/components, cite patterns + integration points + constraints; **exclude** code snippets / line-by-line steps; **2–3 acceptance criteria each**.
- **Bounds:** ~3 phases, ~8 parent tasks max.
- DONE when: user-confirmed scope, synthesized research, written plan, and **every in-scope item maps to a task with no out-of-scope tasks added** (validate coverage before declaring done).

**Method / guardrails:**
- **Step 1 — context, reply-first.** Respond before any tool call. If `$ARGUMENTS` lacks task context, ask "What are you trying to build or fix? Share any docs or context." and wait. Make no tool calls and ask no *technical* questions here — research answers those.
- **Step 2 — confirm functional scope (gate).** Present scope as Objective · ✅ In Scope (behaviors, not implementation) · ❌ Out of Scope · UX Assumptions · Constraints (user-provided only). Scope is **WHAT, not HOW** — do not ask about implementation/technical approach; research settles that. **Wait for the user to confirm or amend; apply changes before proceeding.**
- **Step 3 — research (parallel, read-only).** Spawn in parallel and wait for all: `@caspar:finder` (where files live), `@caspar:analyst` (how code works), `@caspar:patterns` (similar implementations), and `@caspar:web-research` *only if the user asks*. Synthesize in-thread (file paths, patterns, architectural decisions) — no intermediate report files.
- **Step 4 — clarify (gate).** Use `AskUserQuestion` for 2–4 questions, **only** on what research revealed needs a user decision (UX preferences, behavioral trade-offs); give Pros/Cons/Trade-offs for multi-option ones. Never re-ask scope (settled Step 2) or technical questions answerable from code.
- **Step 5 — write the plan.** `mkdir -p "${OUT_DIR}/specs"`; generate `quick_task_plan.md` per the structure above, then validate coverage.

**Handoff:** Present `**Task Plan Created**: {path}` with `✅ Scope | ✅ Research | ✅ Plan`. End with a one-line Next Steps: implement directly, or if the plan exceeds the bounds (>~3 phases / ~8 parent tasks) suggest **`/caspar:create_tasks`** for full task generation.

**Escalate if:** scope balloons past small/medium (route to `/caspar:plan`); the plan would exceed ~3 phases / ~8 parent tasks (suggest `/caspar:create_tasks`); or research surfaces a scope conflict the user must resolve.

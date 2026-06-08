---
name: "caspar-validate"
description: "Validate that completed implementation actually delivers the scope/tasks requirements — chunks the work into areas, dispatches parallel @caspar:analyst validators that trace each requirement from user action to render, and writes one actionable validation_gaps.md ranking what's Delivered / Partial / Dead Code / Missing. Trigger after execute (or any build) when you need to confirm requirements are met before clean/test/ship. Do NOT trigger to fix the gaps (caspar-fix), to run the test suite (caspar-test), or to remove dead code (caspar-prune)."
user-invocable: true
---

# validate

Post-implementation requirement validation. Verify the built work against scope docs and `tasks.json` slices, dispatch parallel validators per area, and produce one actionable gap-remediation document. **Validation only — never fix.**

## Core principle (load-bearing)

> **Definition ≠ Connection ≠ Reachability.** A requirement is only delivered if all three hold:
> 1. **Defined** — code exists in a file.
> 2. **Connected** — it is imported/called by other code.
> 3. **Reachable** — a user action can trigger the code path.

Level 1 without 2/3 is **dead code that happens to match the description** — not complete. Always trace past "X exists" → "X is called by Z at file:line" → "Z fires when the user does W."

## Inputs

- `$ARGUMENTS` — scope docs and/or `tasks.json` to validate against (paths, or "use thread context"). **REQUIRED.** If absent, ask for the scope doc path, the task detail JSON path, or "use thread context" — then wait.
- Read scope docs in full. For `tasks.json`, extract validation slices from `phases[]` (parent title/description plus child acceptance criteria/context); do not use `execute.md` as the validation source except to locate the JSON path.

## Working Set (late-bound — read at run-time, never inline)

- `branch = git rev-parse --abbrev-ref HEAD` (fallback `unknown`)
- `OUT_DIR = user-specified path || docs/tasks/{branch}`; report under `{OUT_DIR}/validation/` (`mkdir -p`)
- the actual code, diff, and task artifacts under `{OUT_DIR}/` — read just-in-time

## Method / guardrails

- **Chunk into 3–8 validation areas:** one per parent task in `tasks.json`, else one per "In Scope" item in scope.md, else one per discussed feature. Merge small, split large.
- **Dispatch one `@caspar:analyst` per area, ALL in parallel in a single message.** Brief each with: the area, its source requirement (exact text), expected deliverables, branch, and the status enum + evidence + reachability rules below. Subagents return compressed findings in-thread — no per-area files.
- **Status enum (each requirement):** ✅ **Delivered** (defined AND connected AND reachable) · ⚠️ **Partial** (exists, broken/missing connection) · 🔌 **Dead Code** (exists, zero usage sites) · ❌ **Missing** (does not exist).
- **Evidence rule (YOU MUST):** every requirement cites **both** a definition site (`file:line`) and a usage site (`file:line`). Definition only, no usage → status is ⚠️ or 🔌, never ✅.
- **Reachability + render-backward trace:** for UI features, trace from the final render *backward* — JSX ← variable ← source (hook/prop/computed) ← user action. A broken link anywhere = ⚠️. Grep for *usage* not just definition (`fnName(`, `<Component`, `useHook(`, `prop={`).
- **Dead-computation + old-path audit:** flag any computed value that never reaches a render (🔌), and any old code path still active after new code replaced it (⚠️, new path bypassed / duplicate data source).
- **Note scope creep** — anything built beyond the requirements.
- **Final wiring check before any ✅:** consumer connected? render chain unbroken? old path removed? no orphaned computation? single data source? Any failure downgrades ✅ → ⚠️ and adds a gap task.
- **No fixes.** Report and hand back.

## Outputs + DONE

Write `{OUT_DIR}/validation/validation_gaps.md`. Required sections:

1. **Summary** — overall status (Complete | Needs Work | Significant Gaps) · {X of Y} delivered · gap count · scope-creep count.
2. **Gap Remediation Tasks** — phased by priority (Critical / Medium / Low). Each gap: requirement · current state · gap; each action carries **Produces / Consumed by / Replaces** and verifiable check-box outcomes.
3. **Scope Creep Review** — items beyond scope (Keep+document / Remove / Discuss) with evidence.
4. **Validation Coverage** table — Area · Status · Definition · Usage · Render Chain.
5. **Dead Computations Found** table — Variable · File · Computed By · Should Be Consumed By.
6. **Old Code Paths Still Active** table — Old Path · Location · Replaced By · Impact.

**DONE when:** validation_gaps.md exists with all six sections; every area has a status from the enum with definition+usage evidence; gaps are actionable (Produces/Consumed-by/Replaces); scope creep noted; no code was modified.

## Handoff

Reply to the user with a short summary: status, {X of Y} delivered, gap count, scope-creep count, 1–2 sentence key findings, and the report path. Then suggest the next command inline — typically `/caspar:fix` to remediate gaps, else `/caspar:clean` / `/caspar:test` to continue the loop.

## Escalate-If

- No scope/tasks docs and no usable thread context → ask before dispatching.
- A gap implies a scope/requirements change rather than a wiring defect → surface to the user; do not silently re-scope.

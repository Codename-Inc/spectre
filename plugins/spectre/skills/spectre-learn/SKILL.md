---
name: "spectre-learn"
description: "Use when the user invokes /learn or asks to remember, save, or capture a pattern, decision, gotcha, procedure, or feature dossier from this session for later re-use (\"please remember\", \"what did we learn?\"). Captures durable project knowledge as a canonical user-level record. Do NOT trigger for simple personal preferences (those go to CLAUDE.md) or for searching or loading existing knowledge (use the knowledge CLI)."
user-invocable: true
disable-model-invocation: true
---

# Learning Agent

Capture durable project knowledge as a canonical user-level record. When invoked (`/learn` or `/spectre:learn`), this is the **exclusive** knowledge handler: do not write to `MEMORY.md` or any auto-memory system. Goal: someone with zero context becomes productive on the topic without follow-up questions.

## Inputs
- **Topic/content** from `$ARGUMENTS`; if absent, infer from the last ~10–20 messages.
- **Project root** = `${CLAUDE_PROJECT_DIR:-$PWD}`. Do not traverse to a Git root or main worktree; identify the project from where the user is working. Never use `git rev-parse`.
- **Canonical knowledge** from the host-neutral `spectre knowledge search` and exact-ID `spectre knowledge load` contract. The commands resolve Git and non-Git projects to the readable user-level store under `~/.spectre/projects/`.

## Working Set
- Read-only search results and any selected canonical `recordPath`.
- One temporary proposal directory created with `mktemp -d`; it must be outside the project.
- The approved core `SKILL.md` plus optional focused `references/` staged under that proposal directory.

## Method / guardrails
1. **Context or investigate.** If the topic was discussed in detail or you already understand it this session, proceed. Otherwise enter **Investigation Mode** — do NOT fabricate. Dispatch `@spectre:finder` to map relevant files, then 2–3 read-only `@spectre:analyst` passes answering the category's required-section questions (cite file:line). Synthesize: cross-reference shared files, resolve conflicts by reading the disputed code, flag gaps.
2. **Migrate, then search before deciding.** Run:
   ```bash
   project_root="${CLAUDE_PROJECT_DIR:-$PWD}"
   spectre knowledge migrate --project-dir "$project_root" --json
   spectre knowledge search "$ARGUMENTS" --project-dir "$project_root" --json
   ```
   Treat migration issues as preserved debt, not permission to rewrite or delete legacy input. For each plausible search result, load the verified core by exact ID before choosing an action:
   ```bash
   spectre knowledge load "<exact-id>" --project-dir "$project_root" --json
   ```
   Search results are metadata, not loaded knowledge. Use the load result's `recordPath`, `recordDirectory`, and lazy resource manifest when inspecting an existing candidate.
3. **Capture criteria** — proceed only if ≥2 of 4 hold: Frequency (recurs) · Pain (cost real debug time) · Surprise (non-obvious) · Durability (true in 6 months). Skip one-offs, generic knowledge, temporary workarounds, and simple preferences (→ CLAUDE.md).
4. **Categorize** — use ONLY these (never invent): `feature · gotchas · patterns · decisions · procedures · integration · performance · testing · ux · strategy`.
5. **Required sections by category** (minimums — add depth per Content Principles below):
   - **feature**: What is it? · Why/use cases (≥3) · User flows (≥2) · Technical design · Key files (≥3) · Common tasks (≥2)
   - **gotchas**: Symptom · Root cause · Solution (code) · Prevention
   - **patterns**: Problem · Solution (code) · When to use · Trade-offs
   - **decisions**: Context · Options considered · Decision · Rationale · Consequences
   - **procedures**: When to use · Prerequisites · Steps (numbered, w/ commands) · Verification
   - **integration**: What it is · How we connect (auth/endpoints/SDK) · Key operations (code) · Gotchas
   - **performance/testing/ux/strategy**: Context · the actionable knowledge · examples · pitfalls
6. **Content principles** (all categories): lead with the one key insight · orient (why, 2–3 sentences) before details · be actionable (commands/code/steps) · show with examples · call out pitfalls · keep scannable (80% value in a 60s skim). The core must be sufficient for immediate correct application. Move non-essential history, extended examples, and supporting detail into focused files under `references/`.
7. **Name** = `{category}-{slug}`, lowercase-kebab-case only (letters/numbers/hyphens), no colons/slashes/underscores/parens, slug ≤5 descriptive words. E.g. `feature-auth-flows`, `gotchas-hook-timeout`.
8. **Match → UPDATE > APPEND > CREATE** (prefer consolidation). Use the canonical search results from step 2. UPDATE when new information contradicts, extends, or supersedes a result. APPEND when it is distinct but belongs in the same record. CREATE only when no result matches. UPDATE and APPEND preserve the original Created date, set Updated to today, and increment `spectre-version`.
9. **Canonical record shape.** The staged proposal must use only Agent Skills fields at the frontmatter top level. All Spectre extensions are string values under `metadata`; `spectre-triggers` is a JSON-encoded string array. New records default to active.

   <!-- canonical-record:start -->
   ```yaml
   ---
   name: "{category}-{slug}"
   description: "Use when changing authentication refresh behavior or debugging expired-session renewal."
   metadata:
     spectre-category: "feature"
     spectre-triggers: '["authentication refresh workflow","src/auth/refresh.ts"]'
     spectre-status: "active"
     spectre-version: "1"
   ---
   ```
   <!-- canonical-record:end -->

   The description states the precise use condition. Each activation cue must make the record's subject and a concrete activation condition recognizable. Use no more than 16 cues, each no more than 120 normalized characters. A cue must be either a phrase with at least two lexical tokens (`authentication refresh`) or a structured command, path, filename, symbol, or identifier (`/spectre:learn`, `src/auth/refresh.ts`, `hooks.json`, `registration.validateCue`). Never propose generic standalone terms such as `test`, `plan`, `plugin`, `learn`, `knowledge`, or `registry`. A cue assists discovery; it is never sufficient by itself to justify loading a record. Preserve unrelated valid string metadata when updating an existing record.
10. **Verify before proposing** (especially Investigation Mode): spot-check 2–3 key claims against real files; confirm each Key-File purpose; trace one flow for feature learnings. Set confidence low/medium/high accordingly; flag unverified areas inline. Default Investigation learnings to medium.
11. **Proposal gate — YOU MUST stop and wait for the user.** Show the action (UPDATE/APPEND/CREATE), record name, **full** proposed core content (never a summary), any proposed `references/` files, trigger phrases, and confidence. Handle: `y`→write · `n`→cancel · `edit`/custom→revise · different name→use it. Do not stage or register files before approval.
12. **Stage only after approval.** Create a temporary root with `mktemp -d`. For UPDATE or APPEND, copy the selected canonical record directory from the parent of its `recordPath` into the temporary root before editing the copy. For CREATE, create a new `{name}/SKILL.md` there. Write focused resources beneath `{name}/references/`. Never edit the selected canonical record in place.
13. **Register and repair until accepted.** Run:
    ```bash
    spectre knowledge register \
      --record "$proposal_root/$name" \
      --project-dir "$project_root" \
      --json
    ```
    Handle failures precisely:
    - `KNOWLEDGE_RECORD_INVALID` with a 9,001-character core: move non-essential detail into `references/`, revise the complete core, and retry. Never truncate or partially register it.
    - Other validation errors: repair the reported schema or content defect and retry. Lock or filesystem errors are blockers; do not claim success.
14. **Verify the committed record.** Registration succeeds only when its JSON result has `ok: true`. Search again using the primary activation cue, require the expected ID in the metadata results, then run `spectre knowledge load "$name" --project-dir "$project_root" --json`. Require `ok: true`, confirm the returned full core matches the approved bytes, and verify `recordDirectory` plus any resource paths. Registration must not create project knowledge files, including for non-Git projects. Remove the temporary proposal only after verification.

## Outputs + DONE
- A validated canonical `SKILL.md` plus any focused `references/`, committed atomically through `spectre knowledge register`.
- **DONE when:** the user approved at the proposal gate · registration returned `ok: true` · canonical search finds the expected active record · exact-ID load returns the approved full core and resource paths · no project knowledge files were created.

## Handoff
Report the canonical `recordPath`, action, category, confidence, version, and any resource paths. If a previously applied record proved incomplete or wrong, route the correction through the same search, proposal, temporary-stage, registration, and verification flow.

## Escalate-If
- Category is ambiguous → ask the user which of the ten categories.
- Investigation can't confirm a load-bearing claim → flag it inline and set confidence low; do not assert unverified behavior as fact.
- Migration reports divergent, malformed, conflicting, or unproven oversized input relevant to this topic → preserve it and surface the exact issue before proposing new authority. Proven legacy Spectre-generated learnings migrate intact even when oversized; do not rewrite their canonical bytes merely to satisfy superseded delivery constraints.

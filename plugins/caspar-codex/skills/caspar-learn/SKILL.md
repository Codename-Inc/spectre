---
name: "caspar-learn"
description: "Use when the user invokes /learn or asks to remember, save, or capture a pattern, decision, gotcha, procedure, or feature dossier from this session for later re-use (\"please remember\", \"what did we learn?\"). Captures durable project knowledge as an on-demand Skill. Do NOT trigger for simple personal preferences (those go to CLAUDE.md) or for recalling existing knowledge (that is /caspar:recall)."
user-invocable: true
---

# Learning Agent

Capture durable project knowledge as a project-level Skill, registered for on-demand recall. When invoked (`/learn`, `caspar-learn`, `Skill(caspar-learn)`) this is the **exclusive** knowledge handler: do NOT write to `MEMORY.md` or any auto-memory system. Goal: someone with zero context becomes productive on the topic without follow-up questions.

## Inputs
- **Topic/content** from `$ARGUMENTS`; if absent, infer from the last ~10–20 messages.
- **`{{project_root}}`** = `CLAUDE_PROJECT_DIR` else `$PWD`. **YOU MUST NOT** traverse up to a git root / main worktree — save where the user is working. Never use `git rev-parse`.
- **Registry** (read first): `{{project_root}}/.agents/skills/caspar-recall/references/registry.toon` — lines `{skill-name}|{category}|{triggers}|{description}`.

## Working Set
- Skill files: `{{project_root}}/.agents/skills/{category}-{slug}/SKILL.md`.
- Recall skill + registry: `{{project_root}}/.agents/skills/caspar-recall/`.

## Method / guardrails
1. **Context or investigate.** If the topic was discussed in detail or you already understand it this session, proceed. Otherwise enter **Investigation Mode** — do NOT fabricate. Dispatch `@finder` to map relevant files, then 2–3 read-only `@analyst` passes answering the category's required-section questions (cite file:line). Synthesize: cross-reference shared files, resolve conflicts by reading the disputed code, flag gaps.
2. **Capture criteria** — proceed only if ≥2 of 4 hold: Frequency (recurs) · Pain (cost real debug time) · Surprise (non-obvious) · Durability (true in 6 months). Skip one-offs, generic knowledge, temp workarounds, and simple preferences (→ CLAUDE.md).
3. **Categorize** — use ONLY these (never invent): `feature · gotchas · patterns · decisions · procedures · integration · performance · testing · ux · strategy`.
4. **Required sections by category** (minimums — add depth per Content Principles below):
   - **feature**: What is it? · Why/use cases (≥3) · User flows (≥2) · Technical design · Key files (≥3) · Common tasks (≥2)
   - **gotchas**: Symptom · Root cause · Solution (code) · Prevention
   - **patterns**: Problem · Solution (code) · When to use · Trade-offs
   - **decisions**: Context · Options considered · Decision · Rationale · Consequences
   - **procedures**: When to use · Prerequisites · Steps (numbered, w/ commands) · Verification
   - **integration**: What it is · How we connect (auth/endpoints/SDK) · Key operations (code) · Gotchas
   - **performance/testing/ux/strategy**: Context · the actionable knowledge · examples · pitfalls
5. **Content principles** (all categories): lead with the one key insight · orient (why, 2–3 sentences) before details · be actionable (commands/code/steps) · show with examples · call out pitfalls · keep scannable (80% value in a 60s skim).
6. **Name** = `{category}-{slug}`, lowercase-kebab-case only (letters/numbers/hyphens), no colons/slashes/underscores/parens, slug ≤5 descriptive words. E.g. `feature-auth-flows`, `gotchas-hook-timeout`.
7. **Match → UPDATE > APPEND > CREATE** (prefer consolidation). Scan registry for same-category / overlapping-trigger / related candidates; read the candidate SKILL.md before deciding. UPDATE when new info contradicts/extends/supersedes; APPEND when distinct but same skill; CREATE when no semantic match.
8. **Verify before proposing** (esp. Investigation Mode): spot-check 2–3 key claims against real files; confirm each Key-File purpose; trace one flow for feature learnings. Set confidence low/medium/high accordingly; flag unverified areas inline. Default Investigation learnings to medium.
9. **Proposal gate — YOU MUST stop and wait for the user.** Show the action (UPDATE/APPEND/CREATE), skill name, **full** proposed content (never a summary), trigger keywords, and confidence. Handle: `y`→write · `n`→cancel · `edit`/custom→revise · different name→use it.

## Outputs + DONE
- A `SKILL.md` written to `{{project_root}}/.agents/skills/{category}-{slug}/SKILL.md` with frontmatter (`name`, `description` starting "Use when…", `user-invocable: true`) and the dated header (Trigger · Confidence · Created · Updated · Version). On UPDATE: preserve Created, set Updated=today, increment Version. On APPEND: add a new `---`-delimited section with its own header.
- Registered via the plugin's register CLI (updates `registry.toon`, regenerates `caspar-recall/SKILL.md`, injects `TRIGGER when:` into all skill descriptions). The registry `description` MUST start with "Use when…" and describe *when to use* the knowledge, not what it contains.
- **DONE when:** user approved at the gate · file written at the correct project-level path · registry entry + recall skill regenerated. Confirm with the saved path and registry path.

## Handoff
Report the saved skill path, category, confidence, and registry path. Proactive update: if you loaded a skill earlier this session and found it incomplete/wrong/extendable, edit it directly (no proposal gate — just inform the user), re-register, and regenerate recall.

## Escalate-If
- Category is ambiguous → ask the user which of the ten categories.
- Investigation can't confirm a load-bearing claim → flag it inline and set confidence low; do not assert unverified behavior as fact.

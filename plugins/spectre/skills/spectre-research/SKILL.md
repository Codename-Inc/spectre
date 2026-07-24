---
name: "spectre-research"
description: "Research a codebase to answer a question — fan out read-only agents (finder/analyst/patterns, web-research for 3rd-party), then synthesize evidence-backed findings into a saved research doc with file:line citations. Use when the user asks \"how does X work\", \"where does Y live\", \"investigate/research Z before planning\", or wants a written research artifact. Do NOT use to write code, plan a feature (use spectre-plan), or for a one-off lookup that needs no saved doc."
user-invocable: true
disable-model-invocation: true
---

# research

Codebase research: spawn parallel read-only agents, synthesize their findings into one evidence-based document. Live code is the source of truth.

## Inputs
- Research question / topic (from `$ARGUMENTS`). If absent, send an immediate reply asking for it and stop.
- Optional explicit managed feature name/root or an artifact beneath one.
- Any files the user names (tickets, docs, JSON).

## Working set
- `FEATURE_ROOT = .spectre/features/<feature-name>/`, resolved from the input or proposed below. Read branch/commit/repo metadata via tool at write time, never inline earlier.
- Agents (read-only, run in parallel): `@spectre:finder` (where code lives), `@spectre:analyst` (how it works), `@spectre:patterns` (similar implementations), `@spectre:web-research` (3rd-party docs — instruct it to return LINKS). Context7 MCP only if the user explicitly asks for library docs.

## Feature root contract

- Resolve an explicit feature directory or feature name first, then a supplied artifact beneath the feature root, then one unambiguous feature artifact from the current thread. If unresolved or ambiguous, use the proposal flow below; never use branch name, modification time, lifecycle completeness, or directory scanning to infer a feature.
- For new work, propose a lowercase kebab-case feature name and `.spectre/features/<feature-name>/` in the existing immediate response. Silence on the name accepts it; never create a separate name-confirmation gate.
- When the user explicitly names an existing managed feature, continue it under its existing overwrite safeguards. The physical directory is authoritative.
- Before the first write, inspect the proposed root. An unintended occupied directory must stop the workflow; never auto-suffix, reinterpret, or overwrite it. An explicitly selected directory without a valid `feature.json` is unmanaged and must also stop.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`.
- Keep the marker lifecycle-neutral: never add branch, status, active-pointer, alias, or absolute-path state.
- If `.spectre/.gitignore` is absent and the repository does not already ignore `.spectre/`, create it with `manifest.json`, `bin/`, `handoffs/`, and `!features/`. Do not rewrite a user root ignore file. If the selected feature root is ignored, warn that its records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid.

## Method / guardrails
1. **Immediate reply first** — acknowledge the topic and proposed feature name/root (or ask for the topic) with NO tool calls in the opening turn.
2. **Read named files fully** in main context (no limit/offset) before decomposing.
3. Decompose the question into areas; track with TodoWrite. Strategy: locate → analyze promising hits → fan out parallel reads. Tell each agent what to find, not how to search.
4. Wait for ALL agents before synthesizing. Compress each return to a 1–2K summary; do not write per-agent scratch files.
5. Synthesize: prefer live-code findings as source of truth; connect findings across components; cite concrete `path:line`; answer the user's actual question with evidence.

## Outputs + DONE
Write one research doc to `{FEATURE_ROOT}/research/{topic}_{MMDDYY}.md`; the research doc begins below its title with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`. DONE when:
- YAML frontmatter: `date` (ISO+tz), `git_commit`, `branch`, `repository`, `topic`, `tags`, `status: complete`, `last_updated` (YYYY-MM-DD), `last_updated_by`. Multi-word keys snake_case.
- Sections, in order: 1 Title `# Research: {topic}` · 2 Metadata header · 3 Research Question · 4 Summary · 5 Detailed Findings (by area, with `file:line`) · 6 Code References · 7 Architecture Insights · 8 Related Research · 9 Open Questions.
- Every claim is backed by a `path:line` reference; live code prioritized over docs.
- Permalinks: if on main/master OR the commit is pushed, replace local refs with `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}` (`gh repo view --json owner,name`); else keep local refs.
- A concise findings summary (with key file refs) is presented to the user.

## Handoff
- Follow-ups update the SAME doc: bump `last_updated`/`last_updated_by`, add `last_updated_note`, append `## Follow-up Research {timestamp}`, spawn agents as needed.
- Close with a one-line Next Steps pointer (e.g. `/spectre:plan` to formalize, or further research).

## Escalate-If
- The question is too broad/ambiguous to scope agents → ask one clarifying question before fanning out.
- Findings contradict each other or the live code can't be reached → surface the conflict in Open Questions rather than guessing.

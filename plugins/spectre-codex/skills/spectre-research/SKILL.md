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
- `FEATURE_ROOT = .spectre/features/<feature-name>/`, resolved from the input or chosen autonomously below. Read branch/commit/repo metadata via tool at write time, never inline earlier.
- Agents (read-only, run in parallel): `@spectre_finder` (where code lives), `@spectre_analyst` (how it works), `@spectre_patterns` (similar implementations), `@spectre_web_research` (3rd-party docs — instruct it to return LINKS). Context7 MCP only if the user explicitly asks for library docs.

## Feature root contract

- Reuse a managed `FEATURE_ROOT` only when explicit/current-thread evidence ties it to this work (physical directory wins; never branch/recency/lifecycle/scans); distinct work ignores ambient roots. Otherwise, including on collision, standalone MUST first load and follow `Skill(spectre-feature-root)` through DONE; orchestrated calls escalate. Keep writes beneath it and pass it unchanged.

## Method / guardrails
1. **Immediate reply first** — acknowledge the topic and state the feature name/root the workflow will use (or ask for the topic) with NO tool calls in the opening turn.
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
| Handoff | Details |
|---|---|
| 🧭 **Current phase** | Done |
| 📦 **What was just done** | Result |
| ▶️ **Proposed next step** | Render resolved action. |

Follow-ups update the same doc (metadata + timestamped section); close with one next-step pointer: Plan with resolved research document path or further research.

## Escalate-If
- The question is too broad/ambiguous to scope agents → ask one clarifying question before fanning out.
- Findings contradict each other or the live code can't be reached → surface the conflict in Open Questions rather than guessing.

---
name: "caspar-kickoff"
description: "Project kickoff — deep codebase + external research producing an evidence-backed kickoff doc, gap analysis, and MVP path before scoping. Use to start a fresh feature/project from an unclear problem, when the user wants research/options/an MVP recommendation before committing to scope or a plan. Do not trigger once scope is already defined (use /caspar:scope) or for a single targeted code question (use an analyst agent directly)."
user-invocable: true
---

# kickoff

Deep research entry point: investigate the codebase and external best practices, then hand off a written kickoff doc with a gap analysis and MVP path. Clear on WHAT to produce; the research method is yours.

## Inputs
- `$ARGUMENTS` — the project/feature context (the current command arguments). If empty, ask the user for it before any tools.
- Any docs the user references — read them FULLY in main context (not via subagent): vision, constraints, decisions, open questions.

## Working set (late-bound — read at runtime, never inline)
- Codebase, via read-only research agents (see Method).
- `task_name` derived from context (kebab-case); current git commit/branch for metadata + permalinks.

## Method / guardrails
1. **Acknowledge first.** Open with a reply naming what we're exploring, the decision we're heading toward, and what success looks like. No tool calls in this first turn.
2. **Decompose** the project into research areas (components, dirs/files, patterns, data flows, code to extend); track them with TodoWrite.
3. **Research in parallel**, read-only — locator → analyzer-on-findings → breadth. Spawn follow-ups if a thread is shallow. Use Context7 MCP for central 3rd-party libs.

   | Agent | Task | Required output |
   |---|---|---|
   | `@finder` | relevant files, entry points, handlers, models | file paths by domain |
   | `@analyst` | data flow, dependencies, behavior, edge cases | file:line for ALL findings |
   | `@patterns` | similar impls, patterns to follow/avoid | code examples w/ file:line |
   | `@web-research` | best practices, prior art, pitfalls | findings WITH links |

   Demand file:line evidence (codebase) and links (external). Returns come back as compressed in-thread summaries — no intermediate report files.
4. **Wait for all agents** before synthesizing; update TodoWrite as each lands.
5. **Synthesize → gap → MVP → options.** Connect findings across components with file:line throughout; gap analysis = current capabilities (file refs) vs required, split missing-vs-modify; MVP = core value + minimum slice + what to defer; give 2–3 options each with summary, key decisions, code to leverage (refs), new work, effort, trade-offs; surface decision points and open questions.

## Outputs + DONE
Write the kickoff doc to `docs/tasks/{task_name}/kickoff/{task_name}_kickoff.md` (`mkdir -p` first; timestamp-suffix if the file exists). **Save it before presenting** the summary.

- YAML frontmatter: date, git_commit, branch, repo, topic, tags, status.
- Required sections, in order: Title · Metadata · Project Context · Research Summary · Detailed Codebase Findings (by area, file:line, snippets) · Code References (table) · Architecture Insights (patterns, conventions, constraints) · External Research (with links) · Gap Analysis · MVP Suggestion · Implementation Options (2–3, with trade-offs) · Decision Points · Open Questions · Related Resources.
- If on `main`/pushed, convert file refs to GitHub permalinks: `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}`.

**DONE when:** doc saved with every required section populated, all findings carry file:line (or external links), gap analysis and an MVP path are stated, and the saved summary + scoping questions have been presented to the user.

## Handoff
Present a compact summary (vision · what exists w/ refs · architecture insights · external learnings · gap · MVP path) plus 1–3 scoping questions, each offering concrete options (e.g. "Option A leverages `code:line` vs Option B"). Then engage scoping: wait, ask follow-ups, and **research answerable questions instead of asking them** — do not move to planning until ambiguities resolve. Fold clarifications back into the doc under `## Scoping Clarifications [timestamp]`; spawn more research if needed.

When resolved, offer the next step:
1. Proceed to scope → `caspar-scope` with `FROM_KICKOFF=true`, `KICKOFF_DOC={path}`, `SKIP_EXPLORATION=true`, + context summary.
2. Skip to planning → `caspar-plan` with the kickoff doc as context.

## Escalate-If
- No project context supplied and none inferable → ask the user before researching.
- Research stays shallow / no file:line evidence after follow-ups → say so and present partial findings rather than fabricating depth.
- Scoping ambiguities can't be resolved by research → surface them as Open Questions; do not proceed to planning.

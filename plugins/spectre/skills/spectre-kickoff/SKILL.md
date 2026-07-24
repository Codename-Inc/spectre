---
name: "spectre-kickoff"
description: "Project kickoff — deep codebase + external research producing an evidence-backed kickoff doc, gap analysis, and MVP path before scoping. Use to start a fresh feature/project from an unclear problem, when the user wants research/options/an MVP recommendation before committing to scope or a plan. Do not trigger once scope is already defined (use /spectre:scope) or for a single targeted code question (use an analyst agent directly)."
user-invocable: true
disable-model-invocation: true
---

# kickoff

Deep research entry point: investigate the codebase and external best practices, then hand off a written kickoff doc with a gap analysis and MVP path. Clear on WHAT to produce; the research method is yours.

## Inputs
- `$ARGUMENTS` — the project/feature context (the current command arguments). If empty, ask the user for it before any tools.
- Optional explicit managed feature name/root or an artifact beneath one.
- Any docs the user references — read them FULLY in main context (not via subagent): vision, constraints, decisions, open questions.

## Working set (late-bound — read at runtime, never inline)
- Codebase, via read-only research agents (see Method).
- `FEATURE_ROOT = .spectre/features/<feature-name>/`, resolved from the input or proposed below; current git commit/branch for metadata + permalinks.

## Feature root contract

- Resolve an explicit feature directory or feature name first, then a supplied artifact beneath the feature root, then one unambiguous feature artifact from the current thread. If unresolved or ambiguous, use the proposal flow below; never use branch name, modification time, lifecycle completeness, or directory scanning to infer a feature.
- For new work, propose a lowercase kebab-case feature name and `.spectre/features/<feature-name>/` in the existing acknowledgement response. Silence on the name accepts it; never create a separate name-confirmation gate.
- When the user explicitly names an existing managed feature, continue it under its existing overwrite safeguards. The physical directory is authoritative.
- Before the first write, inspect the proposed root. An unintended occupied directory must stop the workflow; never auto-suffix, reinterpret, or overwrite it. An explicitly selected directory without a valid `feature.json` is unmanaged and must also stop.
- Initialize an approved new root before its first artifact with a lifecycle-neutral `feature.json` containing `{"schema_version":1,"created_at":"<ISO8601>","feature":"<feature-name>","feature_root":".spectre/features/<feature-name>"}`.
- Keep the marker lifecycle-neutral: never add branch, status, active-pointer, alias, or absolute-path state.
- Before writing the first artifact, initialize local-state tenancy. Create `.spectre/.gitignore` only when it is absent and the parent repository does not already ignore `.spectre/`; give it ignore patterns for `manifest.json`, `bin/`, and `handoffs/`, while retaining `!features/`. Never silently rewrite an arbitrary user root `.gitignore`. A blanket parent `.spectre/` ignore requires a warning that the selected feature records are local-only.
- Write new canonical artifacts only inside `FEATURE_ROOT`; arbitrary output roots are invalid.

## Method / guardrails
1. **Acknowledge first.** Open with a reply naming what we're exploring, the proposed feature name/root, the decision we're heading toward, and what success looks like. No tool calls in this first turn.
2. **Decompose** the project into research areas (components, dirs/files, patterns, data flows, code to extend); track them with TodoWrite.
3. **Research in parallel**, read-only — locator → analyzer-on-findings → breadth. Spawn follow-ups if a thread is shallow. Use Context7 MCP for central 3rd-party libs.

   | Agent | Task | Required output |
   |---|---|---|
   | `@spectre:finder` | relevant files, entry points, handlers, models | file paths by domain |
   | `@spectre:analyst` | data flow, dependencies, behavior, edge cases | file:line for ALL findings |
   | `@spectre:patterns` | similar impls, patterns to follow/avoid | code examples w/ file:line |
   | `@spectre:web-research` | best practices, prior art, pitfalls | findings WITH links |

   Demand file:line evidence (codebase) and links (external). Returns come back as compressed in-thread summaries — no intermediate report files.
4. **Wait for all agents** before synthesizing; update TodoWrite as each lands.
5. **Synthesize → gap → MVP → options.** Connect findings across components with file:line throughout; gap analysis = current capabilities (file refs) vs required, split missing-vs-modify; MVP = core value + minimum slice + what to defer; give 2–3 options each with summary, key decisions, code to leverage (refs), new work, effort, trade-offs; surface decision points and open questions.

## Outputs + DONE
Write the kickoff doc to `{FEATURE_ROOT}/kickoff/{feature-name}_kickoff.md` (`mkdir -p` first; timestamp-suffix if the file exists). The kickoff doc begins below its title with `Feature: <feature-name>` and `Feature Root: .spectre/features/<feature-name>`. **Save it before presenting** the summary.

- YAML frontmatter: date, git_commit, branch, repo, topic, tags, status.
- Required sections, in order: Title · Metadata · Project Context · Research Summary · Detailed Codebase Findings (by area, file:line, snippets) · Code References (table) · Architecture Insights (patterns, conventions, constraints) · External Research (with links) · Gap Analysis · MVP Suggestion · Implementation Options (2–3, with trade-offs) · Decision Points · Open Questions · Related Resources.
- If on `main`/pushed, convert file refs to GitHub permalinks: `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}`.

**DONE when:** doc saved with every required section populated, all findings carry file:line (or external links), gap analysis and an MVP path are stated, and the saved summary + scoping questions have been presented to the user.

## Handoff
Present a compact summary (vision · what exists w/ refs · architecture insights · external learnings · gap · MVP path) plus 1–3 scoping questions, each offering concrete options (e.g. "Option A leverages `code:line` vs Option B"). Then engage scoping: wait, ask follow-ups, and **research answerable questions instead of asking them** — do not move to planning until ambiguities resolve. Fold clarifications back into the doc under `## Scoping Clarifications [timestamp]`; spawn more research if needed.

When resolved, offer the next step:
1. Proceed to scope → `/spectre:scope` with `FROM_KICKOFF=true`, `KICKOFF_DOC={path}`, `SKIP_EXPLORATION=true`, + context summary.
2. Skip to planning → `/spectre:plan` with the kickoff doc as context.

## Escalate-If
- No project context supplied and none inferable → ask the user before researching.
- Research stays shallow / no file:line evidence after follow-ups → say so and present partial findings rather than fabricating depth.
- Scoping ambiguities can't be resolved by research → surface them as Open Questions; do not proceed to planning.

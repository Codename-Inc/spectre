---
name: caspar-rewrite-subagent
description: Rewrite Caspar subagent definitions into compact, contract-driven agents with clear routing, least-privilege tools, output schemas, and an auditable rewrite trail. Use when reviewing or rewriting `plugins/caspar/agents/*.md`, when the user asks to improve subagents/agent definitions, or when checking generated `plugins/caspar-codex/agents/*.toml`. Do not use for rewriting workflow skills; use `caspar-rewrite-skill` for `SKILL.md` compression.
---

# Caspar Subagent Rewrite

Rewrite one or more Caspar subagent definitions from broad persona prompts into focused worker contracts. Produce a reviewable proposal by default; apply changes to the live plugin only when the user explicitly asks.

## Inputs

- Target agent names from `$ARGUMENTS` (`finder`, `analyst`, `patterns`, `reviewer`, `tester`, `dev`, `web-research`) or explicit file paths.
- Source path: `plugins/caspar/agents/<agent>.md`.
- Generated Codex path: `plugins/caspar-codex/agents/<agent>.toml`.
- Mode:
  - `proposal` by default: write review artifacts only.
  - `apply` only if the user explicitly asks to update live definitions.

Assume cwd is the Caspar repo root. If no target is provided, ask which subagent to rewrite.

## Grounding

Read these before drafting:

1. `docs/tasks/main/research/subagent_definition_best_practices_053126.md` - subagent best practices and practitioner findings.
2. The source agent file(s) in full.
3. `scripts/translators/agents.cjs` only when applying or checking Codex TOML generation.
4. `docs/caspar-design-research.md` only if deciding whether a block is load-bearing or generic bloat.

Source of truth is `plugins/caspar/agents/*.md`; generated TOML is derived output.

## Procedure

### 1. Inventory The Agent

Record:

- `name`, `description`, `tools`, `codex_sandbox_mode`, `model`, and body line/token size.
- Whether the role is read-only, write-capable, or ambiguous.
- Current generated Codex `name`, `description`, `sandbox_mode`, and `developer_instructions` if present.
- Known risks from the research doc: chatty description, write access on read-only role, generic capability catalog, mandatory artifact writes, missing return contract, or context-sharing assumptions.

### 2. Classify The Role

Choose one primary role and make the rewrite fit it:

- `locator`: finds files/areas; returns grouped paths only.
- `analyst`: explains how code works; returns cited implementation facts.
- `pattern-miner`: finds reusable examples; returns 2-5 examples and recommendation.
- `reviewer`: identifies risks/findings; returns severity-ranked findings first.
- `tester`: writes or verifies tests; decide whether it is write-capable or read-only.
- `implementer`: writes code; may edit files and run commands.
- `web-briefer`: verifies current/third-party facts; returns sourced findings.

If a source agent mixes roles, flag the split decision instead of silently broadening it.

### 3. Block Triage

Walk the source top to bottom. For each block, assign one verdict:

- `KEEP`: changes behavior measurably.
- `CUT`: persona filler, generic expertise, tutorials, marketing, jokes, or capability catalogs the model already knows.
- `CONTRACT`: restate as mission, inputs, boundaries, method, or return contract.
- `PERMISSION`: move to tools/sandbox/model decision.
- `REFERENCE`: preserve only by linking to an existing reference doc.

Keep specifics that define behavior: routing triggers, scope boundaries, least-privilege tools, citations, exact output schema, empty-result behavior, verification commands, artifact paths, and "do not write" constraints.

### 4. Draft The Agent Contract

Use this shape unless the existing agent has a stronger local convention:

```markdown
---
name: <agent>
description: <one or two sentences: trigger, boundary, return type>
tools: <least-privilege tool list>
codex_sandbox_mode: <read-only|workspace-write>
model: <model if intentionally set>
---

You are a focused <role>. <One sentence mission.>

## Mission
<What this agent produces, not a broad capability list.>

## Inputs Expected
- <files/diff/range/task/error/source constraints expected from parent>

## Boundaries
- <what to do>
- <what not to do, especially write/no-write and no nested delegation>

## Method
- <only role-specific heuristics and failure-mode guards>

## Return Contract
<compact schema; include citations, uncertainty, empty-result behavior, and max summary size if useful>
```

Description rules:

- Put all trigger and "do not use when" information in the frontmatter description.
- Be specific, not long.
- Remove jokes, sales language, and second-person coaching.

Tool rules:

- Read-only roles default to `Read, Grep, Glob, LS` and `codex_sandbox_mode: read-only`.
- Web research adds web tools only.
- Implementers/test authors may use write/edit/bash and workspace-write.
- If a role sometimes writes and sometimes verifies, flag whether to split it.

Return rules:

- Require compact, structured output.
- Require `file:line` for code claims.
- Require links/version/date notes for web claims.
- State what to return when no findings or no matches are found.

### 5. Write The Observability Trail

In proposal mode, write one artifact per agent:

`docs/tasks/caspar-light/proposals/agents/<agent>.rewrite.md`

Create the directory if needed. The artifact must contain:

1. `# Subagent Rewrite Proposal: <agent>`
2. `## Inventory`
3. `## Role Classification`
4. `## Block Triage` with `| source block | verdict | reason |`
5. `## Permission Decision`
6. `## Proposed Agent Definition` as a fenced Markdown block
7. `## Stripped Block Ledger` with `| stripped block | this prevented/claimed | replacement |`
8. `## Load-Bearing Coverage` with `| item | where it lives now |`
9. `## Self-Check`
10. `## Open Questions`

Do not overwrite live agent files in proposal mode.

### 6. Apply Only On Explicit Request

When applying:

1. Edit only `plugins/caspar/agents/<agent>.md` source files.
2. Regenerate Codex output with `npm run sync-codex`.
3. Verify generated output with `npm run sync-codex -- --check --quiet`.
4. Run targeted tests if translator/config behavior changed; otherwise run the smallest relevant verification.
5. Do not hand-edit `plugins/caspar-codex/agents/*.toml` except to inspect diffs.

## Self-Check

For each rewritten agent, report pass/fail:

- Description names trigger, boundary, and return type.
- Body has Mission, Inputs Expected, Boundaries, Method, Return Contract.
- Read-only roles have no `Write`, `Edit`, or `Bash`, and use `codex_sandbox_mode: read-only`.
- Write-capable roles justify write access.
- No generic capability catalog remains.
- No casual/promotional language remains.
- No nested subagent delegation is requested.
- Claims require citations or source links as appropriate.
- Empty-result behavior is specified.
- Generated Codex TOML matches source when apply mode was used.

## Output To User

Return:

1. Files written or changed.
2. Key rewrite decisions, especially permissions and role splits.
3. Self-check result.
4. Open questions that need human review before applying.

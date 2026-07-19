---
name: "spectre-guide"
description: "Use when rendering the Next Steps footer at the end of any spectre command, suggesting which spectre command to run next, or answering \"what command should I run?\" / \"how does the workflow work?\". Do NOT use mid-task or for executing a phase — this only renders guidance and the footer."
user-invocable: false
---

# Spectre Guide

Renders the **Next Steps footer** after a command and answers which spectre command to run next. Routing + a fixed footer format only — not a tutorial.

## Inputs

- Current phase + status (what command just ran, blocked or not).
- The command roster (below) — grounds every suggestion.

## Working Set

Read just-in-time, never inline: the phase the caller is in and any blockers. Suggestions are drawn only from the roster below.

## Outputs + DONE

A Next Steps footer appended to command output. **DONE when:**
- Footer states **Phase · Status · Next** (one concise recommendation) + up to 5 **Options**.
- Every option is either a real `/spectre:` command from the roster or a non-slash manual action.
- Suggestions match the current stage; no command is invented.

## Method / guardrails

Footer shape (plain text, no ASCII box):

```
Next Steps — Phase: {phase} | Status: {status}
Next: {1–2 line recommendation}
Options:
- /spectre:{command} — {why}            # up to 5 total
- {manual action} — {why}              # max 2 non-slash actions
Reply: {only if a textual reply is expected}
```

Rules (load-bearing):
- **Status** is exactly one of: `Active` · `Pending Input` · `Blocked` · `On Hold` · `Complete`.
- Max **5 options**, max **2 manual** (non-slash) actions.
- Slash commands use the full **`/spectre:`** prefix; manual actions carry no prefix.
- **Never invent a command** — suggest only roster entries. Only suggest commands that fit the current stage.

Command roster (S→P→E→C→R + standalone utilities):

| Command | When |
|---|---|
| `/spectre:scope` | start a feature — IN/OUT boundaries |
| `/spectre:ux` | UI-heavy — flows, components, states (after scope) |
| `/spectre:plan` | scope ready — research + route by complexity |
| `/spectre:create_plan` | complex work needing architecture first |
| `/spectre:create_tasks` | plan ready → concrete tasks |
| `/spectre:plan_review` | sanity-check a plan before task generation |
| `/spectre:task_review` | comprehensive task-artifact translation check |
| `/spectre:execute` | execute.md + tasks.json exist — multi-agent parallel build |
| `/spectre:code_review` | implementation complete - adversarial opposing-model review |
| `/spectre:validate` | verify implementation against scope |
| `/spectre:create_test_guide` | manual QA checklist |
| `/spectre:clean` | meta cleanup — prune, test, sweep |
| `/spectre:prune` | dead-code/artifact cleanup only |
| `/spectre:test` | risk-aware test coverage (P0–P3) |
| `/spectre:rebase` | rebase onto target, prep merge |
| `/spectre:release` | bump/push a Spectre version and refresh local Codex install |
| `/spectre:fix` | structured debugging for tough bugs |

Workflow shorthand: **S**cope → **P**lan → **E**xecute → **C**lean → **R**ebase. `prune`, `test`, and `sweep` also run standalone; order is a default, not a requirement.

## Handoff

The footer is the transition point — it tells the user/agent the next phase. Other spectre skills inline this same one-line Next-Steps convention at their close (no cross-skill reference to this skill).

## Escalate-If

- The current phase has no sensible next command (e.g. blocked on external input) → set Status `Blocked`/`Pending Input` and put the needed input in **Reply**, not a guessed command.

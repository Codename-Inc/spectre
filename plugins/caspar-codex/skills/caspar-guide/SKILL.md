---
name: "caspar-guide"
description: "Use when rendering the Next Steps footer at the end of any caspar command, suggesting which caspar command to run next, or answering \"what command should I run?\" / \"how does the workflow work?\". Do NOT use mid-task or for executing a phase — this only renders guidance and the footer."
user-invocable: false
---

# Caspar Guide

Renders the **Next Steps footer** after a command and answers which caspar command to run next. Routing + a fixed footer format only — not a tutorial.

## Inputs

- Current phase + status (what command just ran, blocked or not).
- The command roster (below) — grounds every suggestion.

## Working Set

Read just-in-time, never inline: the phase the caller is in and any blockers. Suggestions are drawn only from the roster below.

## Outputs + DONE

A Next Steps footer appended to command output. **DONE when:**
- Footer states **Phase · Status · Next** (one concise recommendation) + up to 5 **Options**.
- Every option is either a real `/caspar:` command from the roster or a non-slash manual action.
- Suggestions match the current stage; no command is invented.

## Method / guardrails

Footer shape (plain text, no ASCII box):

```
Next Steps — Phase: {phase} | Status: {status}
Next: {1–2 line recommendation}
Options:
- /caspar:{command} — {why}            # up to 5 total
- {manual action} — {why}              # max 2 non-slash actions
Reply: {only if a textual reply is expected}
```

Rules (load-bearing):
- **Status** is exactly one of: `Active` · `Pending Input` · `Blocked` · `On Hold` · `Complete`.
- Max **5 options**, max **2 manual** (non-slash) actions.
- Slash commands use the full **`/caspar:`** prefix; manual actions carry no prefix.
- **Never invent a command** — suggest only roster entries. Only suggest commands that fit the current stage.

Command roster (S→P→E→C→R + standalone utilities):

| Command | When |
|---|---|
| `caspar-scope` | start a feature — IN/OUT boundaries |
| `caspar-ux` | UI-heavy — flows, components, states (after scope) |
| `caspar-plan` | scope ready — research + route by complexity |
| `caspar-create_plan` | complex work needing architecture first |
| `caspar-create_tasks` | plan ready → concrete tasks |
| `caspar-plan_review` | sanity-check a plan before task generation |
| `caspar-task_review` | comprehensive task-artifact translation check |
| `caspar-execute` | execute.md + tasks.json exist — multi-agent parallel build |
| `caspar-code_review` | implementation complete - adversarial opposing-model review |
| `caspar-validate` | verify implementation against scope |
| `caspar-create_test_guide` | manual QA checklist |
| `caspar-clean` | meta cleanup — prune, test, sweep |
| `caspar-prune` | dead-code/artifact cleanup only |
| `caspar-test` | risk-aware test coverage (P0–P3) |
| `caspar-rebase` | rebase onto target, prep merge |
| `caspar-release` | bump/push a Caspar version and refresh local Codex install |
| `caspar-fix` | structured debugging for tough bugs |

Workflow shorthand: **S**cope → **P**lan → **E**xecute → **C**lean → **R**ebase. `prune`, `test`, and `sweep` also run standalone; order is a default, not a requirement.

## Handoff

The footer is the transition point — it tells the user/agent the next phase. Other caspar skills inline this same one-line Next-Steps convention at their close (no cross-skill reference to this skill).

## Escalate-If

- The current phase has no sensible next command (e.g. blocked on external input) → set Status `Blocked`/`Pending Input` and put the needed input in **Reply**, not a guessed command.

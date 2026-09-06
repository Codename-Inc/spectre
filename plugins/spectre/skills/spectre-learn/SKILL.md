---
name: "spectre-learn"
description: "Preserve consequential, evidenced project knowledge or a work account from this conversation. Use for /learn, a correction, or a request to summarize work; do not use for routine progress, unsupported hypotheses, personal preferences, or ordinary knowledge search."
user-invocable: true
disable-model-invocation: true
---

# learn

## Purpose

Make on-demand capture available without reviving knowledge-skill authoring, proposal gates, dossiers, or SessionStart output. `Skill(spectre-capture)` remains the only record-writing contract.

## Inputs

- `$ARGUMENTS` and the current conversation; bare invocation means review the conversation for consequential, evidenced knowledge.
- Explicit intent: an insight or correction targets maintained knowledge; `summarize this work` or a broad feature account targets a typed work record.
- The current project and any exact record/work identity already in context.

## Working Set

- Search metadata and exact verified loads needed to identify a maintained record or answer a stated work question.
- Current evidence. Investigate only missing material evidence; do not reconstruct a conversation or manufacture a durable fact.

## Outputs + DONE

- `Skill(spectre-capture)` returns a saved, updated, or no-op result. Report its record kind, exact ID, and outcome.
- A broad account always uses the seven-section work record form. No Learn output creates a knowledge skill, separate dossier, or SessionStart entry.
- DONE when qualifying evidence has reached Capture or bare Learn truthfully reports a no-op.

## Method / guardrails

1. Identify intent from the request. A bare request scans the conversation for accepted consequential decisions, verified reusable constraints, corrections, or confirmed blockers/resolutions. Routine progress and unsupported hypotheses are no-ops.
2. For an insight or correction, provide Capture the evidence and maintained-knowledge target. For work summary intent, provide the exact run/PR/candidate association and only truthful lifecycle facts.
3. Delegate search, exact loads, applicability, tags, deduplication, revisions, saving, conflict repair, and save outcomes to `Skill(spectre-capture)`. Already-authorized facts need no new proposal or approval loop.

## Handoff

Return the compact Capture result: `knowledge|work`, ID, and `saved|updated|no-op`. Surface conflicts with explicit user decisions and missing evidence.

## Escalate-If

The request requires an unverified durable claim, cannot identify an ambiguous work association, or conflicts with an explicit user decision.

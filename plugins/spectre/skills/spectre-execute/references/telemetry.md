# Execute workflow events

Load for structured `tasks.json` and plan-direct execution. Plan-direct passes its plan as `--source`, uses stable coarse-map workstream ids (`ws-<n>`) as task ids, and emits workstream-granularity events only. Source artifacts are immutable; the local workflow store is the sole lifecycle/progress authority.

## Start or resume

Run once after resolving the source artifact (`TASKS_JSON`, or `PLAN_SOURCE` in plan-direct mode) and `FEATURE_ROOT`:

```bash
spectre-workflow run start --source "$TASKS_JSON" --owner "$FINALIZATION_OWNER" --project-dir "$PROJECT_ROOT" --json
```

Keep returned `runId` as `RUN_ID` and `primaryActorId` as `PRIMARY_ACTOR_ID`. Start the `execute` stage. Start each phase and wave before its first work. Use stable idempotency keys from the run + boundary/task/attempt.

When routing is known, append `--provider "<provider>" --model "<primary-model>" --effort "<effort>"` to `run start`. Omit unknown values; never guess.

Telemetry is local supporting state, not acceptance truth. On an operational/lock/write failure, set `TELEMETRY_STATUS=degraded`, continue from the source definition plus current verified orchestration context, and report the exact coded failure. Never mutate the source to replace telemetry or include prompts, code, commands, or raw tool output in events.

For the optional Plan join, hash the full source artifact and run:

```bash
spectre-workflow plan match --feature-root "$FEATURE_ROOT" --artifact-hash "$PLAN_SOURCE_HASH" --project-dir "$PROJECT_ROOT" --json
```

The command reads the project-local Spectre store and returns exactly one matching `plan.completed` event by feature root plus artifact/source hash; retain its `planRunId` and `scopeHash`. Zero or multiple matches degrade only the join—never use recency, branch, lifecycle state, or a derived summary to guess.

## Resume after compaction

The store is the only progress record; source artifacts carry none. Recover it, never reconstruct it from memory or the working tree:

```bash
spectre-workflow run start --source "$TASKS_JSON" --project-dir "$PROJECT_ROOT" --json
spectre-workflow run status --run-id "$RUN_ID" --project-dir "$PROJECT_ROOT" --json
```

A matching active or blocked run returns `resumed: true` with the same `runId` and `primaryActorId`. `run status` then reports one status per task id.

| Reported | Trust rule |
|---|---|
| `completed` | Accepted against a passing verification gate. Do not redo. |
| `skipped` | Terminally excluded with a recorded reason. Do not redo. |
| `blocked` | A real blocker was recorded. Resolve or escalate; never treat as done. |
| `in_progress` | Dispatched, started, or submitted—**not** accepted. Assume nothing landed; re-dispatch. |
| `pending` | Never dispatched. Normal frontier work. |

Everything outside `completed` and `skipped` is redo-or-verify. A worker submission collapses to `in_progress` because it is never acceptance without a passing gate. If a re-dispatch is rejected with `INVALID_TASK_TRANSITION`, the log is ahead of your read; re-read and continue, never force the event.

## Dispatch and worker ownership

Emit the dispatch below; the store moves the selected parent and child tasks to `in_progress`. Never hand-write a status anywhere.

```bash
spectre-workflow agent dispatch --run-id "$RUN_ID" --actor-id "$PRIMARY_ACTOR_ID" --tasks "<comma-separated parent+subtask ids>" --attempt <N> --idempotency-key "dispatch:$RUN_ID:<batch>:<N>" --project-dir "$PROJECT_ROOT" --json
```

When routing is known, append `--provider "<provider>" --model "<worker-model>" --effort "<effort>"` to `agent dispatch`. Pass the returned `workerActorId`, `assignmentId`, exact task ids/attempt, recorded provider/model/effort, project root, and command name `spectre-workflow` inside `<workflow_telemetry>`. Omit unknown routing values; never guess. The worker:

1. emits `agent start`;
2. emits `task start` immediately before each assigned parent/subtask;
3. emits `task submit` after implementation and focused checks are ready;
4. emits `task block` for a genuine blocked assignment;
5. emits `agent finish` before its Completion Report.

Only a `repair-policy.md`-bounded follow-up may use `task start` and `task submit` with `PRIMARY_ACTOR_ID`; planned work always has a worker actor. A missing worker submission may be reconciled only from returned evidence by submitting as the primary with `--source-kind primary-reconciliation`; preserve the telemetry warning.

## Verification and acceptance

Start/finish waves and phases with their typed commands. After affected batch checks, record one compact verification gate with task ids and stable check ids; HEAD SHA is captured automatically:

```bash
spectre-workflow gate record --run-id "$RUN_ID" --actor-id "$PRIMARY_ACTOR_ID" --kind verification --status pass --tasks "<ids>" --checks "<stable-check-ids>" --wave-id "<wave>" --project-dir "$PROJECT_ROOT" --json
```

Emit `task complete` leaf-first using the passing gate event id; emit `task skip` with its source-owned reason. Never write either status to `tasks.json` or a plan. A failed check records a failed gate; repair and record a fresh gate rather than changing prior events.

Record intermediate/final review and proof results as `gate record --kind review|proof`. `--evidence` is optional and may reference only an existing canonical review/proof or product-owned test artifact; never create an artifact merely to satisfy a gate. For a human authority wait, emit `human-input require`, then `resolve` when answered.

## Finish

- Parent-owned: finish the run as `implementation_ready` only after every task is completed/skipped and wave gates are current.
- Self-owned: finish as `passed` only after every task is completed/skipped and a passing proof gate exists.
- Use `failed`, `blocked`, or `interrupted` honestly for terminal/error state; never manufacture a pass because telemetry is degraded.

Only after authoritative execution status is known, record one joined `plan.execution_outcome` for the matched Plan run, passing its artifact/source hash and this `RUN_ID`. For structured mode record actual parent workstreams, accepted parent+child task count, and completed wave count; for plan-direct record actual coarse-map workstreams, zero synthetic tasks, and executed wave count. Record the authoritative outcome status, proof and review result (`SKIPPED` when owner/routing omits one), and closed planning-surprise codes (`NONE` when empty). Verification, review, proof, and completion authority remain unchanged. A telemetry failure is degraded and never blocks delivery or changes the terminal status.

Include `RUN_ID`, event status (`complete|degraded`), and any reconciliation/degradation in the Execute handoff.

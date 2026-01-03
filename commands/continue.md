---
description: 👻 | Resume interrupted execute workflow - primary agent
---

# continue: Resume In-Progress Development Work

## Description
- **What** — Resume an interrupted `/spectre:execute` workflow by finding the task document, identifying remaining work, and continuing from where we left off
- **Outcome** — Seamless continuation of feature development through execution, code review, and validation

## Variables

### Dynamic Variables
- `task_doc_path`: Optional path to task document — (via ARGUMENTS: $ARGUMENTS)

### Static Variables
- `out_dir`: docs/active_tasks/{branch_name}

## ARGUMENTS Input

Optional: Path to task document if you want to specify explicitly.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/7) - Find Task Document

- **Action** — LocateTaskDoc: Find the task document to resume.
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - `OUT_DIR=docs/active_tasks/{branch_name}`
  - **If** ARGUMENTS provides a path → use that path
  - **Else** → search `{OUT_DIR}/specs/` and `{OUT_DIR}/` for files matching `*task*.md`

- **Action** — ResolveDocument:
  - **If** exactly 1 task document found → use it
  - **If** 0 or >1 task documents found → ask user:
    > **📂 Task document needed**
    >
    > Found {count} task documents in `{OUT_DIR}`:
    > {list files if any}
    >
    > Please provide the path to the task document you want to continue.
  - **Wait** for user response if needed

- **Action** — LoadDocuments: Read the identified task document.
  - Also check for and read scope doc (`*scope*.md`) in same directory
  - These provide context for the work

## Step (2/7) - Find Resume Point

- **Action** — IdentifyRemainingWork: Parse the task document.
  - Find all tasks marked `[ ]` (incomplete)
  - Find the first incomplete parent task — this is where we resume
  - Note any tasks marked `[x]` (already completed)

- **Action** — ConfirmResume: Brief status to user.
  > **📍 Resuming**: {first incomplete parent task title}
  >
  > Progress: {complete}/{total} parent tasks done
  >
  > Continuing execution...

## Primary Agent State

Throughout execution, maintain internal tracking of:
- **Task Adaptations**: List of all modifications made to future tasks (additions, modifications, removals, reorderings)
- **Adaptation Rationale**: Why each change was made and which completion report triggered it

This tracking will be included in the final summary report.

## Step (3/7) - Adaptive Wave Execution

- **Action** — ExecuteAdaptiveLoop: Complete the following execution loop until all tasks complete.

  **Adaptive Execution Loop:**

  1. **Dispatch Wave Subagents**: Launch parallel @coder subagents based on tasks document parallel execution strategy (waves)
     - Each subagent responsible for 1 parent task and its associated subtasks
     - Each subagent dispatched with critical information:
       - The parent task and sub-tasks it is responsible for
       - Completion report(s) from any subagents that its work depends on
         - Example: If Wave 2 Task 3 depends on Wave 1 Task 1, the Wave 2 Task 3 subagent should receive the Wave 1 Task 1 completion report
       - Instructions to run the `/spectre:tdd` slash command to execute on the parent task and sub-tasks
       - Instructions/reminder to return the completion report with **Implementation Insights** section when complete

  2. **Mark Wave Complete**: When a wave of @coder subagents complete their tasks and return completion reports
     - Use Write tool to mark corresponding tasks in tasks document as complete with `[x]`
     - Mark parent task: `- [x] 1.0 Parent Task Title`
     - Mark all completed sub-tasks: `- [x] 1.1 Sub-task description`

  3. **Reflect on Learnings**: Review completion reports from just-completed wave
     - Examine the **Implementation Insights** section from each completion report
     - Identify insights with 🟡/🟠/🔴 scope signals
     - **If** all signals are ⚪ (no impact) → proceed to step 5 (Identify Next Wave)
     - **Else** → proceed to step 4 (Task Adaptation)

  4. **Task Adaptation** *(only when triggered by step 3)*:

     **Adaptation Criteria** (must meet at least one to justify changes):
     - New dependency discovered that affects task ordering
     - Technical constraint makes planned approach infeasible
     - Implementation revealed missing sub-task(s) required for requirements compliance
     - Completed work obsoletes a planned task

     **Adaptation Actions**:
     - Modify affected future task descriptions with learned context
     - Add required sub-tasks with `[ADDED]` prefix and brief rationale
     - Mark obsoleted tasks with `[SKIPPED - reason]` instead of deleting
     - Reorder tasks if dependency graph changed
     - Update wave assignments if parallelization assumptions changed

     **Track Changes**: Add to your internal adaptation tracking:
     - Which wave triggered this adaptation
     - What specifically changed (task added/modified/skipped/reordered)
     - Why (link to specific insight from completion report)
     - Impact on remaining work

     **Guardrails** (prevent scope creep):
     - ❌ Do NOT add "nice-to-have" improvements discovered during implementation
     - ❌ Do NOT expand scope beyond original requirements
     - ❌ Do NOT refactor/optimize based on preferences
     - ❌ Do NOT add tasks for technical debt unless it blocks requirements
     - ✅ ONLY adapt when new information makes current plan incorrect or incomplete for delivering requirements

  5. **Identify Next Wave**: Determine next wave of subagents
     - Use the potentially-updated task list
     - Identify associated task/subtasks from tasks document
     - Gather relevant completion reports to share with next wave subagents
     - Return to step 1

  6. **Continue Wave Dispatch**: Continue to dispatch @coder agents in parallel waves until all tasks complete
     - **If** uncompleted tasks remain → return to step 1
     - **Else** → exit loop and continue to Step 4

## Step (4/7) - Code Review Loop

- **Action** — ExecuteCodeReviewLoop: Complete the following code review loop until no critical/high priority feedback remains.

  **Code Review Loop:**

  1. **Spawn Review Subagent**: Dispatch @coder subagent
     - Instruct subagent to run `/spectre:code_review` slash command
     - Target complete implementation for this feature
     - Wait for feedback report

  2. **Analyze Feedback**: Review code review findings
     - Identify critical and high priority items
     - **If** no critical/high priority feedback → exit loop and continue to Step 5
     - **Else** → proceed to address feedback

  3. **Address Feedback**: Dispatch parallel @coder subagents to address critical and high priority feedback
     - Launch subagents in parallel for independent feedback items
     - Wait for all subagents to report completion
     - Document changes made

  4. **Re-verify**: Return to step 1 for next code review iteration

## Step (5/7) - Validate Requirements

- **Action** — SpawnValidationAgent: Dispatch @independent-review-engineer subagent for requirement validation.
  - Instruct subagent to run `/spectre:validate` slash command
  - Pass tasks list so subagent knows which files to review
  - Wait for validation report
- **Action** — AddressFeedback: Review validation findings and address high priority gaps.
  - Identify high priority requirement gaps
  - **If** gaps exist → dispatch parallel @coder subagents to address feedback
  - **Else** → proceed to Step 6
  - Document all requirement gap resolutions

## Step (6/7) - Prepare for QA

- **Action** — GenerateTestGuide: Create manual test guide based on completed work.
  - Have @coder subagent run `/spectre:create_test_guide` slash command
  - Verify test guide covers all implemented functionality
  - Save to `{OUT_DIR}/test_guide.md`

## Step (7/7) - Respond to User

- **Action** — SummarizeCompletion: Generate comprehensive summary for user.
  - **Summary includes**:
    - All parent tasks completed with brief description
    - Number of waves executed in parallel
    - Code review iterations completed and final status
    - Requirement validation status
    - Test guide location and coverage
    - Known limitations or assumptions made
    - **Task Evolution Summary** *(new for adaptive execution)*
    - Recommended next steps
- **Action** — RenderTaskEvolutionSummary: Include the task adaptation details tracked during execution.

  **Task Evolution Summary format:**
  ```
  ## Task Evolution During Execution

  **Adaptations Made**: {count} task modifications across {wave_count} waves

  | Wave | Change | Rationale |
  |------|--------|-----------|
  | {#} | {Added/Modified/Skipped/Reordered}: {task description} | {Why - linked to implementation insight} |

  **Net Impact**: {Brief summary - e.g., "Added 2 sub-tasks for API compatibility, skipped 1 obsoleted task"}
  ```

  If no adaptations were made:
  ```
  ## Task Evolution During Execution

  **Adaptations Made**: None - original task plan executed as designed
  ```

- **Action** — ReadNextStepsGuide: Read `.claude/spectre/next_steps_guide.md` to source relevant next step options.
- **Action** — RenderFooter: End reply with single 60-column Next Steps footer using options from guide.

## Next Steps

**Footer format:**
```
╔══════════════════════════════════════════════════════════╗
║ NEXT STEPS                                               ║
╠══════════════════════════════════════════════════════════╣
║ 🧭 Phase: {phase} | 🟢 {status} | 🚧 {blockers}           ║
╟──────────────────────────────────────────────────────────╢
║ 🎯 Next — {concise recommendation; 1–2 lines max}         ║
║                                                          ║
║ ➡️ Options:                                              ║
║ - /create_pr — {why}                                      ║
║ - Run manual tests — {why}                                ║
║ - /handoff — {why}                                        ║
║   … up to 5 total; ≤2 manual                              ║
║                                                          ║
║ 💬 Reply — {only if textual reply expected}               ║
╚══════════════════════════════════════════════════════════╝
```

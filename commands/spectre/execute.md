---
description: 👻 | Adaptive Wave-Based Build -> Code_Review -> Validate Flow
---

# build_review_validate: Adaptive Task Execution with Quality Gates

## Description
- **What** — Execute tasks in parallel waves with reflection after each wave, adapting future tasks based on implementation learnings, then conduct code review and validate requirements compliance
- **Outcome** — Complete feature implementation with verified code quality and requirement coverage, with tasks that evolved intelligently based on what was learned during development

## Primary Agent State

Throughout execution, maintain internal tracking of:
- **Task Adaptations**: List of all modifications made to future tasks (additions, modifications, removals, reorderings)
- **Adaptation Rationale**: Why each change was made and which completion report triggered it

This tracking will be included in the final summary report.

## Step (1/5) - Adaptive Wave Execution

- **Action** — LoadTaskList: Read tasks document to understand wave-based execution strategy.
  - Locate `docs/active_tasks/{branch_name}/specs/tasks.md`, similarly named `tasks` document (e.g., `quick_tasks`), or the open Beads epic/tasks/subtasks for this Workspace
  - Review Parallel Execution Plan section for wave structure
  - Identify first wave of tasks
  - Locate the requirements source (PRD, plan doc, or other specification) for reference during adaptation decision
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
     - **Else** → exit loop and continue to Step 2

## Step (2/5) - Code Review Loop

- **Action** — ExecuteCodeReviewLoop: Complete the following code review loop until no critical/high priority feedback remains.

  **Code Review Loop:**

  1. **Spawn Review Subagent**: Dispatch @coder subagent
     - Instruct subagent to run `/spectre:code_review` slash command
     - Target complete implementation for this feature
     - Wait for feedback report

  2. **Analyze Feedback**: Review code review findings
     - Identify critical and high priority items
     - **If** no critical/high priority feedback → exit loop and continue to Step 3
     - **Else** → proceed to address feedback

  3. **Address Feedback**: Dispatch parallel @coder subagents to address critical and high priority feedback
     - Launch subagents in parallel for independent feedback items
     - Wait for all subagents to report completion
     - Document changes made

  4. **Re-verify**: Return to step 1 for next code review iteration

## Step (3/5) - Validate Requirements

- **Action** — SpawnValidationAgent: Dispatch @independent-review-engineer subagent for requirement validation.
  - Instruct subagent to run `/spectre:validate` slash command
  - Pass tasks list so subagent knows which files to review
  - Wait for validation report
- **Action** — AddressFeedback: Review validation findings and address high priority gaps.
  - Identify high priority requirement gaps
  - **If** gaps exist → dispatch parallel @coder subagents to address feedback
  - **Else** → proceed to Step 4
  - Document all requirement gap resolutions

## Step (4/5) - Prepare for QA

- **Action** — GenerateTestGuide: Create manual test guide based on completed work.
  - Have @coder subagent run `/spectre:create_test_guide` slash command
  - Verify test guide covers all implemented functionality
  - Save to `{OUT_DIR}/test_guide.md`

## Step (5/5) - Respond to User

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

## Success Criteria

**Step 1 - Adaptive Wave Execution**:
- [ ] Tasks document loaded and parallel execution plan reviewed
- [ ] Requirements source identified for adaptation decisions
- [ ] All waves identified with proper dependency mapping
- [ ] Parallel @coder subagents dispatched for each wave
- [ ] Completion reports with Implementation Insights received from all subagents
- [ ] `/tdd` slash command used for each parent task execution
- [ ] All completed tasks marked with `[x]` in tasks document
- [ ] Reflection performed after each wave completion
- [ ] Task adaptations made only when justified by adaptation criteria
- [ ] Adaptation guardrails respected (no scope creep)
- [ ] All adaptations tracked internally with rationale
- [ ] No tasks skipped or executed out of dependency order

**Step 2 - Code Review Loop**:
- [ ] Initial code review completed by @coder subagent
- [ ] Critical and high priority feedback identified
- [ ] Parallel @coder subagents dispatched to address feedback
- [ ] All critical/high priority items addressed
- [ ] Final code review shows no critical/high priority issues
- [ ] Code review iterations documented

**Step 3 - Validate Requirements**:
- [ ] @independent-review-engineer subagent dispatched with `/validate`
- [ ] Validation report received and reviewed
- [ ] High priority requirement gaps identified
- [ ] Parallel @coder subagents dispatched to address gaps (if needed)
- [ ] All high priority gaps addressed
- [ ] Requirement coverage verified

**Step 4 - Prepare for QA**:
- [ ] @coder subagent executed `/create_test_guide` successfully
- [ ] Test guide saved to correct location
- [ ] Test guide covers all implemented functionality

**Step 5 - Respond to User**:
- [ ] Comprehensive completion summary generated
- [ ] Summary includes all required components
- [ ] Task Evolution Summary included with all adaptations and rationale
- [ ] Next steps guide read and relevant options sourced for footer
- [ ] Footer rendered with appropriate next steps

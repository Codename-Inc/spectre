---
description: 👻 | Generate right-sized manual test guides - primary agent
---

# create_test_guide: Right-sized manual testing documentation

### Description
- Description — Generate appropriately scoped manual testing guides that validate completed work, highlight key risks, and keep quality efforts aligned with tas scope. Scale complexity to match change size.
- Desired Outcome — Feature-based testing guide with actionable checklists organized by user workflows, saved to `docs/tasks/{task_name}/testing/{task_name}_test_guide.md`.

## ARGUMENTS Input

Optional user input to seed this workflow.

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/3) - Analyze Context & Determine Testing Strategy

- **Action** — AssessScope: Analyze current task to understand changes and determine complexity.
  - Extract from task documentation: features/functionality added/modified/removed, technical stack/environment, user personas/use cases, integration points/dependencies
  - Process ARGUMENTS for specific focus areas (if provided)
  - **Change Complexity Assessment**:
    - **Simple**: Basic smoke tests, happy path validation, quick regression check of related features
    - **Medium**: Edge case testing, error handling validation, basic integration testing
    - **Complex**: Advanced user scenarios, performance considerations, cross-feature interactions, security implications
- **Action** — DetermineStrategy: Select required and optional sections based on complexity.
  - **Required Sections (Always)**:
    - Testing Overview (scope, environment, prerequisites)
    - Environment Setup (step-by-step setup and verification)
    - Core Test Cases (primary functionality validation)
    - Results Documentation (how to record and report findings)
  - **Optional Sections (Include Based on Relevance)**:
    - Known Issues & Limitations (if documented bugs/workarounds)
    - Rollback Procedures (high-risk changes/production deployments)
    - Performance Testing (changes affecting load times/resource usage)
    - Accessibility Testing (UI/UX changes)
    - Cross-Browser/Device Testing (frontend changes)
    - Data Validation Testing (changes affecting data handling)
    - Security Testing (authentication/permissions/data access changes)

## Step (2/3) - Generate Test Guide

- **Output Location** — DetermineOutputDir: Decide where to save artifacts for this workflow.
  - `branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)`
  - **If** user specifies `target_dir/path` → `OUT_DIR={that value}`
  - **Else** → `OUT_DIR=docs/tasks/{branch_name}`
  - `mkdir -p "OUT_DIR/testing"`
- **Action** — CreateGuide: Generate comprehensive testing guide with feature-based organization.
  - Save to `{OUT_DIR}/testing/{branch_name}_test_guide.md`
  - **Guiding Principles**:
    - Scale appropriately (CSS color change ≠ payment system)
    - Focus on risk (prioritize areas most likely to break or impact users)
    - Be practical (completable in reasonable timeframe)
    - Stay relevant (only include sections that add value)
  - **Primary Structure**: Organize by user workflows/features (not procedural sections)
  - **Feature-Based Format**:
    ```markdown
    ### 1. Feature Name (User Action/Context)
    - [ ] Step 1: Action to perform
    - [ ] Step 2: What to verify/expect
    - [ ] Step 3: Additional validation
    - [ ] Step 4: Edge case or error handling
    ```
  - **Content Standards**:
    - **Complete Scenarios**: Structure around complete scenarios (user workflows or technical capabilities); each section validates specific capability end-to-end
    - **Actionable Steps**: Each checkbox = complete action + verification pair (e.g., "Send POST to /api/users and verify 201 with user ID returned")
    - **Logical Grouping**: Group related test steps under scenarios (e.g., all "API Rate Limiting" aspects in one section)
    - **Appropriate Depth**: Scale complexity to match changes (simple UI updates need basic workflows; new features need comprehensive coverage)
  - **Formatting Requirements**:
    - Headers: Descriptive feature names explaining user goal
    - Steps: Combine action and expected result in each checkbox
    - Grouping: Organize related functionality under same feature section
    - Checkboxes: Use `[ ]` for progress tracking
    - Context: Include keyboard shortcuts, button names, UI elements in parentheses
    - Examples: Provide specific test data (branch names, file paths)
  - Write instructions clear enough for unfamiliar users; don't over-engineer for straightforward changes

## Step (3/3) - Deliver

- **Action** — PresentDelivery: Present guide with testing coverage summary.
  > **📋 Test Guide Created**
  >
  > **Location**: `docs/tasks/{task_name}/testing/{task_name}_test_guide.md`
  >
  > **Coverage**:
  > - {X} feature workflows/scenarios
  > - {Y} total test steps
  > - Estimated time: {Z} minutes
  >
  > **Testing Strategy**: {Simple/Medium/Complex} - {brief rationale}
  >
  > The guide is organized by user workflows with actionable checklists ready for execution.
- **Action** — RenderFooter: Render Next Steps footer using `@skill-spectre:spectre-next-steps` skill (contains format template and SPECTRE command options)

## Next Steps

See `@skill-spectre:spectre-next-steps` skill for footer format and command options.

## Success Criteria

- [ ] Output directory determined inline (`OUT_DIR`) using branch name or user-specified path
- [ ] Task context analyzed (features changed, stack, personas, integration points)
- [ ] ARGUMENTS processed for specific focus areas (if provided)
- [ ] Change complexity assessed (Simple/Medium/Complex)
- [ ] Testing strategy determined with required and optional sections identified
- [ ] Test guide created with feature-based organization
- [ ] Required sections included (Overview, Setup, Core Tests, Results)
- [ ] Optional sections evaluated and included based on relevance
- [ ] Tests organized by user workflows/features with descriptive headers
- [ ] Steps combine actions with expected results using checklist format
- [ ] Related functionality logically grouped under coherent scenarios
- [ ] Keyboard shortcuts and UI elements included as relevant
- [ ] Guide complexity scaled appropriately to change size
- [ ] Instructions clear enough for unfamiliar users
- [ ] Guide saved to `{OUT_DIR}/testing/{branch_name}_test_guide.md`
 
- [ ] Testing coverage summary presented to user
- [ ] Next steps guide read and relevant options sourced for footer

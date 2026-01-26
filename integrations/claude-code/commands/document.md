---
description: 👻 | Generate agent-ready feature documentation - primary agent
---

# feature_doc: Capture delivered feature for future agent orientation

## Description
- **What** — Generate concise, location-first documentation from delivered work
- **Outcome** — `specs/{branch_name}/{feature_name}_documentation.md` that orients future agents in <3 tool calls

## Variables

### Dynamic Variables
- `feature_name`: Feature identifier — (via ARGUMENTS: $ARGUMENTS)

### Static Variables
- `out_dir`: specs/{branch_name}

## ARGUMENTS Input

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step (1/3) - Gather Delivered Work (Single Bash Call)

- **Action** — GatherContext: Run ONE bash command to get all context:

```bash
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
mkdir -p "specs/${branch}"
cat << EOF
{
  "branch": "$branch",
  "beads": $(bd list --label "$branch" --json 2>/dev/null || echo '[]')
}
EOF
```

- **Output**: JSON with `branch` and `beads` array
- **Side effect**: Creates `specs/{branch}/` directory
- **Then**:
  - **If** ARGUMENTS empty → `feature_name={branch}`
  - **Else** → `feature_name={ARGUMENTS}`
  - Filter beads to closed/completed tasks
- **Action** — IdentifyKeyFiles: From agent context + git diff, identify:
  - Primary implementation files (max 5)
  - Entry point files for common tasks
  - Test files
  - Config changes

## Step (2/3) - Extract Architecture Decisions

- **Action** — ScanForDecisions: Review completed Beads tasks and code for:
  - **Choices made**: What approach was taken over alternatives?
  - **Why**: 1-sentence rationale per choice
  - **Constraints**: What NOT to do / gotchas discovered
- **Action** — MapCommonTasks: Identify 3-5 likely future tasks and their entry points
  - Format: `| Task | Start Here |` table

## Step (3/3) - Write Feature Doc

- **Action** — WriteDoc: Create `specs/{branch}/{feature_name}_documentation.md`
  - Note: Output dir already created in Step 1

**Template:**
```markdown
# Feature: {feature_name}

## Overview
{2-3 sentences: what problem solved, high-level approach}

## Key Files
- `path/to/main.ts` - {3-5 word description}
- `path/to/routes.ts` - {description}
- `path/to/Component.tsx` - {description}
- `tests/feature.test.ts` - Test coverage

## Architecture Decisions
- **Choice**: {what was chosen}
  - **Why**: {1 sentence}
- **Choice**: {another choice}
  - **Why**: {1 sentence}

## Common Tasks
| Task | Start Here |
|------|------------|
| {likely task 1} | `path/file.ts:functionName()` |
| {likely task 2} | `path/other.ts` |

## Gotchas / Constraints
- {thing to avoid or be aware of}
- {ordering dependency or edge case}

## Delivered Tasks (Beads)
- [x] {task_title} (`{bd_id}`)
- [x] {task_title} (`{bd_id}`)

## Related
- {link to spec if exists}
- {link to related feature docs}
```

- **Action** — Respond: Confirm doc created with path

## Success Criteria

**Performance**:
- [ ] **1 Bash call**: Context gathered + directory created
- [ ] **1 Write call**: Documentation saved

**Step 1 - Gather**:
- [ ] Feature name determined from ARGUMENTS or branch
- [ ] Beads tasks fetched for workspace (JSON output)
- [ ] Output directory created as side effect
- [ ] Key files identified (max 5 primary + tests)

**Step 2 - Extract**:
- [ ] At least 2 architecture decisions documented with rationale
- [ ] Common tasks table has 3-5 entries with file:line references

**Step 3 - Write**:
- [ ] Doc written to `specs/{branch}/{feature_name}_documentation.md`
- [ ] All template sections populated
- [ ] Delivered Beads tasks listed with IDs
- [ ] User notified with file path

---
description: 👻 | Independent LLM Code Review - subagent
---

# code_review: Comprehensive Code Analysis

Conduct thorough code analysis covering quality, security, and production readiness. Output: severity-categorized findings (CRITICAL/HIGH/MEDIUM/LOW), scores, prioritized action plan saved to review file.

## ARGUMENTS

<ARGUMENTS>
$ARGUMENTS
</ARGUMENTS>

## Step 1: Define Review Scope

- **Action** — ProcessGuidance: If ARGUMENTS provided, acknowledge and confirm focus areas with user.
- **Action** — SpecifyScope: Define scope from completed work and modified files.

**Scope Template** (adapt source: `tasks.md` | `plan.md` | ad-hoc):
| Field | Content |
|-------|---------|
| Work Completed | Specific tasks/features from source doc |
| Files Modified | `path` (created\|modified\|deleted - purpose) |
| Related Files | `path` (imports\|tests\|config) |
| Requirements | From tasks.md, plan.md, PRD, or user request |

- **Action** — ExtractWorkContext: Extract requirements from appropriate source (tasks.md → plan.md → PRD → user comms).

## Step 2: Dispatch Review Agent

- **Action** — GenerateReviewPrompt: Create prompt replacing bracketed placeholders:

---

### Independent Code Review Agent Prompt

**Work Completed**: [from scope template]
**Files Modified/Created**: [list with purposes]
**Related Files**: [dependencies, tests, config]
**Requirements**: [acceptance criteria for completed work]
**Docs**: `docs/tasks/{task_name}/` - note which exist (task_summary, plan, tasks)

---

#### Phase 1: Context & Scope Boundaries

1. Read task docs in `docs/tasks/{task_name}/`
2. Identify code scope from task documentation
3. Establish boundaries:

**IN SCOPE**: Work listed above + files listed + their explicit requirements
**OUT OF SCOPE**: Incomplete work, future plans, unrelated best practices, enhancements beyond requirements

**Rule**: Only flag issues preventing delivery of listed work. DO NOT flag missing features from other work or suggest improvements beyond requirements.

---

#### Phase 2: Comprehensive Review

**Severity Scale**: CRITICAL (blocks deploy, security vulns) → HIGH (maintainability, core functionality) → MEDIUM (quality, coverage) → LOW (docs, polish)

**Review Categories**:

| Category | Focus Areas | Severity |
|----------|-------------|----------|
| Foundation | Syntax, imports, build config | CRITICAL |
| Structure | File/class organization, module boundaries | HIGH |
| Completeness | Stubs, TODOs, missing tests | HIGH |
| Logic | Off-by-one, null handling, condition errors | CRITICAL |
| Security | Injection (SQL/XSS/command), auth/authz, data exposure, secrets | CRITICAL |
| Error Handling | Graceful degradation, user messages | HIGH |
| Tests | Coverage, boundary cases, flaky patterns | MEDIUM |
| Performance | O(n²) loops, N+1 queries, blocking I/O | HIGH/MEDIUM |
| Resources | Memory leaks, unclosed handles | HIGH |
| Config | CVEs, security headers, logging | MEDIUM |
| Documentation | README, comments, API docs | LOW |
| Polish | Dead code, debug prints | LOW |

---

#### Phase 3: Output

**Report Structure**:
1. Scope validation (work parsed, files identified, boundaries confirmed)
2. Context summary
3. Files reviewed
4. Assessment (readiness, security posture, risk)
5. Findings by severity: `[File:Line]` **Category**: Description + fix
6. Scores (0-10): Security | Logic | Quality | Production Readiness
7. Prioritized action plan

**Save to**: `docs/tasks/{task_name}/reviews/comprehensive_code_review.md` (use timestamped variant if exists)

**Response**: Summary of HIGH+ items only, point to file. Do not perform fixes.

**Note**: Early-stage startup seeking PMF. YAGNI + SOLID + KISS + DRY. No over-engineering.

---

- **Action** — DispatchAgent: Deploy `@spectre:reviewer` with prompt above.

## Step 3: Process & Present

- **Action** — CollectReview: Receive comprehensive report, verify all categories covered.
- **Action** — ProcessFindings: Prioritize by severity (CRITICAL → HIGH → MEDIUM → LOW), group related fixes.
- **Action** — PresentSummary:

> **🔍 Code Review Complete**
>
> **Assessment**: [headline on readiness/risk]
> **Report**: `{REVIEW_FILE}`
>
> **Findings** (numbered for selection):
> 🚨 CRITICAL: [numbered list with file:line, impact, fix]
> 🔥 HIGH: [numbered list with file:line, impact]
> ⚠️ MEDIUM: [numbered list]
> 💡 LOW: [numbered list]

## Step 4: Handoff

- **Action** — RenderFooter: Render Next Steps using `@skill-spectre:spectre` skill.

## Output Location

```bash
branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
OUT_DIR=${target_dir:-docs/tasks/$branch_name}
mkdir -p "$OUT_DIR/reviews"
```

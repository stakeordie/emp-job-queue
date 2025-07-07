# TodoWrite ↔ MASTER_PLAN.md Sync Workflow

## Overview
This document outlines the workflow for keeping MASTER_PLAN.md synchronized with TodoWrite to ensure MASTER_PLAN.md remains the source of truth across Claude sessions.

## Key Principle
**MASTER_PLAN.md is the persistent source of truth** - TodoWrite is temporary and only exists during a Claude session.

## Sync Rules

### 1. When Starting a Claude Session
- Read MASTER_PLAN.md first
- Use TodoWrite to create tasks based on MASTER_PLAN.md status
- Only include tasks that are NOT_STARTED or IN_PROGRESS

### 2. When Marking Tasks in TodoWrite

#### Task Status Changes
When changing a task status in TodoWrite:
- `pending` → `in_progress`: Update MASTER_PLAN.md status to IN_PROGRESS
- `in_progress` → `completed`: Update MASTER_PLAN.md status to COMPLETED

#### Subtask Completion
When completing subtasks:
- Mark the checkbox in MASTER_PLAN.md: `- [ ]` → `- [x]`
- Update the parent task progress if all subtasks are done

### 3. Sync Points

Always sync MASTER_PLAN.md when:
1. **Starting work on a task** - Mark as IN_PROGRESS
2. **Completing a subtask** - Check the box
3. **Completing a task** - Mark as COMPLETED
4. **Before ending session** - Final sync of all changes

### 4. Example Workflow

```bash
# 1. Start session - read current state
Read MASTER_PLAN.md

# 2. Create TodoWrite tasks from MASTER_PLAN.md
TodoWrite: Create tasks for NOT_STARTED and IN_PROGRESS items

# 3. Work on a task
TodoWrite: Mark "Implement JobBroker" as in_progress
MASTER_PLAN.md: Update status to IN_PROGRESS

# 4. Complete a subtask
Complete: "Create RedisJobBroker class"
MASTER_PLAN.md: Check the box for this subtask

# 5. Complete the task
TodoWrite: Mark "Implement JobBroker" as completed
MASTER_PLAN.md: Update status to COMPLETED, ensure all subtasks checked

# 6. Before ending session
Review TodoWrite completed items
Ensure all are reflected in MASTER_PLAN.md
```

### 5. Quick Checklist

Before marking a TodoWrite task as completed:
- [ ] Are all subtasks in MASTER_PLAN.md checked?
- [ ] Is the task status in MASTER_PLAN.md updated to COMPLETED?
- [ ] Are any new discoveries or blockers documented?

Before ending a Claude session:
- [ ] Are all TodoWrite completed tasks reflected in MASTER_PLAN.md?
- [ ] Are all IN_PROGRESS tasks accurately marked in MASTER_PLAN.md?
- [ ] Is the "Next Priority" section updated for the next session?

### 6. Status Mapping

| TodoWrite Status | MASTER_PLAN.md Status |
|-----------------|----------------------|
| pending         | NOT_STARTED          |
| in_progress     | IN_PROGRESS          |
| completed       | COMPLETED            |

### 7. Important Notes

- **Never** mark a task as COMPLETED in MASTER_PLAN.md if subtasks remain unchecked
- **Always** update MASTER_PLAN.md immediately after TodoWrite changes
- **Document** any blockers or changes in scope in MASTER_PLAN.md notes
- **Preserve** the structure and formatting of MASTER_PLAN.md

## Automation Helper (Optional)

For manual verification, you can use these commands:

```bash
# Check for IN_PROGRESS tasks in MASTER_PLAN.md
grep -n "Status: IN_PROGRESS" MASTER_PLAN.md

# Check for unchecked subtasks
grep -n "- \[ \]" MASTER_PLAN.md

# Check for COMPLETED tasks that might have unchecked subtasks
awk '/Status: COMPLETED/ {task=$0} /- \[ \]/ {if (task) print task, $0}' MASTER_PLAN.md
```

Remember: MASTER_PLAN.md persists between sessions - TodoWrite does not!
# 📋 Task Management System

## Overview

This folder contains the complete task tracking system for the emp-job-queue project. It provides visibility into what's been done, what's in progress, and what's coming next.

## Structure

```
tasks/
├── README.md              # This file
├── ACTIVE_TASKS.md        # 🎯 Current work tracking (START HERE!)
├── CHANGELOG.md           # 📜 Historical record of completed work
├── project.md             # 📊 Monitor app specific project plan
├── notes_to_self.md       # 📝 Quick notes and reminders
│
├── backlog/               # 📥 Tasks ready to start
│   ├── monitor-event-integration-phase2.md
│   ├── build-worker-dashboard.md
│   └── ...
│
├── in_progress/           # 🚧 Tasks currently being worked on
│   └── (empty when no active work)
│
└── complete/              # ✅ Finished tasks archive
    ├── event-driven-monitor-system-phase1.md
    ├── monitor-app-setup.md
    └── ...
```

## How to Use

### For Quick Status
1. Open **ACTIVE_TASKS.md** - Shows current work with checkboxes
2. See live progress tracking and what's being worked on

### To Start New Work
1. Check ACTIVE_TASKS.md for the task pipeline
2. Move task file from `backlog/` to `in_progress/`
3. Update ACTIVE_TASKS.md with the new active task
4. Start checking off subtasks as you complete them

### To Complete Work
1. Check all boxes in ACTIVE_TASKS.md
2. Move task file from `in_progress/` to `complete/`
3. Update CHANGELOG.md with completion summary
4. Select next task from backlog

## Integration with Claude Code

Claude Code uses:
- **TodoWrite/TodoRead**: For real-time task tracking during sessions
- **ACTIVE_TASKS.md**: For persistent progress tracking
- **Task Files**: For detailed specifications and requirements
- **CHANGELOG.md**: For maintaining project history

## Task File Format

Each task file includes:
- **Status**: Current state (Pending/In Progress/Complete)
- **Description**: What needs to be done
- **Prerequisites**: What must be done first
- **Tasks**: Detailed checklist of work items
- **Success Criteria**: How to know when done
- **Files to Modify**: Specific code changes needed

## Best Practices

1. **One Active Task**: Focus on one major task at a time
2. **Update Frequently**: Check boxes as you complete subtasks
3. **Document Decisions**: Add notes about important choices
4. **Maintain History**: Update changelog for completed work
5. **Clear Communication**: Task status should be obvious at a glance

## Current Focus

Check **ACTIVE_TASKS.md** for what's being worked on right now!
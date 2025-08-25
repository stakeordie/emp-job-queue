# GitHub Project Management Setup: Tracking TODOs and Long-Term Planning

**Date**: 2025-08-25  
**Status**: Ready for Implementation  
**Priority**: High  

## Executive Summary

**Goal**: Set up GitHub's project management features to track TODOs, manage longer-term plans, and ensure completion visibility without changing the current direct-commit workflow.

**Key Focus Areas**:
- GitHub Projects for visual task tracking
- Issues for detailed planning and discussion
- Milestones for grouping related work
- Labels for categorization and priority
- Automation to reduce manual overhead

## Current State vs. Target State

### **Current State**
- Direct commits to master branch (keeping this)
- TODOs scattered across code comments and documentation
- No centralized tracking of longer-term initiatives
- Difficult to see what's been completed vs. pending

### **Target State** 
- Continue direct commits (no PR workflow change)
- GitHub Projects as central TODO dashboard
- Issues for planning and tracking
- Clear visibility of progress on initiatives
- Automated tracking of completions

## GitHub Projects Setup

### **1. Create Main Project Board**

#### **Project Name**: "EMP Job Queue - Development Tracker"

**Board Views**:
1. **Kanban Board** (Default)
   - Columns: Backlog → TODO → In Progress → Done → Archived
   - Automation: Move to Done when issue closes
   
2. **Roadmap View** 
   - Timeline of milestones and longer-term plans
   - Visual representation of major initiatives
   
3. **Table View**
   - Spreadsheet-like view for bulk operations
   - Custom fields for priority, effort, component

#### **Setup Steps**:
```bash
# Via GitHub CLI (gh)
gh project create --title "EMP Job Queue - Development Tracker" \
  --body "Central tracking for all development tasks and initiatives"

# Or via UI:
# 1. Go to github.com/your-org/emp-job-queue
# 2. Click Projects tab → New Project
# 3. Select "Board" template
# 4. Name it "EMP Job Queue - Development Tracker"
```

### **2. Configure Custom Fields**

Add these fields to track additional context:

```yaml
Priority:
  type: single_select
  options: [Critical, High, Medium, Low, Nice-to-have]

Component:
  type: single_select
  options: [API, Worker, Machine, Monitor, Core, Docs, Infrastructure]

Effort:
  type: single_select
  options: [XS (< 1hr), S (1-4hr), M (1 day), L (2-3 days), XL (1 week+)]

Initiative:
  type: single_select
  options: [Modernization, EmProps Integration, API Refactor, Cleanup, Bug Fix, Performance]

Status Detail:
  type: text
  description: Additional context about current status
```

### **3. Automation Rules**

Configure these automations in the project settings:

```yaml
Automations:
  - name: "Auto-add new issues"
    trigger: Issue created in repository
    action: Add to project in "Backlog" column

  - name: "Move to In Progress"
    trigger: Issue assigned
    action: Move to "In Progress" column

  - name: "Move to Done"
    trigger: Issue closed
    action: Move to "Done" column

  - name: "Archive old items"
    trigger: Item in Done for 30 days
    action: Archive item

  - name: "Flag stale items"
    trigger: Item in "In Progress" for 7+ days with no activity
    action: Add label "needs-attention"
```

## Issue Templates for Planning

### **1. Feature/Initiative Template**

Create `.github/ISSUE_TEMPLATE/feature-initiative.yml`:

```yaml
name: Feature/Initiative Planning
description: Plan a new feature or longer-term initiative
title: "[FEATURE] "
labels: ["enhancement", "planning"]
assignees: []
body:
  - type: markdown
    attributes:
      value: |
        ## Feature/Initiative Planning
        Use this template for planning new features or longer-term initiatives.

  - type: textarea
    id: overview
    attributes:
      label: Overview
      description: What are we building and why?
      placeholder: Describe the feature/initiative
    validations:
      required: true

  - type: textarea
    id: success-criteria
    attributes:
      label: Success Criteria
      description: How do we know when this is done?
      placeholder: |
        - [ ] Criteria 1
        - [ ] Criteria 2
        - [ ] Criteria 3
    validations:
      required: true

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - Critical
        - High
        - Medium
        - Low
        - Nice-to-have
    validations:
      required: true

  - type: dropdown
    id: effort
    attributes:
      label: Estimated Effort
      options:
        - XS (< 1hr)
        - S (1-4hr)
        - M (1 day)
        - L (2-3 days)
        - XL (1 week+)
    validations:
      required: false

  - type: textarea
    id: tasks
    attributes:
      label: Implementation Tasks
      description: Break down into specific tasks
      placeholder: |
        - [ ] Task 1
        - [ ] Task 2
        - [ ] Task 3
      value: |
        - [ ] 
    validations:
      required: false

  - type: textarea
    id: dependencies
    attributes:
      label: Dependencies
      description: What needs to be done first?
      placeholder: List any dependencies or blockers
    validations:
      required: false
```

### **2. TODO/Task Template**

Create `.github/ISSUE_TEMPLATE/todo-task.yml`:

```yaml
name: TODO/Task
description: Quick TODO or task that needs to be done
title: "[TODO] "
labels: ["todo"]
body:
  - type: markdown
    attributes:
      value: |
        ## Quick TODO/Task
        For smaller tasks that need tracking.

  - type: textarea
    id: task
    attributes:
      label: Task Description
      description: What needs to be done?
    validations:
      required: true

  - type: dropdown
    id: component
    attributes:
      label: Component
      options:
        - API
        - Worker
        - Machine
        - Monitor
        - Core
        - Docs
        - Infrastructure
        - Other
    validations:
      required: true

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - High
        - Medium
        - Low
    validations:
      required: true

  - type: textarea
    id: context
    attributes:
      label: Additional Context
      description: Any additional information
    validations:
      required: false
```

### **3. Bug Report Template** (already useful for tracking)

Create `.github/ISSUE_TEMPLATE/bug-report.yml`:

```yaml
name: Bug Report
description: Report a bug or issue
title: "[BUG] "
labels: ["bug"]
body:
  - type: textarea
    id: description
    attributes:
      label: Bug Description
      description: What's the problem?
    validations:
      required: true

  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      placeholder: |
        1. Step 1
        2. Step 2
        3. See error
    validations:
      required: false

  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - Critical (production down)
        - High (major feature broken)
        - Medium (feature impaired)
        - Low (minor issue)
    validations:
      required: true
```

## Milestones for Longer-Term Planning

### **Create Initial Milestones**

```bash
# Via GitHub CLI
gh milestone create --title "Phase 1: Modernization Foundation" \
  --description "Cleanup and basic refactoring" \
  --due-date 2025-09-08

gh milestone create --title "Phase 2: Service Separation" \
  --description "Extract JobService and WorkflowService" \
  --due-date 2025-09-15

gh milestone create --title "Phase 3: EmProps Integration" \
  --description "Integrate EmProps Open API into monorepo" \
  --due-date 2025-09-22

gh milestone create --title "Phase 4: Production Readiness" \
  --description "Testing, monitoring, and deployment" \
  --due-date 2025-09-29
```

### **Milestone Structure**

```markdown
Milestone: Phase 1 - Modernization Foundation
├── Issue #1: Remove unused files and dead code
├── Issue #2: Standardize logging across services
├── Issue #3: Fix TypeScript strict mode issues
├── Issue #4: Update dependencies
└── Issue #5: Create integration tests

Milestone: Phase 2 - Service Separation
├── Issue #6: Extract JobService from API
├── Issue #7: Extract WorkflowService from API
├── Issue #8: Implement message bus
└── Issue #9: Update all service integrations
```

## Label System for Organization

### **Standard Labels**

```yaml
Priority Labels:
  - priority:critical (red)
  - priority:high (orange)
  - priority:medium (yellow)
  - priority:low (green)

Type Labels:
  - type:feature (blue)
  - type:bug (red)
  - type:refactor (purple)
  - type:docs (gray)
  - type:cleanup (teal)
  - type:performance (orange)

Component Labels:
  - component:api (blue)
  - component:worker (green)
  - component:machine (purple)
  - component:monitor (yellow)
  - component:core (red)

Status Labels:
  - status:blocked (red)
  - status:needs-discussion (yellow)
  - status:ready (green)
  - status:in-progress (blue)
  - status:needs-attention (orange)

Initiative Labels:
  - initiative:modernization (purple)
  - initiative:emprops-integration (blue)
  - initiative:api-refactor (green)
```

### **Create Labels via Script**

```bash
# Save as create-labels.sh
#!/bin/bash

# Priority labels
gh label create "priority:critical" --color "FF0000" --description "Urgent - production impact"
gh label create "priority:high" --color "FF6B00" --description "Important - needs attention soon"
gh label create "priority:medium" --color "FFD700" --description "Normal priority"
gh label create "priority:low" --color "00FF00" --description "Nice to have"

# Type labels
gh label create "type:feature" --color "0052CC" --description "New feature or enhancement"
gh label create "type:bug" --color "FF0000" --description "Something isn't working"
gh label create "type:refactor" --color "9B59B6" --description "Code improvement"
gh label create "type:cleanup" --color "008080" --description "Code cleanup"

# Component labels
gh label create "component:api" --color "0052CC" --description "API service"
gh label create "component:worker" --color "00FF00" --description "Worker service"
gh label create "component:machine" --color "9B59B6" --description "Machine service"
# ... etc
```

## Workflow Integration

### **1. Daily TODO Management**

```markdown
## Morning Planning
1. Open GitHub Project board
2. Review "TODO" column
3. Move 2-3 items to "In Progress"
4. Assign to yourself

## During Development
1. Reference issue number in commits:
   ```bash
   git commit -m "fix: webhook persistence issue #42"
   ```
2. Update issue comments with progress
3. Move cards across board as status changes

## End of Day
1. Update "In Progress" items with status
2. Move completed items to "Done"
3. Add any new TODOs discovered during work
```

### **2. Weekly Planning**

```markdown
## Weekly Review Process
1. Review "Done" column - celebrate completions!
2. Archive completed items older than 2 weeks
3. Review "Backlog" - prioritize for next week
4. Check milestone progress
5. Create issues for any TODOs found in code/docs
```

### **3. Initiative Tracking**

```markdown
## For Longer-Term Plans
1. Create issue with feature-initiative template
2. Assign to appropriate milestone
3. Break down into smaller TODO issues
4. Link child issues to parent initiative
5. Track progress via milestone view
```

## Automation Scripts

### **1. Import Existing TODOs**

```javascript
// scripts/import-todos.js
const fs = require('fs');
const { execSync } = require('child_process');

// Find all TODO comments in code
const todos = execSync('grep -r "TODO:" --include="*.ts" --include="*.js" .')
  .toString()
  .split('\n')
  .filter(Boolean);

todos.forEach(todo => {
  const [file, ...rest] = todo.split(':');
  const description = rest.join(':').replace('// TODO:', '').trim();
  
  if (description) {
    const title = `[TODO] ${description.slice(0, 50)}...`;
    const body = `Found in: ${file}\n\nFull TODO: ${description}`;
    
    execSync(`gh issue create --title "${title}" --body "${body}" --label "todo,imported"`);
  }
});
```

### **2. Generate Progress Report**

```javascript
// scripts/progress-report.js
const { execSync } = require('child_process');

// Get issues closed this week
const closedIssues = JSON.parse(
  execSync('gh issue list --state closed --limit 100 --json number,title,closedAt')
);

const thisWeek = closedIssues.filter(issue => {
  const closedDate = new Date(issue.closedAt);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return closedDate > weekAgo;
});

console.log(`## Weekly Progress Report\n`);
console.log(`Completed ${thisWeek.length} items this week:\n`);
thisWeek.forEach(issue => {
  console.log(`- #${issue.number}: ${issue.title}`);
});
```

## Integration with Development Notes

### **Link Issues to Documentation**

When creating development notes (like the ones in `/10-development-notes/`):

1. Create corresponding GitHub issue
2. Reference issue in the document:
   ```markdown
   # Webhook Persistence Reliability Fix
   
   **GitHub Issue**: #42  
   **Date**: 2025-08-25  
   **Status**: In Progress
   ```

3. Update issue when implementation complete
4. Link to documentation in issue comments

## Benefits of This Approach

### **What You Get**
- ✅ **Central TODO tracking** without changing commit workflow
- ✅ **Visual progress** on longer-term initiatives via milestones
- ✅ **Searchable history** of decisions and implementations
- ✅ **Automated tracking** reduces manual overhead
- ✅ **Team visibility** if/when you add collaborators
- ✅ **Metrics** on velocity and completion rates

### **What You Keep**
- ✅ **Direct commits** to master (no PR overhead)
- ✅ **Fast development** workflow unchanged
- ✅ **Simple process** - just add issues and close them
- ✅ **Flexibility** - use as much or as little as needed

## Quick Start Checklist

### **Immediate Setup** (30 minutes)
- [ ] Create GitHub Project board
- [ ] Set up basic columns (Backlog, TODO, In Progress, Done)
- [ ] Create first 3 milestones for modernization phases
- [ ] Add issue templates to repository
- [ ] Create priority and type labels

### **First Week Usage**
- [ ] Create issues for current TODOs from code
- [ ] Create initiative issues for 3 major plans:
  - [ ] Modernization & Cleanup
  - [ ] API Service Refactor  
  - [ ] EmProps Integration
- [ ] Start referencing issue numbers in commits
- [ ] Move items across board daily

### **Ongoing Practices**
- [ ] Weekly review and planning session
- [ ] Monthly milestone review
- [ ] Quarterly roadmap update
- [ ] Archive completed items regularly

## Example Issues to Create First

### **Issue #1: Webhook Persistence Fix**
```markdown
Title: [BUG] Webhooks disappear when inactive
Labels: bug, priority:critical, component:core
Milestone: Phase 1: Modernization Foundation

## Problem
Users report webhooks disappearing from the system.

## Root Cause
refreshCache() only loads active webhooks, making inactive ones invisible.

## Solution
- [ ] Change refreshCache to load ALL webhooks
- [ ] Add consistency verification
- [ ] Add tests for inactive webhook visibility

## Success Criteria
- No more reports of disappeared webhooks
- Tests confirm inactive webhooks remain visible
```

### **Issue #2: API Service Refactor**
```markdown
Title: [FEATURE] Extract JobService and WorkflowService
Labels: type:refactor, priority:high, component:api
Milestone: Phase 2: Service Separation

## Overview
Separate monolithic API into domain services.

## Tasks
- [ ] Create JobService class
- [ ] Create WorkflowService class  
- [ ] Extract job-related endpoints
- [ ] Extract workflow endpoints
- [ ] Update service integrations
- [ ] Add integration tests

## Success Criteria
- Clean separation of concerns
- All tests passing
- No breaking changes to API
```

### **Issue #3: EmProps Integration Planning**
```markdown
Title: [FEATURE] Integrate EmProps Open API into monorepo
Labels: type:feature, priority:high, initiative:emprops-integration
Milestone: Phase 3: EmProps Integration

## Overview
Bring EmProps Open API service and PostgreSQL into the monorepo.

## Tasks
- [ ] Migrate from npm to pnpm
- [ ] Integrate Prisma setup
- [ ] Add to build pipeline
- [ ] Update Docker Compose
- [ ] Create unified development workflow
- [ ] Document integration points

## Dependencies
- API Service Refactor should be complete
- Cleanup phase should be done

## Success Criteria
- Single pnpm install sets up everything
- Unified development experience
- All services interconnected
```

---

*This GitHub Project Management setup provides the TODO tracking and longer-term planning visibility you need while keeping your fast, direct-commit workflow intact.*
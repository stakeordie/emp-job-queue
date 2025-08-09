# Prompt Engineering Tips

Based on our experiences with this codebase, here are effective patterns for prompting:

## General Principles

### 1. Provide Clear Context
❌ **Bad**: "Fix the worker"
✅ **Good**: "The worker is claiming multiple jobs simultaneously when it should only process one at a time. This started after we added simulation connectors."

### 2. Be Explicit About Constraints
❌ **Bad**: "Make it work with simulation"
✅ **Good**: "Make it work with simulation. Note: We're renaming SimulationConnector to SimulationHttpConnector because we'll add SimulationWebsocketConnector later"

### 3. Specify Desired Outcomes
❌ **Bad**: "Find the issues"
✅ **Good**: "Find the issues and provide:
1. List of all problems found
2. Root cause analysis for each
3. Proposed refactoring plan
4. Priority order for fixes"

### 4. Include Architecture Context
❌ **Bad**: "Debug the connector"
✅ **Good**: "Debug the connector. Architecture flow: BaseWorker → HttpConnector → SimulationHttpConnector → SimulationHTTPService"

## Effective Patterns

### For Debugging
```
I'm seeing [SYMPTOM].
Expected behavior: [WHAT SHOULD HAPPEN]
Actual behavior: [WHAT IS HAPPENING]
This started after: [RECENT CHANGES]
Please investigate and provide root cause analysis.
```

### For Architecture Reviews
```
Review [COMPONENT/SYSTEM] for:
- Architectural inconsistencies
- Technical debt
- Missing abstractions
- Race conditions
- Error handling gaps

Provide:
1. Issue list with severity
2. Root cause for each issue
3. Refactoring plan with priorities
```

### For Feature Implementation
```
Implement [FEATURE] that:
- [REQUIREMENT 1]
- [REQUIREMENT 2]

Constraints:
- Must work with existing [SYSTEM]
- Should follow pattern used in [SIMILAR FEATURE]
- Performance requirement: [METRIC]

Deliverables:
1. Implementation plan
2. Code changes
3. Test coverage
4. Documentation updates
```

### For Refactoring
```
Refactor [COMPONENT] to:
- Remove [SPECIFIC TECHNICAL DEBT]
- Improve [SPECIFIC QUALITY METRIC]
- Prepare for [FUTURE REQUIREMENT]

Current issues:
- [ISSUE 1]
- [ISSUE 2]

Success criteria:
- [MEASURABLE OUTCOME 1]
- [MEASURABLE OUTCOME 2]
```

## Anti-Patterns to Avoid

### 1. Vague Requests
❌ "Make it better"
❌ "Fix all the issues"
❌ "Optimize everything"

### 2. Missing Context
❌ "The worker doesn't work" (Which worker? What's not working?)
❌ "Jobs are stuck" (Where? In what state?)

### 3. Assumed Knowledge
❌ "Fix the obvious problem in the connector"
❌ "You know what needs to be done"

### 4. Multiple Unrelated Tasks
❌ "Fix the worker, update the UI, add logging, and optimize the database"
✅ Break into separate, focused requests

## Session Management

### Starting a Session
Provide:
- Current system state
- Recent changes
- What's working/not working
- Goal for this session

### Continuing a Session
Reference:
- Previous work done
- Current task in progress
- Any blockers discovered
- Next steps planned

### Ending a Session
Document:
- What was accomplished
- What's still pending
- Any new issues discovered
- Handoff notes for next session

## Examples of Excellent Prompts from This Project

### Example 1: Clear Problem Statement
> "okay so we are having issues with the simulation machine I noticed 2 things:
> 1. The workers always show up a Processing (blue flashing) instead of Idle (green) even when there are no jobs
> 2. The services don't seem to be starting when the machine connects based on the UI"

**Why it works**: Specific symptoms, clear observations, provides UI context

### Example 2: Architectural Clarity
> "What needs to work right now: BaseWorker -> HttpConnector -> SimulationHttpConnector -> SimulationHTTPService"

**Why it works**: Shows the exact flow, making the architecture crystal clear

### Example 3: Future-Proofing
> "I changed the SimulationConnector name to SimulationHttpConnector because we are going to add a SimulationWebsocketConnector"

**Why it works**: Explains the reasoning behind changes, preventing confusion
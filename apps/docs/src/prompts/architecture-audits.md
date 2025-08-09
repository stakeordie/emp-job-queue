# Architecture Audit Prompts

## 2025-08-08 - System Architecture Audit & Refactoring Plan

### Context
After multiple sessions fixing symptoms (workers showing wrong status, services not starting, jobs not completing), user recognized the need for a comprehensive architecture review rather than continuing with band-aid fixes.

### Original User Request
> "I want you to go through the entire machine/worker setup and find issues that could be problematic, I don't want to keep trying to solve symptoms. What needs to work right now: BaseWorker -> HttpConnector -> SimulationHttpConnector -> SimulationHTTPService. I changed the SimulationConnector name to SimulationHttpConnector because we are going to add a SimulationWebsocketConnector. The thing is we need this to all make total sense, any issues that seem hacked together or less than optimal should be raised. We will then come up with a plan to refactor."

### Refined Prompt

```markdown
**System Architecture Audit & Refactoring Plan Request**

I need you to perform a comprehensive audit of our entire machine/worker architecture. We've been fixing symptoms rather than root causes, and it's time to step back and identify all architectural issues.

**Current Architecture Path That Must Work:**
`BaseWorker` → `HttpConnector` → `SimulationHttpConnector` → `SimulationHTTPService`

**Key Changes:**
- `SimulationConnector` has been renamed to `SimulationHttpConnector` 
- We will be adding a `SimulationWebsocketConnector` in the future
- This naming convention needs to be consistent throughout

**Audit Scope:**
1. Review the entire worker/machine setup from end to end
2. Identify ALL issues that could be problematic:
   - Architectural inconsistencies
   - Hacked-together solutions
   - Suboptimal implementations
   - Code smell and technical debt
   - Naming inconsistencies
   - Missing abstractions or improper abstractions
   - Race conditions or concurrency issues
   - Error handling gaps

**Deliverables Needed:**
1. **Comprehensive Issue List**: Document every issue found, no matter how small
2. **Root Cause Analysis**: Identify why these issues exist (rushed implementation, legacy code, etc.)
3. **Refactoring Plan**: Propose a clean, logical architecture that:
   - Makes total sense architecturally
   - Follows consistent patterns
   - Is extensible for future connectors (WebSocket, gRPC, etc.)
   - Eliminates all hacks and workarounds
   - Provides clear separation of concerns

**Focus Areas:**
- Service discovery and registration
- Connector lifecycle management
- Job claiming and processing flow
- Status reporting and monitoring
- Error recovery and resilience
- Configuration management (check service-mapping.json)

Please don't just fix the immediate problem - I want a holistic view of what's wrong and a comprehensive plan to make this system production-ready and maintainable.
```

### Key Improvements in Refined Version
1. **Clear Structure**: Organized into logical sections with clear headers
2. **Specific Deliverables**: Listed exactly what outputs are expected
3. **Comprehensive Scope**: Expanded from vague "find issues" to specific categories
4. **Future-Proofing**: Mentioned extensibility for future connector types
5. **Context Setting**: Explained why (fixing symptoms vs root causes)
6. **Actionable**: Ends with clear request for holistic view and comprehensive plan

### Outcome
*To be documented after prompt execution*

### Lessons Learned
1. **Be Explicit About Deliverables**: Don't just ask to "find issues" - specify what format you want them in
2. **Provide Architecture Context**: Showing the component flow (`BaseWorker` → `HttpConnector` → etc.) helps establish the mental model
3. **Explain Recent Changes**: Mentioning the rename helps prevent confusion and ensures consistency
4. **Set Quality Bar**: Phrases like "production-ready and maintainable" establish the standard expected

### Related Sessions
- Previous: Multiple debugging sessions for worker status, service startup, job completion
- Next: *To be linked after execution*
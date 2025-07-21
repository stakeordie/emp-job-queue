# EmProps AI Backend - Planning Documents

This directory contains all planning, design, and implementation documentation for the EmProps AI Backend project.

## Directory Structure

### 📁 `/plans/` (Active Plans)
Current and ongoing planning documents that guide active development:

- **`NORTH_STAR_ARCHITECTURE.md`** - Strategic architecture direction and goals
- **`TESTING_PROCEDURES.md`** - Standard testing procedures and debugging workflows
- **`comfyui-job-handler.md`** - ComfyUI job processing implementation plan
- **`logging.md`** - Logging strategy and implementation
- **`test_plan_doc.md`** - Test planning documentation

### 📁 `/plans/completed/` (Completed Plans)
Implemented features and completed projects for historical reference:

- **`MONOREPO_REFACTOR_IMPLEMENTATION.md`** - ✅ Complete monorepo migration with environment management
- **`custom-nodes-integration-summary.md`** - ✅ Two-part custom nodes integration system
- **`emprops-message-compatibility-plan.md`** - ✅ EmProps WebSocket message format compatibility
- **`monitor-reliability-fix.md`** - ✅ Monitor data flow and reliability improvements
- **`websocket-debugging.md`** - ✅ WebSocket event system debugging and fixes
- **`BROADCAST_DIAGRAM.md`** - ✅ WebSocket broadcast architecture documentation
- **`MIGRATION_GUIDE.md`** - ✅ Migration procedures and guidelines
- **`COMFYUI_INSTALLATION_PLAN.md`** - ✅ ComfyUI installation strategy
- **`COMFYUI_MIGRATION_CHECKLIST.md`** - ✅ ComfyUI migration validation
- **`north-star-visualization-plan.md`** - ✅ North Star progress visualization implementation
- **`playwright-service-architecture.md`** - ✅ Playwright service design
- **`playwright-service-implementation.md`** - ✅ Playwright service implementation

## Usage Guidelines

### For Active Development
1. **Review active plans** in `/plans/` before starting new features
2. **Update plans** as implementation details change
3. **Move to completed** when features are fully implemented and tested
4. **Reference North Star** architecture for strategic alignment

### For Historical Reference
1. **Check completed plans** to understand implementation decisions
2. **Learn from past solutions** when facing similar challenges
3. **Understand evolution** of the system architecture

### Adding New Plans
1. Create new planning documents in `/plans/` (not `/plans/completed/`)
2. Use descriptive names that reflect the feature or problem being addressed
3. Include implementation status and strategic North Star alignment
4. Move to `/plans/completed/` when implementation is finished

## Related Documentation

- **Main Documentation**: `/apps/docs/src/` - User-facing documentation and guides
- **Architecture Documentation**: `/plans/NORTH_STAR_ARCHITECTURE.md` - Strategic direction
- **Changelog**: `/apps/docs/src/changelog.md` - Complete development history
- **Development Guide**: `/CLAUDE.md` - Development workflow and context

## Next Major Initiatives

Based on the North Star architecture, upcoming major planning initiatives include:

1. **Machine Type Configuration System** - Enable Fast Lane / Standard / Heavy pool specialization
2. **Predictive Model Management** - Replace Python asset downloader with TypeScript model intelligence
3. **Pool-Aware Job Routing** - Enhanced Redis functions for pool-specific job matching
4. **Elastic Scaling Optimization** - Dynamic machine pool management

---

*This directory is actively maintained as part of the EmProps AI Backend development workflow. All major features and system changes should have corresponding planning documentation.*
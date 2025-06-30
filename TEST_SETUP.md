# EmProps Job Queue - Test Orchestration Setup

## Quick Start Testing

### 1. Install Dependencies
```bash
pnpm install
```

### 2. VS Code Setup (Recommended)

#### Install Extensions
VS Code will automatically suggest the required extensions from `.vscode/extensions.json`:
- **Jest** (`orta.vscode-jest`) - Main test runner integration
- **Coverage Gutters** (`ryanluker.vscode-coverage-gutters`) - Visual coverage
- **ESLint** and **Prettier** - Code quality

#### Jest Extension Features
- ✅ **Run Individual Tests**: Click the play button next to test functions
- ✅ **Test Explorer**: View all tests in sidebar
- ✅ **Inline Results**: See test results directly in editor
- ✅ **Coverage Highlighting**: Green/red coverage indicators
- ✅ **Auto-run**: Tests run automatically on file save

### 3. Test Commands Reference

```bash
# 🎯 Development (Interactive)
pnpm test:watch              # Watch mode - reruns tests on changes
pnpm test:watch:all          # Watch all files (including dependencies)

# 📊 Coverage Analysis  
pnpm test:coverage           # Generate coverage report
pnpm test:coverage:open      # Generate + open HTML report in browser
pnpm test:coverage:watch     # Watch mode with coverage

# 🎯 Targeted Testing
pnpm test:unit               # Unit tests only (fast)
pnpm test:integration        # Integration tests (requires Redis)
pnpm test:e2e               # End-to-end tests (full system)

# 🔍 Selective Testing
pnpm test:changed            # Only test changed files
pnpm test:related            # Test files related to changed files

# 🐛 Debugging
pnpm test:debug              # Debug tests with Node inspector

# 🖥️ GUI Testing
pnpm test:gui                # Launch Majestic GUI (web interface)

# 🚀 CI/CD
pnpm test:ci                 # Full test suite for continuous integration
```

## Testing Workflows

### 1. **TDD Workflow** (Recommended for Core Logic)
```bash
# Terminal 1: Watch tests
pnpm test:watch

# Terminal 2: Development
pnpm dev

# In VS Code:
# - Write test first
# - Watch it fail (red)
# - Implement code
# - Watch it pass (green)
# - Refactor
```

### 2. **Coverage-Driven Development**
```bash
# Generate coverage report
pnpm test:coverage:open

# Focus on files with low coverage:
# - src/core/job-broker.ts (target: 95%)
# - src/core/message-handler.ts (target: 90%)
```

### 3. **Integration Testing**
```bash
# Start Redis (for integration tests)
docker run -d -p 6379:6379 redis:alpine

# Run integration tests
pnpm test:integration
```

### 4. **Full System E2E Testing**
```bash
# Start full system
pnpm docker:up:local

# Run E2E tests
pnpm test:e2e
```

## VS Code Testing Features

### Test Explorer
- **Location**: Activity Bar → Test icon
- **Features**: 
  - Tree view of all tests
  - Run/debug individual tests
  - Filter by status (failed, passed, skipped)

### Coverage Gutters
- **Activation**: `Cmd+Shift+P` → "Coverage Gutters: Display Coverage"
- **Features**:
  - Green lines: Covered
  - Red lines: Not covered
  - Yellow lines: Partially covered

### Debugging Tests
1. Set breakpoints in test or source code
2. Click "Debug" button next to test
3. Use VS Code debugger to step through code

## Majestic GUI Setup

### Launch Majestic
```bash
pnpm test:gui
```

### Features
- 🌐 **Web Interface**: Opens at `http://localhost:4000`
- 📊 **Visual Results**: Test results with graphs
- 🔍 **Test Filtering**: Filter by file, status, or name
- 📈 **Coverage View**: Visual coverage maps
- ⚡ **Real-time**: Auto-refreshes on file changes

## Test Infrastructure Overview

### Directory Structure
```
tests/
├── unit/                    # Fast, isolated tests
│   ├── core/
│   │   ├── job-broker.test.ts
│   │   └── message-handler.test.ts
│   └── ...
├── integration/            # Redis-dependent tests
│   ├── job-lifecycle.test.ts
│   └── setup.ts
├── e2e/                    # Full system tests
│   ├── full-system.test.ts
│   └── setup.ts
├── fixtures/               # Test data
│   ├── jobs.ts
│   └── workers.ts
├── utils/                  # Test utilities
│   └── redis-mock.ts
└── setup.ts               # Global test setup
```

### Test Categories

| Category | Speed | Dependencies | Coverage |
|----------|-------|--------------|----------|
| **Unit** | ⚡ Fast | Mocked | 95% (core logic) |
| **Integration** | 🐌 Medium | Real Redis | 90% |
| **E2E** | 🐌 Slow | Full System | 80% |

## Current Test Status

### ✅ Ready to Run
- Test infrastructure complete
- All test files created with comprehensive scenarios
- Redis mock system functional
- VS Code integration configured

### ⏳ Implementation Required
Tests are written but commented out because core classes don't exist yet:
- `JobBroker` class
- `MessageHandler` class
- Core job processing logic

### 🎯 Next Steps
1. **Implement core classes** to make tests pass
2. **Run `pnpm test:watch`** for TDD workflow
3. **Use VS Code Jest extension** for interactive development
4. **Generate coverage reports** to track progress

## Tips & Best Practices

### VS Code Tips
- **Quick Test Run**: `Cmd+Shift+P` → "Jest: Run All Tests"
- **Test This File**: `Cmd+Shift+P` → "Jest: Run Tests in Current File"
- **Toggle Coverage**: `Cmd+Shift+P` → "Coverage Gutters: Toggle Coverage"

### Performance Tips
- Use `test:unit` for fastest feedback during development
- Use `test:integration` only when testing Redis interactions
- Use `test:e2e` only for final system validation

### Debugging Tips
- Set breakpoints in both test and source code
- Use `console.log()` liberally during development
- Check coverage reports to find untested code paths

---

**Ready to start Test-Driven Development!** 🚀

The complete testing infrastructure is in place. Now we can implement the core job broker logic using TDD methodology.
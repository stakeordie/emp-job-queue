# Phase 1: Testing Infrastructure Implementation Guide

**Date**: 2025-08-26  
**Status**: Ready for Implementation  
**Priority**: Critical - Foundation  
**Timeline**: Days 1-5 (5 days)  
**Dependencies**: None (First Phase)

## 📋 Quick Navigation

- [Executive Summary](#executive-summary)
- [Research Findings](#research-findings-modern-testing-best-practices)
- [Current System Analysis](#current-system-analysis)
- [Implementation Architecture](#implementation-architecture)
- [Step-by-Step Implementation](#step-by-step-implementation)
- [Success Criteria](#success-criteria-and-validation)
- [Risk Mitigation](#risk-mitigation)

## Executive Summary

> **🎯 Mission**: Establish bulletproof testing foundation using Vitest for safe architectural modernization.

This guide provides detailed, step-by-step implementation instructions for Phase 1 of the unified modernization plan. Phase 1 establishes a comprehensive testing foundation using Vitest, which is **essential before making any architectural changes**. This safety net ensures all subsequent refactoring is backed by reliable tests.

### 🔄 Testing Strategy Flow

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["🚀 Start Phase 1"]) --> Foundation["📋 Testing Foundation Setup"]
    Foundation --> Environment["🐳 Docker Test Environment"]
    Environment --> Redis["📡 Redis Function Testing"]
    Redis --> API["🔌 API Integration Testing"]
    API --> E2E["🔄 End-to-End Testing"]
    E2E --> Validation["✅ Validation & Metrics"]
    Validation --> Complete(["🎉 Phase 1 Complete"])
    
    Foundation --> |"Day 1"| F1["Vitest Installation"]
    Foundation --> |"Day 1"| F2["Configuration Setup"]  
    Foundation --> |"Day 1"| F3["Package Scripts"]
    
    Environment --> |"Day 2"| E1["Docker Compose Test Stack"]
    Environment --> |"Day 2"| E2["Redis Test Instance"]
    Environment --> |"Day 2"| E3["Health Checks & Connectivity"]
    
    Redis --> |"Day 3"| R1["Job Matching Function Tests"]
    Redis --> |"Day 3"| R2["Job Lifecycle Tests"]
    Redis --> |"Day 3"| R3["Atomic Operations Tests"]
    
    API --> |"Day 4"| A1["Job Submission Endpoints"]
    API --> |"Day 4"| A2["Workflow Management"]
    API --> |"Day 4"| A3["WebSocket Events"]
    
    E2E --> |"Day 5"| E2E1["Complete Job Flows"]
    E2E --> |"Day 5"| E2E2["Multi-service Integration"]
    E2E --> |"Day 5"| E2E3["Error Scenarios"]
    
    Validation --> V1["Coverage Reports"]
    Validation --> V2["Performance Benchmarks"]
    Validation --> V3["CI/CD Integration"]
    API --> |"Day 4"| A2["Status Endpoints"]
    API --> |"Day 4"| A3["Workflow APIs"]
    
    E2E --> |"Day 5"| E2E1["Complete Workflows"]
    E2E --> |"Day 5"| E2E2["Performance Tests"]
    E2E --> |"Day 5"| E2E3["Load Testing"]
    
    classDef dayStyle fill:#e3f2fd
    classDef processStyle fill:#fff3e0
    classDef completeStyle fill:#e8f5e8
    
    class F1,F2,F3,E1,E2,E3,R1,R2,R3,A1,A2,A3,E2E1,E2E2,E2E3 dayStyle
    class Foundation,Environment,Redis,API,E2E processStyle
    class Start,Complete completeStyle
```

</FullscreenDiagram>

### 🎆 Key Deliverables

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph Foundation["📋 Testing Foundation"]
        Vitest["🧪 Vitest Infrastructure<br/>Monorepo Configuration"]
        Redis["📡 Redis Function Tests<br/>Job Matching Logic"]
        API["🔌 API Integration Tests<br/>HTTP Endpoints"]
        E2E["🔄 End-to-End Testing<br/>Complete Workflows"]
        MessageBus["📤 Message Bus Foundation<br/>Event-Driven Prep"]
    end
    
    subgraph Benefits["✅ Testing Benefits"]
        SafeRefactor["Safe Refactoring"]
        BugPrevention["Bug Prevention"]
        ConfidentChanges["Confident Changes"]
        RegressionProtection["Regression Protection"]
    end
    
    Foundation --> Benefits
    
    classDef foundationStyle fill:#e3f2fd
    classDef benefitsStyle fill:#e8f5e8
    
    class Vitest,Redis,API,E2E,MessageBus foundationStyle
    class SafeRefactor,BugPrevention,ConfidentChanges,RegressionProtection benefitsStyle
```

</FullscreenDiagram>

### 📈 Implementation Progress Tracker

<FullscreenDiagram>

```mermaid
stateDiagram-v2
    [*] --> Planning: "📋 Implementation Planning"
    Planning --> Day1: "Day 1: Foundation Setup"
    
    state Day1 {
        [*] --> Dependencies: "📦 Install Vitest Dependencies"
        Dependencies --> Configuration: "⚙️ Configure Test Projects"
        Configuration --> Scripts: "📜 Setup Package Scripts"
        Scripts --> Validation1: "✅ Validation Checkpoint"
        Validation1 --> [*]
    }
    
    state Day2 {
        [*] --> DockerCompose: "🐳 Create Docker Compose"
        DockerCompose --> Environment: "🌍 Setup Test Environment"
        Environment --> HealthChecks: "🔍 Implement Health Checks"
        HealthChecks --> Validation2: "✅ Validation Checkpoint"
        Validation2 --> [*]
    }
    
    state Day3 {
        [*] --> RedisFunctions: "📡 Redis Function Tests"
        RedisFunctions --> JobMatching: "🎯 Job Matching Logic"
        JobMatching --> Lifecycle: "🔄 Job Lifecycle Tests"
        Lifecycle --> Validation3: "✅ Validation Checkpoint"
        Validation3 --> [*]
    }
    
    state Day4 {
        [*] --> APIIntegration: "🔌 API Integration Tests"
        APIIntegration --> JobSubmission: "📤 Job Submission Tests"
        JobSubmission --> StatusEndpoints: "📊 Status Endpoint Tests"
        StatusEndpoints --> Validation4: "✅ Validation Checkpoint"
        Validation4 --> [*]
    }
    
    state Day5 {
        [*] --> E2ETesting: "🔄 End-to-End Testing"
        E2ETesting --> Performance: "⚡ Performance Testing"
        Performance --> LoadTesting: "📈 Load Testing"
        LoadTesting --> Validation5: "✅ Final Validation"
        Validation5 --> [*]
    }
    
    Day1 --> Day2: "Foundation Ready"
    Day2 --> Day3: "Environment Ready"
    Day3 --> Day4: "Redis Tests Ready"
    Day4 --> Day5: "API Tests Ready"
    Day5 --> Complete: "🎆 Phase 1 Complete"
    Complete --> [*]: "Ready for Phase 2"
```

</FullscreenDiagram>

## 🔬 Research Findings: Modern Testing Best Practices

### ⚡ Vitest: Next-Generation Testing Framework

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph Comparison["🔍 Framework Comparison"]
        Jest["Jest<br/>❌ Legacy Framework"]
        Vitest["Vitest<br/>✅ Modern Framework"]
    end
    
    subgraph JestLimitations["🔴 Jest Limitations"]
        Slow["Slow Execution<br/>CommonJS overhead"]
        Complex["Complex Setup<br/>Multiple config files"]
        ESMIssues["ESM Problems<br/>Module compatibility"]
        TSConfig["TypeScript Complexity<br/>Manual configuration"]
    end
    
    subgraph VitestBenefits["🟢 Vitest Advantages"]
        Fast["10x Faster<br/>Native ESM execution"]
        NativeTS["Native TypeScript<br/>Zero configuration"]
        ESMSupport["Native ESM<br/>Modern module support"]
        Modern["Modern APIs<br/>Built-in features"]
        Vite["Vite Integration<br/>Shared configuration"]
    end
    
    subgraph Decision["🎯 Decision Matrix"]
        Performance["Performance: Vitest wins"]
        Maintenance["Maintenance: Vitest wins"]
        Features["Features: Vitest wins"]
        Learning["Learning curve: Minimal"]
    end
    
    Jest --> JestLimitations
    Vitest --> VitestBenefits
    JestLimitations --> Decision
    VitestBenefits --> Decision
    
    classDef jestStyle fill:#ffebee
    classDef vitestStyle fill:#e8f5e8
    classDef decisionStyle fill:#e3f2fd
    
    class Jest,Slow,Complex,ESMIssues,TSConfig jestStyle
    class Vitest,Fast,NativeTS,ESMSupport,Modern,Vite vitestStyle
    class Performance,Maintenance,Features,Learning decisionStyle
```

</FullscreenDiagram>

Based on Context7 research, **Vitest emerges as the optimal choice** for our testing infrastructure:

#### 🏆 Why Vitest Over Jest

| Criteria | Jest | Vitest |
|----------|------|--------|
| **Performance** | Slow (CommonJS) | 🚀 **10x Faster** (Native ESM) |
| **TypeScript** | Complex Setup | 🎯 **Native Support** |
| **Modern Features** | Legacy Architecture | ✅ **Built-in Modern APIs** |
| **Concurrency** | Limited | 🔄 **True Parallel Execution** |
| **Integration** | Manual Setup | 🔗 **Excellent Integration Support** |
| **Maintenance** | High Overhead | 🧹 **Low Configuration** |

#### 🔑 Vitest Feature Mapping for Our Architecture

<FullscreenDiagram>

```mermaid
flowchart LR
    subgraph VitestCore["🔧 Vitest Core Features"]
        Context["Test Context Support<br/>({ expect }) => pattern"]
        Projects["Multi-Project Setup<br/>unit/integration/e2e"]
        Snapshots["Snapshot Testing<br/>API response validation"]
        Mocking["Advanced Mocking<br/>Service simulation"]
        Watch["Watch Mode<br/>Development testing"]
        Coverage["Coverage Reports<br/>Code quality metrics"]
    end
    
    subgraph OurNeeds["🎯 System Requirements"]
        RedisTests["Redis Function Testing<br/>Job matching logic"]
        APITests["HTTP Endpoint Testing<br/>Job submission/status"]
        WorkflowTests["Workflow Testing<br/>Multi-step processes"]
        LoadTests["Performance Testing<br/>Concurrent operations"]
        E2ETests["E2E Testing<br/>Complete user journeys"]
        CITests["CI/CD Integration<br/>Automated validation"]
    end
    
    subgraph Benefits["✅ Implementation Benefits"]
        FastFeedback["Fast Feedback Loop<br/>< 10s unit tests"]
        SafeRefactor["Safe Refactoring<br/>Regression protection"]
        QualityGates["Quality Gates<br/>PR validation"]
        Documentation["Living Documentation<br/>Test as specs"]
    end
    
    Context --> RedisTests
    Projects --> APITests
    Snapshots --> WorkflowTests
    Mocking --> LoadTests
    Watch --> E2ETests
    Coverage --> CITests
    
    RedisTests --> FastFeedback
    APITests --> SafeRefactor
    WorkflowTests --> QualityGates
    LoadTests --> Documentation
    
    classDef featureStyle fill:#e3f2fd
    classDef needStyle fill:#fff3e0
    classDef benefitStyle fill:#e8f5e8
    
    class Context,Projects,Snapshots,Mocking,Watch,Coverage featureStyle
    class RedisTests,APITests,WorkflowTests,LoadTests,E2ETests,CITests needStyle
    class FastFeedback,SafeRefactor,QualityGates,Documentation benefitStyle
```

</FullscreenDiagram>

### 🔗 Integration Testing Architecture

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph TestingLayers["📚 Testing Layer Architecture"]
        Unit["Unit Tests<br/>Pure functions, services"]
        Integration["Integration Tests<br/>Redis, API, Database"]
        E2E["E2E Tests<br/>Complete workflows"]
    end
    
    subgraph Infrastructure["🏗️ Test Infrastructure"]
        DockerCompose["Docker Compose<br/>Isolated containers"]
        TestDBs["Test Databases<br/>Redis + PostgreSQL"]
        MockServices["Mock Services<br/>External APIs"]
        HealthChecks["Health Checks<br/>Service readiness"]
    end
    
    subgraph Patterns["📐 Testing Patterns"]
        Setup["Setup/Teardown<br/>Clean state per test"]
        DataSeeds["Data Seeding<br/>Consistent fixtures"]
        Transactions["Test Transactions<br/>Isolation guarantee"]
        Parallel["Parallel Execution<br/>Independent tests"]
    end
    
    subgraph Benefits["✅ Architecture Benefits"]
        Isolation["Complete Isolation<br/>No test interference"]
        Consistency["Consistent Results<br/>Deterministic outcomes"]
        Speed["Fast Execution<br/>Parallel processing"]
        Reliability["High Reliability<br/>Flake-free tests"]
    end
    
    Unit --> DockerCompose
    Integration --> TestDBs
    E2E --> MockServices
    
    DockerCompose --> Setup
    TestDBs --> DataSeeds
    MockServices --> Transactions
    HealthChecks --> Parallel
    
    Setup --> Isolation
    DataSeeds --> Consistency
    Transactions --> Speed
    Parallel --> Reliability
    
    classDef layerStyle fill:#e3f2fd
    classDef infraStyle fill:#fff3e0
    classDef patternStyle fill:#f3e5f5
    classDef benefitStyle fill:#e8f5e8
    
    class Unit,Integration,E2E layerStyle
    class DockerCompose,TestDBs,MockServices,HealthChecks infraStyle
    class Setup,DataSeeds,Transactions,Parallel patternStyle
    class Isolation,Consistency,Speed,Reliability benefitStyle
```

</FullscreenDiagram>

Research from Prisma docs reveals proven patterns for database integration testing:

#### 🐳 Docker-Based Testing Strategy
- **Isolated test databases** using Docker containers
- **Automatic setup/teardown** with npm scripts
- **Migration application** during test setup
- **Data seeding** for consistent test scenarios

#### 📋 Test Organization Structure
- **Integration tests separate** from unit tests
- **Database transactions** for test isolation
- **Comprehensive cleanup** in `afterAll` hooks
- **Test-specific environment** configuration

## 🔍 Current System Analysis

### 🚨 Critical Testing Gaps Analysis

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph CurrentState["🔴 Current Testing State"]
        RedisGap["❌ Redis Functions<br/>Job matching logic untested<br/>Risk: Production failures"]
        APIGap["❌ API Integration<br/>Endpoints tested in isolation<br/>Risk: Integration bugs"]
        WorkflowGap["❌ Workflow Testing<br/>Multi-step processes uncovered<br/>Risk: State corruption"]
        WebSocketGap["❌ WebSocket Testing<br/>Real-time updates uncovered<br/>Risk: Communication failures"]
        E2EGap["❌ End-to-End Testing<br/>Complete user journeys untested<br/>Risk: User experience issues"]
    end
    
    subgraph Impacts["💥 Business Impact"]
        ProductionIssues["Production Failures<br/>Job matching breaks"]
        UserExperience["Poor User Experience<br/>Unreliable job status"]
        Downtime["System Downtime<br/>Critical service failures"]
        DataLoss["Data Inconsistency<br/>Job state corruption"]
        TechnicalDebt["Technical Debt<br/>Fear-driven development"]
    end
    
    subgraph Solution["✅ Testing Solution"]
        ComprehensiveSuite["Comprehensive Test Suite<br/>All components covered"]
        AutomatedValidation["Automated Validation<br/>Every commit tested"]
        SafeRefactoring["Safe Refactoring<br/>Regression protection"]
        ConfidentDeployment["Confident Deployment<br/>Production readiness"]
    end
    
    RedisGap --> ProductionIssues
    APIGap --> UserExperience
    WorkflowGap --> Downtime
    WebSocketGap --> DataLoss
    E2EGap --> TechnicalDebt
    
    ProductionIssues --> ComprehensiveSuite
    UserExperience --> AutomatedValidation
    Downtime --> SafeRefactoring
    DataLoss --> ConfidentDeployment
    TechnicalDebt --> ComprehensiveSuite
    
    classDef gapStyle fill:#ffebee
    classDef impactStyle fill:#fff3e0
    classDef solutionStyle fill:#e8f5e8
    
    class RedisGap,APIGap,WorkflowGap,WebSocketGap,E2EGap gapStyle
    class ProductionIssues,UserExperience,Downtime,DataLoss,TechnicalDebt impactStyle
    class ComprehensiveSuite,AutomatedValidation,SafeRefactoring,ConfidentDeployment solutionStyle
```

</FullscreenDiagram>

### 📋 Current Test Infrastructure Assessment

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph CurrentStructure["📁 Existing Test Structure"]
        RedisMinimal["packages/core/src/<br/>redis-functions/__tests__/<br/>🟡 Minimal Redis tests<br/>Basic function coverage"]
        APIBasic["apps/api/src/__tests__/<br/>🟡 Limited unit tests<br/>Endpoint-level only"]
        WorkerMissing["apps/worker/src/<br/>❌ No worker tests<br/>Core logic untested"]
        MonitorMissing["apps/monitor/src/<br/>❌ No monitor tests<br/>UI logic untested"]
    end
    
    subgraph CoverageAnalysis["📊 Coverage Analysis"]
        CoreCoverage["Core Package: ~25%<br/>Redis functions partially covered"]
        APICoverage["API Package: ~15%<br/>Basic endpoint tests only"]
        WorkerCoverage["Worker Package: 0%<br/>No test coverage"]
        MonitorCoverage["Monitor Package: 0%<br/>No test coverage"]
    end
    
    subgraph QualityAssessment["🔍 Quality Assessment"]
        TestTypes["Test Types:<br/>Unit only, no integration"]
        TestQuality["Test Quality:<br/>Basic assertions, no edge cases"]
        TestReliability["Test Reliability:<br/>No CI integration"]
        TestMaintenance["Test Maintenance:<br/>No systematic approach"]
    end
    
    subgraph RiskAnalysis["⚠️ Risk Analysis"]
        RefactorRisk["HIGH: Refactoring Risk<br/>No regression protection"]
        ProductionRisk["HIGH: Production Risk<br/>Untested critical paths"]
        MaintenanceRisk["MEDIUM: Maintenance Risk<br/>Code changes fear-driven"]
        QualityRisk["HIGH: Quality Risk<br/>No validation standards"]
    end
    
    CurrentStructure --> CoverageAnalysis
    CoverageAnalysis --> QualityAssessment
    QualityAssessment --> RiskAnalysis
    
    classDef currentStyle fill:#fff3e0
    classDef coverageStyle fill:#ffebee
    classDef qualityStyle fill:#f3e5f5
    classDef riskStyle fill:#ffcdd2
    
    class RedisMinimal,APIBasic,WorkerMissing,MonitorMissing currentStyle
    class CoreCoverage,APICoverage,WorkerCoverage,MonitorCoverage coverageStyle
    class TestTypes,TestQuality,TestReliability,TestMaintenance qualityStyle
    class RefactorRisk,ProductionRisk,MaintenanceRisk,QualityRisk riskStyle
```

</FullscreenDiagram>

```bash
# Current test structure
packages/core/src/redis-functions/__tests__/  # 🟡 Minimal Redis function tests
apps/api/src/__tests__/                       # 🟡 Limited unit tests
```

**📊 Assessment**: **Insufficient coverage** for architectural changes - major refactoring without comprehensive tests is high-risk.

## 🏗️ Implementation Architecture

### 🎯 Comprehensive Testing Strategy

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph TestPyramid["📋 Testing Pyramid Strategy"]
        E2E["🔄 E2E Tests (Few)<br/>Complete user workflows<br/>Job submission → completion<br/>WebSocket real-time updates"]
        Integration["🔗 Integration Tests (More)<br/>Component interactions<br/>Redis functions + API endpoints<br/>Database transactions"]
        Unit["⚙️ Unit Tests (Most)<br/>Individual functions<br/>Service logic validation<br/>Edge case handling"]
    end
    
    subgraph TestEnvironment["🌍 Isolated Test Environment"]
        RedisContainer["📡 Redis Test Container<br/>Port 6380, isolated instance<br/>Redis functions loaded<br/>Health checks enabled"]
        PostgresContainer["🐘 PostgreSQL Test Container<br/>Port 5433, test database<br/>Schema migrations applied<br/>Clean state per test"]
        MockServices["🎭 Mock External Services<br/>EmProps API simulation<br/>Webhook endpoints<br/>External service stubs"]
    end
    
    subgraph TestInfrastructure["🔧 Modern Testing Infrastructure"]
        Vitest["⚡ Vitest Framework<br/>Native TypeScript support<br/>10x faster than Jest<br/>Built-in ESM support"]
        DockerCompose["🐳 Docker Compose Setup<br/>Service orchestration<br/>Network isolation<br/>Volume management"]
        CI["🔄 CI/CD Integration<br/>GitHub Actions workflow<br/>Parallel test execution<br/>Coverage reporting"]
    end
    
    subgraph QualityGates["🛡️ Quality Gates"]
        Coverage["📊 Coverage Requirements<br/>>85% code coverage<br/>100% critical path coverage<br/>Branch coverage validation"]
        Performance["⚡ Performance Standards<br/>Unit: <10s execution<br/>Integration: <30s execution<br/>E2E: <60s execution"]
        Reliability["🎯 Reliability Standards<br/>Zero flaky tests<br/>Deterministic outcomes<br/>Isolated test execution"]
    end
    
    Unit --> RedisContainer
    Integration --> PostgresContainer
    E2E --> MockServices
    
    RedisContainer --> Vitest
    PostgresContainer --> DockerCompose
    MockServices --> CI
    
    Vitest --> Coverage
    DockerCompose --> Performance
    CI --> Reliability
    
    classDef pyramidStyle fill:#e3f2fd
    classDef environmentStyle fill:#fff3e0
    classDef infraStyle fill:#e8f5e8
    classDef qualityStyle fill:#f3e5f5
    
    class E2E,Integration,Unit pyramidStyle
    class RedisContainer,PostgresContainer,MockServices environmentStyle
    class Vitest,DockerCompose,CI infraStyle
    class Coverage,Performance,Reliability qualityStyle
```

</FullscreenDiagram>

### ⚙️ Vitest Configuration Architecture

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph RootConfig["📁 Root Configuration"]
        Workspace["vitest.workspace.ts<br/>- Defines test projects<br/>- Shared configuration<br/>- Global setup files"]
        GlobalSetup["test/global-setup.ts<br/>- Environment initialization<br/>- Global test hooks<br/>- Shared utilities"]
        EnvConfig[".env.test<br/>- Test-specific variables<br/>- Database URLs<br/>- Service ports"]
    end
    
    subgraph ProjectTypes["📦 Test Project Types"]
        UnitProject["Unit Tests<br/>Pattern: **/*.test.ts<br/>Environment: node<br/>Fast execution, isolated"]
        IntegrationProject["Integration Tests<br/>Pattern: **/*.integration.test.ts<br/>Setup: Docker services<br/>Database connections"]
        E2EProject["E2E Tests<br/>Pattern: **/*.e2e.test.ts<br/>Setup: Full system<br/>Real workflows"]
    end
    
    subgraph TestEnvironments["🌍 Environment Setup"]
        UnitEnv["Unit Environment<br/>- No external services<br/>- Mocked dependencies<br/>- Fast feedback loop"]
        IntegrationEnv["Integration Environment<br/>- Docker containers<br/>- Test databases<br/>- Service health checks"]
        E2EEnv["E2E Environment<br/>- Full system stack<br/>- Real service integration<br/>- WebSocket connections"]
    end
    
    subgraph ExecutionFlow["🔄 Execution Flow"]
        Sequential["Sequential by Type<br/>1. Unit tests first<br/>2. Integration tests<br/>3. E2E tests last"]
        Parallel["Parallel within Type<br/>- Multiple workers<br/>- Isolated test files<br/>- Resource pooling"]
        Reporting["Unified Reporting<br/>- Coverage aggregation<br/>- Performance metrics<br/>- CI/CD integration"]
    end
    
    Workspace --> UnitProject
    GlobalSetup --> IntegrationProject
    EnvConfig --> E2EProject
    
    UnitProject --> UnitEnv
    IntegrationProject --> IntegrationEnv
    E2EProject --> E2EEnv
    
    UnitEnv --> Sequential
    IntegrationEnv --> Parallel
    E2EEnv --> Reporting
    
    classDef configStyle fill:#e3f2fd
    classDef projectStyle fill:#fff3e0
    classDef envStyle fill:#e8f5e8
    classDef flowStyle fill:#f3e5f5
    
    class Workspace,GlobalSetup,EnvConfig configStyle
    class UnitProject,IntegrationProject,E2EProject projectStyle
    class UnitEnv,IntegrationEnv,E2EEnv envStyle
    class Sequential,Parallel,Reporting flowStyle
```

</FullscreenDiagram>

Based on research, we'll implement a **monorepo-friendly Vitest setup**:

```typescript
// vitest.workspace.ts - Root workspace configuration
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/*',
  'apps/*',
  {
    test: {
      include: ['__tests__/**/*.integration.test.{ts,js}'],
      name: 'integration',
      environment: 'node',
      setupFiles: ['./test/integration-setup.ts']
    }
  }
])
```

## 🚀 Step-by-Step Implementation

### 📅 Implementation Timeline & Dependencies

<FullscreenDiagram>

```mermaid
gantt
    title Phase 1 Testing Implementation - 5 Days
    dateFormat  YYYY-MM-DD
    
    section Day 1: Foundation Setup
    Install Dependencies        :milestone, deps, 2025-08-26, 0d
    Vitest Installation        :d1-deps, 2025-08-26, 4h
    Root Configuration         :d1-config, after d1-deps, 4h
    Package Scripts Setup      :d1-scripts, after d1-config, 4h
    Validation Checkpoint      :milestone, val1, after d1-scripts, 0d
    
    section Day 2: Environment
    Docker Setup Start         :milestone, docker, after val1, 0d
    Docker Compose Config      :d2-docker, after docker, 4h
    Test Database Setup        :d2-env, after d2-docker, 4h
    Health Check Implementation :d2-health, after d2-env, 4h
    Environment Validation     :milestone, val2, after d2-health, 0d
    
    section Day 3: Redis Testing
    Redis Test Start           :milestone, redis, after val2, 0d
    Core Function Tests        :d3-redis, after redis, 6h
    Job Lifecycle Tests        :d3-lifecycle, after d3-redis, 6h
    Atomic Operation Tests     :d3-atomic, after d3-lifecycle, 4h
    Redis Tests Validation     :milestone, val3, after d3-atomic, 0d
    
    section Day 4: API Testing
    API Integration Start      :milestone, api, after val3, 0d
    Job Submission Tests       :d4-submit, after api, 6h
    Status Endpoint Tests      :d4-status, after d4-submit, 4h
    Workflow API Tests         :d4-workflow, after d4-status, 6h
    API Tests Validation       :milestone, val4, after d4-workflow, 0d
    
    section Day 5: E2E & Performance
    E2E Testing Start          :milestone, e2e, after val4, 0d
    Complete Workflow Tests    :d5-e2e, after e2e, 6h
    Performance Benchmarks    :d5-perf, after d5-e2e, 4h
    Load Testing Suite        :d5-load, after d5-perf, 4h
    Final Validation          :milestone, complete, after d5-load, 0d
```

</FullscreenDiagram>

### 🔄 Agent Implementation Workflow

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["🚀 Start Implementation"]) --> PlanAnalysis["📋 Analyze Implementation Plan"]
    PlanAnalysis --> DayPlanning["📅 Daily Task Planning"]
    
    subgraph DailyWorkflow["📈 Daily Implementation Cycle"]
        TaskStart(["Start Daily Tasks"]) --> TaskExecution["⚙️ Execute Implementation"]
        TaskExecution --> ValidationRun["🧪 Run Validation Commands"]
        ValidationRun --> ResultCheck{"✅ Results Pass?"}
        ResultCheck -->|Yes| NextDay["🎯 Proceed to Next Day"]
        ResultCheck -->|No| Debug["🔍 Debug & Fix Issues"]
        Debug --> TaskExecution
    end
    
    subgraph ValidationCommands["🔧 Validation Commands"]
        UnitTest["pnpm test:unit"]
        IntegrationTest["pnpm test:integration"]
        E2ETest["pnpm test:e2e"]
        CoverageCheck["pnpm test:coverage"]
        LintCheck["pnpm lint"]
    end
    
    subgraph CompletionCriteria["✅ Completion Criteria"]
        AllTestsPass["All tests passing"]
        CoverageTarget["Coverage >85%"]
        NoFlakes["Zero flaky tests"]
        DocComplete["Documentation updated"]
        CIIntegrated["CI/CD pipeline working"]
    end
    
    DayPlanning --> DailyWorkflow
    ValidationRun --> ValidationCommands
    NextDay --> CompletionCriteria
    
    classDef startStyle fill:#e8f5e8
    classDef processStyle fill:#e3f2fd
    classDef validationStyle fill:#fff3e0
    classDef criteriaStyle fill:#f3e5f5
    
    class Start,TaskStart,NextDay startStyle
    class PlanAnalysis,DayPlanning,TaskExecution,ValidationRun,Debug processStyle
    class UnitTest,IntegrationTest,E2ETest,CoverageCheck,LintCheck validationStyle
    class AllTestsPass,CoverageTarget,NoFlakes,DocComplete,CIIntegrated criteriaStyle
```

</FullscreenDiagram>

### 📋 Day 1: Vitest Infrastructure Setup

> **🎯 Objective**: Establish Vitest foundation with monorepo configuration and project separation.

#### 🔄 Day 1 Implementation Flow

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["📅 Day 1 Start"]) --> Dependencies["📦 Install Dependencies"]
    Dependencies --> Verification["✅ Verify Installation"]
    Verification --> Configuration["⚙️ Root Configuration"]
    Configuration --> Projects["📁 Project Setup"]
    Projects --> Scripts["📜 Package Scripts"]
    Scripts --> Validation["🧪 Validation Tests"]
    Validation --> Complete(["✅ Day 1 Complete"])
    
    subgraph DependencyInstall["📦 Dependency Installation"]
        VitestCore["vitest<br/>@vitest/ui<br/>vite"]
        TypeSupport["@types/node<br/>@types/redis"]
        TestUtils["supertest<br/>@types/supertest"]
    end
    
    subgraph ConfigurationFiles["📄 Configuration Files"]
        WorkspaceConfig["vitest.workspace.ts<br/>Multi-project setup"]
        RootConfig["vitest.config.ts<br/>Base configuration"]
        GlobalSetup["test/global-setup.ts<br/>Environment setup"]
    end
    
    subgraph ValidationChecks["🔍 Validation Checks"]
        VersionCheck["npx vitest --version"]
        ConfigTest["pnpm test --run"]
        ProjectTest["Test project separation"]
    end
    
    Dependencies --> DependencyInstall
    Configuration --> ConfigurationFiles
    Validation --> ValidationChecks
    
    classDef flowStyle fill:#e3f2fd
    classDef detailStyle fill:#fff3e0
    classDef validationStyle fill:#e8f5e8
    
    class Start,Dependencies,Verification,Configuration,Projects,Scripts,Validation,Complete flowStyle
    class VitestCore,TypeSupport,TestUtils,WorkspaceConfig,RootConfig,GlobalSetup detailStyle
    class VersionCheck,ConfigTest,ProjectTest validationStyle
```

</FullscreenDiagram>

#### 📦 1.1 Install Vitest Dependencies

```bash
# Core Vitest packages
pnpm add -DW vitest @vitest/ui vite

# TypeScript support
pnpm add -DW @types/node @types/redis

# Testing utilities
pnpm add -DW supertest @types/supertest

# WebSocket testing (for E2E)
pnpm add -DW ws @types/ws
```

**📊 Validation Checkpoint**: Verify packages installed correctly
```bash
npx vitest --version  # Should show Vitest version (e.g., vitest/1.0.0)
pnpm list vitest      # Verify package in dependencies
```

#### ⚙️ 1.2 Create Root Vitest Configuration
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Enable concurrent tests by default
    concurrent: true,
    // Global test timeout
    testTimeout: 30000,
    // Setup files for all tests
    setupFiles: ['./test/global-setup.ts'],
    // Environment variables
    env: {
      NODE_ENV: 'test',
    },
    // Projects for different test types
    projects: [
      // Unit tests
      {
        name: 'unit',
        testMatch: ['**/*.test.ts'],
        testIgnore: ['**/*.integration.test.ts', '**/*.e2e.test.ts'],
      },
      // Integration tests
      {
        name: 'integration',
        testMatch: ['**/*.integration.test.ts'],
        setupFiles: ['./test/integration-setup.ts'],
        pool: 'forks', // Prevent segfaults with Redis connections
      },
      // End-to-end tests
      {
        name: 'e2e',
        testMatch: ['**/*.e2e.test.ts'],
        setupFiles: ['./test/e2e-setup.ts'],
        pool: 'forks',
      },
    ],
  },
})
```

#### 🌍 1.3 Create Test Environment Setup
```typescript
// test/global-setup.ts
import { beforeAll, afterAll } from 'vitest'

beforeAll(async () => {
  console.log('🚀 Global test setup initiated')
  // Global setup logic if needed
})

afterAll(async () => {
  console.log('✅ Global test cleanup completed')
  // Global cleanup logic if needed
})
```

#### 📜 1.4 Update Package.json Scripts
```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --project unit",
    "test:integration": "vitest --project integration",
    "test:e2e": "vitest --project e2e",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:ci": "vitest --run --reporter=junit --outputFile=test-results.xml"
  }
}
```

### 🐳 Day 2: Docker Test Environment Setup

> **🎯 Objective**: Create isolated, reproducible test environment with Docker containers.

#### 🔄 Day 2 Implementation Flow

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["📅 Day 2 Start"]) --> DockerCompose["🐳 Docker Compose Setup"]
    DockerCompose --> Services["🔧 Service Configuration"]
    Services --> HealthChecks["🏥 Health Check Setup"]
    HealthChecks --> TestSetup["🧪 Test Setup Scripts"]
    TestSetup --> Integration["🔗 Integration Configuration"]
    Integration --> Validation["✅ Environment Validation"]
    Validation --> Complete(["✅ Day 2 Complete"])
    
    subgraph DockerServices["🐳 Docker Services"]
        RedisService["Redis Test Container<br/>Port: 6380<br/>Health checks enabled<br/>Isolated data volume"]
        PostgresService["PostgreSQL Test Container<br/>Port: 5433<br/>Test database setup<br/>Migration ready"]
        NetworkConfig["Docker Network<br/>Service discovery<br/>Port isolation<br/>Container communication"]
    end
    
    subgraph HealthMonitoring["🏥 Health Monitoring"]
        RedisHealth["Redis Health Check<br/>redis-cli ping<br/>5s interval, 3s timeout"]
        PostgresHealth["Postgres Health Check<br/>pg_isready command<br/>Connection validation"]
        StartupWait["Service Startup Wait<br/>Health check completion<br/>Dependency ordering"]
    end
    
    subgraph IntegrationSetup["🔗 Integration Setup"]
        SetupScripts["test/integration-setup.ts<br/>Container lifecycle<br/>Database connections"]
        EnvVariables[".env.test<br/>Test-specific config<br/>Service endpoints"]
        CleanupHooks["Cleanup Procedures<br/>Container shutdown<br/>Volume cleanup"]
    end
    
    Services --> DockerServices
    HealthChecks --> HealthMonitoring
    Integration --> IntegrationSetup
    
    classDef flowStyle fill:#e3f2fd
    classDef serviceStyle fill:#fff3e0
    classDef healthStyle fill:#e8f5e8
    classDef integrationStyle fill:#f3e5f5
    
    class Start,DockerCompose,Services,HealthChecks,TestSetup,Integration,Validation,Complete flowStyle
    class RedisService,PostgresService,NetworkConfig serviceStyle
    class RedisHealth,PostgresHealth,StartupWait healthStyle
    class SetupScripts,EnvVariables,CleanupHooks integrationStyle
```

</FullscreenDiagram>

#### 📜 2.1 Create Docker Compose for Testing
```yaml
# docker-compose.test.yml
version: '3.9'

services:
  redis-test:
    image: redis:7-alpine
    ports:
      - '6380:6379'
    command: redis-server --appendonly yes
    volumes:
      - redis-test-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  postgres-test:
    image: postgres:15-alpine
    ports:
      - '5433:5432'
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: testdb
    volumes:
      - postgres-test-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser -d testdb"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis-test-data:
  postgres-test-data:
```

#### 🔗 2.2 Create Integration Test Setup
```typescript
// test/integration-setup.ts
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import Redis from 'ioredis'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let redis: Redis

beforeAll(async () => {
  console.log('🔄 Starting test containers...')
  
  // Start test containers
  await execAsync('docker-compose -f docker-compose.test.yml up -d')
  
  // Wait for services to be ready
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  // Connect to test Redis
  redis = new Redis({
    host: 'localhost',
    port: 6380,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
  })

  // Load Redis functions
  console.log('📋 Loading Redis functions...')
  // Load your Redis functions here
  
  console.log('✅ Test environment ready')
}, 60000)

beforeEach(async () => {
  // Clean Redis between tests
  await redis.flushdb()
})

afterAll(async () => {
  if (redis) {
    redis.disconnect()
  }
  
  // Stop test containers
  console.log('🛑 Stopping test containers...')
  await execAsync('docker-compose -f docker-compose.test.yml down -v')
  
  console.log('✅ Test cleanup completed')
}, 30000)

// Export redis instance for tests
export { redis }
```

#### 🌍 2.3 Create Test Environment Variables
```env
# .env.test
# Redis Test Configuration
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=

# PostgreSQL Test Configuration
DATABASE_URL="postgresql://testuser:testpass@localhost:5433/testdb"

# API Test Configuration
API_PORT=3001
NODE_ENV=test
JWT_SECRET=test_secret_key
API_KEY=test_api_key

# Webhook Test Configuration
WEBHOOK_SERVICE_HOST=localhost
WEBHOOK_SERVICE_PORT=3002
```

### 📡 Day 3: Redis Function Testing Suite

> **🎯 Objective**: Comprehensive testing of Redis job matching functions and lifecycle management.

#### 🔄 Day 3 Implementation Flow

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["📅 Day 3 Start"]) --> FunctionTests["⚙️ Core Function Tests"]
    FunctionTests --> LifecycleTests["🔄 Lifecycle Tests"]
    LifecycleTests --> ConcurrencyTests["⚡ Concurrency Tests"]
    ConcurrencyTests --> PoolTests["🎯 Pool-Aware Tests"]
    PoolTests --> Validation["✅ Redis Validation"]
    Validation --> Complete(["✅ Day 3 Complete"])
    
    subgraph CoreFunctionTesting["⚙️ Core Function Testing"]
        JobMatching["findMatchingJob Function<br/>Capability matching<br/>Priority ordering<br/>Resource requirements"]
        AtomicOps["Atomic Operations<br/>Race condition prevention<br/>Concurrent worker handling<br/>Job claiming logic"]
        ErrorHandling["Error Scenarios<br/>No matching jobs<br/>Invalid capabilities<br/>System failures"]
    end
    
    subgraph LifecycleTesting["🔄 Lifecycle Testing"]
        JobSubmission["Job Submission<br/>Queue entry validation<br/>Status transitions<br/>Metadata handling"]
        JobProgress["Job Progress<br/>Status updates<br/>Progress tracking<br/>Heartbeat monitoring"]
        JobCompletion["Job Completion<br/>Result handling<br/>Cleanup procedures<br/>Success/failure paths"]
    end
    
    subgraph ConcurrencyTesting["⚡ Concurrency Testing"]
        MultiWorker["Multiple Workers<br/>Concurrent job requests<br/>Fair job distribution<br/>No duplicate assignments"]
        LoadTesting["Load Testing<br/>High job volume<br/>Worker scaling<br/>Performance metrics"]
        StressScenarios["Stress Scenarios<br/>Resource exhaustion<br/>Connection limits<br/>Recovery testing"]
    end
    
    subgraph PoolAwareTesting["🎯 Pool-Aware Testing"]
        FastLane["Fast Lane Pool<br/>Quick job routing<br/>Resource optimization<br/>Duration-based matching"]
        StandardPool["Standard Pool<br/>Balanced workloads<br/>General purpose matching<br/>Resource efficiency"]
        HeavyPool["Heavy Pool<br/>Resource-intensive jobs<br/>High-end GPU matching<br/>Extended processing"]
    end
    
    FunctionTests --> CoreFunctionTesting
    LifecycleTests --> LifecycleTesting
    ConcurrencyTests --> ConcurrencyTesting
    PoolTests --> PoolAwareTesting
    
    classDef flowStyle fill:#e3f2fd
    classDef coreStyle fill:#fff3e0
    classDef lifecycleStyle fill:#e8f5e8
    classDef concurrencyStyle fill:#f3e5f5
    classDef poolStyle fill:#fce4ec
    
    class Start,FunctionTests,LifecycleTests,ConcurrencyTests,PoolTests,Validation,Complete flowStyle
    class JobMatching,AtomicOps,ErrorHandling coreStyle
    class JobSubmission,JobProgress,JobCompletion lifecycleStyle
    class MultiWorker,LoadTesting,StressScenarios concurrencyStyle
    class FastLane,StandardPool,HeavyPool poolStyle
```

</FullscreenDiagram>

#### ⚙️ 3.1 Core Redis Function Tests
```typescript
// packages/core/src/redis-functions/__tests__/findMatchingJob.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { redis } from '../../../../test/integration-setup'
import type { JobRequirements, WorkerCapabilities } from '../types'

describe('findMatchingJob Redis Function Integration', () => {
  beforeEach(async () => {
    // Clean slate for each test
    await redis.flushdb()
  })

  describe('Basic Job Matching', () => {
    it('should find matching job for worker capabilities', async ({ expect }) => {
      // Setup: Create test jobs with different requirements
      const testJobs = [
        {
          id: 'job-1',
          requirements: {
            gpu_memory: 8,
            model_type: 'stable-diffusion',
            capabilities: ['text-to-image']
          },
          priority: 50,
          status: 'pending'
        },
        {
          id: 'job-2',
          requirements: {
            gpu_memory: 16,
            model_type: 'llm',
            capabilities: ['text-generation']
          },
          priority: 70,
          status: 'pending'
        }
      ]

      // Add jobs to Redis
      for (const job of testJobs) {
        await redis.hmset(`job:${job.id}`, {
          ...job,
          requirements: JSON.stringify(job.requirements)
        })
        await redis.zadd('jobs:pending', job.priority, job.id)
      }

      // Test: Worker with SD capabilities
      const workerCapabilities: WorkerCapabilities = {
        gpu_memory: 12,
        model_types: ['stable-diffusion'],
        capabilities: ['text-to-image', 'image-to-image']
      }

      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(workerCapabilities),
        '1'
      )

      // Assertions
      expect(result).toBeDefined()
      const jobResult = JSON.parse(result as string)
      expect(jobResult.jobId).toBe('job-1')
      expect(jobResult.success).toBe(true)

      // Verify job is no longer in pending queue
      const pendingJobs = await redis.zrange('jobs:pending', 0, -1)
      expect(pendingJobs).not.toContain('job-1')
      
      // Verify job status updated to assigned
      const jobStatus = await redis.hget(`job:${jobResult.jobId}`, 'status')
      expect(jobStatus).toBe('assigned')
    })

    it('should return no match when no suitable jobs exist', async ({ expect }) => {
      // Setup: Create job requiring high-end GPU
      await redis.hmset('job:gpu-intensive', {
        requirements: JSON.stringify({
          gpu_memory: 32,
          model_type: 'llm',
          capabilities: ['text-generation']
        }),
        status: 'pending'
      })
      await redis.zadd('jobs:pending', 50, 'gpu-intensive')

      // Test: Worker with limited capabilities
      const workerCapabilities: WorkerCapabilities = {
        gpu_memory: 4,
        model_types: ['stable-diffusion'],
        capabilities: ['text-to-image']
      }

      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(workerCapabilities),
        '1'
      )

      const jobResult = JSON.parse(result as string)
      expect(jobResult.success).toBe(false)
      expect(jobResult.reason).toContain('No matching jobs found')
    })
  })

  describe('Priority-Based Matching', () => {
    it('should return highest priority matching job', async ({ expect }) => {
      // Setup: Create jobs with different priorities
      const jobs = [
        { id: 'low-priority', priority: 30 },
        { id: 'high-priority', priority: 80 },
        { id: 'medium-priority', priority: 50 }
      ]

      for (const job of jobs) {
        await redis.hmset(`job:${job.id}`, {
          requirements: JSON.stringify({
            gpu_memory: 8,
            model_type: 'stable-diffusion',
            capabilities: ['text-to-image']
          }),
          status: 'pending'
        })
        await redis.zadd('jobs:pending', job.priority, job.id)
      }

      const workerCapabilities: WorkerCapabilities = {
        gpu_memory: 16,
        model_types: ['stable-diffusion'],
        capabilities: ['text-to-image']
      }

      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(workerCapabilities),
        '1'
      )

      const jobResult = JSON.parse(result as string)
      expect(jobResult.jobId).toBe('high-priority')
    })
  })

  describe('Pool-Aware Matching (North Star Preparation)', () => {
    it('should match jobs based on pool preferences', async ({ expect }) => {
      // Setup: Create jobs with pool specifications
      await redis.hmset('job:fast-lane', {
        requirements: JSON.stringify({
          gpu_memory: 4,
          model_type: 'ollama',
          capabilities: ['text-generation'],
          pool_preference: 'fast-lane',
          expected_duration: 30 // seconds
        }),
        status: 'pending'
      })
      await redis.zadd('jobs:pending', 60, 'fast-lane')

      await redis.hmset('job:standard', {
        requirements: JSON.stringify({
          gpu_memory: 8,
          model_type: 'stable-diffusion',
          capabilities: ['text-to-image'],
          pool_preference: 'standard',
          expected_duration: 300 // seconds
        }),
        status: 'pending'
      })
      await redis.zadd('jobs:pending', 50, 'standard')

      // Test: Fast-lane worker
      const fastLaneWorker: WorkerCapabilities = {
        gpu_memory: 8,
        model_types: ['ollama', 'stable-diffusion'],
        capabilities: ['text-generation', 'text-to-image'],
        pool_type: 'fast-lane'
      }

      const result = await redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(fastLaneWorker),
        '1'
      )

      const jobResult = JSON.parse(result as string)
      expect(jobResult.jobId).toBe('fast-lane')
    })
  })

  describe('Atomic Operations', () => {
    it('should handle concurrent job matching without race conditions', async ({ expect }) => {
      // Setup: Single high-priority job
      await redis.hmset('job:single', {
        requirements: JSON.stringify({
          gpu_memory: 8,
          model_type: 'stable-diffusion',
          capabilities: ['text-to-image']
        }),
        status: 'pending'
      })
      await redis.zadd('jobs:pending', 70, 'single')

      const workerCapabilities: WorkerCapabilities = {
        gpu_memory: 16,
        model_types: ['stable-diffusion'],
        capabilities: ['text-to-image']
      }

      // Test: Concurrent requests (simulate multiple workers)
      const promises = Array(5).fill(null).map(() => 
        redis.fcall(
          'findMatchingJob',
          0,
          JSON.stringify(workerCapabilities),
          '1'
        )
      )

      const results = await Promise.all(promises)
      
      // Only one should succeed
      const successfulResults = results
        .map(r => JSON.parse(r as string))
        .filter(r => r.success)
      
      expect(successfulResults).toHaveLength(1)
      expect(successfulResults[0].jobId).toBe('single')

      // All others should fail gracefully
      const failedResults = results
        .map(r => JSON.parse(r as string))
        .filter(r => !r.success)
      
      expect(failedResults).toHaveLength(4)
    })
  })
})
```

#### 🔄 3.2 Job Lifecycle Testing
```typescript
// packages/core/src/redis-functions/__tests__/jobLifecycle.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { redis } from '../../../../test/integration-setup'
import { v4 as uuidv4 } from 'uuid'

describe('Job Lifecycle Integration', () => {
  let jobId: string
  
  beforeEach(async () => {
    await redis.flushdb()
    jobId = uuidv4()
  })

  it('should handle complete job lifecycle: submit → assign → progress → complete', async ({ expect }) => {
    // 1. Job Submission
    const jobPayload = {
      id: jobId,
      type: 'text-to-image',
      prompt: 'A beautiful sunset',
      requirements: {
        gpu_memory: 8,
        model_type: 'stable-diffusion',
        capabilities: ['text-to-image']
      },
      priority: 50,
      status: 'pending',
      created_at: new Date().toISOString()
    }

    await redis.hmset(`job:${jobId}`, {
      ...jobPayload,
      requirements: JSON.stringify(jobPayload.requirements)
    })
    await redis.zadd('jobs:pending', jobPayload.priority, jobId)

    // Verify job in pending state
    let jobStatus = await redis.hget(`job:${jobId}`, 'status')
    expect(jobStatus).toBe('pending')

    // 2. Job Assignment
    const workerCapabilities = {
      worker_id: 'worker-1',
      machine_id: 'machine-1',
      gpu_memory: 12,
      model_types: ['stable-diffusion'],
      capabilities: ['text-to-image']
    }

    const matchResult = await redis.fcall(
      'findMatchingJob',
      0,
      JSON.stringify(workerCapabilities),
      '1'
    )

    const assignedJob = JSON.parse(matchResult as string)
    expect(assignedJob.success).toBe(true)
    expect(assignedJob.jobId).toBe(jobId)

    // Verify job assigned
    jobStatus = await redis.hget(`job:${jobId}`, 'status')
    expect(jobStatus).toBe('assigned')

    // 3. Job Progress Updates
    await redis.hmset(`job:${jobId}`, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress: '25'
    })

    const progress = await redis.hget(`job:${jobId}`, 'progress')
    expect(progress).toBe('25')

    // 4. Job Completion
    const result = {
      image_url: 'https://example.com/result.jpg',
      metadata: { model: 'sd-1.5', steps: 20 }
    }

    await redis.hmset(`job:${jobId}`, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: JSON.stringify(result),
      progress: '100'
    })

    // Verify final state
    const finalJob = await redis.hgetall(`job:${jobId}`)
    expect(finalJob.status).toBe('completed')
    expect(JSON.parse(finalJob.result)).toEqual(result)
    expect(finalJob.progress).toBe('100')
  })

  it('should handle job failure scenarios', async ({ expect }) => {
    // Setup job
    await redis.hmset(`job:${jobId}`, {
      status: 'running',
      worker_id: 'worker-1',
      started_at: new Date().toISOString()
    })

    // Simulate failure
    const error = {
      code: 'MODEL_LOAD_FAILED',
      message: 'Failed to load stable-diffusion model',
      timestamp: new Date().toISOString()
    }

    await redis.hmset(`job:${jobId}`, {
      status: 'failed',
      error: JSON.stringify(error),
      failed_at: new Date().toISOString()
    })

    // Job should be back in pending queue for retry
    await redis.zadd('jobs:pending', 50, jobId)

    const finalStatus = await redis.hget(`job:${jobId}`, 'status')
    expect(finalStatus).toBe('failed')

    const jobError = JSON.parse(await redis.hget(`job:${jobId}`, 'error') || '{}')
    expect(jobError.code).toBe('MODEL_LOAD_FAILED')
  })
})
```

### 🔌 Day 4: API Integration Testing

> **🎯 Objective**: Test all HTTP endpoints with full request/response validation.

#### 🔄 Day 4 Implementation Flow

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["📅 Day 4 Start"]) --> JobAPIs["📤 Job Submission APIs"]
    JobAPIs --> StatusAPIs["📊 Status APIs"]
    StatusAPIs --> WorkflowAPIs["🔄 Workflow APIs"]
    WorkflowAPIs --> WebSocketAPIs["🔌 WebSocket APIs"]
    WebSocketAPIs --> Validation["✅ API Validation"]
    Validation --> Complete(["✅ Day 4 Complete"])
    
    subgraph JobSubmissionTesting["📤 Job Submission Testing"]
        SubmitValidation["Submission Validation<br/>Payload validation<br/>Schema enforcement<br/>Error handling"]
        AuthTesting["Authentication Testing<br/>API key validation<br/>Authorization checks<br/>Security boundaries"]
        PriorityTesting["Priority Handling<br/>Queue ordering<br/>Priority enforcement<br/>SLA compliance"]
    end
    
    subgraph StatusTesting["📊 Status Testing"]
        JobStatus["Job Status Queries<br/>Status accuracy<br/>Progress updates<br/>Metadata retrieval"]
        BulkStatus["Bulk Status Queries<br/>Multiple job status<br/>Filtering options<br/>Pagination support"]
        RealTimeUpdates["Real-time Updates<br/>Status change events<br/>Progress notifications<br/>Completion alerts"]
    end
    
    subgraph WorkflowTesting["🔄 Workflow Testing"]
        WorkflowCreation["Workflow Creation<br/>Multi-step validation<br/>Dependency handling<br/>Resource planning"]
        StepExecution["Step Execution<br/>Sequential processing<br/>Parallel execution<br/>Conditional logic"]
        WorkflowStatus["Workflow Status<br/>Overall progress<br/>Step-by-step status<br/>Failure handling"]
    end
    
    subgraph WebSocketTesting["🔌 WebSocket Testing"]
        ConnectionManagement["Connection Management<br/>Client connections<br/>Authentication<br/>Session handling"]
        EventBroadcasting["Event Broadcasting<br/>Job status events<br/>Progress updates<br/>System notifications"]
        ErrorRecovery["Error Recovery<br/>Connection drops<br/>Reconnection logic<br/>Message queuing"]
    end
    
    JobAPIs --> JobSubmissionTesting
    StatusAPIs --> StatusTesting
    WorkflowAPIs --> WorkflowTesting
    WebSocketAPIs --> WebSocketTesting
    
    classDef flowStyle fill:#e3f2fd
    classDef jobStyle fill:#fff3e0
    classDef statusStyle fill:#e8f5e8
    classDef workflowStyle fill:#f3e5f5
    classDef websocketStyle fill:#fce4ec
    
    class Start,JobAPIs,StatusAPIs,WorkflowAPIs,WebSocketAPIs,Validation,Complete flowStyle
    class SubmitValidation,AuthTesting,PriorityTesting jobStyle
    class JobStatus,BulkStatus,RealTimeUpdates statusStyle
    class WorkflowCreation,StepExecution,WorkflowStatus workflowStyle
    class ConnectionManagement,EventBroadcasting,ErrorRecovery websocketStyle
```

</FullscreenDiagram>

#### 📤 4.1 Job Submission API Tests
```typescript
// apps/api/src/__tests__/jobSubmission.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app'
import { redis } from '../../../../test/integration-setup'
import type { Express } from 'express'

describe('Job Submission API Integration', () => {
  let app: Express
  
  beforeAll(async () => {
    app = await createApp({
      redis: {
        host: 'localhost',
        port: 6380
      }
    })
  })

  beforeEach(async () => {
    await redis.flushdb()
  })

  describe('POST /api/jobs/submit', () => {
    it('should submit job and return job ID', async ({ expect }) => {
      const jobPayload = {
        type: 'text-to-image',
        prompt: 'A serene landscape',
        parameters: {
          width: 512,
          height: 512,
          steps: 20
        },
        priority: 60
      }

      const response = await request(app)
        .post('/api/jobs/submit')
        .set('x-api-key', 'test_api_key')
        .send(jobPayload)
        .expect(200)

      // Verify response structure
      expect(response.body).toMatchObject({
        success: true,
        job_id: expect.any(String),
        status: 'submitted'
      })

      const jobId = response.body.job_id

      // Verify job created in Redis
      const job = await redis.hgetall(`job:${jobId}`)
      expect(job.status).toBe('pending')
      expect(job.type).toBe('text-to-image')
      expect(JSON.parse(job.payload)).toMatchObject(jobPayload)

      // Verify job in pending queue
      const pendingJobs = await redis.zrange('jobs:pending', 0, -1)
      expect(pendingJobs).toContain(jobId)
    })

    it('should validate job payload and reject invalid requests', async ({ expect }) => {
      const invalidPayload = {
        type: 'invalid-type',
        // Missing required prompt field
        parameters: {}
      }

      const response = await request(app)
        .post('/api/jobs/submit')
        .set('x-api-key', 'test_api_key')
        .send(invalidPayload)
        .expect(400)

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          code: expect.any(String),
          message: expect.stringMatching(/validation/i)
        })
      })
    })

    it('should require valid API key', async ({ expect }) => {
      const jobPayload = {
        type: 'text-to-image',
        prompt: 'Test prompt'
      }

      // No API key
      await request(app)
        .post('/api/jobs/submit')
        .send(jobPayload)
        .expect(401)

      // Invalid API key
      await request(app)
        .post('/api/jobs/submit')
        .set('x-api-key', 'invalid_key')
        .send(jobPayload)
        .expect(401)
    })

    it('should handle high-priority job submission', async ({ expect }) => {
      const regularJob = {
        type: 'text-to-image',
        prompt: 'Regular priority job',
        priority: 50
      }

      const highPriorityJob = {
        type: 'text-to-image',
        prompt: 'High priority job',
        priority: 90
      }

      // Submit both jobs
      const [regularResponse, priorityResponse] = await Promise.all([
        request(app)
          .post('/api/jobs/submit')
          .set('x-api-key', 'test_api_key')
          .send(regularJob),
        request(app)
          .post('/api/jobs/submit')
          .set('x-api-key', 'test_api_key')
          .send(highPriorityJob)
      ])

      // Verify both submitted successfully
      expect(regularResponse.status).toBe(200)
      expect(priorityResponse.status).toBe(200)

      // Verify priority job comes first in queue
      const pendingJobs = await redis.zrange('jobs:pending', 0, -1, 'WITHSCORES')
      expect(pendingJobs).toHaveLength(4) // [jobId1, score1, jobId2, score2]
      
      const highPriorityJobId = priorityResponse.body.job_id
      const highPriorityIndex = pendingJobs.indexOf(highPriorityJobId)
      const highPriorityScore = pendingJobs[highPriorityIndex + 1]
      
      expect(highPriorityScore).toBe('90')
    })
  })

  describe('GET /api/jobs/:jobId/status', () => {
    it('should return job status and details', async ({ expect }) => {
      // Setup: Create test job
      const jobId = 'test-job-id'
      await redis.hmset(`job:${jobId}`, {
        id: jobId,
        type: 'text-to-image',
        status: 'running',
        progress: '45',
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString()
      })

      const response = await request(app)
        .get(`/api/jobs/${jobId}/status`)
        .set('x-api-key', 'test_api_key')
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        job: {
          id: jobId,
          type: 'text-to-image',
          status: 'running',
          progress: 45,
          created_at: expect.any(String),
          started_at: expect.any(String)
        }
      })
    })

    it('should return 404 for non-existent job', async ({ expect }) => {
      const response = await request(app)
        .get('/api/jobs/non-existent-job/status')
        .set('x-api-key', 'test_api_key')
        .expect(404)

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: expect.stringContaining('Job not found')
        }
      })
    })
  })

  describe('WebSocket Job Updates', () => {
    it('should broadcast job status updates via WebSocket', async ({ expect }) => {
      // This test would require WebSocket testing setup
      // Implementation depends on your WebSocket library
      // Here's a conceptual structure:

      /*
      const ws = new WebSocket('ws://localhost:3001/ws')
      
      // Subscribe to job updates
      ws.send(JSON.stringify({
        type: 'subscribe',
        job_id: 'test-job-id'
      }))

      // Trigger job status change
      await request(app)
        .post('/api/jobs/test-job-id/status')
        .set('x-api-key', 'test_api_key')
        .send({ status: 'completed' })

      // Wait for WebSocket message
      const message = await new Promise(resolve => {
        ws.onmessage = (event) => resolve(JSON.parse(event.data))
      })

      expect(message).toMatchObject({
        type: 'job_status_update',
        job_id: 'test-job-id',
        status: 'completed'
      })
      */
    })
  })
})
```

#### 🔄 4.2 Workflow API Integration Tests
```typescript
// apps/api/src/__tests__/workflowAPI.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app'
import { redis } from '../../../../test/integration-setup'
import type { Express } from 'express'

describe('Workflow API Integration', () => {
  let app: Express

  beforeAll(async () => {
    app = await createApp({
      redis: {
        host: 'localhost',
        port: 6380
      }
    })
  })

  beforeEach(async () => {
    await redis.flushdb()
  })

  describe('POST /api/workflows/create', () => {
    it('should create workflow with multiple jobs', async ({ expect }) => {
      const workflowPayload = {
        name: 'Image Generation Workflow',
        description: 'Generate and upscale images',
        steps: [
          {
            type: 'text-to-image',
            prompt: 'A beautiful landscape',
            parameters: { width: 512, height: 512 }
          },
          {
            type: 'upscale',
            scale_factor: 2,
            depends_on: 0 // Depends on first step
          }
        ]
      }

      const response = await request(app)
        .post('/api/workflows/create')
        .set('x-api-key', 'test_api_key')
        .send(workflowPayload)
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        workflow_id: expect.any(String),
        job_ids: expect.arrayContaining([
          expect.any(String),
          expect.any(String)
        ])
      })

      const workflowId = response.body.workflow_id

      // Verify workflow created in Redis
      const workflow = await redis.hgetall(`workflow:${workflowId}`)
      expect(workflow.name).toBe(workflowPayload.name)
      expect(workflow.status).toBe('pending')
      expect(JSON.parse(workflow.steps)).toHaveLength(2)

      // Verify jobs created and linked to workflow
      const jobIds = response.body.job_ids
      for (const jobId of jobIds) {
        const job = await redis.hgetall(`job:${jobId}`)
        expect(job.workflow_id).toBe(workflowId)
        expect(job.status).toBe('pending')
      }
    })

    it('should handle workflow with dependencies correctly', async ({ expect }) => {
      const workflowPayload = {
        name: 'Sequential Processing',
        steps: [
          { type: 'text-to-image', prompt: 'Base image' },
          { type: 'img2img', prompt: 'Enhanced image', depends_on: [0] },
          { type: 'upscale', scale_factor: 2, depends_on: [1] }
        ]
      }

      const response = await request(app)
        .post('/api/workflows/create')
        .set('x-api-key', 'test_api_key')
        .send(workflowPayload)
        .expect(200)

      const workflowId = response.body.workflow_id
      const jobIds = response.body.job_ids

      // First job should be immediately pending
      const firstJob = await redis.hgetall(`job:${jobIds[0]}`)
      expect(firstJob.status).toBe('pending')

      // Dependent jobs should be waiting
      const secondJob = await redis.hgetall(`job:${jobIds[1]}`)
      const thirdJob = await redis.hgetall(`job:${jobIds[2]}`)
      expect(secondJob.status).toBe('waiting')
      expect(thirdJob.status).toBe('waiting')
    })
  })

  describe('GET /api/workflows/:workflowId/status', () => {
    it('should return workflow progress and step details', async ({ expect }) => {
      // Setup: Create test workflow
      const workflowId = 'test-workflow-id'
      const jobIds = ['job-1', 'job-2', 'job-3']

      await redis.hmset(`workflow:${workflowId}`, {
        id: workflowId,
        name: 'Test Workflow',
        status: 'running',
        total_steps: 3,
        completed_steps: 1,
        created_at: new Date().toISOString()
      })

      // Set up jobs in different states
      await redis.hmset(`job:${jobIds[0]}`, {
        id: jobIds[0],
        workflow_id: workflowId,
        status: 'completed',
        result: JSON.stringify({ image_url: 'result1.jpg' })
      })
      
      await redis.hmset(`job:${jobIds[1]}`, {
        id: jobIds[1],
        workflow_id: workflowId,
        status: 'running',
        progress: '50'
      })
      
      await redis.hmset(`job:${jobIds[2]}`, {
        id: jobIds[2],
        workflow_id: workflowId,
        status: 'waiting'
      })

      const response = await request(app)
        .get(`/api/workflows/${workflowId}/status`)
        .set('x-api-key', 'test_api_key')
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        workflow: {
          id: workflowId,
          name: 'Test Workflow',
          status: 'running',
          total_steps: 3,
          completed_steps: 1,
          progress_percentage: expect.closeTo(33.33, 1)
        },
        steps: expect.arrayContaining([
          expect.objectContaining({
            job_id: jobIds[0],
            status: 'completed',
            result: expect.any(Object)
          }),
          expect.objectContaining({
            job_id: jobIds[1],
            status: 'running',
            progress: 50
          }),
          expect.objectContaining({
            job_id: jobIds[2],
            status: 'waiting'
          })
        ])
      })
    })
  })
})
```

### 🔄 Day 5: End-to-End Workflow Testing

> **🎯 Objective**: Validate complete system workflows with WebSocket integration and performance testing.

#### 🔄 Day 5 Implementation Flow

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["📅 Day 5 Start"]) --> E2EWorkflows["🎯 E2E Workflows"]
    E2EWorkflows --> PerformanceTests["⚡ Performance Tests"]
    PerformanceTests --> LoadTests["📈 Load Tests"]
    LoadTests --> StressTests["💪 Stress Tests"]
    StressTests --> FinalValidation["✅ Final Validation"]
    FinalValidation --> Complete(["✅ Phase 1 Complete"])
    
    subgraph E2EWorkflowTesting["🎯 End-to-End Workflow Testing"]
        CompleteJourney["Complete User Journey<br/>Job submission → completion<br/>Real-time status updates<br/>Webhook notifications"]
        MultiStepWorkflow["Multi-step Workflows<br/>Sequential job processing<br/>Dependency management<br/>Conditional execution"]
        FailureRecovery["Failure Recovery<br/>Job retry mechanisms<br/>Error propagation<br/>System resilience"]
    end
    
    subgraph PerformanceTesting["⚡ Performance Testing"]
        ResponseTimes["Response Time Testing<br/>API endpoint latency<br/>Database query performance<br/>Redis operation speed"]
        ThroughputTesting["Throughput Testing<br/>Jobs per second<br/>Concurrent processing<br/>Resource utilization"]
        WebSocketPerformance["WebSocket Performance<br/>Message delivery speed<br/>Connection scaling<br/>Event processing"]
    end
    
    subgraph LoadTesting["📈 Load Testing"]
        ConcurrentUsers["Concurrent Users<br/>50+ simultaneous clients<br/>Job submission scaling<br/>Status query scaling"]
        HighJobVolume["High Job Volume<br/>100+ jobs/minute<br/>Queue management<br/>Worker allocation"]
        SystemScaling["System Scaling<br/>Resource autoscaling<br/>Performance degradation<br/>Breaking point analysis"]
    end
    
    subgraph StressTesting["💪 Stress Testing"]
        ResourceExhaustion["Resource Exhaustion<br/>Memory limits<br/>Connection limits<br/>CPU saturation"]
        NetworkFailures["Network Failures<br/>Connection drops<br/>Timeout handling<br/>Recovery mechanisms"]
        DataIntegrity["Data Integrity<br/>Concurrent modifications<br/>Transaction consistency<br/>State corruption prevention"]
    end
    
    subgraph ValidationCriteria["✅ Validation Criteria"]
        AllTestsPass["All Tests Passing<br/>Zero test failures<br/>No flaky tests<br/>Consistent results"]
        PerformanceTargets["Performance Targets Met<br/>Unit: <10s execution<br/>Integration: <30s<br/>E2E: <60s"]
        CoverageGoals["Coverage Goals Achieved<br/>>85% code coverage<br/>100% critical paths<br/>Edge case handling"]
    end
    
    E2EWorkflows --> E2EWorkflowTesting
    PerformanceTests --> PerformanceTesting
    LoadTests --> LoadTesting
    StressTests --> StressTesting
    FinalValidation --> ValidationCriteria
    
    classDef flowStyle fill:#e3f2fd
    classDef e2eStyle fill:#fff3e0
    classDef perfStyle fill:#e8f5e8
    classDef loadStyle fill:#f3e5f5
    classDef stressStyle fill:#fce4ec
    classDef validationStyle fill:#e1f5fe
    
    class Start,E2EWorkflows,PerformanceTests,LoadTests,StressTests,FinalValidation,Complete flowStyle
    class CompleteJourney,MultiStepWorkflow,FailureRecovery e2eStyle
    class ResponseTimes,ThroughputTesting,WebSocketPerformance perfStyle
    class ConcurrentUsers,HighJobVolume,SystemScaling loadStyle
    class ResourceExhaustion,NetworkFailures,DataIntegrity stressStyle
    class AllTestsPass,PerformanceTargets,CoverageGoals validationStyle
```

</FullscreenDiagram>

#### 🎆 5.1 Complete Job Lifecycle E2E Tests
```typescript
// __tests__/e2e/jobLifecycle.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../apps/api/src/app'
import { redis } from '../../test/integration-setup'
import { WebSocket } from 'ws'
import type { Express } from 'express'

describe('Complete Job Lifecycle E2E', () => {
  let app: Express
  let apiServer: any

  beforeAll(async () => {
    app = await createApp({
      redis: { host: 'localhost', port: 6380 }
    })
    
    apiServer = app.listen(3001)
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000))
  }, 30000)

  afterAll(async () => {
    if (apiServer) {
      apiServer.close()
    }
  })

  it('should handle complete job flow: submit → assign → progress → complete → webhook', async ({ expect }) => {
    // 1. Submit Job
    const jobPayload = {
      type: 'text-to-image',
      prompt: 'A magnificent dragon',
      parameters: {
        width: 512,
        height: 512,
        steps: 20,
        guidance_scale: 7.5
      },
      priority: 70,
      webhook_url: 'http://localhost:3001/test-webhook'
    }

    const submitResponse = await request(app)
      .post('/api/jobs/submit')
      .set('x-api-key', 'test_api_key')
      .send(jobPayload)
      .expect(200)

    const jobId = submitResponse.body.job_id
    expect(jobId).toBeDefined()

    // 2. WebSocket Connection for Real-time Updates
    const ws = new WebSocket(`ws://localhost:3001/ws`)
    const messages: any[] = []

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'subscribe_job',
        job_id: jobId
      }))
    })

    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()))
    })

    // Wait for WebSocket connection
    await new Promise(resolve => setTimeout(resolve, 500))

    // 3. Simulate Worker Assignment
    const workerCapabilities = {
      worker_id: 'test-worker-1',
      machine_id: 'test-machine-1',
      gpu_memory: 12,
      model_types: ['stable-diffusion'],
      capabilities: ['text-to-image']
    }

    // Worker requests job
    const assignResult = await redis.fcall(
      'findMatchingJob',
      0,
      JSON.stringify(workerCapabilities),
      '1'
    )

    const assignedJob = JSON.parse(assignResult as string)
    expect(assignedJob.success).toBe(true)
    expect(assignedJob.jobId).toBe(jobId)

    // 4. Simulate Job Progress Updates
    const progressUpdates = [10, 25, 50, 75, 90]
    
    for (const progress of progressUpdates) {
      await redis.hmset(`job:${jobId}`, {
        status: 'running',
        progress: progress.toString(),
        updated_at: new Date().toISOString()
      })

      // Trigger WebSocket update
      await request(app)
        .post(`/api/internal/jobs/${jobId}/progress`)
        .set('x-api-key', 'test_api_key')
        .send({ progress })

      // Small delay to allow WebSocket message processing
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 5. Complete Job
    const jobResult = {
      image_url: 'https://cdn.example.com/generated/dragon-123.jpg',
      metadata: {
        model: 'stable-diffusion-v1.5',
        steps: 20,
        guidance_scale: 7.5,
        seed: 42
      },
      generation_time: 45.2
    }

    await redis.hmset(`job:${jobId}`, {
      status: 'completed',
      result: JSON.stringify(jobResult),
      progress: '100',
      completed_at: new Date().toISOString()
    })

    // Trigger completion webhook
    await request(app)
      .post(`/api/internal/jobs/${jobId}/complete`)
      .set('x-api-key', 'test_api_key')
      .send({ result: jobResult })

    // 6. Verify Final State
    const finalJobStatus = await request(app)
      .get(`/api/jobs/${jobId}/status`)
      .set('x-api-key', 'test_api_key')
      .expect(200)

    expect(finalJobStatus.body.job).toMatchObject({
      id: jobId,
      status: 'completed',
      progress: 100,
      result: jobResult
    })

    // 7. Verify WebSocket Messages
    // Allow time for all WebSocket messages
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'job_assigned',
          job_id: jobId
        }),
        ...progressUpdates.map(progress => 
          expect.objectContaining({
            type: 'job_progress',
            job_id: jobId,
            progress
          })
        ),
        expect.objectContaining({
          type: 'job_completed',
          job_id: jobId,
          result: jobResult
        })
      ])
    )

    // 8. Verify Webhook Called (mock verification would go here)
    // In a real test, you'd set up a mock webhook server
    
    ws.close()
  }, 60000)

  it('should handle job failure and retry scenarios', async ({ expect }) => {
    // Submit job
    const jobPayload = {
      type: 'text-to-image',
      prompt: 'Test failure scenario',
      max_retries: 2
    }

    const submitResponse = await request(app)
      .post('/api/jobs/submit')
      .set('x-api-key', 'test_api_key')
      .send(jobPayload)
      .expect(200)

    const jobId = submitResponse.body.job_id

    // Assign job to worker
    const workerCapabilities = {
      worker_id: 'test-worker-failure',
      machine_id: 'test-machine-failure',
      gpu_memory: 8,
      model_types: ['stable-diffusion'],
      capabilities: ['text-to-image']
    }

    await redis.fcall(
      'findMatchingJob',
      0,
      JSON.stringify(workerCapabilities),
      '1'
    )

    // Simulate job failure
    const failureReason = {
      code: 'MODEL_LOAD_ERROR',
      message: 'Failed to load model checkpoint',
      timestamp: new Date().toISOString()
    }

    await redis.hmset(`job:${jobId}`, {
      status: 'failed',
      error: JSON.stringify(failureReason),
      retry_count: '1',
      failed_at: new Date().toISOString()
    })

    // Job should be re-queued for retry
    await redis.zadd('jobs:pending', 50, jobId)

    // Verify retry
    const retryAssignResult = await redis.fcall(
      'findMatchingJob',
      0,
      JSON.stringify(workerCapabilities),
      '1'
    )

    const retryJob = JSON.parse(retryAssignResult as string)
    expect(retryJob.success).toBe(true)
    expect(retryJob.jobId).toBe(jobId)

    // Verify retry count incremented
    const jobData = await redis.hgetall(`job:${jobId}`)
    expect(parseInt(jobData.retry_count)).toBeGreaterThan(0)
  })

  it('should handle workflow completion with webhook notifications', async ({ expect }) => {
    // Create multi-step workflow
    const workflowPayload = {
      name: 'Image Processing Pipeline',
      steps: [
        {
          type: 'text-to-image',
          prompt: 'A scenic mountain view'
        },
        {
          type: 'upscale',
          scale_factor: 2,
          depends_on: [0]
        }
      ],
      webhook_url: 'http://localhost:3001/test-workflow-webhook'
    }

    const workflowResponse = await request(app)
      .post('/api/workflows/create')
      .set('x-api-key', 'test_api_key')
      .send(workflowPayload)
      .expect(200)

    const workflowId = workflowResponse.body.workflow_id
    const jobIds = workflowResponse.body.job_ids

    // Complete first job
    const firstJobResult = {
      image_url: 'https://cdn.example.com/mountain-512.jpg'
    }

    await redis.hmset(`job:${jobIds[0]}`, {
      status: 'completed',
      result: JSON.stringify(firstJobResult),
      completed_at: new Date().toISOString()
    })

    // This should trigger second job to become available
    await request(app)
      .post(`/api/internal/workflows/${workflowId}/job-completed`)
      .set('x-api-key', 'test_api_key')
      .send({ job_id: jobIds[0], result: firstJobResult })

    // Verify second job is now pending
    const secondJobStatus = await redis.hget(`job:${jobIds[1]}`, 'status')
    expect(secondJobStatus).toBe('pending')

    // Complete second job
    const secondJobResult = {
      image_url: 'https://cdn.example.com/mountain-1024.jpg',
      upscale_factor: 2
    }

    await redis.hmset(`job:${jobIds[1]}`, {
      status: 'completed',
      result: JSON.stringify(secondJobResult),
      completed_at: new Date().toISOString()
    })

    // Complete workflow
    await request(app)
      .post(`/api/internal/workflows/${workflowId}/job-completed`)
      .set('x-api-key', 'test_api_key')
      .send({ job_id: jobIds[1], result: secondJobResult })

    // Verify workflow completed
    const workflowStatus = await request(app)
      .get(`/api/workflows/${workflowId}/status`)
      .set('x-api-key', 'test_api_key')
      .expect(200)

    expect(workflowStatus.body.workflow.status).toBe('completed')
    expect(workflowStatus.body.workflow.completed_steps).toBe(2)
  })
})
```

#### 📊 5.2 Performance and Load Testing
```typescript
// __tests__/e2e/performance.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../apps/api/src/app'
import { redis } from '../../test/integration-setup'
import type { Express } from 'express'

describe('Performance and Load Testing', () => {
  let app: Express

  beforeAll(async () => {
    app = await createApp({
      redis: { host: 'localhost', port: 6380 }
    })
  })

  it('should handle concurrent job submissions efficiently', async ({ expect }) => {
    const concurrentJobs = 50
    const startTime = Date.now()

    // Create concurrent job submissions
    const jobPromises = Array(concurrentJobs).fill(null).map((_, index) => 
      request(app)
        .post('/api/jobs/submit')
        .set('x-api-key', 'test_api_key')
        .send({
          type: 'text-to-image',
          prompt: `Concurrent job ${index}`,
          priority: Math.floor(Math.random() * 100)
        })
    )

    const responses = await Promise.all(jobPromises)
    const endTime = Date.now()

    // All jobs should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.job_id).toBeDefined()
    })

    // Performance check: should complete within reasonable time
    const duration = endTime - startTime
    expect(duration).toBeLessThan(5000) // 5 seconds for 50 jobs

    // Verify all jobs in Redis
    const pendingJobs = await redis.zrange('jobs:pending', 0, -1)
    expect(pendingJobs).toHaveLength(concurrentJobs)

    console.log(`✅ Submitted ${concurrentJobs} jobs in ${duration}ms (${(duration/concurrentJobs).toFixed(2)}ms per job)`)
  })

  it('should handle high-frequency status checks', async ({ expect }) => {
    // Setup test jobs
    const jobIds = []
    for (let i = 0; i < 10; i++) {
      const jobId = `perf-test-job-${i}`
      jobIds.push(jobId)
      
      await redis.hmset(`job:${jobId}`, {
        id: jobId,
        status: ['pending', 'running', 'completed'][i % 3],
        progress: Math.floor(Math.random() * 100).toString(),
        created_at: new Date().toISOString()
      })
    }

    const checksPerJob = 20
    const totalChecks = jobIds.length * checksPerJob
    const startTime = Date.now()

    // Create high-frequency status checks
    const checkPromises = jobIds.flatMap(jobId =>
      Array(checksPerJob).fill(null).map(() =>
        request(app)
          .get(`/api/jobs/${jobId}/status`)
          .set('x-api-key', 'test_api_key')
      )
    )

    const responses = await Promise.all(checkPromises)
    const endTime = Date.now()

    // All checks should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    const duration = endTime - startTime
    const checksPerSecond = Math.round((totalChecks / duration) * 1000)

    console.log(`✅ Processed ${totalChecks} status checks in ${duration}ms (${checksPerSecond} checks/sec)`)

    // Performance target: at least 100 checks/second
    expect(checksPerSecond).toBeGreaterThan(100)
  })

  it('should handle Redis function performance under load', async ({ expect }) => {
    // Setup test jobs with varying requirements
    const testJobs = Array(100).fill(null).map((_, index) => ({
      id: `load-test-job-${index}`,
      requirements: {
        gpu_memory: [4, 8, 16][index % 3],
        model_type: ['stable-diffusion', 'llm', 'controlnet'][index % 3],
        capabilities: [['text-to-image'], ['text-generation'], ['pose-detection']][index % 3]
      },
      priority: Math.floor(Math.random() * 100)
    }))

    // Add all jobs to Redis
    const pipeline = redis.pipeline()
    testJobs.forEach(job => {
      pipeline.hmset(`job:${job.id}`, {
        ...job,
        requirements: JSON.stringify(job.requirements),
        status: 'pending'
      })
      pipeline.zadd('jobs:pending', job.priority, job.id)
    })
    await pipeline.exec()

    // Test multiple workers requesting jobs simultaneously
    const workerTypes = [
      {
        gpu_memory: 16,
        model_types: ['stable-diffusion', 'llm'],
        capabilities: ['text-to-image', 'text-generation']
      },
      {
        gpu_memory: 8,
        model_types: ['stable-diffusion'],
        capabilities: ['text-to-image']
      },
      {
        gpu_memory: 24,
        model_types: ['llm'],
        capabilities: ['text-generation']
      }
    ]

    const concurrentRequests = 30
    const startTime = Date.now()

    const requestPromises = Array(concurrentRequests).fill(null).map(async (_, index) => {
      const worker = {
        ...workerTypes[index % workerTypes.length],
        worker_id: `load-test-worker-${index}`
      }

      return redis.fcall(
        'findMatchingJob',
        0,
        JSON.stringify(worker),
        '1'
      )
    })

    const results = await Promise.all(requestPromises)
    const endTime = Date.now()

    // Analyze results
    const successfulMatches = results
      .map(r => JSON.parse(r as string))
      .filter(r => r.success)

    const duration = endTime - startTime
    const requestsPerSecond = Math.round((concurrentRequests / duration) * 1000)

    console.log(`✅ Processed ${concurrentRequests} job matching requests in ${duration}ms`)
    console.log(`   - ${successfulMatches.length} successful matches`)
    console.log(`   - ${requestsPerSecond} requests/sec`)

    // Performance target: at least 50 requests/second
    expect(requestsPerSecond).toBeGreaterThan(50)
    
    // Should have successful matches
    expect(successfulMatches.length).toBeGreaterThan(0)
  })
})
```

## Testing Scripts and CI Integration

### 📊 Test Execution Architecture

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph LocalDevelopment["💻 Local Development"]
        DevWatch["pnpm test:watch<br/>Continuous testing<br/>File change detection<br/>Fast feedback loop"]
        DevUI["pnpm test:ui<br/>Visual test interface<br/>Interactive debugging<br/>Test result exploration"]
        DevUnit["pnpm test:unit<br/>Fast unit tests<br/>Isolated components<br/>TDD workflow"]
    end
    
    subgraph CIEnvironment["🔄 CI/CD Environment"]
        CIFull["pnpm test:ci<br/>Complete test suite<br/>Docker orchestration<br/>Coverage reporting"]
        CIParallel["Parallel Execution<br/>Test type separation<br/>Resource optimization<br/>Faster feedback"]
        CIReporting["Test Reporting<br/>JUnit XML output<br/>Coverage badges<br/>Performance metrics"]
    end
    
    subgraph DockerOrchestration["🐳 Docker Orchestration"]
        ServiceStartup["Service Startup<br/>docker-compose up<br/>Health check waiting<br/>Dependency ordering"]
        TestExecution["Test Execution<br/>Isolated containers<br/>Network isolation<br/>Volume management"]
        ServiceCleanup["Service Cleanup<br/>Container shutdown<br/>Volume removal<br/>Resource cleanup"]
    end
    
    subgraph QualityGates["🛡️ Quality Gates"]
        TestResults["Test Results<br/>All tests must pass<br/>Zero flaky tests<br/>Performance thresholds"]
        CoverageCheck["Coverage Check<br/>>85% code coverage<br/>Critical path coverage<br/>Regression detection"]
        SecurityScan["Security Scanning<br/>Dependency vulnerabilities<br/>Code security issues<br/>Best practice validation"]
    end
    
    LocalDevelopment --> CIEnvironment
    CIEnvironment --> DockerOrchestration
    DockerOrchestration --> QualityGates
    
    classDef localStyle fill:#e8f5e8
    classDef ciStyle fill:#e3f2fd
    classDef dockerStyle fill:#fff3e0
    classDef qualityStyle fill:#f3e5f5
    
    class DevWatch,DevUI,DevUnit localStyle
    class CIFull,CIParallel,CIReporting ciStyle
    class ServiceStartup,TestExecution,ServiceCleanup dockerStyle
    class TestResults,CoverageCheck,SecurityScan qualityStyle
```

</FullscreenDiagram>

### Package.json Scripts Update
```json
{
  "scripts": {
    // Development testing
    "test": "vitest",
    "test:unit": "vitest --project unit",
    "test:integration": "vitest --project integration --run",
    "test:e2e": "vitest --project e2e --run",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    
    // CI/CD testing
    "test:ci": "npm run test:docker && npm run test:integration && npm run test:e2e",
    "test:docker": "docker-compose -f docker-compose.test.yml up -d --wait",
    "test:docker:down": "docker-compose -f docker-compose.test.yml down -v",
    
    // Coverage and reporting
    "test:coverage": "vitest --coverage",
    "test:coverage:ui": "vitest --coverage --ui",
    "test:report": "vitest --reporter=junit --outputFile=test-results.xml"
  }
}
```

### GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
          
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_USER: testuser
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Setup test environment
      run: |
        cp .env.test.example .env.test
        
    - name: Run unit tests
      run: npm run test:unit
      
    - name: Run integration tests
      run: npm run test:integration
      env:
        REDIS_HOST: localhost
        REDIS_PORT: 6379
        DATABASE_URL: postgresql://testuser:testpass@localhost:5432/testdb
        
    - name: Run E2E tests
      run: npm run test:e2e
      env:
        REDIS_HOST: localhost
        REDIS_PORT: 6379
        DATABASE_URL: postgresql://testuser:testpass@localhost:5432/testdb
        
    - name: Upload test results
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: test-results
        path: |
          test-results.xml
          coverage/
```

## Success Criteria and Validation

### 🎯 Validation Decision Tree

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["🚀 Begin Validation"]) --> UnitCheck{"Unit Tests Pass?"}
    UnitCheck -->|Yes| IntegrationCheck{"Integration Tests Pass?"}
    UnitCheck -->|No| UnitFix["🔧 Fix Unit Test Issues"]
    UnitFix --> UnitCheck
    
    IntegrationCheck -->|Yes| E2ECheck{"E2E Tests Pass?"}
    IntegrationCheck -->|No| IntegrationFix["🔧 Fix Integration Issues"]
    IntegrationFix --> IntegrationCheck
    
    E2ECheck -->|Yes| CoverageCheck{"Coverage >85%?"}
    E2ECheck -->|No| E2EFix["🔧 Fix E2E Issues"]
    E2EFix --> E2ECheck
    
    CoverageCheck -->|Yes| PerformanceCheck{"Performance Targets Met?"}
    CoverageCheck -->|No| CoverageImprove["📈 Improve Test Coverage"]
    CoverageImprove --> CoverageCheck
    
    PerformanceCheck -->|Yes| ReliabilityCheck{"Zero Flaky Tests?"}
    PerformanceCheck -->|No| PerformanceOptimize["⚡ Optimize Performance"]
    PerformanceOptimize --> PerformanceCheck
    
    ReliabilityCheck -->|Yes| CICheck{"CI/CD Integration Works?"}
    ReliabilityCheck -->|No| ReliabilityFix["🛠️ Fix Test Reliability"]
    ReliabilityFix --> ReliabilityCheck
    
    CICheck -->|Yes| ValidationComplete(["✅ Phase 1 Complete"])
    CICheck -->|No| CIFix["🔄 Fix CI/CD Issues"]
    CIFix --> CICheck
    
    subgraph ValidationMetrics["📊 Validation Metrics"]
        TestMetrics["Test Metrics:<br/>• Unit: <10s execution<br/>• Integration: <30s execution<br/>• E2E: <60s execution<br/>• Coverage: >85%"]
        QualityMetrics["Quality Metrics:<br/>• Zero flaky tests<br/>• Deterministic results<br/>• Clear error messages<br/>• Comprehensive scenarios"]
        PerformanceMetrics["Performance Metrics:<br/>• 50+ concurrent operations<br/>• 100+ jobs/minute throughput<br/>• <100ms API response time<br/>• Reliable WebSocket delivery"]
    end
    
    ValidationComplete --> ValidationMetrics
    
    classDef startStyle fill:#e8f5e8
    classDef checkStyle fill:#e3f2fd
    classDef fixStyle fill:#fff3e0
    classDef completeStyle fill:#c8e6c9
    classDef metricStyle fill:#f3e5f5
    
    class Start,ValidationComplete startStyle
    class UnitCheck,IntegrationCheck,E2ECheck,CoverageCheck,PerformanceCheck,ReliabilityCheck,CICheck checkStyle
    class UnitFix,IntegrationFix,E2EFix,CoverageImprove,PerformanceOptimize,ReliabilityFix,CIFix fixStyle
    class TestMetrics,QualityMetrics,PerformanceMetrics metricStyle
```

</FullscreenDiagram>

### Technical Metrics
- **Test Coverage**: >85% code coverage across all packages
- **Test Performance**: 
  - Unit tests: <10s total execution time
  - Integration tests: <30s total execution time
  - E2E tests: <60s total execution time
- **Redis Function Testing**: 100% coverage of core job matching logic
- **API Integration**: All endpoints tested with success/failure scenarios
- **Concurrent Testing**: Support for 50+ concurrent operations

### Quality Metrics
- **Zero Flaky Tests**: All tests must be deterministic and reliable
- **Clear Test Organization**: Logical separation of unit/integration/e2e tests
- **Comprehensive Documentation**: Each test suite documented with purpose and scope
- **CI/CD Integration**: Automated testing on all pull requests

### Completion Checklist
- [ ] Vitest configuration implemented across monorepo
- [ ] Docker-based test environment operational
- [ ] Redis function test suite covering job matching logic
- [ ] API integration tests for job submission/status workflows
- [ ] WebSocket testing infrastructure established
- [ ] Workflow API testing implemented
- [ ] End-to-end job lifecycle tests passing
- [ ] Performance and load testing baseline established
- [ ] CI/CD pipeline integrated and passing
- [ ] Test documentation complete

## Risk Mitigation

### ⚠️ Risk Assessment Matrix

<FullscreenDiagram>

```mermaid
flowchart TD
    subgraph TechnicalRisks["🔧 Technical Risks"]
        DockerRisk["Docker Environment Issues<br/>Impact: HIGH<br/>Probability: MEDIUM<br/>Container networking/startup"]
        RedisRisk["Redis Function Complexity<br/>Impact: HIGH<br/>Probability: LOW<br/>Atomic operations testing"]
        WebSocketRisk["WebSocket Testing Issues<br/>Impact: MEDIUM<br/>Probability: MEDIUM<br/>Async event handling"]
        ConcurrencyRisk["Concurrency Testing<br/>Impact: HIGH<br/>Probability: MEDIUM<br/>Race conditions"]
    end
    
    subgraph OperationalRisks["⚙️ Operational Risks"]
        CIPerformanceRisk["CI/CD Performance<br/>Impact: MEDIUM<br/>Probability: HIGH<br/>Slow test execution"]
        MaintenanceRisk["Test Maintenance Burden<br/>Impact: MEDIUM<br/>Probability: MEDIUM<br/>Complex test suites"]
        FlakeRisk["Flaky Tests<br/>Impact: HIGH<br/>Probability: MEDIUM<br/>Unreliable test results"]
        ResourceRisk["Resource Constraints<br/>Impact: MEDIUM<br/>Probability: LOW<br/>CI/CD resource limits"]
    end
    
    subgraph MitigationStrategies["🛡️ Mitigation Strategies"]
        DockerMitigation["Docker Mitigation:<br/>• Health check validation<br/>• Retry mechanisms<br/>• Fallback to local services<br/>• Clear error messages"]
        RedisMitigation["Redis Mitigation:<br/>• Isolated test instances<br/>• Transaction testing<br/>• Atomic operation validation<br/>• Comprehensive scenarios"]
        WebSocketMitigation["WebSocket Mitigation:<br/>• Event ordering tests<br/>• Timeout handling<br/>• Connection retry logic<br/>• Message acknowledgment"]
        ConcurrencyMitigation["Concurrency Mitigation:<br/>• Stress testing<br/>• Load simulation<br/>• Resource monitoring<br/>• Deadlock detection"]
    end
    
    subgraph MonitoringAlerts["📊 Monitoring & Alerts"]
        TestMonitoring["Test Monitoring:<br/>• Execution time tracking<br/>• Success rate monitoring<br/>• Flaky test detection<br/>• Coverage trend analysis"]
        PerformanceMonitoring["Performance Monitoring:<br/>• Response time tracking<br/>• Resource usage monitoring<br/>• Throughput measurement<br/>• Bottleneck identification"]
        QualityMonitoring["Quality Monitoring:<br/>• Code coverage tracking<br/>• Test reliability metrics<br/>• Error rate monitoring<br/>• Regression detection"]
    end
    
    DockerRisk --> DockerMitigation
    RedisRisk --> RedisMitigation
    WebSocketRisk --> WebSocketMitigation
    ConcurrencyRisk --> ConcurrencyMitigation
    
    DockerMitigation --> TestMonitoring
    RedisMitigation --> PerformanceMonitoring
    WebSocketMitigation --> QualityMonitoring
    ConcurrencyMitigation --> TestMonitoring
    
    classDef riskStyle fill:#ffcdd2
    classDef mitigationStyle fill:#fff3e0
    classDef monitoringStyle fill:#e8f5e8
    
    class DockerRisk,RedisRisk,WebSocketRisk,ConcurrencyRisk,CIPerformanceRisk,MaintenanceRisk,FlakeRisk,ResourceRisk riskStyle
    class DockerMitigation,RedisMitigation,WebSocketMitigation,ConcurrencyMitigation mitigationStyle
    class TestMonitoring,PerformanceMonitoring,QualityMonitoring monitoringStyle
```

</FullscreenDiagram>

### Technical Risks
1. **Docker Environment Issues**
   - **Risk**: Container startup/networking problems
   - **Mitigation**: Health checks, wait strategies, fallback to local services
   - **Detection**: CI pipeline failures, test timeouts

2. **Redis Function Complexity**
   - **Risk**: Difficult to test atomic operations
   - **Mitigation**: Isolated Redis instances, transaction testing
   - **Detection**: Race condition failures, inconsistent results

3. **WebSocket Testing Challenges**
   - **Risk**: Async event testing complexity
   - **Mitigation**: Proper event ordering, timeout handling
   - **Detection**: Intermittent WebSocket test failures

### Operational Risks
1. **CI/CD Performance Impact**
   - **Risk**: Slow test execution blocking development
   - **Mitigation**: Parallel execution, selective testing
   - **Detection**: PR feedback delays

2. **Test Maintenance Burden**
   - **Risk**: High maintenance cost for complex tests
   - **Mitigation**: Simple, focused tests with clear purposes
   - **Detection**: Frequent test updates required

## Next Steps: Phase 2 Preparation

### 🔮 Phase Transition Roadmap

<FullscreenDiagram>

```mermaid
flowchart TD
    Phase1Complete(["✅ Phase 1 Complete<br/>Testing Foundation"]) --> TransitionAnalysis["📊 Transition Analysis"]
    TransitionAnalysis --> Phase2Planning["📋 Phase 2 Planning"]
    Phase2Planning --> FoundationHandoff["🤝 Foundation Handoff"]
    
    subgraph Phase1Deliverables["📦 Phase 1 Deliverables"]
        TestingFramework["🧪 Testing Framework<br/>Vitest infrastructure<br/>Multi-project setup<br/>CI/CD integration"]
        TestSuites["📊 Comprehensive Test Suites<br/>Unit, Integration, E2E<br/>Performance benchmarks<br/>Load testing framework"]
        QualityGates["🛡️ Quality Gates<br/>>85% coverage<br/>Zero flaky tests<br/>Performance standards"]
        Documentation["📚 Documentation<br/>Testing procedures<br/>Validation criteria<br/>Maintenance guides"]
    end
    
    subgraph Phase2Preparation["🔄 Phase 2 Preparation"]
        EventTesting["📡 Event Testing Ready<br/>WebSocket infrastructure<br/>Real-time validation<br/>Event-driven patterns"]
        MessageBusReady["🚌 Message Bus Ready<br/>Integration points tested<br/>Event flow validation<br/>Performance baselines"]
        APIValidation["🔌 API Validation Ready<br/>Endpoint test coverage<br/>Schema validation<br/>Error handling tested"]
        PerformanceBaseline["📈 Performance Baseline<br/>Current system metrics<br/>Bottleneck identification<br/>Scaling thresholds"]
    end
    
    subgraph Phase2Success["🎯 Phase 2 Success Criteria"]
        TestingContinuity["Testing Continuity<br/>All existing tests pass<br/>New message bus tests<br/>Regression prevention"]
        PerformanceValidation["Performance Validation<br/>Message bus benchmarks<br/>Event processing speed<br/>System throughput"]
        ReliabilityAssurance["Reliability Assurance<br/>Event delivery guarantees<br/>Failure recovery<br/>Data consistency"]
    end
    
    Phase1Complete --> Phase1Deliverables
    TransitionAnalysis --> Phase2Preparation
    FoundationHandoff --> Phase2Success
    
    classDef completeStyle fill:#c8e6c9
    classDef deliverableStyle fill:#e3f2fd
    classDef prepStyle fill:#fff3e0
    classDef successStyle fill:#e8f5e8
    
    class Phase1Complete completeStyle
    class TestingFramework,TestSuites,QualityGates,Documentation deliverableStyle
    class EventTesting,MessageBusReady,APIValidation,PerformanceBaseline prepStyle
    class TestingContinuity,PerformanceValidation,ReliabilityAssurance successStyle
```

</FullscreenDiagram>

This testing infrastructure creates the foundation for Phase 2: Message Bus Implementation. Key preparations:

1. **Event Testing Framework**: Tests are structured to validate event-driven patterns
2. **Integration Points**: API tests ready to verify message bus integration
3. **WebSocket Infrastructure**: Real-time testing foundation established
4. **Performance Baseline**: Load testing framework ready for message bus performance validation

The robust testing foundation ensures that the message bus implementation in Phase 2 can be developed with confidence, backed by comprehensive validation of all integration points and performance characteristics.

### 🚀 Implementation Readiness Checklist

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["🎯 Implementation Ready"]) --> TeamReadiness{"Team Prepared?"}
    TeamReadiness -->|Yes| EnvironmentReady{"Environment Setup?"}
    TeamReadiness -->|No| TeamPrep["👥 Team Preparation<br/>Review implementation guide<br/>Understand architecture<br/>Clarify responsibilities"]
    TeamPrep --> TeamReadiness
    
    EnvironmentReady -->|Yes| ResourcesAvailable{"Resources Available?"}
    EnvironmentReady -->|No| EnvSetup["🏗️ Environment Setup<br/>Docker installation<br/>Development tools<br/>Access permissions"]
    EnvSetup --> EnvironmentReady
    
    ResourcesAvailable -->|Yes| TimeAllocated{"Time Allocated?"}
    ResourcesAvailable -->|No| ResourcePlanning["📊 Resource Planning<br/>Allocate development time<br/>Schedule implementation<br/>Plan validation checkpoints"]
    ResourcePlanning --> ResourcesAvailable
    
    TimeAllocated -->|Yes| BeginImplementation(["🚀 Begin Implementation"])
    TimeAllocated -->|No| TimeAllocation["📅 Time Allocation<br/>5-day implementation window<br/>Daily checkpoint planning<br/>Buffer for issue resolution"]
    TimeAllocation --> TimeAllocated
    
    subgraph ReadinessCriteria["✅ Readiness Criteria"]
        Technical["Technical Readiness:<br/>• Docker environment available<br/>• Node.js and pnpm installed<br/>• Git repository access<br/>• Editor/IDE configured"]
        Knowledge["Knowledge Readiness:<br/>• Implementation guide reviewed<br/>• Architecture understood<br/>• Testing strategy clear<br/>• Validation criteria known"]
        Organizational["Organizational Readiness:<br/>• Team availability confirmed<br/>• 5-day implementation window<br/>• Daily progress checkpoints<br/>• Issue escalation plan"]
    end
    
    BeginImplementation --> ReadinessCriteria
    
    classDef startStyle fill:#e8f5e8
    classDef checkStyle fill:#e3f2fd
    classDef actionStyle fill:#fff3e0
    classDef criteriaStyle fill:#f3e5f5
    
    class Start,BeginImplementation startStyle
    class TeamReadiness,EnvironmentReady,ResourcesAvailable,TimeAllocated checkStyle
    class TeamPrep,EnvSetup,ResourcePlanning,TimeAllocation actionStyle
    class Technical,Knowledge,Organizational criteriaStyle
```

</FullscreenDiagram>

---

**Status**: ✅ **Ready for implementation**. This comprehensive guide provides all necessary visual workflows, step-by-step instructions, and validation criteria for successful Phase 1 completion.

**Next Action**: Begin Day 1 implementation following the detailed workflow diagrams and validation checkpoints. Proceed to Phase 2 after successful completion of all Phase 1 deliverables.
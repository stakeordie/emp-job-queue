# Testing Framework & E2E Tests

## Status: Pending

## Description
Implement comprehensive testing strategy using Vitest, React Testing Library, and Playwright to ensure the Next.js monitor app is reliable and maintainable.

## Testing Strategy

### Unit Testing (Vitest + React Testing Library)
```typescript
// Component tests
describe('JobCard', () => {
  it('displays job information correctly', () => {
    const job = createMockJob({ status: 'active' });
    render(<JobCard job={job} />);
    
    expect(screen.getByText(job.id)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
  
  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const job = createMockJob({ status: 'pending' });
    render(<JobCard job={job} onCancel={onCancel} />);
    
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledWith(job.id);
  });
});

// Store tests
describe('JobStore', () => {
  it('adds job correctly', () => {
    const store = createJobStore();
    const job = createMockJob();
    
    store.addJob(job);
    
    expect(store.jobs[job.id]).toEqual(job);
  });
});

// Hook tests
describe('useWebSocket', () => {
  it('connects to WebSocket successfully', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3002'));
    
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });
});
```

### Integration Testing
```typescript
// Store integration tests
describe('Job Submission Integration', () => {
  it('submits job and updates store', async () => {
    const mockWebSocket = createMockWebSocketService();
    const { result } = renderHook(() => useJobStore(), {
      wrapper: ({ children }) => (
        <WebSocketProvider service={mockWebSocket}>
          {children}
        </WebSocketProvider>
      ),
    });
    
    await act(async () => {
      await result.current.submitJob({
        jobType: 'simulation',
        priority: 5,
        payload: { test: true }
      });
    });
    
    expect(mockWebSocket.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'submit_job',
        job_type: 'simulation'
      })
    );
  });
});
```

### E2E Testing (Playwright)
```typescript
// Full workflow tests
test.describe('Job Management Workflow', () => {
  test('complete job submission and monitoring flow', async ({ page }) => {
    await page.goto('/');
    
    // Connect to WebSocket
    await expect(page.locator('[data-testid="connection-indicator"]')).toHaveClass(/connected/);
    
    // Submit a job
    await page.fill('[data-testid="job-type-select"]', 'simulation');
    await page.fill('[data-testid="priority-input"]', '5');
    await page.click('[data-testid="submit-job-button"]');
    
    // Verify job appears in queue
    await expect(page.locator('[data-testid="job-card"]').first()).toBeVisible();
    
    // Wait for job completion
    await expect(page.locator('[data-testid="job-status"]').first()).toHaveText('Completed');
  });
  
  test('workflow simulation creates sequential jobs', async ({ page }) => {
    await page.goto('/');
    
    // Enable workflow simulation
    await page.check('[data-testid="workflow-simulation-checkbox"]');
    await page.click('[data-testid="submit-job-button"]');
    
    // Verify workflow jobs are created
    await expect(page.locator('[data-testid="job-card"]')).toHaveCount(5);
    
    // Verify all jobs have same workflow_id
    const workflowIds = await page.locator('[data-testid="workflow-id"]').allTextContents();
    expect(new Set(workflowIds).size).toBe(1);
  });
});
```

## Testing Infrastructure

### Mock Services
```typescript
// Mock WebSocket Service
export class MockWebSocketService implements WebSocketService {
  private handlers = new Map<string, Function[]>();
  public sentMessages: any[] = [];
  
  async connect(url: string): Promise<void> {
    // Mock connection logic
  }
  
  send<T>(message: T): Promise<void> {
    this.sentMessages.push(message);
    return Promise.resolve();
  }
  
  onMessage<T>(type: string, handler: (message: T) => void): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }
}

// Mock Data Factories
export const createMockJob = (overrides?: Partial<Job>): Job => ({
  id: 'job-123',
  job_type: 'simulation',
  status: 'pending',
  priority: 50,
  created_at: Date.now(),
  payload: { test: true },
  ...overrides,
});
```

### Test Utilities
```typescript
// Custom render function with providers
export const renderWithProviders = (
  ui: React.ReactElement,
  options?: {
    preloadedState?: any;
    webSocketService?: WebSocketService;
  }
) => {
  const { preloadedState, webSocketService = new MockWebSocketService() } = options || {};
  
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <WebSocketProvider service={webSocketService}>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </WebSocketProvider>
  );
  
  return render(ui, { wrapper: Wrapper });
};
```

## Tasks
- [ ] Set up Vitest with React Testing Library
- [ ] Configure Playwright for E2E testing
- [ ] Create mock services and data factories
- [ ] Write unit tests for all components
- [ ] Write unit tests for all stores and hooks
- [ ] Create integration tests for key workflows
- [ ] Build E2E tests for complete user journeys
- [ ] Set up test coverage reporting
- [ ] Create visual regression testing
- [ ] Add performance testing benchmarks
- [ ] Implement test data management
- [ ] Set up CI/CD testing pipeline
- [ ] Create test documentation and guidelines

## Priority: Medium

## Dependencies
- monitor-app-setup.md (project structure)
- monitor-core-components.md (components to test)
- monitor-state-management.md (stores to test)
- monitor-websocket-service.md (service to test)

## Files to Create
- `vitest.config.ts` - Vitest configuration
- `playwright.config.ts` - Playwright configuration
- `__tests__/setup.ts` - Test setup and utilities
- `__tests__/mocks/` - Mock services and data
- `__tests__/components/` - Component unit tests
- `__tests__/stores/` - Store unit tests
- `__tests__/hooks/` - Hook unit tests
- `__tests__/integration/` - Integration tests
- `__tests__/e2e/` - Playwright E2E tests
- `__tests__/utils/` - Test utilities and helpers

## Acceptance Criteria
- [ ] 90%+ code coverage for all components and stores
- [ ] All critical user journeys covered by E2E tests
- [ ] CI/CD pipeline runs tests automatically
- [ ] Tests are fast and reliable (no flaky tests)
- [ ] Visual regression testing prevents UI breaks
- [ ] Performance tests catch regressions
- [ ] Test documentation guides contributors
- [ ] Mock services accurately simulate real behavior
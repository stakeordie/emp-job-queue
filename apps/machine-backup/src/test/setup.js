import { vi } from 'vitest'

// Mock console methods for cleaner test output
vi.mock('console', () => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}))

// Mock fs-extra for testing
vi.mock('fs-extra', () => ({
  ensureDir: vi.fn(),
  copy: vi.fn(),
  remove: vi.fn(),
  readJson: vi.fn(),
  writeJson: vi.fn(),
  pathExists: vi.fn(),
}))

// Mock execa for testing
vi.mock('execa', () => ({
  default: vi.fn(() => ({ stdout: '', stderr: '' })),
}))

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks()
})

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks()
})
/**
 * Staging Environment Initialization
 *
 * This file should be imported at the top of worker entry points
 * when running in staging mode to activate HTTP mocks.
 *
 * PRODUCTION SAFETY: Only runs when NODE_ENV=staging or MOCK_MODE=true
 */

import './mocks/mock-manager.js';

// Simple flag to confirm mocks are loaded
console.log('🎭 Staging initialization complete - HTTP mocks ready if enabled');

export { isMockMode, simulateError } from './mocks/mock-manager.js';
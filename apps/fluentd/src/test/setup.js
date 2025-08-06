/**
 * Test setup for Fluentd companion service tests
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
process.env.SERVICE_NAME = 'fluentd-aggregator-test';

// Mock external dependencies
global.fetch = async (url, options) => {
  // Mock Fluentd health endpoint
  if (url.includes('24220/api/plugins.json')) {
    return {
      ok: true,
      json: async () => ({
        plugins: [
          { type: 'input', plugin: 'forward', config: {} },
          { type: 'output', plugin: 'dash0', config: {} }
        ]
      })
    };
  }
  
  // Mock other HTTP calls
  return {
    ok: true,
    json: async () => ({}),
    text: async () => 'OK'
  };
};
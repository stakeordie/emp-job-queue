// Integration test setup - uses real Redis but isolated
import Redis from 'ioredis';

let testRedis: Redis;

beforeAll(async () => {
  // Use test database (Redis DB 15)
  testRedis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: 15, // Use dedicated test database
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true
  });

  try {
    await testRedis.connect();
    console.log('Connected to test Redis database');
  } catch (error) {
    console.warn('Redis not available for integration tests:', error.message);
    // Skip Redis-dependent tests if Redis is not available
    process.env.SKIP_REDIS_TESTS = 'true';
  }
});

beforeEach(async () => {
  if (testRedis && process.env.SKIP_REDIS_TESTS !== 'true') {
    // Clear test database before each test
    await testRedis.flushdb();
  }
});

afterAll(async () => {
  if (testRedis) {
    await testRedis.quit();
  }
});

// Make test Redis instance available globally
global.testRedis = testRedis;
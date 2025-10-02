#!/usr/bin/env node
/**
 * Remove TTL from attestation keys in production Redis
 * This ensures we don't lose attestation data when TTLs expire
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || process.env.HUB_REDIS_URL;

if (!REDIS_URL) {
  console.error('❌ REDIS_URL or HUB_REDIS_URL environment variable required');
  process.exit(1);
}

const redis = new Redis(REDIS_URL, {
  enableReadyCheck: true,
  maxRetriesPerRequest: 10,
});

// Attestation key patterns to check
const ATTESTATION_PATTERNS = [
  'worker:completion:*',
  'worker:failure:*',
  'workflow:failure:*',
  'api:workflow:completion:*',
  'api:workflow:failure:*',
  'user_notification_attestation:*',
];

async function findKeysWithTTL(pattern) {
  const keys = [];
  let cursor = '0';

  do {
    const [nextCursor, foundKeys] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      1000
    );
    cursor = nextCursor;

    // Check TTL for each key
    for (const key of foundKeys) {
      const ttl = await redis.ttl(key);
      // ttl > 0 means key has expiration, -1 means no expiration, -2 means key doesn't exist
      if (ttl > 0) {
        keys.push({ key, ttl });
      }
    }
  } while (cursor !== '0');

  return keys;
}

async function removeTTL(key) {
  const result = await redis.persist(key);
  return result === 1; // 1 = TTL removed, 0 = key doesn't exist or already has no TTL
}

async function main() {
  console.log('🔍 Scanning Redis for attestation keys with TTL...\n');

  const allKeysWithTTL = [];

  for (const pattern of ATTESTATION_PATTERNS) {
    console.log(`📋 Checking pattern: ${pattern}`);
    const keysWithTTL = await findKeysWithTTL(pattern);

    if (keysWithTTL.length > 0) {
      console.log(`   Found ${keysWithTTL.length} keys with TTL`);
      allKeysWithTTL.push(...keysWithTTL);
    } else {
      console.log(`   No keys with TTL found`);
    }
  }

  console.log(`\n📊 Summary: Found ${allKeysWithTTL.length} total keys with TTL\n`);

  if (allKeysWithTTL.length === 0) {
    console.log('✅ No attestation keys have TTL - all good!');
    await redis.quit();
    return;
  }

  // Show sample of keys that will be updated
  console.log('Sample keys with TTL:');
  allKeysWithTTL.slice(0, 5).forEach(({ key, ttl }) => {
    const days = Math.floor(ttl / 86400);
    const hours = Math.floor((ttl % 86400) / 3600);
    console.log(`   ${key} - expires in ${days}d ${hours}h`);
  });

  if (allKeysWithTTL.length > 5) {
    console.log(`   ... and ${allKeysWithTTL.length - 5} more\n`);
  }

  // Check-only mode - just report, don't modify
  if (process.env.CHECK_ONLY === 'true' || process.env.AUTO_CONFIRM !== 'true') {
    if (process.env.CHECK_ONLY === 'true') {
      console.log('✅ Check complete (CHECK_ONLY mode - no changes made)\n');
    } else {
      console.log('\n⚠️  This will remove TTL from all these keys, making them persist indefinitely.');
      console.log('To proceed, run with AUTO_CONFIRM=true environment variable.\n');
    }
    await redis.quit();
    return;
  }

  console.log('\n🔧 Removing TTL from keys...\n');

  let successCount = 0;
  let failCount = 0;

  for (const { key } of allKeysWithTTL) {
    const success = await removeTTL(key);
    if (success) {
      successCount++;
      if (successCount % 100 === 0) {
        console.log(`   Processed ${successCount}/${allKeysWithTTL.length} keys...`);
      }
    } else {
      failCount++;
      console.log(`   ⚠️  Failed to remove TTL from: ${key}`);
    }
  }

  console.log(`\n✅ Complete!`);
  console.log(`   Successfully removed TTL: ${successCount}`);
  if (failCount > 0) {
    console.log(`   Failed: ${failCount}`);
  }

  await redis.quit();
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

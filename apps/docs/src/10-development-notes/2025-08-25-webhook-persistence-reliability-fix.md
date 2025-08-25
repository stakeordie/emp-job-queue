# Webhook Persistence Reliability Fix: Ensuring Zero-Loss Registration

**Date**: 2025-08-25  
**Status**: Implementation Required  
**Priority**: Critical  

## Problem Statement

**User Report**: "I registered a webhook but it disappeared from the system."

**Root Cause Analysis**: The webhook system has several reliability gaps that can cause webhook configurations to be lost:

### **Critical Issue: Cache-Only Visibility**
```typescript
// packages/core/src/services/webhook-notification-service.ts:1394
private async refreshCache(): Promise<void> {
  const activeWebhooks = await this.webhookStorage.getActiveWebhooks(); // ❌ Only active
  
  this.webhooksCache.clear(); // ❌ Clears ALL webhooks 
  for (const webhook of activeWebhooks) {
    this.webhooksCache.set(webhook.id, webhook);
  }
}
```

**The Problem**: 
- `refreshCache()` only loads `active: true` webhooks into cache
- APIs use cache-first lookup: `this.webhooksCache.get(id)` 
- If webhook becomes `active: false` or leaves active set, it becomes "invisible" 
- User sees webhook as deleted even though it's still in Redis storage

### **Secondary Issues**

#### **1. Race Conditions in Registration**
```typescript
// Potential race condition
await this.webhookStorage.storeWebhook(webhook);        // Redis write
this.webhooksCache.set(webhook.id, webhook);           // Cache write
// ↑ If refreshCache() runs between these, cache write is lost
```

#### **2. Inconsistent Storage States**
- Webhook exists in `webhooks:registry` hash but not in `webhooks:active` set
- Service restart loads only active webhooks, losing inactive ones
- No recovery mechanism for orphaned configurations

#### **3. Missing Durability Guarantees**
- No confirmation of successful Redis persistence
- No retry logic for failed webhook registration
- No background consistency verification

## Technical Investigation

### **Current Storage Architecture**
```typescript
// Redis storage pattern
webhooks:registry       // Hash: webhook_id → webhook_config JSON
webhooks:active         // Set: webhook_ids that are active
webhooks:stats:${id}    // Hash: delivery statistics  
webhooks:attempts:${id} // List: delivery attempts
```

**Cache Refresh Logic** (Every 30 seconds):
1. `getActiveWebhooks()` → queries `webhooks:active` set
2. For each active ID → fetch from `webhooks:registry`
3. **Clear entire cache** → rebuild with only active webhooks
4. **Result**: Inactive webhooks disappear from memory

### **API Lookup Chain** (The Visibility Problem):
```typescript
// getWebhook() - line 460
async getWebhook(id: string): Promise<WebhookEndpoint | null> {
  const cached = this.webhooksCache.get(id);  // ❌ Cache-first
  if (cached) return cached;                  // ❌ Fast path skips Redis
  
  // Fallback to Redis (but only for cache misses)
  const webhook = await this.webhookStorage.getWebhook(id);
  if (webhook) {
    this.webhooksCache.set(id, webhook);      // ❌ Re-adds to cache
  }
  return webhook;
}
```

**The Issue**: Once `refreshCache()` removes an inactive webhook from cache, the next `getWebhook()` call will:
1. Miss in cache → fallback to Redis  
2. Find webhook in Redis → add back to cache
3. **But**: Next `refreshCache()` removes it again if still inactive

**Result**: Webhook "flickers" between visible/invisible based on timing.

## Solution Architecture

### **1. Fix Cache Strategy: Include All Webhooks**

```typescript
// FIXED: Load ALL webhooks into cache, not just active ones
private async refreshCache(): Promise<void> {
  try {
    const allWebhooks = await this.webhookStorage.getAllWebhooks(); // ✅ Get ALL
    
    // Rebuild cache with ALL webhooks (active and inactive)
    this.webhooksCache.clear();
    for (const webhook of allWebhooks) {
      this.webhooksCache.set(webhook.id, webhook);
    }
    
    logger.debug(`Webhook cache refreshed: ${allWebhooks.length} total webhooks`);
  } catch (error) {
    logger.error('Failed to refresh webhook cache:', error);
    // Don't clear cache on failure - keep existing data
  }
}
```

### **2. Add Registration Reliability**

```typescript
// Enhanced registration with confirmation
async registerWebhook(
  config: Omit<WebhookEndpoint, 'id' | 'created_at' | 'updated_at'>
): Promise<WebhookEndpoint> {
  const webhook: WebhookEndpoint = {
    id: this.generateId(),
    created_at: Date.now(),
    updated_at: Date.now(),
    active: true,
    ...config,
  };

  // Atomic registration with confirmation
  try {
    await this.webhookStorage.storeWebhook(webhook);
    
    // ✅ Verify storage succeeded before declaring success
    const stored = await this.webhookStorage.getWebhook(webhook.id);
    if (!stored) {
      throw new Error(`Webhook storage verification failed for ${webhook.id}`);
    }
    
    // ✅ Update cache after confirmed storage
    this.webhooksCache.set(webhook.id, webhook);
    
    logger.info(`Webhook registered and verified: ${webhook.id} -> ${webhook.url}`);
    return webhook;
  } catch (error) {
    logger.error(`Webhook registration failed: ${webhook.id}`, error);
    
    // Cleanup attempt (best effort)
    try {
      await this.webhookStorage.deleteWebhook(webhook.id);
      this.webhooksCache.delete(webhook.id);
    } catch (cleanupError) {
      logger.warn(`Cleanup failed for webhook ${webhook.id}:`, cleanupError);
    }
    
    throw error;
  }
}
```

### **3. Add Background Consistency Verification**

```typescript
// New method: Detect and repair inconsistencies
private async verifyConsistency(): Promise<{
  repaired: number;
  orphaned: number;
  missing: number;
}> {
  let repaired = 0;
  let orphaned = 0;
  let missing = 0;

  try {
    // Get webhooks from both cache and Redis
    const cacheWebhooks = new Map(this.webhooksCache);
    const redisWebhooks = await this.webhookStorage.getAllWebhooks();
    const redisMap = new Map(redisWebhooks.map(w => [w.id, w]));

    // Find webhooks in cache but not in Redis (orphaned)
    for (const [id, cacheWebhook] of cacheWebhooks) {
      if (!redisMap.has(id)) {
        logger.warn(`Orphaned webhook in cache: ${id} - removing`);
        this.webhooksCache.delete(id);
        orphaned++;
      }
    }

    // Find webhooks in Redis but not in cache (missing)
    for (const [id, redisWebhook] of redisMap) {
      if (!cacheWebhooks.has(id)) {
        logger.warn(`Missing webhook in cache: ${id} - adding`);
        this.webhooksCache.set(id, redisWebhook);
        missing++;
      } else {
        // Check for data consistency
        const cached = cacheWebhooks.get(id)!;
        if (cached.updated_at !== redisWebhook.updated_at) {
          logger.warn(`Webhook ${id} cache stale - refreshing`);
          this.webhooksCache.set(id, redisWebhook);
          repaired++;
        }
      }
    }

    if (repaired > 0 || orphaned > 0 || missing > 0) {
      logger.info(`Webhook consistency check completed`, {
        repaired,
        orphaned,
        missing,
        total_cache: this.webhooksCache.size,
        total_redis: redisWebhooks.length
      });
    }

    return { repaired, orphaned, missing };
  } catch (error) {
    logger.error('Webhook consistency verification failed:', error);
    return { repaired: 0, orphaned: 0, missing: 0 };
  }
}

// Run consistency check periodically
private startConsistencyVerification(): void {
  setInterval(async () => {
    await this.verifyConsistency();
  }, 5 * 60 * 1000); // Every 5 minutes
}
```

### **4. Enhanced Durability Options**

#### **Option A: Add Redis Persistence Settings**
```bash
# Ensure Redis persistence is enabled
redis.conf:
save 900 1      # Save if at least 1 key changed in 900 seconds
save 300 10     # Save if at least 10 keys changed in 300 seconds  
save 60 10000   # Save if at least 10000 keys changed in 60 seconds
```

#### **Option B: Database Backup Storage**
```typescript
// Optional: Store webhook configs in PostgreSQL for ultimate durability
export class WebhookDatabaseBackup {
  async backupWebhook(webhook: WebhookEndpoint): Promise<void> {
    await this.db.webhook_configs.upsert({
      where: { id: webhook.id },
      update: { config: JSON.stringify(webhook), updated_at: new Date() },
      create: { 
        id: webhook.id, 
        config: JSON.stringify(webhook), 
        created_at: new Date() 
      }
    });
  }

  async recoverWebhooks(): Promise<WebhookEndpoint[]> {
    const backups = await this.db.webhook_configs.findMany({
      orderBy: { created_at: 'desc' }
    });
    return backups.map(b => JSON.parse(b.config));
  }
}
```

## Implementation Plan

### **Phase 1: Immediate Fix** (1-2 hours)
```typescript
// Quick fix: Change refreshCache to load ALL webhooks
- const activeWebhooks = await this.webhookStorage.getActiveWebhooks();
+ const allWebhooks = await this.webhookStorage.getAllWebhooks();
```

### **Phase 2: Enhanced Reliability** (4-6 hours)
1. Add registration verification
2. Add consistency verification background task
3. Enhanced error handling and retry logic

### **Phase 3: Long-term Durability** (1-2 days)
1. Database backup option
2. Redis persistence configuration review
3. Comprehensive monitoring and alerting

## Testing Strategy

### **Reproduce the Issue**
```typescript
// Test case: Webhook becomes invisible
describe('Webhook Persistence Bug', () => {
  it('should not lose inactive webhooks', async () => {
    // 1. Register webhook
    const webhook = await service.registerWebhook({
      url: 'https://example.com/webhook',
      events: ['job_completed'],
      active: true
    });

    // 2. Deactivate webhook  
    await service.updateWebhook(webhook.id, { active: false });

    // 3. Force cache refresh (simulates 30s interval)
    await service.refreshCache();

    // 4. Webhook should still be retrievable
    const retrieved = await service.getWebhook(webhook.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.active).toBe(false);
  });
});
```

### **Consistency Testing**
```typescript
describe('Webhook Cache Consistency', () => {
  it('should maintain cache-Redis consistency', async () => {
    // Create webhooks in various states
    const activeWebhook = await service.registerWebhook(config1);
    const inactiveWebhook = await service.registerWebhook({...config2, active: false});

    // Force cache refresh multiple times
    for (let i = 0; i < 5; i++) {
      await service.refreshCache();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Both should still be retrievable
    expect(await service.getWebhook(activeWebhook.id)).toBeTruthy();
    expect(await service.getWebhook(inactiveWebhook.id)).toBeTruthy();
  });
});
```

## Monitoring & Alerting

### **Add Webhook Reliability Metrics**
```typescript
// Track webhook registration success rate
webhookRegistrationAttempts.inc();
if (success) {
  webhookRegistrationSuccesses.inc();
} else {
  webhookRegistrationFailures.inc();
}

// Track cache-Redis consistency
webhookConsistencyChecks.inc();
webhookConsistencyRepairs.inc(repaired);
webhookOrphanedInCache.inc(orphaned);
webhookMissingFromCache.inc(missing);
```

### **Dashboard Alerts**
- Webhook registration failure rate > 1%
- Cache-Redis consistency repairs > 0 (indicates systemic issue)
- Webhook disappearance reports (user feedback integration)

## Success Criteria

- [ ] **Zero webhook loss**: No more user reports of disappeared webhooks
- [ ] **Consistency verification**: Background process detects and repairs inconsistencies  
- [ ] **Registration reliability**: 99.9%+ webhook registration success rate
- [ ] **Cache accuracy**: Cache always reflects Redis state accurately
- [ ] **Monitoring coverage**: Full observability of webhook persistence pipeline

## Risk Mitigation

### **Backward Compatibility**
- Changes are additive (enhanced loading, not changed storage format)
- Existing webhooks continue to work unchanged
- API contracts remain identical

### **Performance Impact**
- `getAllWebhooks()` vs `getActiveWebhooks()`: Minimal impact for typical webhook counts
- Consistency verification: Low frequency (5-minute intervals)
- Registration verification: One additional Redis read per registration

### **Rollback Plan**
- Simple rollback: revert `refreshCache()` method to original implementation
- Redis data unchanged, so no data migration needed
- Feature flags can control new verification logic

---

*This fix addresses the root cause of webhook disappearance while adding comprehensive reliability measures to prevent future data loss.*
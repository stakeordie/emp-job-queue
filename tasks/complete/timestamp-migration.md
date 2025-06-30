# Timestamp Type Migration Guide

## Overview

We're migrating from mixed string/number timestamps to a single `Timestamp` type that is always a number (milliseconds since epoch). This eliminates type confusion and enables direct comparisons and math operations.

## Migration Steps

### 1. Update Type Definitions

All timestamp fields should use the `Timestamp` type:

```typescript
// Before
interface Job {
  created_at: string;
  updated_at?: string;
  completed_at?: string | number;
}

// After
interface Job {
  created_at: Timestamp;
  updated_at?: Timestamp;
  completed_at?: Timestamp;
}
```

### 2. Update Message Interfaces

```typescript
// Before
interface BaseMessage {
  timestamp?: number | string;
}

// After
interface BaseMessage {
  timestamp: Timestamp;  // Always required, always a number
}
```

### 3. Fix Creation Points

```typescript
// Before
const message = {
  timestamp: new Date().toISOString(),  // ❌ String
  // or
  timestamp: Date.now(),  // ✓ Number but inconsistent
};

// After
const message = {
  timestamp: Timestamp.now(),  // ✅ Always number, clear intent
};
```

### 4. Fix API Boundaries

#### Incoming (Parse at entry):
```typescript
// Before
app.post('/jobs', (req, res) => {
  const job = req.body; // Mixed formats

// After
app.post('/jobs', (req, res) => {
  const job = {
    ...req.body,
    created_at: req.body.created_at 
      ? Timestamp.fromISO(req.body.created_at)
      : Timestamp.now(),
  };
```

#### Outgoing (Convert at exit):
```typescript
// Before
res.json(job); // Sends numbers to client

// After
res.json({
  ...job,
  created_at: Timestamp.toISO(job.created_at),
  updated_at: job.updated_at ? Timestamp.toISO(job.updated_at) : undefined,
});
```

### 5. Update Redis Operations

```typescript
// Before
await redis.hset('job:123', {
  created_at: new Date().toISOString(), // String in Redis
});

// After
await redis.hset('job:123', {
  created_at: Timestamp.now(), // Number in Redis
});

// Reading
const created_at = parseInt(await redis.hget('job:123', 'created_at'));
```

### 6. Fix Comparisons

```typescript
// Before
const createdDate = new Date(job.created_at);
const updatedDate = new Date(job.updated_at);
if (createdDate < updatedDate) { // Awkward

// After
if (job.created_at < job.updated_at) { // Direct!
```

### 7. Fix Time Math

```typescript
// Before
const ageMs = new Date().getTime() - new Date(job.created_at).getTime();

// After
const ageMs = Timestamp.now() - job.created_at; // Simple!
const ageMinutes = Timestamp.diffMinutes(Timestamp.now(), job.created_at);
```

## Files to Update

Priority order for migration:

1. **Type definitions**:
   - `src/core/types/job.ts`
   - `src/core/types/worker.ts`
   - `src/core/types/messages.ts`

2. **Message creation**:
   - `src/core/message-handler.ts`
   - `src/worker/worker-client.ts`
   - `src/hub/websocket-manager.ts`

3. **API boundaries**:
   - `src/hub/hub-server.ts` (REST endpoints)
   - `src/worker/worker-dashboard.ts` (UI endpoints)

4. **Redis operations**:
   - `src/core/redis-service.ts`

## Testing the Migration

1. All timestamps should be numbers internally
2. API responses should return ISO strings
3. Redis should store numbers
4. Comparisons should work without conversion
5. Time math should be simple arithmetic

## Common Patterns

```typescript
// Getting current time
const now = Timestamp.now();

// Parsing from API
const ts = Timestamp.fromISO(req.body.timestamp);

// Sending to API
res.json({ timestamp: Timestamp.toISO(ts) });

// Time windows
const oneHourAgo = Timestamp.addHours(Timestamp.now(), -1);
if (job.created_at > oneHourAgo) {
  // Recent job
}

// Sorting (works directly!)
jobs.sort((a, b) => b.created_at - a.created_at); // Newest first

// Filtering
const recentJobs = jobs.filter(job => 
  job.created_at > Timestamp.addDays(Timestamp.now(), -7)
);
```

## Benefits After Migration

1. **Performance**: No parsing needed for comparisons
2. **Simplicity**: Direct arithmetic operations
3. **Type Safety**: Single type throughout
4. **Redis Efficiency**: Numbers store more efficiently
5. **Developer Experience**: Clear, consistent API
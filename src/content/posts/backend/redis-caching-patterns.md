---
title: Redis Caching Patterns for APIs
description: Effective caching strategies for backend APIs using Redis, including cache-aside, write-through, and cache invalidation patterns.
date: '2026-01-15'
updated: '2026-01-15'
tags:
  - redis
  - caching
  - backend
  - performance
category: backend
draft: false
---

# Redis Caching Patterns for APIs

Caching is essential for building performant APIs. Redis provides a fast, in-memory data store that excels at caching use cases.

## Cache-Aside Pattern

The most common caching pattern. The application checks the cache first, then falls back to the database.

```typescript
async function getUser(userId: string): Promise<User> {
  // Check cache first
  const cached = await redis.get(`user:${userId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - fetch from database
  const user = await db.users.findById(userId);

  // Store in cache with TTL
  await redis.setex(`user:${userId}`, 3600, JSON.stringify(user));

  return user;
}
```

## Write-Through Pattern

Updates go through the cache to the database, ensuring cache consistency.

```typescript
async function updateUser(userId: string, data: Partial<User>): Promise<User> {
  // Update database
  const user = await db.users.update(userId, data);

  // Update cache
  await redis.setex(`user:${userId}`, 3600, JSON.stringify(user));

  return user;
}
```

## Cache Invalidation

The hardest problem in computer science. Here are some strategies:

### Time-Based Expiration (TTL)

Set appropriate TTL based on data freshness requirements:

- User profiles: 1 hour
- Product listings: 5 minutes
- Real-time data: 30 seconds

### Event-Based Invalidation

Invalidate cache when data changes:

```typescript
async function deleteUser(userId: string): Promise<void> {
  await db.users.delete(userId);
  await redis.del(`user:${userId}`);
}
```

### Pattern-Based Invalidation

Use Redis SCAN to invalidate related keys:

```typescript
async function invalidateUserCache(userId: string): Promise<void> {
  const keys = await redis.keys(`user:${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

## Key Takeaways

1. **Start simple** - Cache-aside is usually sufficient
2. **Set TTLs** - Never cache without expiration
3. **Monitor hit rates** - Aim for 90%+ cache hit ratio
4. **Handle failures gracefully** - Cache should be optional, not critical

---
title: DataSource vs Repository Pattern
description: Architectural decision guide for choosing between direct DataSource usage and
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - architecture
  - patterns
  - typeorm
  - nestjs
category: backend
draft: false
lang: en
references:
  - url: 'https://docs.nestjs.com/techniques/database'
    title: Database — NestJS Documentation
    type: official
  - url: 'https://typeorm.io/#/repository-api'
    title: Repository API — TypeORM
    type: official
source_content_hash: 142c29d2d3f82314c045c9b94b22dc73310566fdf7339f399bdc136109d39f88
---

the Repository pattern in NestJS/TypeORM applications.

## The Two Approaches

### Repository Pattern (Traditional)

```typescript
Controller → Service → Repository → TypeORM
             ↑         ↑
         Business    Data Access
         Logic       Abstraction
```

### Service-as-Repository (DataSource Direct)

```typescript
Controller → Service → TypeORM (DataSource)
             ↑
         Business Logic
         + Data Access
```

## When to Use Each

### Use Service-as-Repository IF

1. **Team values simplicity over flexibility**
   - Not planning to switch ORMs
   - Team is comfortable with TypeORM
   - Less abstraction = faster development

2. **Services are domain-focused (not shared)**
   - Each service owns its entities
   - No complex cross-service queries
   - Clear bounded contexts

3. **Team size is small (fewer than 5 backend devs)**
   - Easier to maintain consistency
   - Code reviews catch issues quickly

4. **Project is young (under 2 years)**
   - Architecture can still evolve
   - Migration cost is low

### Keep Repository Layer IF

1. **You value testability and flexibility**
   - Easy to mock repositories
   - Can swap ORMs in future
   - Clear separation of concerns

2. **Services are large and complex**
   - Service already 400+ lines
   - Adding data access would bloat it
   - Hard to navigate and maintain

3. **Team size is medium-large (5+ backend devs)**
   - Abstractions prevent inconsistencies
   - Easier to enforce best practices

4. **Project is mature (>2 years)**
   - Established patterns are valuable
   - Migration cost is high

## Trade-offs Comparison

### Pros of Service-as-Repository

| Benefit                | Impact                         |
| ---------------------- | ------------------------------ |
| Simpler file structure | ~30-40% fewer files            |
| Less boilerplate       | No repo method for every query |
| Transaction handling   | Direct manager access          |
| QueryBuilder access    | No wrapper needed              |

### Cons of Service-as-Repository

| Drawback                          | Impact                         |
| --------------------------------- | ------------------------------ |
| TypeORM leaks into business logic | Violates DIP                   |
| Services become "God Objects"     | 500-1000+ line files           |
| Testing more complex              | Must mock EntityManager chains |
| Code duplication                  | Same patterns in every service |
| Cannot swap ORM easily            | High migration cost            |
| Harder to enforce best practices  | No centralized query layer     |

## Decision Matrix

| Factor             | Service-as-Repository    | Repository Pattern      |
| ------------------ | ------------------------ | ----------------------- |
| Team size          | Small (under 5)          | Medium+ (5+)            |
| Project age        | Young (under 2yr)        | Mature (2yr+)           |
| Service size       | Under 300 lines          | Over 300 lines          |
| ORM stability      | Stable                   | May change              |
| Testing complexity | Can handle complex mocks | Prefer simple mocks     |
| Development speed  | Faster (less files)      | Slower (more structure) |
| Maintainability    | Requires discipline      | Enforced by structure   |

## Recommended: Thin Repository Pattern

Best of both worlds - keep repositories but make them thin:

```typescript
// Thin repository - just TypeORM wrapper
class BlockRepository {
  constructor(private dataSource: DataSource) {}

  // Simple CRUD (one-liners)
  save(entity: Block, manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).save(Block, entity);
  }

  findOne(where, manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).findOne(Block, { where });
  }

  // Complex queries only
  async searchBlocks(query: string) {
    return this.dataSource
      .getRepository(Block)
      .createQueryBuilder("block")
      .where("block.title ILIKE :query", { query: `%${query}%` })
      .getMany();
  }
}

// Service stays focused on business logic
class BlocksService {
  constructor(private blockRepo: BlockRepository) {}

  async create(dto) {
    // Business logic + delegation
    return this.blockRepo.save({ ...dto });
  }
}
```

### Benefits of Thin Repository

- Repository layer is thin (~50 lines per entity)
- Services don't import TypeORM types
- Easy to test (simple mocks)
- Can still use QueryBuilder for complex queries
- Can swap ORMs by changing repositories only

## Industry Patterns

| Framework      | Pattern          | Notes                             |
| -------------- | ---------------- | --------------------------------- |
| Java/Spring    | Repository       | Always uses `@Repository` layer   |
| C#/.NET        | Repository + UoW | Repository + Unit of Work         |
| Ruby/Rails     | Active Record    | Entities have data access         |
| Python/Django  | Hybrid           | ORM in views, can extract repos   |
| Node.js/NestJS | Mixed            | TypeORM docs recommend Repository |

## Testing Implications

### With Repository (Simple)

```typescript
const mockRepo = { findOne: jest.fn().mockResolvedValue(mockBlock) };
```

### With DataSource (Complex)

```typescript
const mockManager = {
  findOne: jest.fn().mockResolvedValue(mockBlock),
  save: jest.fn().mockResolvedValue(mockBlock),
  getRepository: jest.fn().mockReturnValue({
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockBlock])
    })
  })
};
```

## Key Lessons

1. **No universal answer** - Depends on team, project, and context
2. **Thin repositories** - Best middle ground for most projects
3. **Consistency matters** - Pick one approach and stick to it
4. **Test complexity** - Repository pattern makes testing simpler
5. **TypeORM leakage** - Direct DataSource exposes ORM types to business layer

---
title: DataSource vs Repository Pattern
description: Architectural decision guide for choosing between direct DataSource usage and
date: 2026-01-26T00:00:00.000Z
updated: '2026-03-22'
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
expanded: true
---

I was refactoring a block creation service in a NestJS app when the question hit me: should the service talk to TypeORM directly through `DataSource`, or should I keep the repository layer in between? The service was already 400 lines long and growing. Every new feature meant more TypeORM imports, more `EntityManager` chains, and test files that looked like they were mocking the entire ORM. Something had to give.

This is one of those architectural decisions that every NestJS/TypeORM team faces eventually. Pick the wrong pattern for your context, and you either drown in boilerplate or end up with untestable god-object services. Here's how I thought through it, and where I landed.

## The Two Approaches

There are two main ways to structure data access in a NestJS/TypeORM application. The first is the traditional Repository Pattern, where a dedicated repository class sits between your service and the ORM:

```typescript
Controller → Service → Repository → TypeORM
             ↑         ↑
         Business    Data Access
         Logic       Abstraction
```

The second is what I call Service-as-Repository, where the service uses `DataSource` directly — no intermediary:

```typescript
Controller → Service → TypeORM (DataSource)
             ↑
         Business Logic
         + Data Access
```

Both work. Neither is inherently wrong. The right choice depends on your team, your project's maturity, and how much pain you're willing to tolerate in tests.

## When Service-as-Repository Makes Sense

Skipping the repository layer is a legitimate choice when your team values speed over flexibility. If you're not planning to swap ORMs, your team is comfortable with TypeORM's API, and you want fewer files to maintain, going direct can cut your file count by 30-40%.

This works best when services are domain-focused with clear bounded contexts — each service owns its entities, there are no complex cross-service queries, and the team is small enough (under 5 backend devs) that code reviews catch inconsistencies before they snowball.

It also works well for young projects (under 2 years old) where the architecture is still evolving and migration cost is low. You can always add a repository layer later if the service grows unwieldy.

## When to Keep the Repository Layer

The repository pattern earns its keep when testability matters. Compare the two testing approaches:

**With Repository (simple):**

```typescript
const mockRepo = { findOne: jest.fn().mockResolvedValue(mockBlock) };
```

**With DataSource (complex):**

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

That second mock is a maintenance nightmare. Every time you add a query method, you're chaining another mock. And if TypeORM's API changes in a major version, every test file needs updating.

Keep the repository layer when your services are large and complex (400+ lines), your team has 5 or more backend devs (where abstractions prevent inconsistencies), or your project is mature enough that established patterns carry real value.

## Trade-offs at a Glance

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

When I need to make this call on a new project, I run through this matrix:

| Factor             | Service-as-Repository    | Repository Pattern      |
| ------------------ | ------------------------ | ----------------------- |
| Team size          | Small (under 5)          | Medium+ (5+)            |
| Project age        | Young (under 2yr)        | Mature (2yr+)           |
| Service size       | Under 300 lines          | Over 300 lines          |
| ORM stability      | Stable                   | May change              |
| Testing complexity | Can handle complex mocks | Prefer simple mocks     |
| Development speed  | Faster (less files)      | Slower (more structure) |
| Maintainability    | Requires discipline      | Enforced by structure   |

If most of your answers fall in one column, that's your pattern.

## The Middle Ground: Thin Repositories

After going back and forth, I landed on a third option that takes the best of both worlds — thin repositories. The idea is to keep the repository layer, but resist the urge to make it a full abstraction. Each repository is a lightweight TypeORM wrapper with one-liner CRUD methods and only the complex queries that need `QueryBuilder`:

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

Each repository stays around 50 lines per entity. Services never import TypeORM types. Testing is straightforward with simple mocks. You still get `QueryBuilder` access for complex queries, and if you ever need to swap ORMs, you change repositories only — business logic stays untouched.

## How the Industry Does It

It's worth noting how other frameworks handle this same tension:

| Framework      | Pattern          | Notes                             |
| -------------- | ---------------- | --------------------------------- |
| Java/Spring    | Repository       | Always uses `@Repository` layer   |
| C#/.NET        | Repository + UoW | Repository + Unit of Work         |
| Ruby/Rails     | Active Record    | Entities have data access         |
| Python/Django  | Hybrid           | ORM in views, can extract repos   |
| Node.js/NestJS | Mixed            | TypeORM docs recommend Repository |

Most mature ecosystems lean toward a repository layer. Rails is the notable exception with Active Record, but even Rails teams extract service objects when complexity grows. The NestJS/TypeORM ecosystem officially recommends the repository pattern, which gives you confidence that tooling and documentation will support it.

## Takeaway

There's no universal answer here — it depends on your team size, project maturity, and tolerance for boilerplate. But if I had to give one recommendation: **start with thin repositories**. They add minimal overhead (~50 lines per entity), keep your services testable, and give you an escape hatch if you ever need to change ORMs. The key is consistency — pick one approach and stick to it across the entire project.

## References

- [Database — NestJS Documentation](https://docs.nestjs.com/techniques/database)
- [Repository API — TypeORM](https://typeorm.io/#/repository-api)

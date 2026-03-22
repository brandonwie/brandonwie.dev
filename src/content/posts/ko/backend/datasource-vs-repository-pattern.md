---
title: DataSource vs Repository 패턴
description: NestJS/TypeORM 애플리케이션에서 직접 DataSource 사용과 Repository 패턴 중 선택하기 위한 아키텍처 결정 가이드.
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
lang: ko
source_lang: en
source_slug: datasource-vs-repository-pattern
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://docs.nestjs.com/techniques/database'
    title: Database — NestJS Documentation
    type: official
  - url: 'https://typeorm.io/#/repository-api'
    title: Repository API — TypeORM
    type: official
---

## 두 가지 접근 방식

### Repository 패턴(전통적)

```typescript
Controller → Service → Repository → TypeORM
             ↑         ↑
         비즈니스    데이터 접근
         로직       추상화
```

### Service-as-Repository(DataSource 직접 사용)

```typescript
Controller → Service → TypeORM (DataSource)
             ↑
         비즈니스 로직
         + 데이터 접근
```

## 언제 어떤 걸 사용할까

### Service-as-Repository를 선택할 때

1. **팀이 유연성보다 단순성을 중시할 때**
   - ORM을 바꿀 계획이 없을 때
   - 팀이 TypeORM에 익숙할 때
   - 추상화가 적을수록 개발이 빠름

2. **서비스가 도메인 중심일 때(공유되지 않음)**
   - 각 서비스가 자체 엔티티를 소유할 때
   - 복잡한 크로스 서비스 쿼리가 없을 때
   - 명확한 bounded context가 있을 때

3. **팀 규모가 작을 때(백엔드 개발자 5명 미만)**
   - 일관성 유지가 쉬움
   - 코드 리뷰에서 문제를 빠르게 잡을 수 있음

4. **프로젝트가 초기일 때(2년 미만)**
   - 아키텍처가 아직 진화할 수 있음
   - 마이그레이션 비용이 낮음

### Repository 레이어를 유지할 때

1. **테스트 가능성과 유연성을 중시할 때**
   - Repository를 mock하기 쉬움
   - 향후 ORM 변경 가능
   - 관심사의 명확한 분리

2. **서비스가 크고 복잡할 때**
   - 서비스가 이미 400줄 이상
   - 데이터 접근을 추가하면 더 비대해짐
   - 탐색과 유지보수가 어려움

3. **팀 규모가 중대형일 때(백엔드 개발자 5명 이상)**
   - 추상화가 불일치를 방지
   - 모범 사례 적용이 더 쉬움

4. **프로젝트가 성숙할 때(2년 이상)**
   - 확립된 패턴이 가치 있음
   - 마이그레이션 비용이 높음

## 트레이드오프 비교

### Service-as-Repository의 장점

| 이점                | 영향                           |
| ------------------- | ------------------------------ |
| 단순한 파일 구조    | ~30-40% 적은 파일              |
| 적은 보일러플레이트 | 모든 쿼리에 repo 메서드 불필요 |
| 트랜잭션 처리       | 직접 manager 접근              |
| QueryBuilder 접근   | 래퍼 불필요                    |

### Service-as-Repository의 단점

| 단점                           | 영향                         |
| ------------------------------ | ---------------------------- |
| TypeORM이 비즈니스 로직에 누출 | DIP 위반                     |
| 서비스가 "God Object"가 됨     | 500-1000줄 이상의 파일       |
| 테스트가 더 복잡               | EntityManager 체인 mock 필요 |
| 코드 중복                      | 모든 서비스에서 동일한 패턴  |
| ORM 교체가 어려움              | 높은 마이그레이션 비용       |
| 모범 사례 적용이 어려움        | 중앙화된 쿼리 레이어 없음    |

## 결정 매트릭스

| 요소          | Service-as-Repository | Repository 패턴  |
| ------------- | --------------------- | ---------------- |
| 팀 규모       | 작음(5명 미만)        | 중형 이상(5명+)  |
| 프로젝트 나이 | 초기(2년 미만)        | 성숙(2년+)       |
| 서비스 크기   | 300줄 미만            | 300줄 이상       |
| ORM 안정성    | 안정적                | 변경 가능        |
| 테스트 복잡도 | 복잡한 mock 가능      | 단순한 mock 선호 |
| 개발 속도     | 빠름(적은 파일)       | 느림(구조 많음)  |
| 유지보수성    | 규율 필요             | 구조로 강제      |

## 권장: Thin Repository 패턴

두 가지 장점을 모두 취하는 방법. Repository를 유지하되 얇게 만드세요:

```typescript
// Thin repository - TypeORM 래퍼
class BlockRepository {
  constructor(private dataSource: DataSource) {}

  // 단순 CRUD(한 줄짜리)
  save(entity: Block, manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).save(Block, entity);
  }

  findOne(where, manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).findOne(Block, { where });
  }

  // 복잡한 쿼리만
  async searchBlocks(query: string) {
    return this.dataSource
      .getRepository(Block)
      .createQueryBuilder("block")
      .where("block.title ILIKE :query", { query: `%${query}%` })
      .getMany();
  }
}

// 서비스는 비즈니스 로직에 집중
class BlocksService {
  constructor(private blockRepo: BlockRepository) {}

  async create(dto) {
    // 비즈니스 로직 + 위임
    return this.blockRepo.save({ ...dto });
  }
}
```

### Thin Repository의 이점

- Repository 레이어가 얇음(엔티티당 ~50줄)
- 서비스가 TypeORM 타입을 import하지 않아요
- 테스트가 쉬움(단순한 mock)
- 복잡한 쿼리에는 여전히 QueryBuilder 사용 가능
- Repository만 변경해서 ORM을 교체할 수 있어요

## 업계 패턴

| 프레임워크     | 패턴             | 참고                            |
| -------------- | ---------------- | ------------------------------- |
| Java/Spring    | Repository       | 항상 `@Repository` 레이어 사용  |
| C#/.NET        | Repository + UoW | Repository + Unit of Work       |
| Ruby/Rails     | Active Record    | 엔티티가 데이터 접근을 가짐     |
| Python/Django  | 하이브리드       | 뷰에서 ORM 사용, repo 추출 가능 |
| Node.js/NestJS | 혼합             | TypeORM 문서는 Repository 권장  |

## 테스트 시사점

### Repository 사용 시(단순)

```typescript
const mockRepo = { findOne: jest.fn().mockResolvedValue(mockBlock) };
```

### DataSource 사용 시(복잡)

```typescript
const mockManager = {
  findOne: jest.fn().mockResolvedValue(mockBlock),
  save: jest.fn().mockResolvedValue(mockBlock),
  getRepository: jest.fn().mockReturnValue({
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockBlock]),
    }),
  }),
};
```

## 핵심 교훈

1. **정답은 없어요** - 팀, 프로젝트, 맥락에 따라 달라져요
2. **Thin repository** - 대부분의 프로젝트에서 가장 좋은 중간 지점이에요
3. **일관성이 중요해요** - 하나의 접근 방식을 선택하고 유지하세요
4. **테스트 복잡도** - Repository 패턴이 테스트를 더 단순하게 만들어요
5. **TypeORM 누출** - 직접 DataSource를 쓰면 ORM 타입이 비즈니스 레이어에 노출돼요

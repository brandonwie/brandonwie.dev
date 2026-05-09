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
translation_date: '2026-05-10'
references:
  - url: 'https://docs.nestjs.com/techniques/database'
    title: Database — NestJS Documentation
    type: official
  - url: 'https://typeorm.io/#/repository-api'
    title: Repository API — TypeORM
    type: official
---

NestJS 앱의 block 생성 서비스를 리팩토링하다 질문이 떠올랐어요. 서비스가
`DataSource`로 TypeORM에 직접 말해야 할까, 아니면 그 사이에 repository 레이어를
유지해야 할까? 서비스는 이미 400줄이 넘었고 계속 늘어나는 중이었어요. 새 기능을
하나 추가할 때마다 TypeORM import가 늘고, `EntityManager` 체인이 길어지고,
테스트 파일은 ORM 전체를 mock하는 모습이 돼 갔어요. 뭔가 정리해야 했어요.

NestJS/TypeORM 팀이라면 언젠가 마주치는 아키텍처 결정이에요. 컨텍스트에 안 맞는
패턴을 고르면 보일러플레이트에 빠져 죽거나, 테스트 안 되는 god-object 서비스로
끝나게 돼요. 어떻게 정리해 봤는지, 어디에 안착했는지 적어둘게요.

## 두 가지 접근

NestJS/TypeORM 앱에서 데이터 접근을 구조화하는 방식은 크게 두 가지예요. 하나는
전통적인 Repository 패턴이에요. 서비스와 ORM 사이에 전용 repository 클래스를
두는 방식이죠.

```typescript
Controller → Service → Repository → TypeORM
             ↑         ↑
         비즈니스    데이터 접근
         로직       추상화
```

또 하나는 제가 Service-as-Repository라고 부르는 방식이에요. 서비스가
`DataSource`를 직접 쓰고, 중간 레이어가 없어요.

```typescript
Controller → Service → TypeORM (DataSource)
             ↑
         비즈니스 로직
         + 데이터 접근
```

둘 다 동작해요. 본질적으로 잘못된 건 없어요. 옳은 선택은 팀, 프로젝트 성숙도,
테스트에서 감수할 수 있는 고통의 크기에 따라 달라져요.

## Service-as-Repository가 맞는 상황

repository 레이어를 건너뛰는 건 팀이 유연성보다 속도를 중시할 때 정당한 선택이에요.
ORM을 바꿀 계획이 없고, 팀이 TypeORM API에 편안하고, 유지할 파일을 줄이고
싶다면, 직접 가는 쪽이 파일 수를 30-40%까지 줄여줘요.

이 방식이 가장 잘 맞는 건 서비스가 도메인 중심이고 bounded context가 명확할
때예요. 각 서비스가 자기 엔티티를 소유하고, 복잡한 cross-service 쿼리가 없고,
팀이 작아서(백엔드 5명 미만) 코드 리뷰가 불일치를 잡아낼 수 있는 규모일 때요.

초기 프로젝트(2년 미만)에도 잘 맞아요. 아키텍처가 아직 진화하고 있고, migration
비용이 낮으니까요. 서비스가 다루기 어려워지면 그때 가서 repository 레이어를
얹으면 돼요.

## Repository 레이어를 유지하는 상황

repository 패턴은 테스트 가능성이 중요할 때 값을 해요. 두 방식의 테스트
접근법을 비교해 볼게요.

**Repository 사용 시(단순):**

```typescript
const mockRepo = { findOne: jest.fn().mockResolvedValue(mockBlock) };
```

**DataSource 사용 시(복잡):**

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

두 번째 mock은 유지보수 악몽이에요. 쿼리 메서드를 추가할 때마다 mock이 또 한
단계 깊어져요. TypeORM이 메이저 버전에서 API를 바꾸면 모든 테스트 파일이 손이
가야 해요.

repository 레이어는 서비스가 크고 복잡할 때(400줄 이상), 백엔드 5명 이상의
팀에서(추상화가 불일치를 막아줌), 또는 확립된 패턴의 가치가 큰 성숙한 프로젝트에서
값을 해요.

## 트레이드오프 한눈에 보기

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

새 프로젝트에서 결정해야 할 때, 이 매트릭스로 한 번 훑어 봐요.

| 요소          | Service-as-Repository | Repository 패턴  |
| ------------- | --------------------- | ---------------- |
| 팀 규모       | 작음(5명 미만)        | 중형 이상(5명+)  |
| 프로젝트 나이 | 초기(2년 미만)        | 성숙(2년+)       |
| 서비스 크기   | 300줄 미만            | 300줄 이상       |
| ORM 안정성    | 안정적                | 변경 가능        |
| 테스트 복잡도 | 복잡한 mock 가능      | 단순한 mock 선호 |
| 개발 속도     | 빠름(적은 파일)       | 느림(구조 많음)  |
| 유지보수성    | 규율 필요             | 구조로 강제      |

대부분의 답이 한쪽 column에 몰리면, 그게 우리 패턴이에요.

## 중간 지점: Thin Repository

왔다갔다 해본 끝에 정착한 세 번째 옵션이 thin repository예요. 양쪽의 장점만
빼서 합친 방식이에요. repository 레이어는 유지하되, 그걸 풀스케일 추상화로
만들고 싶은 충동을 누르는 거예요. 각 repository는 한 줄짜리 CRUD 메서드만 있는
가벼운 TypeORM 래퍼고, `QueryBuilder`가 필요한 복잡한 쿼리만 거기에 살아요.

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

repository는 엔티티당 50줄 정도로 머물러요. 서비스는 TypeORM 타입을 import할
일이 없어요. 테스트는 단순한 mock으로 풀려요. 복잡한 쿼리에는 여전히
`QueryBuilder`를 쓸 수 있고, ORM을 바꿔야 하면 repository만 갈아끼우면 돼요.
비즈니스 로직은 그대로예요.

## 다른 생태계는 어떻게 다루는지

같은 긴장을 다른 프레임워크들이 어떻게 다루는지 짧게 짚어둘게요.

| 프레임워크     | 패턴             | 참고                            |
| -------------- | ---------------- | ------------------------------- |
| Java/Spring    | Repository       | 항상 `@Repository` 레이어 사용  |
| C#/.NET        | Repository + UoW | Repository + Unit of Work       |
| Ruby/Rails     | Active Record    | 엔티티가 데이터 접근을 가짐     |
| Python/Django  | 하이브리드       | 뷰에서 ORM 사용, repo 추출 가능 |
| Node.js/NestJS | 혼합             | TypeORM 문서는 Repository 권장  |

성숙한 생태계 대부분이 repository 레이어 쪽으로 기울어 있어요. Rails는 Active
Record로 예외 같지만, 복잡도가 커지면 Rails 팀들도 service object를 따로
뽑아내요. NestJS/TypeORM 생태계는 공식적으로 repository 패턴을 권장해요. 도구와
문서가 그 방향을 받쳐준다는 뜻이에요.

## 정리

여기엔 보편 정답이 없어요. 팀 규모, 프로젝트 성숙도, 보일러플레이트에 대한
인내심에 따라 달라져요. 하지만 한 가지 추천을 골라야 한다면 **thin repository로
시작하세요**. 엔티티당 50줄 수준의 작은 오버헤드로 서비스를 테스트 가능하게
유지하고, 나중에 ORM을 바꿔야 할 때를 위한 escape hatch도 남겨둘 수 있어요.
중요한 건 일관성이에요. 하나를 골랐으면 프로젝트 전체에서 그걸 유지하세요.

## References

- [Database — NestJS Documentation](https://docs.nestjs.com/techniques/database)
- [Repository API — TypeORM](https://typeorm.io/#/repository-api)

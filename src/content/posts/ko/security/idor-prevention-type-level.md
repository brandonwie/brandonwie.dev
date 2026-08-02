---
title: 타입 수준 필수 파라미터로 IDOR 방지하기
description: optional 파라미터 하나가 repository 메서드를 IDOR 위험으로 만들었어요. userId를 required로 바꾸니 보안 검사가 컴파일 타임으로 옮겨갔어요.
date: 2026-02-11T00:00:00.000Z
updated: '2026-08-02'
tags:
  - security
  - backend
  - typescript
category: security
draft: false
lang: ko
source_lang: en
source_slug: idor-prevention-type-level
source_updated: '2026-08-02'
translation_date: '2026-02-12'
references:
  - url: >-
      https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
    title: OWASP API Security - Broken Object Level Authorization (BOLA/IDOR)
    type: official
---

NestJS API에서 수동 테스트 중에 데이터 유출을 발견했어요. 요청이 다른 사용자의 레코드를 반환하고 있었죠. 근본 원인은 TypeScript 함수 시그니처에 있는 물음표 하나였어요: `userId?: number`. 컴파일러가 보안을 강제하도록 수정한 과정을 공유할게요.

## 왜 중요한가

Insecure Direct Object Reference (IDOR)는 OWASP API Security Top 10의 1위 취약점이에요. API가 사용자에게 ID를 조작해서 다른 사용자의 리소스에 접근하도록 허용할 때 발생해요. 위험한 점은 IDOR 취약점이 모든 기능 테스트를 통과한다는 거예요. 코드가 올바르게 동작하지만, 잘못된 사람에게 올바르게 동작하는 거죠.

## 취약한 코드

repository 메서드에서 `userId`가 선택적 파라미터로 되어 있었어요:

```typescript
// BAD: userId가 optional — 호출자가 전달을 "잊을" 수 있음
async findByIds(ids: number[], includeDeleted = false, userId?: number) {
  const where = userId ? { id: In(ids), userId } : { id: In(ids) };
  //                     ^^^ optional = 빼먹기 쉬움
}
```

내부 서비스가 userId 없이 `findByIds([1,2,3])`를 호출하면 모든 사용자의 레코드를 반환해요. 코드는 컴파일되고, 테스트는 통과하고, 취약점은 보이지 않았어요.

## 어려웠던 점들

네 가지가 이 문제를 찾고 수정하는 걸 예상보다 어렵게 만들었어요.

**Optional 파라미터가 취약점을 숨김.** TypeScript는 optional 파라미터를 생략해도 유효한 것으로 취급해요. IDOR은 수동 API 테스트에서 다른 사용자의 데이터가 반환될 때에야 비로소 드러났어요. 자동화된 테스트는 우연히 테스트 사용자의 데이터를 조회하고 있었기 때문에 모두 통과했어요.

**기존 호출 지점 때문에 리팩토링이 무서움.** 여러 서비스가 이미 userId 없이 `findByIds`를 호출하고 있었어요. 시그니처를 필수로 바꾸니 즉시 열두 곳에서 빌드가 깨져서, "수정"이 해결하는 것보다 더 많은 문제를 일으키는 것처럼 느껴졌어요.

**데이터베이스 쿼리가 얼핏 보면 정상.** 조건부 WHERE 절 (`userId ? {...} : {...}`)이 의도적으로 보였어요. 일부 호출자가 정당하게 userId 없이 쿼리해야 하는 것처럼(예: admin 작업) 보였죠. 어떤 호출자도 userId 필터를 건너뛰면 안 된다는 걸 확인하려면 세심한 감사가 필요했어요.

**Composite index가 제대로 활용되지 않음.** userId가 전달되어도 조건부 WHERE 절이 때때로 쿼리 플래너가 `(id, userId)` composite index를 사용하는 걸 막아서, 실제 문제를 가리는 느린 쿼리가 발생했어요.

## 검토한 옵션들

| 옵션                       | 장점                                                             | 단점                                         |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| 필수 파라미터 (타입 수준)  | 컴파일 타임 안전성, WHERE에 분기 없음, 항상 composite index 사용 | 기존 호출 지점 깨짐, 리팩토링 필요           |
| 런타임 가드 (없으면 throw) | 시그니처 변경 없음, 하위 호환                                    | 여전히 userId 없이 컴파일됨, 런타임에만 에러 |
| 미들웨어/데코레이터 검사   | 중앙 집중식 강제                                                 | 간접성 추가, 여전히 컴파일 타임 보장 없음    |
| 별도의 admin/user 메서드   | 명확한 관심사 분리                                               | 메서드 증가, 감사 범위 확대                  |

## 해결 방법

타입 수준 강제를 선택했어요 -- `userId`를 필수 파라미터로 만들었어요:

```typescript
// GOOD: 컴파일러가 userId를 강제 — 없으면 컴파일 불가
async findByIdsAndUserId(ids: number[], userId: number, includeDeleted = false) {
  return this.repo.find({
    where: { id: In(ids), userId },  // 항상 필터링
  });
}
```

기존 호출 지점을 수정하는 일회성 비용은, 미래의 어떤 호출자도 실수로 userId 필터를 건너뛸 수 없다는 영구적 보장에 비하면 아무것도 아니에요. 컴파일러가 항상 켜져 있는 보안 리뷰어가 되는 거예요.

## Required가 Optional보다 나은 이유

| 측면               | Optional userId                | Required userId                |
| ------------------ | ------------------------------ | ------------------------------ |
| 컴파일 타임 안전성 | 아니오 -- userId 없이 컴파일됨 | 예 -- 없으면 TS 에러           |
| WHERE 절 로직      | 조건부 (`if userId`)           | 직접적, 분기 없음              |
| 인덱스 활용        | composite index 미스할 수 있음 | 항상 `(id, userId)` index 사용 |
| 코드 리뷰 부담     | 모든 호출 지점 확인 필요       | 컴파일러가 대신 해줌           |
| 신규 개발자 위험   | userId 전달을 모를 수 있음     | 시그니처가 강제                |

## 메서드 네이밍 컨벤션

필수 필터를 메서드 이름에 인코딩하도록 이름도 변경했어요:

```typescript
// 이름이 userId가 필수임을 알려줌
findByIdsAndUserIdWithRelations(ids: number[], userId: number, ...)

// userId 필수 여부를 알 수 없는 모호한 이름
findByIdsWithRelations(ids: number[], ...)
```

메서드 이름에 `AndUserId`가 포함되면 코드를 읽는 모든 개발자가 사용자 범위 지정이 의도적이고 필수적이라는 걸 즉시 이해해요.

## 이 방식이 동작하는 이유

이 수정은 보안 검사를 런타임에서 컴파일 타임으로 이동시키며 런타임 비용은 제로예요. 이전에는 개발자가 `findByIds([1,2,3])`를 작성하면 코드가 컴파일되고 실행되어 모든 사용자의 데이터를 반환했어요. 이제 `findByIdsAndUserId([1,2,3])`는 컴파일 에러예요. 개발자는 코드가 빌드되기 전에 userId를 제공해야 해요.

설계 원칙은 간단해요: **보안 제약 조건은 컨벤션이 아닌 타입 수준에서 강제해야 해요.** 함수가 항상 userId로 필터링해야 한다면, 필수 파라미터로 만드세요. "전달하는 걸 기억하세요"라는 주석이 달린 optional이 아니라요.

## 실무 팁

사용자가 소유한 리소스(userId, orgId, tenantId)로 필터링하는 repository 메서드 중, 필터를 건너뛰면 다른 사용자의 데이터가 노출되는 모든 곳에 이 패턴을 적용하세요. 멀티테넌트 시스템과 클라이언트 입력으로 리소스 ID를 받는 API 엔드포인트에 특히 가치 있어요.

정당하게 모든 사용자를 쿼리해야 하는 **admin/시스템 작업**에는 적용하지 마세요. 대신 `findByIdsAdmin`처럼 명시적으로 이름 지은 별도 메서드를 적절한 인가 가드와 함께 만드세요. 소유 개념이 없는 공개 리소스와 개별 레코드가 아닌 통계를 반환하는 읽기 전용 집계에도 해당하지 않아요.

핵심 통찰: `userId?: number`에서 `userId: number`로의 변경은 제로 코스트 변경이면서 런타임 보안 문제를 컴파일 타임 보장으로 전환해요.

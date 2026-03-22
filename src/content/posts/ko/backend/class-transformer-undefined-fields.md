---
title: class-transformer undefined 자체 속성 버그
description: >-
  ES2022+ TypeScript 타겟에서 plainToInstance()가 클래스 인스턴스를 생성할 때, 모든 optional 클래스
  필드가 undefined 값을 가진 자체 속성이 되는 문제.
date: 2026-02-23T00:00:00.000Z
updated: 2026-03-03T00:00:00.000Z
tags:
  - backend
  - typescript
  - class-transformer
  - gotcha
category: backend
draft: false
lang: ko
source_lang: en
source_slug: class-transformer-undefined-fields
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://github.com/typestack/class-transformer'
    title: class-transformer GitHub Repository
    type: official
  - url: >-
      https://github.com/typestack/class-transformer/blob/develop/docs/pages/02-basic-usage.md
    title: class-transformer Basic Usage — plainToInstance
    type: official
---

## 문제

```text
tsconfig.json → target: ES2023
  → useDefineForClassFields 기본값이 true(ES2022+)
  → TypeScript가 optional 속성을 class field definition으로 컴파일
  → new ReqBlockDetailDto()가 8개 필드 전부를 자체 속성으로 가짐(= undefined)
  → plainToInstance()가 이 자체 속성을 유지
  → Object.keys(dto.detail)이 모든 필드 이름을 반환
  → hangoutLink, location, attendees가 undefined인데도 "존재"로 감지됨
```

클라이언트가 `{ detail: { allDay: true, linkData: {...} } }`를 보내지만, `Object.keys(dto.detail)`은 `hangoutLink`, `location`, `attendees`를 포함한 8개 필드 전부를 반환해요.

## 해결 방법

키 존재가 아닌 `value !== undefined`를 체크하세요:

```typescript
// 수정 전(class-transformer 인스턴스에서 문제 발생)
for (const key of Object.keys(detailRecord)) {
  if (GOOGLE_RELEVANT_DETAIL_KEYS.has(key)) {
    return true; // 오탐! 키는 있지만 값이 undefined
  }
}

// 수정 후(undefined class-field 아티팩트를 올바르게 스킵)
for (const key of Object.keys(detailRecord)) {
  if (GOOGLE_RELEVANT_DETAIL_KEYS.has(key) && detailRecord[key] !== undefined) {
    return true;
  }
}
```

## 핵심 포인트

- `useDefineForClassFields: true`는 TypeScript에서 `target >= ES2022`일 때 기본값이에요. tsconfig에 명시적으로 설정되지 않아서 보이지 않는 함정이 돼요
- `null`은 의도적으로 스킵하지 않아요. `{ title: null }`은 "이 필드를 비우겠다"는 의미로 의미 있는 변경이에요
- 값을 체크하는 함수(예: `dto.itemStatus === undefined`)는 영향받지 않아요. 이미 키 존재가 아닌 값을 테스트하니까요
- `Object.keys()`, `Object.entries()`, `for...in`, `hasOwnProperty()`를 class-transformer 인스턴스에 사용하는 모든 코드에 영향을 줘요
- 이 버그는 `plainToInstance()`에서만 발생해요. `{}` 리터럴로 생성한 일반 객체에는 이 문제가 없어요

## 의사결정 매트릭스

| 체크 방법                                               | class-transformer에 안전? | 참고                        |
| ------------------------------------------------------- | ------------------------- | --------------------------- |
| `Object.keys(obj)`                                      | 아니오                    | undefined 필드를 반환       |
| `key in obj`                                            | 아니오                    | undefined 필드에 true 반환  |
| `obj.hasOwnProperty(key)`                               | 아니오                    | undefined 필드에 true 반환  |
| `obj[key] !== undefined`                                | 예                        | 유령 필드를 올바르게 필터링 |
| `Object.entries(obj).filter(([,v]) => v !== undefined)` | 예                        | 올바름                      |

## 사용 시점

- 클라이언트가 보낸 DTO 필드를 검사하는 모든 코드
- 업데이트 페이로드에서 "뭐가 변경되었는지" 비교하는 변경 감지 로직
- class-transformer 출력을 처리하는 미들웨어나 유틸리티

## 사용하지 않아도 되는 경우

- 일반 객체(클래스 인스턴스가 아닌)로 작업할 때
- TypeScript 타겟이 ES2022 미만일 때(클래스 필드가 자체 속성으로 정의되지 않음)
- 이미 키 존재가 아닌 값을 체크하는 코드

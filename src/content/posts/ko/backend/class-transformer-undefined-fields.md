---
title: class-transformer undefined 자체 속성 버그
description: >-
  ES2022+ TypeScript 타겟에서 plainToInstance()가 클래스 인스턴스를 생성할 때, 모든 optional 클래스
  필드가 undefined 값을 가진 자체 속성이 되는 문제.
date: 2026-02-23T00:00:00.000Z
updated: '2026-03-22'
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
translation_date: '2026-05-10'
references:
  - url: 'https://github.com/typestack/class-transformer'
    title: class-transformer GitHub Repository
    type: official
  - url: >-
      https://github.com/typestack/class-transformer/blob/develop/docs/pages/02-basic-usage.md
    title: class-transformer Basic Usage — plainToInstance
    type: official
---

클라이언트가 실제로 보낸 DTO 필드만 골라내는 sync-relevance guard를 만들고
있었어요. 불필요한 Google Calendar API 호출을 줄이려는 목적이었죠. 로직은
간단했어요. `Object.keys(dto.detail)`을 돌면서 Google 관련 필드가 들어와 있는지
확인하는 거였거든요. 평범한 객체로 짠 unit test에선 잘 돌았어요. 그런데 실제
HTTP 요청으로 테스트하니까 모든 필드가 "보냈음"으로 잡혔어요. 클라이언트가 보낸
적도 없는 필드까지요. 범인은 `class-transformer`의 `plainToInstance()`였고,
ES2022에서 바뀐 TypeScript 컴파일러 동작과 맞물려 있었어요.

## 문제

TypeScript target이 ES2022 이상이면 `useDefineForClassFields` 컴파일러 옵션
기본값이 `true`로 바뀌어요. 이 옵션이 optional 클래스 속성을 컴파일하는 방식을
바꿔놓아요. 인스턴스에서 빠지지 않고, `undefined` 값을 가진 own property로
정의돼버려요. 도미노가 이렇게 떨어져요.

```text
tsconfig.json → target: ES2023
  → useDefineForClassFields 기본값이 true(ES2022+)
  → TypeScript가 optional 속성을 class field definition으로 컴파일
  → new ReqBlockDetailDto()가 8개 필드 전부를 자체 속성으로 가짐(= undefined)
  → plainToInstance()가 이 자체 속성을 유지
  → Object.keys(dto.detail)이 모든 필드 이름을 반환
  → hangoutLink, location, attendees가 undefined인데도 "존재"로 감지됨
```

클라이언트는 `{ detail: { allDay: true, linkData: {...} } }`만 보내요. 두 개
필드뿐이에요. 그런데 `Object.keys(dto.detail)`은 `hangoutLink`, `location`,
`attendees`까지 포함한 8개 필드 전부를 돌려줘요. 클래스 인스턴스에서 own
property로 정의된 채 `undefined` 값을 갖고 있으니까요.

이게 `tsconfig.json`만 봐선 안 보여요. `useDefineForClassFields`가 명시적으로
설정돼 있지 않거든요. target 버전에 따라 암묵적으로 결정되는 default예요.
ES2021에서 ES2022로 올리면 application 코드 한 줄도 안 건드린 채로
class-transformer 인스턴스 위의 모든 `Object.keys()` 검사가 깨질 수 있어요.

## 해결 방법

키 존재 여부 대신 `value !== undefined`로 판단하면 돼요.

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

`null`은 일부러 스킵하지 않아요. 클라이언트가 `{ title: null }`을 보내면 그건
"이 필드를 비우겠다"는 의미 있는 변경이거든요. 가드는 `undefined`만 걸러내요.
class field definition이 만들어내는 phantom 값이 그것뿐이니까요.

## 어떤 검사 방식이 안전한가

속성 검사 방식들이 다 똑같이 영향을 받는 건 아니에요.

| 체크 방법                                               | class-transformer에 안전? | 참고                        |
| ------------------------------------------------------- | ------------------------- | --------------------------- |
| `Object.keys(obj)`                                      | 아니오                    | undefined 필드를 반환       |
| `key in obj`                                            | 아니오                    | undefined 필드에 true 반환  |
| `obj.hasOwnProperty(key)`                               | 아니오                    | undefined 필드에 true 반환  |
| `obj[key] !== undefined`                                | 예                        | 유령 필드를 올바르게 필터링 |
| `Object.entries(obj).filter(([,v]) => v !== undefined)` | 예                        | 올바름                      |

키 존재(`Object.keys()`, `in`, `hasOwnProperty()`)에 의존하는 코드는 다
false positive가 나요. 값을 직접 보는 방식(`!== undefined`)만이 "클라이언트가
이 필드를 보냈다"와 "TypeScript가 이 필드를 `undefined`로 정의했다"를 제대로
구분해줘요.

## 영향을 받지 않는 케이스

키 존재가 아니라 값을 보는 함수는 안전해요. `dto.itemStatus === undefined`로
필드가 들어왔는지 판단하고 있다면, 그 비교는 정상이에요. 키가 아니라 값을
테스트하니까요.

`{}` 리터럴로 만든 일반 객체에도 이 문제가 없어요. 버그는 `plainToInstance()`가
클래스 인스턴스를 만들 때만 나타나요. 클래스 생성자가 모든 필드를 own property로
정의하는 게 원인이거든요.

TypeScript target이 ES2022 미만이면 `useDefineForClassFields` 기본값이 `false`라,
optional 속성이 애초에 own property로 정의되지 않아요.

## 정리

ES2022 이상 TypeScript target에서 `class-transformer`를 쓸 때, 클라이언트가
어떤 필드를 보냈는지 알기 위해 `Object.keys()`나 `in`을 믿으면 안 돼요. 항상
`value !== undefined`로 확인하세요. 이 버그가 까다로운 이유는 컴파일러의 암묵적
default가 트리거라는 점이에요. TypeScript target을 ES2021에서 ES2022로 올리는
순간 클래스 필드 동작이 조용히 바뀌고, 코드나 설정 어디에도 그 사실이 명시적으로
드러나지 않아요.

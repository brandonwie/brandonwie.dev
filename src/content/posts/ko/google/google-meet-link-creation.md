---
title: "Google Meet 링크 생성"
description: "프로그래밍 방식으로 Google Meet 링크를 생성하면서 배운 교훈이에요."
date: 2026-01-23T00:00:00.000Z
updated: "2026-04-06"
tags:
  - backend
  - google-api
  - work
category: google
draft: false
lang: ko
source_lang: en
source_slug: google-meet-link-creation
source_updated: "2026-04-06"
translation_date: "2026-04-06"
references:
  - url: "https://developers.google.com/workspace/calendar/api/guides/create-events"
    title: Create events — Google Calendar
    type: official
---

Google에는 Meet 링크를 만드는 API가 두 개 있어요. 그중 하나는 절반의 사용자에게 동작하지 않는데, 문서에는 그 사실이 언급되어 있지 않아요.

## 문제 상황

Google Meet 링크를 프로그래밍 방식으로 생성해야 했어요. 무료 Gmail 계정과 유료 Google Workspace 계정 모두에서 동작해야 하는 기능이었죠. Google은 이걸 할 수 있는 API를 두 개 제공하는데, 당연해 보이는 선택지에 치명적인 제한이 숨어 있었어요.

## 검토한 옵션

| 옵션                              | 장점                                 | 단점                                           |
| --------------------------------- | ------------------------------------ | ---------------------------------------------- |
| **Calendar API + conferenceData** | 범용(Gmail + Workspace), 검증된 방식 | 캘린더 쓰기 권한 필요, 생성/삭제 오버헤드      |
| **Meet REST API(spaces.create)**  | 직접 생성, 더 많은 제어              | **Workspace 전용** - 무료 Gmail에서 동작 안 함 |
| **미리 생성된 Meet 링크**         | 단순함                               | 확장 불가, 보안 우려                           |

## 핵심 발견

Google Meet REST API는 **Google Workspace가 필수**예요. 무료 Gmail 계정에서는 `spaces.create`를 호출할 수 없어요. API가 permission 에러를 반환하는데, 계정 유형이 원인이라는 힌트는 전혀 없었어요.

우리 앱은 무료 Gmail과 Workspace 사용자 모두를 서빙하기 때문에, Meet REST API는 선택지가 될 수 없었어요. Calendar API가 범용적으로 동작하는 유일한 접근 방식이었어요.

## 해결책: Calendar API + conferenceData

Calendar API 방식은 conferenceData가 포함된 임시 캘린더 이벤트를 만들고, Meet 링크를 추출한 다음, 이벤트를 삭제해요. 해킹처럼 들리지만, 이게 업계 표준 접근 방식이에요.

```typescript
// 1. 캘린더의 OAuth 통합 사용
// 2. conferenceData가 포함된 이벤트 생성
// 3. Meet 링크 추출
// 4. 임시 이벤트 삭제
// 5. 영속적 Meet 링크 반환 (이벤트 삭제 후에도 유지)
```

### 왜 이 방식이 동작하는가

1. **범용 호환성**: 무료 Gmail과 유료 Workspace 계정 모두에서 동작해요 — 계정 유형에 따른 제한이 없어요
2. **이벤트 삭제 후에도 Meet 링크 유지**: 임시 캘린더 이벤트를 삭제해도 회의실은 계속 접근 가능해요
3. **명확한 소유권**: 캘린더 소유자가 회의 호스트가 되고, 캘린더 쓰기 권한이 회의 생성 권한으로 매핑돼요
4. **최소 오버헤드**: 이벤트 생성, 링크 추출, 이벤트 삭제 — 1초 안에 끝나는 API 호출 세 번이에요

### Rate Limit에 대해 알게 된 것

두 API 모두 무료예요. Calendar API는 이 패턴에 대해 넉넉한 할당량을 제공해요. 한 가지 알아둘 점은 무료 Gmail 계정에서 3명 이상 참여하는 회의에 60분 제한이 있다는 거예요.

## 더 나은 방법: 기존 이벤트에 편승하기

초기 구현 이후 몇 달 뒤에 흔한 경우에 더 깔끔한 접근법을 찾았어요. 애플리케이션이 이미 Google Calendar 이벤트를 생성하고 있다면 — 예를 들어 큐 프로세서가 블록을 캘린더에 동기화하는 경우 — 같은 API 호출에 `conferenceData.createRequest`를 포함시켜서 Meet 링크를 **원자적으로** 생성할 수 있어요. 임시 이벤트가 필요 없어요.

```typescript
// Instead of: create temp event → extract link → delete temp event
// Just include in the real event payload:
event.conferenceData = {
  createRequest: {
    requestId: randomUUID(), // Google deduplicates by requestId
    conferenceSolutionKey: { type: "hangoutsMeet" }
  }
};
// Google returns event.hangoutLink in the response
```

이 방식은 생성-추출-삭제 과정을 완전히 없애요. Meet 링크가 `events.insert()`나 `events.update()` 응답에서 바로 돌아오고, 실제 캘린더 이벤트에 바인딩돼요. 사용자는 Google Calendar에서 "Google Meet으로 참여" 버튼을 직접 볼 수 있어요.

### 어떤 방식을 언제 사용할까

| 시나리오                              | 접근 방식                                        |
| ------------------------------------- | ------------------------------------------------ |
| 앱이 이미 캘린더 이벤트를 생성하는 경우 | 편승 — 해당 호출에 `createRequest` 포함          |
| 독립적인 Meet 링크 (캘린더 이벤트 없음) | 임시 이벤트 — 생성, 링크 추출, 삭제              |

편승 방식은 API 오버헤드가 제로예요(추가 호출 없음). Meet 링크가 삭제된 임시 이벤트가 아닌 실제 이벤트에 의미적으로 연결돼요. 이미 `events.insert()`나 `events.update()`를 호출하고 있다면, 임시 이벤트 패턴을 사용할 이유가 없어요.

## Meet 링크 제거하기 (conferenceData = null)

나중에 기존 이벤트에서 Meet 링크를 *제거*해야 할 일이 생겼어요. 이것도 별도의 디버깅 세션이 됐죠.

`hangoutLink`는 Google Calendar API에서 **읽기 전용**이에요 — `conferenceData`에서 파생되는 값이라 직접 설정할 수 없어요. Meet 링크를 제거하려면 `conferenceDataVersion: 1`과 함께 `conferenceData: null`을 보내야 해요.

### 세 가지 상태 의미론

API는 `conferenceData`의 값과 `conferenceDataVersion` 설정 여부에 따라 다르게 동작해요:

| conferenceData 값    | conferenceDataVersion | Google 동작                               |
| -------------------- | --------------------- | ----------------------------------------- |
| `{...}` (truthy)     | 1                     | conference data 설정/업데이트             |
| `null`               | 1                     | **conference data 제거** (Meet 링크 삭제) |
| `undefined` (생략됨) | 0                     | 무시 — 기존 conference data 유지          |

### 무음 실패 함정

`conferenceDataVersion: 1` 없이 보내면 Google은 모든 conference 변경을 조용히 무시해요. API는 200 OK를 반환해요. 응답도 정상처럼 보여요. 하지만 아무것도 안 바뀌어요.

이 때문에 제거 관련 버그가 특히 진단하기 어려워요. 코드가 잘 동작한다고 생각하게 되거든요 — API가 그렇다고 말하니까요 — 근데 Meet 링크는 그대로 남아 있는 거예요.

### TypeScript 타입 갭

Google의 `googleapis` npm 패키지 타입은 `conferenceData`를 `Schema$ConferenceData | undefined`로 정의해요 — union에 `null`이 없어요. 하지만 REST API는 conference data를 제거하기 위해 `null`을 _실제로_ 받아들여요. type assertion으로 우회해야 해요:

```typescript
// Google's types don't model null for request semantics
(event as Record<string, unknown>).conferenceData = null;
```

TypeScript 타입과 실제 API 의미론이 맞지 않는 경우예요. REST API 문서가 진짜 소스 오브 트루스에요.

## 핵심 교훈

1. **계정 유형 요구사항을 먼저 확인하세요** — API마다 무료/유료 계정에서 다른 기능을 제공할 수 있어요. 접근 방식을 확정하기 전에 둘 다 테스트하세요.

2. **"새롭고 반짝이는" 것이 항상 좋은 건 아니에요** — Meet REST API(2024년 2월 출시)가 이상적으로 보였지만, 더 오래된 Calendar API 방식에는 없는 치명적인 제한이 있었어요.

3. **우회 방법이 영구적인 해결책이 될 수 있어요** — 임시 이벤트를 만들고 삭제하는 건 이상하게 느껴지지만, Google이 직접 권장하는 방식이에요. 다만, 앱이 이미 실제 캘린더 이벤트를 생성한다면 그 호출에 편승하세요 — 오버헤드 제로이고, Meet 링크가 실제 이벤트에 연결돼요.

4. **200 OK 응답이 거짓말할 수 있어요** — `conferenceDataVersion`이 빠지면 Google은 요청을 받아들이고 아무것도 안 해요. 상태 변경은 항상 후속 조회로 확인하세요.

5. **타입 정의가 API 현실보다 뒤처질 수 있어요** — 공식 타입이 유효한 API 상태(예: 제거를 위한 `null`)를 모델링하지 않을 때는 REST 문서를 확인하고 타겟 type assertion을 사용하세요.

6. **가능하면 편승하세요** — 이미 `events.insert()`나 `events.update()`를 호출하고 있다면, 별도의 임시 이벤트 왕복 대신 `conferenceData.createRequest`를 포함시키세요. 오버헤드 제로이고, Meet 링크가 실제 이벤트에 의미적으로 바인딩돼요.

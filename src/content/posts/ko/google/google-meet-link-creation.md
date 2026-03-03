---
title: "Google Meet 링크 생성"
description: "프로그래밍 방식으로 Google Meet 링크를 생성하면서 배운 교훈이에요."
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - google-api
  - work
category: google
draft: false
lang: ko
source_lang: en
source_slug: google-meet-link-creation
source_updated: "2026-01-23"
translation_date: "2026-03-04"
references:
  - url: "https://developers.google.com/workspace/calendar/api/guides/create-events"
    title: Create events — Google Calendar
    type: official
---

## 배경

사용자를 위해 Google Meet 링크를 생성해야 했어요. 무료 Gmail 계정과 Google Workspace 계정 모두에서 동작하는 방법을 찾는 것이 과제였죠.

## 검토한 옵션

| 옵션                              | 장점                                 | 단점                                           |
| --------------------------------- | ------------------------------------ | ---------------------------------------------- |
| **Calendar API + conferenceData** | 범용(Gmail + Workspace), 검증된 방식 | 캘린더 쓰기 권한 필요, 생성/삭제 오버헤드      |
| **Meet REST API(spaces.create)**  | 직접 생성, 더 많은 제어              | **Workspace 전용** - 무료 Gmail에서 동작 안 함 |
| **미리 생성된 Meet 링크**         | 단순함                               | 확장 불가, 보안 우려                           |

## 결정

**Calendar API + conferenceData를 선택했어요.**

### 이유

1. **범용 호환성**: 무료 Gmail과 유료 Workspace 계정 모두에서 동작해요
2. **검증된 안정성**: 업계 표준 접근 방식이에요
3. **명확한 소유권**: Meet 링크가 특정 캘린더에 바인딩돼요
4. **최소 오버헤드**: 이벤트 생성 → 링크 추출 → 이벤트 삭제가 빨라요

### 핵심 발견

Google Meet REST API는 **Google Workspace가 필수**예요. 무료 Gmail 계정에서는 `spaces.create`를 사용할 수 없어요. 이것 때문에 우리 사용자 기반에는 적합하지 않았죠.

## 구현

```typescript
// 1. 캘린더의 integration으로 OAuth 사용
// 2. conferenceData가 포함된 이벤트 생성
// 3. Meet 링크 추출
// 4. 임시 이벤트 삭제
// 5. 영속적인 Meet 링크 반환 (이벤트 삭제 후에도 유지)
```

## 주요 발견

1. **Meet 링크는 이벤트 삭제 후에도 유지돼요** - 임시 캘린더 이벤트를 삭제해도 회의실은 계속 접근 가능해요

2. **캘린더 바인딩이 합리적이에요**:
   - 캘린더 소유자 = 회의 호스트
   - 캘린더 쓰기 권한 = 회의 생성 가능
   - 다른 캘린더에서 다른 Google 계정 사용 가능

3. **rate limit이 넉넉해요** - 두 API 모두 무료이고, Calendar API의 할당량이 넉넉해요

4. **무료 계정은 60분 제한** - 무료 Gmail 계정에서 3명 이상 참여하면 시간 제한이 있어요

## 핵심 교훈

1. **계정 유형 요구사항을 확인** - API마다 무료/유료 계정에서 다른 기능을 제공할 수 있어요

2. **"새롭고 반짝이는" 것이 항상 좋은 건 아니에요** - Meet REST API(2024년 2월)가 이상적으로 보였지만 치명적인 제한이 있었어요

3. **우회 방법이 영구적인 해결책이 될 수 있어요** - 임시 이벤트를 만들고 삭제하는 건 해킹처럼 보이지만, 업계 표준이에요

4. **리소스를 논리적으로 바인딩** - Meet 링크를 캘린더에 연결하면 명확한 소유권을 제공해요

5. **fallback으로 미래에 대비** - Meet API가 나중에 무료 계정을 지원하더라도 Calendar API를 fallback으로 유지하세요

---
title: FastAPI Dependency Injection 패턴
description: >-
  모든 라우트 핸들러에서 `Depends(get_current_user)`를 반복하면 보일러플레이트가
  생기고 불일치가 발생하기 쉽습니다
date: 2026-02-03T00:00:00.000Z
updated: 2026-02-03T00:00:00.000Z
tags:
  - backend
  - fastapi
  - python
category: backend
draft: false
lang: ko
source_lang: en
source_slug: fastapi-dependency-injection-patterns
source_updated: "2026-02-03"
translation_date: "2026-02-12"
references:
  - url: "https://fastapi.tiangolo.com/tutorial/dependencies/"
    title: FastAPI Dependencies
    type: official
  - url: >-
      https://fastapi.tiangolo.com/python-types/#type-hints-with-metadata-annotations
    title: FastAPI Type Hints with Metadata Annotations
    type: official
---

Keycloak에서 현재 사용자를 가져와야 하는 라우터가 6개 있었어요. 각각
`Depends(get_current_user)`를 반복했고, 그중 3개는 사용자 ID를 다르게
처리하고 있었어요 -- 어떤 건 `user.sub`를 문자열 그대로 넘기고, 다른 건
`UUID`로 변환했어요. 이 불일치는 다운스트림 데이터베이스 쿼리가 타입 미스매치로
실패할 때까지 드러나지 않았어요.

해결책은 검증을 더 추가하는 게 아니었어요. dependency를 재사용 가능한 type
alias로 중앙화해서 모든 라우터가 같은 걸 같은 방식으로 받게 하는 거였어요.

## 이게 왜 중요한가

모든 라우트 핸들러에서 `Depends(get_current_user)`를 반복하면 두 가지
문제가 생겨요. 첫째, 보일러플레이트예요. 새 엔드포인트마다 같은 세 줄이
필요해요. 둘째, 더 위험한 건 불일치가 생기기 쉽다는 거예요. 중앙화된
dependency 타입이 없으면 인증 프로바이더를 바꿀 때 모든 라우터 파일을
수정해야 해요.

여러 개발자가 참여하는 성장하는 코드베이스에서 "다른 라우터에서 이 패턴을
복사해"가 타입 미스매치와 미묘한 버그가 쌓이는 경로예요.

## 해결책: Annotated Type Alias

Python의 `Annotated` 타입(3.9+)을 사용하면 `Depends()` 메타데이터를 type
alias에 직접 포함할 수 있어요. 한 번 정의하고 어디서나 사용하면 돼요.

```python
from typing import Annotated
from fastapi import Depends

# Define reusable type alias (once, in deps.py)
CurrentUser = Annotated[
    KeycloakTokenClaims,
    Depends(get_current_user)
]

# Use in any router (clean, no Depends() boilerplate)
@router.get("/items")
async def list_items(
    current_user: CurrentUser,  # NO default value!
    session: AsyncSession = Depends(get_db_session),
) -> list[Item]:
    user_id = UUID(current_user.sub)  # Convert at boundary
    ...
```

`CurrentUser` alias는 타입 정보(IDE 자동완성용)와 dependency 메타데이터
(FastAPI 인젝터용)를 모두 가지고 있어요. `current_user: CurrentUser`를
사용하는 모든 라우터는 `Depends(get_current_user)`를 import하거나 반복하지
않아도 자동으로 Keycloak 토큰을 받아요.

## 디버깅에 1시간이 걸린 함정

이게 디버깅에 한 시간을 쓰게 만든 함정이에요:

```python
# BAD: Default value breaks Annotated dependency injection
async def endpoint(current_user: CurrentUser = None):
    ...  # FastAPI uses None instead of calling get_current_user

# GOOD: No default value
async def endpoint(current_user: CurrentUser):
    ...  # FastAPI extracts Depends from Annotated metadata
```

`Annotated[..., Depends()]` 파라미터에 `= None`을 추가해도 에러가 나지
않아요. FastAPI가 dependency 함수를 호출하는 대신 조용히 `None`을 사용해요.
결과적으로 스택 깊은 곳에서 `NoneType` 에러가 발생하는데, 실제 원인과는
거리가 멀어요.

이렇게 되는 이유는 Python이 FastAPI가 `Annotated` 메타데이터를 검사하기 전에
기본값을 평가하기 때문이에요. 기본값이 우선하면서 `Depends()` 메타데이터가
아예 읽히지 않아요.

## 발견하기 어려운 이유

**FastAPI 문서가 두 패턴 모두 보여줘요.** 공식 문서가 레거시 `param =
Depends(func)` 패턴과 새로운 `Annotated` 패턴을 모두 다루고 있어요. 배울 때
어느 걸 채택해야 할지 불명확해요. `Annotated` 패턴은 Python 3.9+와
`typing_extensions`에서만 작동하는데, 이것도 혼란을 더해요.

**기존 패턴은 기본값을 허용해요.** 레거시 스타일에서 `param = Depends(func)`는
dependency를 선언하는 표준 방식이에요. 기본값처럼 보이죠. 그래서 `Annotated`로
전환할 때 선택적 파라미터에 `= None`을 추가하려는 본능이 생겨요. 여기서는
그 본능이 틀려요.

**타입 미스매치가 늦게 나타나요.** 어떤 라우터는 `current_user.sub`를 문자열로
사용하고 다른 건 `UUID`로 사용했어요. 버그는 라우터 경계에서 변환이 일어나야
하는 곳이 아니라, 다운스트림 쿼리가 타입 에러로 실패할 때 나타났어요.

## 조합 가능성

기본 패턴을 갖추면 변형을 만드는 건 간단해요:

```python
# Base: required authenticated user
CurrentUser = Annotated[
    KeycloakTokenClaims,
    Depends(get_current_user)
]

# Variant: admin-only
AdminUser = Annotated[
    KeycloakTokenClaims,
    Depends(get_admin_user)
]

# Each router uses the appropriate type
@router.get("/admin/users")
async def list_users(admin: AdminUser): ...

@router.get("/items")
async def list_items(user: CurrentUser): ...
```

## 실전 가이드

**`Annotated` type alias를 사용하면 좋은 경우:**

- 여러 라우터가 같은 dependency를 공유하는 경우 (인증, DB 세션)
- 주입된 타입에 대한 IDE 자동완성이 필요한 경우
- dependency에서 일관된 타입 변환이 필요한 경우 (예: `str`에서 `UUID`로)
- 변형을 만들 계획인 경우 (`AdminUser`, `OptionalUser`)

**인라인 `Depends()`를 유지해도 되는 경우:**

- **일회성 dependency**: dependency가 단일 엔드포인트에서만 사용된다면 인라인
  `Depends(func)`가 type alias를 만드는 것보다 더 단순하고 명시적이에요.
- **기본값이 있는 선택적 dependency**: `Annotated` 패턴은 기본값과 충돌해요.
  dependency가 진짜 선택적이어야 하는 경우(예: 익명 허용 엔드포인트)에는
  전통적인 `param = Depends(func)` 패턴과 명시적 `Optional[Type]`을
  사용하세요.
- **FastAPI가 아닌 프레임워크**: `Annotated[..., Depends()]` 패턴은
  FastAPI 전용이에요. Flask, Django 등 다른 프레임워크는 다른 DI 메커니즘을
  가지고 있어요.

핵심 규칙: dependency를 공유 `deps.py`에 `Annotated` 타입으로 정의하고,
사용자 ID는 라우터 경계에서 변환하고, `Annotated` dependency 파라미터에는
절대 기본값을 추가하지 마세요.

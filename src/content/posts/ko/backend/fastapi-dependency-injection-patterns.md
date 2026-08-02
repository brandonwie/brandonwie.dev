---
title: FastAPI Dependency Injection 패턴
description: 모든 라우트 핸들러에서 `Depends(get_current_user)`를 반복하면 보일러플레이트가 생기고 불일치가 발생하기 쉽습니다
date: 2026-02-03T00:00:00.000Z
updated: '2026-08-02'
tags:
  - backend
  - fastapi
  - python
category: backend
draft: false
lang: ko
source_lang: en
source_slug: fastapi-dependency-injection-patterns
source_updated: '2026-08-02'
translation_date: '2026-02-12'
references:
  - url: 'https://fastapi.tiangolo.com/tutorial/dependencies/'
    title: FastAPI Dependencies
    type: official
  - url: >-
      https://fastapi.tiangolo.com/python-types/#type-hints-with-metadata-annotations
    title: FastAPI Type Hints with Metadata Annotations
    type: official
---

개인 프로젝트에서 인증을 정리하다가, 라우터마다 같은
`Depends(get_current_user)`를 반복하고 있는 걸 발견했어요. 어떤 라우터는
`user.sub`를 문자열 그대로 넘기고, 어떤 라우터는 `UUID`로 변환하고
있었어요. 라우터 경계에서는 아무도 불평하지 않았고, 이 불일치는 다운스트림
데이터베이스 쿼리가 타입 미스매치로 실패할 때까지 드러나지 않았어요.

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
    current_user: CurrentUser,  # bare alias — no Optional[...] wrapper
    session: AsyncSession = Depends(get_db_session),
) -> list[Item]:
    user_id = UUID(current_user.sub)  # Convert at boundary
    ...
```

`CurrentUser` alias는 타입 정보(IDE 자동완성용)와 dependency 메타데이터
(FastAPI 인젝터용)를 모두 가지고 있어요. `current_user: CurrentUser`를
사용하는 모든 라우터는 `Depends(get_current_user)`를 import하거나 반복하지
않아도 자동으로 Keycloak 토큰을 받아요.

## 조용히 injection을 건너뛰는 함정

`Annotated` 패턴에서 가장 중요한 규칙이에요:

```python
# BAD: the Union wrapper hides the Depends metadata — injection never runs
async def endpoint(current_user: Optional[CurrentUser] = None):
    ...  # current_user is None; get_current_user was never called

# GOOD: bare alias — FastAPI reads Depends from the Annotated metadata
async def endpoint(current_user: CurrentUser):
    ...

# GOOD: genuinely optional — Optional goes INSIDE the alias
OptionalUser = Annotated[
    Optional[KeycloakTokenClaims],
    Depends(get_optional_user),
]

async def endpoint(current_user: OptionalUser):
    ...  # get_optional_user runs and may return None
```

첫 번째 형태가 위험한 건 실패 방식 때문이에요. FastAPI는 에러도 안 내고 경고도
안 찍어요. `Optional[CurrentUser]`는 `Union[Annotated[...], None]`인데, FastAPI는
`Annotated`가 맨 바깥에 있을 때만 그 메타데이터를 들여다봐요. 그래서 `Depends`를
아예 못 봐요. 대신 그 파라미터를 평범한 request 데이터로 취급해요. 버전에 따라
optional query 파라미터가 되기도 하고 request body 필드가 되기도 하는데, 평범한
`GET`은 둘 다 채워주지 않으니 `None` 기본값이 이겨요. 그래서
코드는 전혀 다른 곳에서 터져요 -- 보통 서비스 메서드 깊은 곳에서
`AttributeError: 'NoneType' has no attribute 'sub'`로요. 실제 실수가 있는
라우터와는 한참 떨어진 지점이죠.

### 정정

그때 남긴 제 메모에는 원인이 "`= None`을 추가하면 `Annotated` injection이
깨진다"라고 적혀 있었어요. 이 글을 쓰면서 다시 테스트해 봤는데, 그렇게 동작하지
않았어요. 기본값만 붙인 `current_user: CurrentUser = None`은 제가 시도한 모든
FastAPI 버전(0.95.0, 0.100.0, 0.110.0, 0.115.0, 0.128.0, 0.141.1)에서 여전히
dependency를 호출했고, 그 기본값은 그냥 쓰이지 않았어요. 함정이 아니라 죽은
코드였던 거예요.

조용한 우회를 재현할 수 있었던 유일한 형태는 `Union` 래퍼였어요. 제가 디버깅한
증상은 진짜였지만, 적어둔 원인은 틀렸던 거죠. 두 동작 모두 FastAPI 문서에
명시된 걸 찾지는 못했으니, 규격이 아니라 관찰로 받아들여 주세요. 다만 위
버전들에서는 전부 동일했어요.

## 발견하기 어려운 이유

**FastAPI 문서가 두 패턴 모두 보여줘요.** 공식 문서가 레거시 `param =
Depends(func)` 패턴과 새로운 `Annotated` 패턴을 모두 다루고 있어요. 배울 때
어느 걸 채택해야 할지 불명확해요. `Annotated`는 Python 3.9부터 `typing`에
들어왔고(그 이전 버전은 `typing_extensions`가 필요해요), FastAPI는 0.95.0부터
이걸 읽어요.

**"선택적"으로 만들려는 본능이 함정을 부릅니다.** 파라미터를 선택적으로
만들려면 Python에서는 보통 `Optional[...]`을 씌우죠. 그런데 `Annotated` alias에
그걸 씌우는 순간 `Depends`가 사라져요. `Optional`은 alias 바깥이 아니라 안쪽에
들어가야 해요.

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

# Variant: optional auth — Optional stays INSIDE
OptionalUser = Annotated[
    Optional[KeycloakTokenClaims],
    Depends(get_optional_user)
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
- **선택적 dependency인데 중첩이 번거로울 때**: `Annotated`도 선택적
  dependency를 처리해요. 다만 `Optional`이 alias 안쪽에 있어야 하고, dependency
  함수가 익명 호출자에게 `None`을 돌려줘야 해요. 익명 허용 엔드포인트 하나만
  있다면 전통적인 `user: Optional[Type] = Depends(func)` 형태가 더 눈에 잘
  들어와요. 이 경우엔 `Depends`가 기본값 자리에서 오기 때문에 `Union`이 아무것도
  가리지 않아요.
- **FastAPI가 아닌 프레임워크**: `Annotated[..., Depends()]` 패턴은
  FastAPI 전용이에요. Flask, Django 등 다른 프레임워크는 다른 DI 메커니즘을
  가지고 있어요.

핵심 규칙: dependency를 공유 `deps.py`에 `Annotated` 타입으로 정의하고,
사용자 ID는 라우터 경계에서 변환하고, `Annotated`는 항상 맨 바깥에 두세요.
선택적으로 만들어야 한다면 `Optional`을 alias 안쪽으로 옮기면 돼요.

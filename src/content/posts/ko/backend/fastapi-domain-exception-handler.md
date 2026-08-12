---
title: "FastAPI domain 예외 handler: 404여야 할 응답이 500으로 나갈 때"
description: service layer에서 raise한 domain 예외는 FastAPI에 등록하기 전까지 전부 500으로 나가요. 계층 전체를 handler 하나로 묶으면서 알게 된 것과, review가 뒤늦게 짚어준 네 가지 함정을 정리했어요.
date: 2026-04-15T00:00:00.000Z
updated: "2026-08-12"
tags:
  - backend
  - fastapi
  - python
  - exception-handling
  - http-status-codes
  - architecture
category: backend
draft: false
lang: ko
source_lang: en
source_slug: fastapi-domain-exception-handler
source_updated: "2026-08-12"
translation_date: "2026-08-12"
references:
  - url: >-
      https://fastapi.tiangolo.com/tutorial/handling-errors/#install-custom-exception-handlers
    title: Install custom exception handlers — FastAPI
    type: official
  - url: "https://www.starlette.io/exceptions/"
    title: Exceptions — Starlette
    type: official
  - url: "https://docs.python.org/3/using/cmdline.html#cmdoption-O"
    title: The -O option — Python command line reference
    type: official
  - url: "https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement"
    title: The assert statement — Python language reference
    type: official
  - url: "https://docs.python.org/3/reference/datamodel.html#type.__subclasses__"
    title: type.__subclasses__() — Python data model
    type: official
  - url: "https://docs.python.org/3/library/sys.html#sys.exc_info"
    title: sys.exc_info() — Python standard library
    type: official
  - url: "https://docs.python.org/3/library/logging.html#logging.Logger.debug"
    title: Logger.debug and the exc_info argument — Python standard library
    type: official
  - url: >-
      https://fastapi.tiangolo.com/tutorial/handling-errors/#use-the-requestvalidationerror-body
    title: Use the RequestValidationError body — FastAPI
    type: official
  - url: "https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/"
    title: "Parse, don't validate — Alexis King"
    type: authoritative
---

없는 note를 `GET`으로 조회했더니 `404 Not Found`가 아니라
`500 Internal Server Error`가 돌아왔어요. service layer는 `NotFoundError`를
raise해야 할 자리에서 정확히 raise하고 있었고, router는 그대로 넘겨주는 한 줄이
전부였어요. 두 파일 다 잘못된 게 없었죠. 예외 계층을 FastAPI에 등록한 적이 한
번도 없어서, framework 입장에서는 그냥 처리되지 않은 crash였던 거예요.

개인 project인 crucio에서 이걸 고치면서 알게 된 내용이에요. 나중에 review를
거치면서 혼자서는 떠올리지 못했을 네 가지가 더 나왔고요. 고치는 것 자체는 열 줄
정도예요. 이 글 대부분은 그 열 줄 주변에 있는 이야기예요.

## 멀쩡해 보이는 구조

계층형 architecture 가이드가 대부분 권하는 모양 그대로예요. domain 예외는 한
module에 모여 있고, 문제를 domain 언어로 표현하고, HTTP는 전혀 몰라요.

```python
# core/exceptions.py
class CrucioException(Exception):
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

class NotFoundError(CrucioException): ...
class ValidationError(CrucioException): ...
class AuthenticationError(CrucioException): ...
class AuthorizationError(CrucioException): ...
class StorageError(CrucioException): ...
class ProcessingError(CrucioException): ...
```

부모 클래스가 `message`와 `details`를 들고 있어서, 나중에 이 예외를 직렬화하는
쪽이 구조화된 값을 받을 수 있어요. 나머지는 전부 빈 하위 클래스고, 구분 가능한
타입이라는 것 말고는 역할이 없어요.

service는 business rule이 깨질 때 그 타입들을 raise해요. 이때 상태 코드를 다루지도
않고, web framework에서 뭔가를 import하지도 않아요.

```python
# features/notes/service.py
async def get_note(self, note_id: UUID, user_id: UUID) -> NoteResponse:
    note = await self.repository.get_by_id(note_id=note_id, user_id=user_id)
    if not note:
        raise NotFoundError(f"Note {note_id} not found")
    return NoteResponse.model_validate(note)
```

router는 얇게 유지돼요. logic을 service로 뺀 이유가 그거니까요.

```python
# features/notes/router.py
@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(note_id: UUID, current_user: CurrentUser, ...):
    return await service.get_note(note_id=note_id, ...)
```

세 파일을 같이 놓고 보면 설계가 끝난 것처럼 보여요. service는 HTTP를 모르고,
router는 그냥 통과시키고, 중복도 없어요. 그런데 `NotFoundError`가 raise되면
client는 여전히 404가 아니라 500을 받아요.

## FastAPI가 500을 내주는 이유

`NotFoundError`라는 이름과 상태 코드 404 사이를 이어주는 건 아무것도 없어요.
`CrucioException`은 평범한 `Exception` 하위 클래스고, 잡아줄 게 아무것도 등록되지
않은 채로 endpoint 밖으로 빠져나간 예외는 정의상 처리되지 않은 server error예요.
FastAPI가 올라타 있는 Starlette의 middleware stack은 가장 바깥에
`ServerErrorMiddleware`를 두고, 빠져나온 것을 전부 500 응답으로 바꿔요. 그 안쪽의
`ExceptionMiddleware`는 누군가 handler를 실제로 등록해 둔 예외들을 dispatch하고요.
등록을 건너뛰면 codebase의 모든 domain 예외가 바깥까지 그대로 흘러가요.

응답에 찍힌 숫자가 틀렸다는 것보다, 그 숫자가 뒤에 있는 것들에 미치는 영향이 더
커요. 모니터링은 5xx에 알림을 보내고 4xx는 무시하도록 잡혀 있는데, 그게 맞는
기본값이에요. 그래서 리소스가 없다는 사실이 알림으로 올라오고, 누가 열어보기
전까지는 진짜 장애와 구분이 안 돼요. 잘못 분류된 500은 다른 데 써야 할 주의력을
가져가고, 동시에 진짜 500을 소음 속에 묻어버려요. API를 쓰는 쪽도 같은 혼란을
다른 형태로 겪어요. 정직한 답이 "그 리소스는 여기 없습니다"인 상황에서
"internal server error"를 받으니까요.

이게 쉽게 배포되는 이유는 눈에 띄는 test가 전부 통과하기 때문이에요. service의
unit test는 `NotFoundError`가 raise되는지 확인하고, 실제로 raise돼요. HTTP
integration test는 정상 경로에서 200 body를 확인하고, 실제로 받아요. not-found
경로를 _HTTP를 거쳐_ 실행하는 test만 500을 보는데, 하필 그게 사람들이 건너뛰는
test예요. 404는 굳이 확인할 만큼 흥미롭지 않아 보이니까요.

## 간격을 메우는 세 가지 방법

원인이 분명해지고 나니 그럴듯한 선택지가 셋 있었어요. 순위를 매기는 건 결국
domain 어휘를 transport 어휘로 옮기는 일을 어디에 둘 것이냐의 문제였어요.

| 방법                                | 변환이 일어나는 곳 | feature마다 드는 코드 | 주된 위험                          |
| ----------------------------------- | ------------------ | --------------------- | ---------------------------------- |
| A: 전역 handler 하나                | app 경계 한 곳     | 없음                  | map에 빠진 하위 클래스가 500으로   |
| B: router마다 잡아서 다시 raise     | 모든 router        | 모든 endpoint         | router 하나 빠뜨리면 조용히 500    |
| C: service에서 `HTTPException` 던지기 | service layer      | 없음                  | service가 HTTP에 묶임              |

### 방법 A: 계층 전체를 handler 하나로

_부모_ 클래스에 handler 하나를 등록하고, 그 안에서 구체적인 하위 클래스로
분기해요. Starlette은 handler를 찾을 때 예외의 MRO를 따라 올라가기 때문에, 등록 한
번으로 모든 자손이 덮여요.

```python
# main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from crucio.core.exceptions import (
    CrucioException,
    NotFoundError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    StorageError,
    ProcessingError,
)

app = FastAPI()

_EXCEPTION_STATUS_MAP: dict[type[CrucioException], int] = {
    NotFoundError: 404,
    ValidationError: 422,
    AuthenticationError: 401,
    AuthorizationError: 403,
    StorageError: 500,
    ProcessingError: 500,
}

@app.exception_handler(CrucioException)
async def crucio_exception_handler(request: Request, exc: CrucioException):
    status_code = _EXCEPTION_STATUS_MAP.get(type(exc), 500)
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": exc.message,
            "type": type(exc).__name__,
            "details": exc.details,
        },
    )
```

마음에 드는 점은 이래요. service는 transport를 신경 쓰지 않고 계속 domain 예외를
raise할 수 있고, router에는 예외 처리 코드가 끼어들지 않고, 새 예외 타입이
dictionary 한 줄로 끝나요. 마음에 안 드는 점은 그 한 줄을 잊기 쉽다는 거고요.
잊으면 새 타입에 한해서 원래 버그가 그대로 재현되는데, 같은 실패가 훨씬 조용한
형태로 돌아오는 셈이에요. 당시에 쓴 knowledge entry에서는 startup 때 `assert`로
이걸 막자고 했어요. review가 여기에 할 말이 있었고, 그게 이 글 후반부의
대부분이에요.

### 방법 B: router마다 잡아서 다시 raise

```python
# features/audit/router.py
try:
    return await service.get_event(event_id)
except AuditNotFoundError:
    raise HTTPException(status_code=404, detail="Audit event not found")
except AuditServiceError:
    raise HTTPException(status_code=503, detail="Audit service error")
```

가장 명시적인 선택지고, 명시성은 진짜 장점이에요. 매핑이 호출 지점에 보이고,
잊어버릴 등록 절차도 없어요. 대신 같은 예외를 raise할 수 있는 router마다 똑같은 세
줄이 복사돼요. 실패 방식은 극적이지 않고 서서히 진행돼요. 새 endpoint가 기존
service를 재사용하는데 아무도 `try/except`를 복사해 오지 않고, 옆 동네가 404를 줄
때 그 endpoint만 조용히 500을 돌려줘요.

### 방법 C: service에서 `HTTPException` 던지기

```python
async def get_note(self, note_id: UUID) -> NoteResponse:
    note = await self.repository.get_by_id(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return NoteResponse.model_validate(note)
```

거추장스러운 절차가 아예 없고, 매핑도 이보다 더 분명할 수 없어요. 대신 service가
HTTP를 알게 돼요. 같은 service를 background worker나 CLI에서 부르는 순간, 해석해 줄
web framework가 없는 곳으로 web framework 예외를 raise하는 꼴이 되고요. unit test도
조금 나빠져요. `HTTPException.status_code`를 확인하는 건 rule이 아니라 transport를
확인하는 거니까요.

저는 A로 갔어요. B와 C가 틀렸다는 뜻은 아니에요. HTTP 말고 다른 입구가 생길 일이
없는 작은 app이라면 C도 충분히 괜찮고, 반복보다 명시성이 중요하다고 보면 B도
방어할 수 있어요. 제가 지키고 싶었던 게 service layer의 독립성이었고, 셋 중에 그걸
지켜주는 건 A뿐이라서 A를 골랐어요.

## 경계에서 변환하기

방법 A 밑에 깔린 원칙은 변환이 경계에 있어야 한다는 거예요. domain 코드는 domain
문제를 말하고, 경계가 그걸 transport가 쓰는 오류 어휘로 바꿔요. 같은 모양이 다른
framework에서도 이름만 바꿔서 나타나요. Spring Boot의 `@ControllerAdvice`나 Django
REST Framework의 custom exception handler가 그래요. 이 정도로 자주 다시 발명되는
패턴이면, 보통은 framework의 특이사항을 덮는 게 아니라 진짜 뭔가를 하고 있는
거예요.

Alexis King의 *Parse, don't validate*를 바깥으로 향하게 돌려놓은 것 같기도 해요.
둘 다 외부 표현과 내부 표현 사이의 변환을 시스템 한가운데로 번지게 두지 말고, 잘
정의된 경계 한 곳에 모으자는 주장이니까요. 비유가 멀리 가지는 않아요. 저쪽은
타입과 parsing 과정에서 얻는 정보 이야기고, 이쪽은 예외 클래스를 정수로 매핑하는
이야기예요. 다만 감각은 같아요.

## 남이 쓴 codebase에서 찾아내기

이미 있는 FastAPI app에 이 버그가 있는지 확인하려면 grep 두 번이면 돼요.

```bash
# domain 예외는 정의돼 있는데...
grep -rn "class.*Exception(CrucioException)" core/
# ...handler는 어디든 등록돼 있나?
grep -rn "add_exception_handler\|@app.exception_handler" .
```

앞쪽에서 여러 개가 잡히고 뒤쪽에서 아무것도 안 나오면, 그 예외 타입들은 지금 전부
500이에요.

## 고친 뒤에 review가 잡아낸 것들

위의 최소 형태 방법 A는 맞는 코드고, 저라면 그대로 배포했을 거예요. 이 변경은 AI
reviewer 두 곳(Claude Code review action과 GitHub Copilot)을 거쳐 두 차례 검증을
받았고, 그중 네 가지는 제가 생각하지 못한 지점이었어요. 넷 중 셋은 서로 다른
reviewer가 같은 위치를 독립적으로 지적했는데, 이건 쓸 만한 신호로 보기
시작했어요. pre-training이 다른 두 model이 똑같은 자리에서 똑같은 오탐을 만들어 낼
가능성은 낮으니까요.

### 1. `-O`를 붙이면 `assert`가 사라져요

스케치해 둔 startup guard는 모든 하위 클래스가 상태 map에 들어 있는지 assertion으로
확인했어요.

```python
# 잘못된 방식 — Python `-O`가 지워버려요
_MISSING = set(CrucioException.__subclasses__()) - set(_EXCEPTION_STATUS_MAP)
assert not _MISSING, f"Missing: {_MISSING}"
```

최적화를 요청하면 무슨 일이 생기는지 Python 언어 reference는 분명하게 적어놨어요.
"The current code generator emits no code for an assert statement when
optimization is requested at compile time." `-O`로 실행하거나 환경에
`PYTHONOPTIMIZE=1`이 걸려 있으면 bytecode compile 시점에 guard가 통째로 지워져요. 그
환경 변수는 메모리를 조금 아끼려고 언젠가 추가된 채로 production container image에
들어 있을 법한 값이고요. 그러면 guard는 자기가 지키려던 바로 그 환경에서 아무 일도
하지 않게 돼요.

```python
# 올바른 방식 — 조건 없이 실행돼요
_MISSING = set(CrucioException.__subclasses__()) - set(_EXCEPTION_STATUS_MAP)
if _MISSING:
    raise RuntimeError(f"Missing: {sorted(cls.__name__ for cls in _MISSING)}")
```

여기서 얻은 규칙은 이거예요. `assert`는 test용이고, 개발하는 동안만 신경 쓰면 되는
불변조건용이에요. production에서 반드시 성립해야 하는 건 명시적인 `if`와 진짜
예외로 막아요.

### 2. `__subclasses__()`는 직계 자식만 봐요

guard가 생각보다 적게 확인하고 있기도 했어요. data model 문서는
`type.__subclasses__()`가 클래스의 _직계_ 하위 클래스를 약하게 참조하는 목록을
돌려준다고 설명하는데, 손자 클래스는 빠져요. 그래서 2세대 예외가 그냥
통과해요.

```python
class QuotaExceededError(StorageError):
    """의미상 429 Too Many Requests."""
```

`CrucioException.__subclasses__()`는 직계 자식 여섯 개를 돌려주고 끝나요.
`QuotaExceededError`는 목록에 없으니 guard는 통과하고요. runtime에서도 같은 이유로
`_EXCEPTION_STATUS_MAP.get(type(exc), 500)`이 빗나가요. `type(exc)`가
`QuotaExceededError`인데 아무도 map에 넣은 적이 없으니까요. guard와 handler가 같은
사각지대를 공유하는 셈이라, 버그를 잡으라고 둔 검사가 정작 그 버그를 일으키는
경우만 못 봐요.

```python
def _all_subclasses(cls: type) -> set[type]:
    """직계 자식, 손자, 그 아래까지 전부."""
    collected: set[type] = set()
    for sub in cls.__subclasses__():
        collected.add(sub)
        collected |= _all_subclasses(sub)
    return collected

_MISSING = _all_subclasses(CrucioException) - set(_EXCEPTION_STATUS_MAP)
```

같은 범위를 확인하는 unit test를 옆에 둔다면 그 test도 같은 재귀 helper를 써야
해요. 안 그러면 사각지대까지 같이 물려받아요.

### 3. `exc_info=True`는 주변 상태에 기대요

5xx에는 stack trace를 남기고 4xx에는 남기지 않는 건 한 줄이면 될 것처럼 보여요.

```python
# 덜 안정적 — 암묵적
log(..., exc_info=status_code >= 500)
```

`exc_info=True`는 logging module에게 `sys.exc_info()`로 현재 예외를 가져오라고
시켜요. 이 함수는 처리 중인 예외를 돌려주는데, stack 어디에서도 처리 중인 예외가
없으면 `None` 셋을 돌려줘요. 지금 잘 도는 건 Starlette의 `ExceptionMiddleware`가
자기 `except` 블록 안에서 handler를 부르기 때문이에요. 그래서 현재 예외가 _있어요_.
이건 문서로 보장된 동작이 아니라 framework 내부 구현에 기대는 거예요. 나중에
handler를 task나 shield를 거쳐 dispatch하도록 바꾸면, 겉으로는 아무것도 안 깨진
채로 traceback 수집만 조용히 망가져요.

```python
# 더 안정적 — 명시적
log(
    ...,
    exc_info=(type(exc), exc, exc.__traceback__) if status_code >= 500 else False,
)
```

tuple 형태는 handler가 넘겨받은 예외 객체에서 traceback을 직접 읽어요. 주변 상태에
기대는 부분이 없고, logging module이 이 형태를 그대로 받아요.

### 4. guard가 import 순서를 타요

이건 고침이 부분적이라 제일 찜찜해요. `_all_subclasses`는 실행되는 그 시점에
Python이 이미 import한 클래스만 찾을 수 있어요. 예외 하위 클래스가 feature module
쪽에 있으면(예를 들어 `features/billing/exceptions.py`가
`QuotaExceededError(StorageError)`를 정의하는 경우) 그 module들이 먼저 import된
상태에서만 guard가 의미를 가져요.

```python
# main.py — 순서가 중요해요
from crucio.api.v1.router import api_router   # feature 전체를 따라서 import해요
from crucio.core.exception_handlers import register_exception_handlers  # 여기서 guard가 돌아요
```

저 두 줄의 순서를 바꾸거나, startup import 사슬이 닿지 않는 module에 하위 클래스를
추가하면, guard는 아무것도 못 덮으면서 통과해요. import 시점 검사를 import 순서로부터
자유롭게 만들 방법은 없어요. 그래서 정직한 답은 겹겹이 막는 거예요. 부팅 guard는
빠른 신호로 남겨두고, 같은 재귀 helper를 쓰는
`test_all_crucio_exception_subclasses_are_mapped` CI test를 추가해요. pytest는 수집
단계에서 test 의존성 graph 전체를 import하니까, module 로딩만으로는 놓치는 하위
클래스까지 test가 보게 돼요. guard는 빨리 실패하고, 실제로 맞는 건 test예요.

### 5. 422가 body 모양을 두 개 갖는 건 계약이 지저분하다는 신호예요

결함은 아니지만 적어둘 만해요. FastAPI는 이미 `RequestValidationError`에 422를
쓰고, 그 body는 `{"detail": [{"loc": [...], "msg": ..., "type": ...}]}` 모양의
필드별 객체 목록이에요. domain `ValidationError`도 422로 매핑하면, 같은 상태 코드가
`detail`이 그냥 문자열인 위쪽 형태도 돌려줄 수 있게 돼요.

client 입장에서는 둘 다 정직하게 "처리할 수 없는 요청"이라, 코드를 공유하는 건
의미상 맞아요. 문제는 body를 보고 분기하는 쪽이에요. `detail`이 목록인지(schema
오류) 문자열인지(의미 오류) 나눠서 처리해야 하니까요. 빠져나갈 길은 셋이고, 제가
고려할 순서대로 적으면 이래요.

1. 두 가지 모양을 OpenAPI 설명에 눈에 띄게 문서화하고 그대로 안고 가요. 예외 계층
   전체에서 하나의 envelope를 유지하는 쪽이, 상태 코드 하나를 균일하게 만드는
   것보다 값이 커요.
2. `ValidationError`를 400으로 매핑하고 422는 FastAPI에게 넘겨요. 분리는
   깔끔해지지만 의미는 덜 정확해져요. 400은 알려주는 게 거의 없으니까요.
3. `ValidationError`를 충돌에 가까운 경우로 한정해서 409로 매핑하고, 입력 형태
   문제는 다른 domain 예외로 따로 둬요. 관리할 타입이 늘어나요.

저는 첫 번째로 갔어요. 찜찜한 부분을 다른 찜찜한 부분으로 바꾸는 대신 있는 그대로
인정하는 선택지고, 문서화 비용은 한 문단이니까요.

## 언제 맞고 언제 아닌지

domain 예외 계층이 있는 FastAPI application이라면 이 패턴은 값을 해요. 특히 공개
API를 내보내기 전에 그래요. 그 시점부터 404냐 500이냐가 남의 예외 처리 logic이
되니까요. 유지 비용은 새 예외 타입마다 한 줄, 그리고 그 한 줄을 잊지 않게 해 주는
guard와 test예요.

HTTP 표면이 없는 library 코드에는 이 절차가 아까워요. 거기서는 domain 예외를 그냥
raise하고 의미는 부르는 쪽이 정하게 두면 돼요. 500이 신뢰도를 정확히 설명하는
prototype에서도 마찬가지고요. 그리고 어떤 API는 없는 리소스와 금지된 리소스에
일부러 같은 코드를 돌려줘서 탐지를 막아요. 그건 진짜 보안 패턴이고, 우연이 아니라
의도적으로 map에 넣어야 하는 항목이에요.

codebase가 좀 오래됐다면 같이 해 볼 만한 게 하나 더 있어요. 이미 손으로 방법 B를
하고 있는 feature가 있는지 확인해 보는 거예요. 섞인 관례는 퍼져요. 새 router를 가장
빨리 쓰는 방법이 옆에 있는 router를 복사하는 거니까요. 전역 handler로 표준을 잡고
건드리는 김에 router마다 있는 `try/except`를 걷어내는 게, 두 패턴을 그대로 두고 다음
사람이 옳은 쪽을 고르길 바라는 것보다 싸요.

## 정리

domain 예외 계층을 정의하는 건 필요하지만 그것만으로는 부족해요. app 경계에서
뭔가가 그 계층을 transport의 오류 의미로 매핑해 주기 전까지 계층은 그냥 놀고 있고,
게다가 이 실패는 가장 많이 작성되는 test들에서 조용히 지나가요. 패턴 전체는 부모
클래스에 handler 하나, 타입에서 상태 코드로 가는 dictionary 하나예요. 여기에
startup에서 `assert` 대신 `if`로 막고, 한 단계만 보지 말고 재귀로 훑는 guard를
붙이면 끝이에요.

## 참고 자료

- [Install custom exception handlers — FastAPI](https://fastapi.tiangolo.com/tutorial/handling-errors/#install-custom-exception-handlers):
  `@app.exception_handler(...)`로 handler를 등록하는 방법. 이 글 전체가 여기에
  기대고 있어요.
- [Exceptions — Starlette](https://www.starlette.io/exceptions/): 처리되지 않은
  예외를 500으로 바꾸는 middleware stack, 그리고 등록된 handler가 불리는 자리
- [The `-O` option — Python command line reference](https://docs.python.org/3/using/cmdline.html#cmdoption-O):
  같은 역할을 하는 `PYTHONOPTIMIZE` 환경 변수도 함께
- [The `assert` statement — Python language reference](https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement):
  최적화를 요청하면 `assert` 문의 코드를 아예 만들지 않는다고 명시
- [`type.__subclasses__()` — Python data model](https://docs.python.org/3/reference/datamodel.html#type.__subclasses__):
  직계 하위 클래스만 돌려줘요. 재귀 helper가 필요한 이유
- [`sys.exc_info()` — Python standard library](https://docs.python.org/3/library/sys.html#sys.exc_info):
  처리 중인 예외를 돌려주고, 없으면 `None` 셋을 돌려줘요
- [`Logger.debug` and the `exc_info` argument — Python standard library](https://docs.python.org/3/library/logging.html#logging.Logger.debug):
  boolean뿐 아니라 예외 tuple도 받아요
- [Use the `RequestValidationError` body — FastAPI](https://fastapi.tiangolo.com/tutorial/handling-errors/#use-the-requestvalidationerror-body):
  domain `ValidationError`와 상태 코드를 나눠 쓰게 되는 목록 형태의 422 body
- [_Parse, don't validate_ — Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/):
  이 패턴과 결이 닿아 있는 경계 변환 논의

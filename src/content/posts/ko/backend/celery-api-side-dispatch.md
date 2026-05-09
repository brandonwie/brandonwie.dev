---
title: Celery API-Side Dispatch 패턴
description: >-
  Worker의 task 모듈을 import하지 않고 API 서비스에서 별도의 worker 서비스로 task를 전달하는 send-only
  Celery 클라이언트 만들기
date: 2026-02-03T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - celery
  - python
  - async
category: backend
draft: false
lang: ko
source_lang: en
source_slug: celery-api-side-dispatch
source_updated: '2026-03-22'
translation_date: '2026-05-10'
references:
  - url: 'https://docs.celeryq.dev/en/stable/userguide/calling.html#basics'
    title: Celery - Calling Tasks
    type: official
  - url: 'https://docs.celeryq.dev/en/stable/userguide/routing.html'
    title: Celery - Routing Tasks
    type: official
---

FastAPI 서비스를 띄우려는데 `ModuleNotFoundError: No module named
'psycopg2'`가 떴어요. API 쪽에는 일부러 psycopg2를 안 깔아 둔 상황이었어요.
API는 asyncpg를 쓰거든요. 에러를 따라가 보니까, Celery task 함수를
import해서 `.delay()`를 호출하려던 줄에서 터졌더라고요. 그 한 줄이 worker가
쓰는 의존성 트리를 통째로 끌고 들어온 거예요.

API랑 worker가 따로 떨어진 microservices 구조에서는, task 함수를 그대로
가져와서 호출하는 방식이 함정이에요. 표준 Celery 패턴이라고 하는 "task
import 후 `.delay()` 호출"은 monolith에서나 잘 돌아가요. API는
async(FastAPI + asyncpg), worker는 sync(Celery + psycopg2)인 분리된
구조에서는, task 함수를 import하는 순간 worker가 필요로 하는 의존성이 전부
같이 따라와요.

## 왜 표준 패턴이 깨지는가

Celery의 권장 접근은 decorated task 함수를 import하고 `.delay()` 또는
`.apply_async()`를 호출하는 거예요:

```python
# This is what Celery docs suggest
from worker.tasks.llm import summarize_note

summarize_note.delay(note_id)
```

API와 worker가 같은 코드베이스에서 같은 dependency를 사용할 때는 이게
작동해요. 분리된 아키텍처에서 그 import는 체인을 유발해요:
`worker.tasks.llm`이 `worker.db`를 import하고, 그게 `psycopg2`를
import하는데, API 컨테이너에는 설치되어 있지 않아요. API가 단일 요청도
처리하기 전에 크래시해요.

## 검토한 옵션들

| 옵션                                        | 장점                                  | 단점                                                   |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `.delay()` / `.apply_async()` (task import) | 타입 안전성, IDE 자동 완성            | worker 코드 import 필요; sync dep을 async API로 끌어옴 |
| `.send_task()` (문자열 이름, 선택됨)        | 완전한 디커플링; worker import 불필요 | 문자열 기반 이름 (오타 위험); 컴파일 타임 검증 없음    |
| 공유 task interface 패키지                  | 타입 안전성 + 디커플링                | 추가 패키지 유지 필요; 서비스 간 버전 관리 복잡성      |

공유 interface 패키지가 매력적이었어요 -- 가벼운 공유 라이브러리에 task
signature를 정의하고 API와 worker 둘 다 의존하게 하는 거예요. 하지만
릴리스 주기가 다른 두 서비스 사이에서 공유 패키지를 유지하면 버전 관리
복잡성이 생겨요. 한두 명의 팀에서는 타입 안전성의 이점 대비 오버헤드가
가치 있지 않아요.

## 해결책: send_task()

`send_task()`는 worker에서 아무것도 import하지 않고 이름으로 task를
dispatch해요. API는 broker URL과 task routing이 설정된 Celery
클라이언트만 필요해요:

```python
# API side: celery_client.py (send-only, no worker)
from celery import Celery
from app.config import settings

celery_app = Celery(
    "api_client",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

# Mirror the worker's task routing
celery_app.conf.update(
    task_serializer="json",
    task_routes={
        "worker.tasks.stt.*": {"queue": "stt"},
        "worker.tasks.llm.*": {"queue": "llm"},
        "worker.tasks.link.*": {"queue": "default"},
    },
)
```

이제 API 서비스에서 task를 dispatch하는 건 이렇게 생겼어요:

```python
# In API service code:
from app.celery_client import celery_app

celery_app.send_task(
    "worker.tasks.llm.summarize_note",
    args=[str(note_id)],
)
```

worker import가 없어요. transitive dependency도 없어요. API가 task
이름과 인자와 함께 broker에 메시지를 보내고, worker가 올바른 큐에서
그걸 가져가요.

## Task Routing 미러링이 필수

한 가지 주의점: API 클라이언트가 각 task가 어떤 큐로 라우팅되는지 알아야
해요. API 쪽에서 routing이 미러링되지 않으면, task가 default 큐에 들어가고
전문화된 worker가 절대 가져가지 않아요.

API 클라이언트의 `task_routes` 설정은 worker가 기대하는 것과 일치해야
해요. Worker에 speech-to-text task용 `stt` 큐와 언어 모델 task용 `llm`
큐가 있다면, API 클라이언트도 같은 큐로 라우팅해야 해요.

## Worker 쪽

Worker는 실제 task 구현을 발견하고 실행하는 자체 Celery app이 있는 별도
서비스예요:

```python
# Worker: celery_app.py (has actual task implementations)
celery_app = Celery("worker")
celery_app.autodiscover_tasks(["worker.tasks"])

# Worker: tasks/llm.py
@celery_app.task(name="worker.tasks.llm.summarize_note")
def summarize_note(note_id: str) -> dict:
    ...
```

`@celery_app.task()`의 명시적 `name` 파라미터가 중요해요. API 쪽에서
`send_task()`에 사용하는 문자열과 일치해야 해요. 명시적 이름 없이는
Celery가 모듈 경로 기반으로 자동 생성하는데, 서비스 간에 다를 수 있어요.

## 문자열 취약성 완화

`send_task()`의 주요 위험은 오타예요. 잘못 입력된 task 이름은 존재하지
않는 핸들러에 조용히 task를 보내요. 큐에 영원히 앉아 있고 API 쪽에서는
에러가 없어요. 두 가지 실천이 도움이 돼요:

1. 인라인 문자열 대신 **task 이름에 상수를 사용**하세요
2. task를 dispatch하고 worker가 수신하는지 확인하는 **integration
   test**를 작성하세요

## Sync vs Async 고려사항

Celery task는 synchronous예요. Worker는 sync DB driver(asyncpg가 아닌
psycopg2)가 필요해요. API는 FastAPI 호환성을 위해 async(asyncpg)를
사용해요. 두 서비스 모두 같은 데이터베이스 model에 접근해야 한다면, ORM
model 파일의 중복이나 driver 특정 import가 없는 공유 패키지가 필요할
수 있어요.

## 이 패턴을 사용할 때

이 패턴은 API와 worker가 서로 다른 dependency 트리를 가진 별도
배포 가능한 서비스인 microservices 아키텍처에 맞아요. API가
async(FastAPI/asyncpg)이고 worker가 sync(Celery/psycopg2)이며, worker
코드를 import하지 않고 background task를 dispatch해야 할 때 올바른
선택이에요.

## 사용하지 않아도 되는 경우

- **Monolith 애플리케이션** -- API와 worker가 같은 코드베이스와
  dependency를 공유한다면, 타입 안전성과 IDE 지원을 위해 `.delay()` 또는
  `.apply_async()`를 사용하세요.
- **경량 background task** -- task가 빠르다면(1초 미만), Celery를
  추가하는 대신 `asyncio.create_task()` 또는 FastAPI `BackgroundTasks`를
  고려하세요.
- **Event-driven 아키텍처** -- 이미 Kafka, RabbitMQ direct, 또는
  SNS/SQS로 서비스 간 통신을 하고 있다면, Celery 레이어를 추가하는 건
  중복이에요.
- **단일 task 유형** -- API가 한 가지 유형의 task만 dispatch한다면,
  Celery 클라이언트 설정과 routing 설정의 오버헤드가 정당화되지 않을
  수 있어요.

## 핵심 요약

worker의 코드를 import할 수 없는 서비스에서 Celery task를 이름으로
dispatch하려면 `send_task()`를 사용하세요. 양쪽에서 task routing 설정을
미러링하세요. 문자열 취약성을 받아들이고 상수와 integration test로
완화하세요. 대안인 worker 모듈을 API로 import하는 건 서비스를 처음부터
분리한 목적을 무력화하는 dependency 체인을 만들어요.

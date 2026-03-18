---
title: Alembic과 Async SQLAlchemy 설정하기
description: SQLAlchemy의 async engine과 함께 Alembic migration을 설정하는 방법
date: 2026-02-03T00:00:00.000Z
updated: 2026-03-18T00:00:00.000Z
tags:
  - backend
  - alembic
  - sqlalchemy
  - python
  - database
category: backend
draft: false
lang: ko
source_lang: en
source_slug: alembic-async-sqlalchemy
source_updated: "2026-03-18"
translation_date: "2026-03-18"
references:
  - url: >-
      https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic
    title: Alembic - Using asyncio with Alembic
    type: official
  - url: "https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html"
    title: SQLAlchemy Async I/O Extension
    type: official
---

`alembic init`을 실행하고, 데이터베이스 URL을 `asyncpg`로 바꾸고,
`alembic upgrade head`를 실행하면 synchronous engine에 대한 알 수 없는
에러가 나와요. Alembic이 생성하는 기본 `env.py`는 async driver와 함께
동작하지 않아요. 여기서 필요한 브릿징 패턴과 제가 겪었던 모든 함정을
정리했어요.

## 문제 상황

Alembic은 synchronous 데이터베이스 engine을 전제로 해요. 생성되는
`env.py`는 `engine_from_config()`를 호출하는데, 이건 asyncpg나
aiosqlite 같은 async driver를 지원하지 않아요. 올바른 브릿징 패턴이
없으면 migration이 런타임에 실패하거나 — 더 나쁜 경우 — autogenerate가
뭐가 잘못됐는지 아무 표시도 없이 빈 migration 파일을 생성해요.

해결법은 Alembic의 메인 튜토리얼이 아니라 cookbook 페이지에 있어요.
시작 가이드를 따라하다가 async URL을 넣으면 벽에 부딪히게 돼요.

## 함정들

아래 각각이 디버깅 시간을 잡아먹었어요. 어느 것도 도움이 되는 에러
메시지를 주지 않았죠.

**기본 env.py는 sync 전용이에요.** Alembic이 생성하는 `env.py`는
`engine_from_config()`를 사용하는데, asyncpg를 지원하지 않아요. import
시점에는 에러가 안 나고 — migration을 실행할 때만 실패해요.

**빈 autogenerate migration.** model 모듈을 import하지 않고
`Base.metadata`에 접근하면 operation이 없는 migration이 조용히 생성돼요.
Alembic은 `Base.metadata.tables`가 비어 있다고 경고해주지 않아요.

**run_sync 브릿징이 직관적이지 않아요.** `connection.run_sync()` 안에
synchronous callable을 감싸는 패턴이 이걸 동작하게 하는 핵심인데, 메인
문서가 아니라 cookbook 페이지에 묻혀 있어요.

**ConfigParser `%` 보간 충돌.** `config.set_main_option("sqlalchemy.url", url)`은 Python의 `configparser`를 거치는데, `%`를 보간 구문(`%(name)s`)으로 해석해요. Pydantic의 `PostgresDsn.build()`가 비밀번호의 특수 문자를 URL 인코딩하면(`{` → `%7B`, `[` → `%5B`), `%`가 `ValueError: invalid interpolation syntax`를 일으켜요. 해결법: `set_main_option()` 호출 전에 `.replace("%", "%%")`를 적용하세요. 자동 생성된 비밀번호에 특수 문자가 포함된 경우 흔히 발생하는 함정이에요.

**Connection pooling 혼란.** 기본 pool 클래스는 장기 실행
애플리케이션에는 잘 작동하지만, 수명이 짧은 migration 스크립트에서는
connection 누수나 경고를 발생시켜요. pool이 문제인데 migration 로직이
문제인 줄 알고 헤매는 디버깅 세션이 생겨요.

**PostgreSQL enum 확장은 DDL 전용이에요.** `ALTER TYPE ... ADD VALUE`는
transaction 블록 안에서 실행할 수 없어요. Alembic은 기본적으로
migration을 transaction으로 감싸기 때문에, 기존 enum 타입에 값을
추가하면 "cannot be executed inside a transaction block" 에러가 나요.
`op.execute()`를 `autocommit` isolation과 함께 사용하거나, transaction
컨텍스트 바깥에서 구문을 실행해야 해요. downgrade 경로는 더 나빠요:
PostgreSQL은 기존 enum 타입에서 값을 제거하는 걸 지원하지 않아요. 해당
값이 없는 새 타입을 만들고, 모든 컬럼을 새 타입으로 마이그레이션하고,
이전 타입을 삭제해야 해요.

## 해결책

Alembic의 기본 `env.py`를 이 async 대응 버전으로 교체하세요:

```python
# alembic/env.py
import asyncio
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

# Import Base and all models
from app.db import Base
from app.models.user import User    # noqa: F401
from app.models.note import Note    # noqa: F401

target_metadata = Base.metadata

def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(
            config.config_ini_section, {}
        ),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def run_migrations_online():
    asyncio.run(run_async_migrations())
```

기본 버전과 다른 세 가지가 있어요:

1. `async_engine_from_config()`가 `engine_from_config()`를 대체해요
2. `connection.run_sync()`가 async connection을 Alembic의 sync migration runner로 연결해요
3. `NullPool`이 기본 connection pool을 대체해요

### alembic.ini 설정

```ini
[alembic]
script_location = alembic

# Use async driver in URL
sqlalchemy.url = postgresql+asyncpg://user:pass@host/db
```

## NullPool을 사용하는 이유

Migration은 수명이 짧은 작업이에요. connection pooling은 이점 없이
오버헤드만 추가해요 — 각 migration 실행은 하나의 connection을 만들고,
DDL 문을 실행하고, 종료해요. `NullPool`은 매번 새로운 connection을 만들고
사용 후 즉시 닫아요. connection 누수도 없고, pool 관련 경고도 없어요.

## 함정: Model Import

가장 흔한 "빈 migration" 혼란의 원인이에요:

```python
# Models MUST be imported before accessing Base.metadata
# Otherwise autogenerate won't detect tables

from app.models.user import User    # noqa: F401
from app.models.note import Note    # noqa: F401

# NOW this contains all table metadata
target_metadata = Base.metadata
```

import 없이는 `Base.metadata.tables`가 비어 있고
`alembic revision --autogenerate`는 빈 migration을 생성해요. `# noqa`
주석은 의도적이에요 — linter가 사용하지 않는 import이라고 표시하지만,
이건 SQLAlchemy의 metadata 레지스트리에 모델을 등록하는 부수 효과
import이에요.

## 주요 커맨드

```bash
# Create a new migration
alembic revision --autogenerate -m "add users table"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1

# Show current revision
alembic current
```

## 이 패턴을 사용할 때

- Alembic migration이 필요한 SQLAlchemy 2.0+ async engine(asyncpg, aiosqlite) 프로젝트
- FastAPI나 ORM 레이어가 async인 다른 async 프레임워크
- autogenerate를 활용한 migration 생성이 필요한 프로젝트

## 사용하지 않아도 되는 경우

- **Synchronous SQLAlchemy 프로젝트** — 표준 `env.py`가 잘 작동해요.
  async 브릿징 패턴을 추가하는 건 불필요한 복잡성이에요.
- **SQLAlchemy가 아닌 ORM** — Tortoise ORM, SQLModel(자체 migration
  도구를 사용하는 경우), Django ORM은 각자의 migration 시스템이 있어요.
- **스키마 없는 데이터베이스** — MongoDB, DynamoDB 등 NoSQL 저장소는
  Alembic을 사용하지 않아요.
- **일회성 스크립트나 노트북** — 테이블을 한 번만 만들면 되는 경우
  (예: `Base.metadata.create_all()`) Alembic은 과도해요.

## 한 문장으로 정리

`engine_from_config`를 `async_engine_from_config`로 바꾸고, sync migration runner를 `connection.run_sync()`로 감싸고, `NullPool`을 사용하고, `Base.metadata`를 건드리기 전에 모든 model을 import하세요. 이게 전체 레시피예요 — 나머지는 전부 이 네 단계 중 하나를 빠뜨렸을 때 생기는 결과를 디버깅하는 거예요.

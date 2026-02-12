---
title: Alembic과 Async SQLAlchemy 설정하기
description: SQLAlchemy의 async engine과 함께 Alembic migration을 설정하는 방법
date: 2026-02-03T00:00:00.000Z
updated: 2026-02-03T00:00:00.000Z
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
source_updated: "2026-02-03"
translation_date: "2026-02-12"
references:
  - url: >-
      https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic
    title: Alembic - Using asyncio with Alembic
    type: official
  - url: "https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html"
    title: SQLAlchemy Async I/O Extension
    type: official
---

`alembic init`을 실행하고, async PostgreSQL 데이터베이스를 연결하고,
`alembic revision --autogenerate`를 실행했는데... 빈 migration 파일이
나왔어요. 테이블도 없고. 에러도 없고. migration 파일에 operation이 하나도
없었어요.

Alembic을 SQLAlchemy의 async engine(asyncpg, aiosqlite)과 함께 사용하려면
메인 튜토리얼이 아니라 cookbook 페이지에 숨겨진 특별한 브릿징 패턴이
필요해요. `alembic init`이 생성하는 기본 `env.py`는 synchronous engine을
전제로 하고 있어서, 뭘 먼저 잘못하느냐에 따라 두 가지 다른 방식으로
실패해요.

## 왜 이게 까다로운가

Alembic이 생성하는 `env.py`는 `engine_from_config()`를 사용하는데, 이건
asyncpg 같은 async driver를 지원하지 않아요. import 시점에는 에러가 안
나고, migration을 실행할 때만 실패해요. `async_engine_from_config()`로
교체하는 게 첫 번째 단계이지만, 두 번째 문제가 숨어 있어요.

autogenerate 기능은 `Base.metadata`를 스캔해서 테이블을 찾아요. model
모듈을 import하지 않고 `Base.metadata`에 접근하면, metadata 객체가 비어
있어요. Alembic은 성실하게 operation이 없는 migration을 생성해요. 에러
메시지는 missing import에 대한 힌트를 전혀 주지 않아서, 모든 게 잘 된 것
같지만 migration이 아무것도 안 하는 상황이 돼요.

거기에 `run_sync` 브릿징 패턴(`connection.run_sync()` 안에 synchronous
callable을 감싸는 패턴)은 Alembic의 메인 튜토리얼이 아니라 cookbook
페이지에 문서화되어 있어요. 완전히 놓치기 쉬워요.

## Async 브릿징 패턴

핵심 아이디어는 간단해요: async engine을 만들고, connection을 얻고,
`connection.run_sync()`을 사용해서 표준 synchronous migration 로직을 async
connection 안에서 실행하는 거예요.

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

여기서 세 가지를 주목해야 해요.

첫째, `do_run_migrations`는 일반 synchronous 함수예요. `run_sync`에서
synchronous connection 객체를 받아서 Alembic이 항상 해왔던 방식 그대로
migration을 설정하고 실행해요.

둘째, `run_async_migrations`는 `NullPool`로 async engine을 만들고
`connection.run_sync(do_run_migrations)`를 호출해요. 이게 async/sync
경계를 연결해줘요 -- async connection이 synchronous callable을 Alembic의
migration runner가 작동할 수 있는 방식으로 실행해요.

셋째, `run_migrations_online`이 진입점이에요. `asyncio.run()`을 사용해서
Alembic이 기대하는 synchronous 컨텍스트에서 전체 async 체인을 구동해요.

## alembic.ini 설정

connection URL은 async driver를 사용해야 해요:

```ini
[alembic]
script_location = alembic

# Use async driver in URL
sqlalchemy.url = postgresql+asyncpg://user:pass@host/db
```

`postgresql+psycopg2` 대신 `postgresql+asyncpg`를 사용하는 거예요.
개발용으로 SQLite를 사용한다면 `sqlite+aiosqlite`를 사용하면 돼요.

## NullPool을 사용하는 이유

Migration은 수명이 짧은 작업이에요. connection pooling은 이점 없이
오버헤드만 추가해요 -- 각 migration 실행은 하나의 connection을 만들고,
DDL 문을 실행하고, 종료해요. 기본 pool 클래스는 장기 실행 애플리케이션에는
잘 작동하지만, 수명이 짧은 스크립트에서는 connection 누수나 경고를
발생시켜요. `NullPool`은 매번 새로운 connection을 만들고 사용 후 즉시
닫아요.

## Model Import 함정

가장 흔한 무음 실패예요. `Base.metadata`에 접근하기 전에 model을 반드시
import해야 하고, 그렇지 않으면 autogenerate가 테이블을 하나도 감지하지
못해요:

```python
# Models MUST be imported before accessing Base.metadata
# Otherwise autogenerate won't detect tables

from app.models.user import User    # noqa: F401
from app.models.note import Note    # noqa: F401

# NOW this contains all table metadata
target_metadata = Base.metadata
```

import 없이는 `Base.metadata.tables`가 비어 있고
`alembic revision --autogenerate`는 빈 migration을 생성해요. `# noqa:
F401` 주석은 사용하지 않는 import에 대한 linter 경고를 억제해요 -- 이
import들은 심볼을 직접 사용하기 위해서가 아니라 부수 효과(테이블 metadata
등록)를 위해 존재해요.

## 주요 커맨드

`env.py`가 설정되면 표준 Alembic 워크플로우가 작동해요:

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

이 패턴은 Alembic migration이 필요한 SQLAlchemy 2.0+ async
engine(asyncpg, aiosqlite) 프로젝트에 적용돼요. FastAPI 프로젝트가 가장
흔한 케이스이지만, ORM 레이어가 async인 모든 async 프레임워크에서
필요해요.

## 사용하지 않아도 되는 경우

- **Synchronous SQLAlchemy 프로젝트** -- 표준 `env.py`가 잘 작동해요.
  async 브릿징 패턴을 추가하는 건 불필요한 복잡성이에요.
- **SQLAlchemy가 아닌 ORM** -- Tortoise ORM, SQLModel(자체 migration
  도구를 사용하는 경우), Django ORM은 각자의 migration 시스템이 있어요.
- **스키마 없는 데이터베이스** -- MongoDB, DynamoDB 등 NoSQL 저장소는
  Alembic을 사용하지 않아요.
- **일회성 스크립트나 노트북** -- 테이블을 한 번만 만들면 되는 경우
  (예: `Base.metadata.create_all()`) Alembic은 과도해요.

## 핵심 요약

async Alembic 설정에는 에러 메시지가 전혀 나오지 않는 두 가지 실패 모드가
있어요: model import 누락(빈 migration)과 잘못된 pool 클래스(connection
경고). 둘 다 무음이에요. `env.py` 브릿징 패턴을 제대로 설정하고,
`Base.metadata` 전에 model을 import하고, `NullPool`을 사용하면, Alembic은
sync에서 항상 그랬던 것처럼 async SQLAlchemy에서도 동일하게 작동해요.

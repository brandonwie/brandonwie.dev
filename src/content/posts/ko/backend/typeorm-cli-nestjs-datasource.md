---
title: TypeORM CLI와 NestJS DataSource 충돌
description: TypeORM CLI를 NestJS 프로젝트에서 사용할 때 발생하는 연결 충돌 문제와 해결 방법.
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - typeorm
  - nestjs
category: backend
draft: false
lang: ko
source_lang: en
source_slug: typeorm-cli-nestjs-datasource
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://typeorm.io/#/using-cli'
    title: Using CLI — TypeORM
    type: official
  - url: 'https://docs.nestjs.com/techniques/database'
    title: Database — NestJS Documentation
    type: official
---

## 문제 상황

`migration:generate` 또는 `migration:run` 실행 시 에러가 발생해요.

```text
CannotConnectAlreadyConnectedError: Cannot create a "default" connection
because connection to the database already established.
```

## 원인

NestJS 앱 부팅 방식의 `ormconfig.ts`가 문제에요.

```typescript
export default NestFactory.create(AppModule).then((app) => {
  return app.get(DataSource);
});
```

1. `NestFactory.create(AppModule)` 실행
2. `TypeOrmModule.forRootAsync()`가 DataSource를 **초기화하고 연결**
3. TypeORM CLI가 반환된 DataSource로 `initialize()` 호출 시도
4. 이미 연결된 상태라 에러 발생

## 해결 방법

로컬 마이그레이션용 별도 설정 파일(`ormconfig.local.ts`)을 만들면 돼요.

```typescript
import * as dotenv from "dotenv";
import { DataSource } from "typeorm";
import { getDatabaseDefaultOptions } from "./database";

// .env 파일 로드 (로컬 DB 확인 필수!)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const defaultOptions = getDatabaseDefaultOptions();

// 연결 없이 DataSource만 생성 - CLI가 직접 연결함
const dataSource = new DataSource({
  ...defaultOptions,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
});

export default dataSource;
```

## 설정 파일 분리

| 파일                 | 사용처                  | 특징                                  |
| -------------------- | ----------------------- | ------------------------------------- |
| `ormconfig.ts`       | Docker/ECS 마이그레이션 | NestJS 부팅 방식, 앱 컨텍스트 필요 시 |
| `ormconfig.local.ts` | 로컬 마이그레이션       | 독립 DataSource, CLI가 직접 연결      |

## package.json 스크립트

```json
{
  "migration:generate": "npm run build && typeorm migration:generate -d ./dist/src/ormconfig.local.js ...",
  "migration:run": "npm run build && typeorm migration:run -d ./dist/src/ormconfig.local.js",
  "migration:revert": "npm run build && typeorm migration:revert -d ./dist/src/ormconfig.local.js",
  "migration:run-docker": "node node_modules/typeorm/cli.js migration:run -d dist/src/ormconfig.js",
  "migration:revert-docker": "node node_modules/typeorm/cli.js migration:revert -d dist/src/ormconfig.js"
}
```

## 주의사항

**환경 파일 확인은 필수에요.**

- `.env` → 로컬 DB(안전)
- `.env.development` → AWS 개발 DB
- `.env.production` → AWS 운영 DB

실수로 잘못된 환경 파일을 사용하면 실제 DB가 변경될 수 있어요.

---
title: TypeORM migration:generate는 schema drift 전체를 감지해요
description: >-
  TypeORM migration 생성 결과에 현재 feature와 무관한 SQL이 섞이는 이유와
  local DB drift, 이미 배포한 migration 수정까지 구분해서 다루는 방법이에요.
date: 2026-04-17T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - backend
  - typeorm
  - migration
  - postgresql
  - atomic-commits
category: backend
draft: false
lang: ko
source_lang: en
source_slug: typeorm-migration-drift-scope
source_updated: 2026-07-23T00:00:00.000Z
translation_date: 2026-07-23
references:
  - url: 'https://typeorm.io/migrations#generating-migrations'
    title: TypeORM migration:generate documentation
    type: official
  - url: 'https://www.postgresql.org/docs/current/catalog-pg-constraint.html'
    title: PostgreSQL pg_constraint system catalog
    type: official
---

entity 하나를 고치고 `migration:generate`를 실행했는데 예상하지 않은 SQL도 함께
나왔어요. 몇 주 전부터 어긋나 있던 다른 column default까지 새 migration에
들어왔어요.

TypeORM 동작을 보면 정상적인 결과예요. migration 생성은 전체 entity graph와
연결된 database schema를 비교해요. 현재 branch에서 바꾼 line이 무엇인지는
알지 못하므로, 최종 migration scope는 개발자가 직접 정해야 해요.

## 처음 마주친 drift

entity에 column 하나를 추가했다고 해볼게요.

```typescript
@Column({ type: 'varchar', name: 'google_sub', nullable: true, default: null })
googleSub: string | null;
```

`npm run migration:generate --name=AddGoogleSub`를 실행했는데 아래 SQL도
들어왔어요.

```sql
ALTER TABLE "user" ALTER COLUMN "preference" SET DEFAULT '{"hasDismissedUpgradePopup":false, ...}';
```

이번 작업에서는 `preference`를 건드리지 않았어요. 이전에 TypeScript의
`defaultUserPreference`에는 `hasDismissedUpgradePopup`을 추가했지만 DB
default를 맞추는 migration은 만들지 않았던 거예요. 그 차이가 계속 남아
있었어요.

## PR에서 보이는 증상

- feature와 무관한 SQL이 diff에 들어와요.
- reviewer가 왜 `user.preference`를 바꾸는지 물어요.
- PR을 되돌리면 feature와 별개인 drift 수정까지 함께 돌아가요.
- `--name=AddGoogleSub`라는 이름과 실제 SQL 범위가 달라요.

migration 이름과 timestamp가 같아도 완전한 parity 증거는 아니에요. TypeORM은
실행한 본문의 checksum을 기록하지 않아요. 새 DB에서 migration을 다시 실행해도
현재 file만 검증할 뿐, 오래된 환경이 과거에 어떤 bytes를 실행했는지는 알 수
없어요.

확실히 비교하려면 migration 이력과 live PostgreSQL catalog를 함께 봐요. 새
constraint를 어길 row가 있는지도 별도 query로 확인해야 해요.

## 무관한 SQL을 분리해요

생성된 migration에서 이번 feature와 무관한 drift를 빼고, 이유를 file header에
남겨요. 빠진 drift만 처리하는 migration은 별도 작업으로 열어요.

```typescript
// NOTE: TypeORM also detected an unrelated drift on user.preference JSONB
// default (missing `hasDismissedUpgradePopup` key). That drift is out of scope
// for #840 and was removed to keep the commit atomic. A separate PR should
// regenerate just the preference default sync.
export class AddGoogleSub1776389391540 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "google_sub" varchar`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_google_sub_unique"
      ON "user" ("google_sub") WHERE google_sub IS NOT NULL`);
    // NOTE: `ALTER COLUMN "preference" SET DEFAULT ...` removed; see header.
  }
  // ...
}
```

보통 "migration을 손으로 고치지 말라"는 규칙은 필요한 schema 변경을 빼먹지
않게 하려는 거예요. 여기서는 반대 상황이에요. TypeORM이 의도보다 많은 SQL을
만들었으므로 무관한 statement를 제거하는 게 scope를 바로잡는 방법이에요.

## 생성 직후 확인할 것

- TypeORM에는 `--scope=<entity>` 옵션이 없으니 commit 전에 SQL을 직접 읽어요.
- `--name=`과 실제 SQL이 다르면 이름을 바꾸거나 무관한 SQL을 분리해요.
- 제거한 line과 이유를 migration header에 기록해요.
- drift는 다음 개발자의 migration에도 계속 나타나요. 별도 drift sync PR로
  정리하면 이후 diff가 작아져요.
- feature와 drift를 같이 배포하면 rollback도 둘을 함께 되돌리게 돼요.

추가 SQL이 feature의 정상적인 결과라면 빼면 안 돼요. 새 column 때문에 생긴
index처럼 실제 scope에 속하는 변경은 유지해요. entity를 한 명만 고치는 초기
프로젝트라면 이 분리 과정이 필요할 가능성도 낮아요.

## 두 번째 drift는 local DB가 operation을 바꿔요

더 위험한 경우도 있어요. local database만 staging과 production에서 벗어나면
`migration:generate`가 local에는 맞지만 deploy에서는 실패하는 SQL을 만들 수
있어요.

1. local에서 migration을 실행한 뒤 code에서는 그 file을 삭제했어요.
2. local DB에는 변경이 남았지만 staging과 production에는 없어요.
3. `google_sub`를 `provider_sub`로 바꾸고 migration을 생성해요.
4. TypeORM은 local DB를 기준으로 아래 SQL을 만들어요.

```sql
ALTER TABLE "user" RENAME COLUMN "google_sub" TO "provider_sub"
```

local에는 `google_sub`가 있으니 rename이 맞아요. 하지만 production에는 원본
column이 없어서 `column "google_sub" does not exist`로 실패해요.

SQL만 읽으면 자연스러운 rename처럼 보이기 때문에 review에서 놓칠 수 있어요.
CI도 local과 같은 seed를 쓴다면 통과하고 실제 deploy에서만 실패할 수 있어요.

### 복구 순서

1. 삭제한 migration file을 잠시 복원하고
   `src/database/index.ts`에 등록한 뒤 `npm run migration:revert`로 local
   column을 제거해요.
2. 복원한 file과 rename 기반 replacement를 지워요.
3. 깨끗한 local DB에서 migration을 다시 생성해요. 이제 TypeORM은 아래처럼
   `ADD COLUMN`을 만들어요.

   ```sql
   ALTER TABLE "user" ADD "provider_sub" character varying
   ```

4. 자동화가 migration command를 실행하기 전에 operator가 확인하도록
   guardrail을 둬요. 생성하는 사람은 비교 대상 DB의 상태를 알아야 해요.

생성 결과에 의도하지 않은 `RENAME COLUMN`이나 `RENAME INDEX`가 있으면 원본이
production에 실제로 있었는지 물어봐야 해요. 없었다면 local DB를 되돌리고 다시
생성해요.

예방 방법도 단순해요. migration command를 암묵적으로 실행하지 않고, code에서
migration을 되돌렸다면 local DB도 함께 되돌려요. CI에서는 빈 DB에
`migration:run`을 실행해 없는 column을 rename하는 오류를 merge 전에 잡아요.

## 배포한 migration 본문을 고치면 조용한 drift가 생겨요

세 번째 경우에는 생성 시점 신호조차 없어요. 새 migration을 만들지 않고 기존
`CREATE TABLE` migration 본문에 새 column이나 index를 끼워 넣는 경우예요.

```text
feat: add integration_id to user_contacts

- merge the new column into the existing create-table migration
```

history가 깔끔해 보이지만 이미 기존 본문을 실행한 환경은 예전 schema에 그대로
남아요.

### TypeORM이 감지하지 못하는 이유

`migrations` table은 적용한 migration의 `name`과 `timestamp`만 기록해요.
content hash도, checksum도, 본문 재검증도 없어요. 같은 timestamp가 이미
있으면 file 본문을 바꿔도 다시 실행하지 않아요.

- 개발 DB는 몇 주 전에 원래 본문을 실행해서 `integration_id`가 없어요.
- 작성자는 기존 `CREATE TABLE`에 `"integration_id" integer NOT NULL`을
  추가해요.
- `migration:run`은 timestamp를 보고 "no migrations to run"으로 끝나요.
- entity에는 `integrationId`가 있지만 DB에는 column이 없어요.
- 해당 column을 읽는 query가 runtime에서 실패해요.

## 이미 수정된 migration을 찾는 법

먼저 오래된 migration을 creation 이후에 고친 흔적을 찾아요.

1. `git log --all --oneline -- src/database/migrations/*.ts | grep -i "merge\|병합\|consolidate\|fold"`
   로 기존 migration을 건드린 commit을 찾아요.
2. 각 migration에 `git log --follow --oneline -- <migration-file>`을
   실행해 최초 추가 뒤에도 본문이 바뀌었는지 봐요.
3. `CREATE TABLE` 안의 의심스러운 column이나 index line에 `git blame`을
   실행해 migration 생성 commit보다 나중에 들어왔는지 확인해요.

feature branch에서 발견했고 아직 사용자 환경에 배포하지 않았다면 기존
migration을 원래 본문으로 되돌리고 새 migration을 생성해요. revert와 새
migration은 logical commit을 나눠서 reviewer가 흐름을 볼 수 있게 해요.

이미 배포했다면 새 환경은 수정된 본문을 실행하고 production은 원래 본문을
실행한 상태가 돼요. 기존 file을 다시 고치지 말고 모든 환경에 같은 방식으로
적용되는 corrective `ADD COLUMN` migration으로 앞으로 고쳐야 해요.

### 다시 생기지 않게 막아요

- `main`이나 `develop`에 merge된 migration 실행 본문은 불변으로 다뤄요.
- PR이 오래된 migration file을 고치면 새 migration을 요청해요.
- CI에서 일정 기간보다 오래된 migration의 실행 부분을 수정한 PR을 막을 수
  있어요.
- 빈 DB에 migration 전체를 실행하고 결과 schema도 비교해요. production이
  과거에 실행한 본문과 새 환경이 실행한 본문이 다르면 drift가 드러나요.

## migration history가 같아도 constraint는 다를 수 있어요

check constraint에서도 같은 실패가 생겨요. development와 production 모두
`CreateDailyCounterTable1781675561791`을 기록하고 있지만 현재 repository의
migration 본문에는 `daily_counter_count_check`가 뒤늦게 들어갈 수 있어요.
production catalog에는 `CHECK ((count >= 1))`이 있고 development에는 없을
수도 있어요.

같은 migration identity 아래 서로 다른 과거 본문을 실행한 결과와 모순되지
않아요. `migrations` table만 다시 봐서는 구분할 수 없어요.

1. 영향을 받는 환경의 live constraint catalog를 비교해요.
2. 넣으려는 predicate를 위반하는 row가 있는지 query해요.
3. 위반 row가 없다면 빠진 환경에만 constraint를 추가해요.
4. 이미 배포한 migration은 그대로 두고 forward change로 복구해요.

`SELECT ... FROM daily_counter WHERE count < 1`이 0건이라면 기존 data를
깨뜨리지 않고 constraint를 추가할 수 있어요.

## 마지막 판단 기준

생성된 migration은 scope가 보장된 결과가 아니라 검토할 제안이에요. 모든
statement가 feature에 속하는지 보고, deploy baseline과 같은 DB에서 생성하며,
이미 실행됐을 수 있는 migration 본문은 고치지 않아요.

TypeORM은 과거 file의 checksum 대신 identity만 기록해요. 그래서 migration
table의 일치만으로는 충분하지 않아요. 환경이 다르면 live catalog와
constraint를 위반할 data를 함께 비교해요. 최종 증거는 현재 저장소의 migration
file이 아니라 실제 database 상태예요.

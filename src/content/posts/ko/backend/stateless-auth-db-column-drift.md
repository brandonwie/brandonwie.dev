---
title: Stateless Auth DB 컬럼 Drift
description: 인증이 stateful에서 stateless JWT 검증으로 마이그레이트했어요. 테스트는 통과해요. 모바일 사용자는 access_token이 채워져 있고; 웹 사용자는 NULL이에요. Drift는 사용자 동작에는 invisible하다가 ops가 컬럼을 쿼리할 때까지요.
date: 2026-04-29T00:00:00.000Z
updated: '2026-04-29'
tags:
  - backend
  - auth
  - database
  - migration
  - stateless
  - knowledge
category: backend
draft: false
lang: ko
source_lang: en
source_slug: stateless-auth-db-column-drift
source_updated: 2026-04-29T00:00:00.000Z
translation_date: '2026-04-29'
---

인증은 작동해요. 모바일 사용자는 잘 로그인해요. 웹 사용자도 잘 로그인해요.
둘 다 보호된 endpoint를 칠 수 있어요. 그런데 `users.access_token`을
쿼리해보면 절반이 NULL이에요 — 정확히 웹 경로로 들어온 절반이요. Auth
guard는 더 이상 컬럼을 읽지 않으니까(stateless JWT) drift가 사용자 동작에
invisible해요 — ops가 데이터가 있을 거라 기대하며 그 컬럼을 쿼리할
때까지요. 그리고 버그는 auth에 있는 게 아니에요 — auth는 멀쩡해요.
마이그레이션 다운스트림의 데이터 무결성 계약 drift예요.

## 누가, 언제, 어디서

이 패턴은 stateful auth(매 요청마다 DB-저장 토큰을 비교)에서 stateless
auth(JWT 복호화/검증, DB 조회 없음)로 마이그레이트하는 백엔드 엔지니어에게
나타나요. 일부 코드 경로는 업데이트됐지만 다른 건 안 된 partial migration
중에, 또는 DB 컬럼이 "backward 호환을 위해 유지"되지만 경로 사이에 쓰기
semantics가 diverge할 때 물려요. Authentication 자체에 더 이상 load-bearing이
아닌 `users.access_token`(또는 동등물) 컬럼을 가진 모든 auth 서브시스템에서
찾아봐요.

## 무엇이 drift하나

Stateful auth(guard가 DB에서 `user.access_token`을 읽고 string-compare)에서
stateless auth(guard가 JWT를 복호화, 컬럼을 절대 쿼리 안 함)로
마이그레이트하면, 컬럼은 functionally dead가 돼요 — 그런데 거기에 채우는
쓰기는 보통 동시에 감사되지 않아요. 다른 코드 경로가 다른 쓰기 semantics를
갖게 돼요:

- **경로 A**는 매 로그인마다 새로 발급된 JWT를 컬럼에 여전히 써요.
- **경로 B**는 쓰기를 완전히 멈추거나 (또는 더 이상 sense가 안 되는 helper로
  옛 null 값을 보존)

Auth guard는 어느 쪽이든 작동해요(컬럼을 안 읽으니까). 그래서 drift는
**사용자 동작에 invisible**해요. 다음 때만 표면화돼요:

- Ops/BI/Sentry가 non-null value를 기대하며 컬럼을 쿼리할 때.
- 컬럼을 정말로 읽는 새 기능이 추가되어 절반의 사용자에서 NULL을 발견할 때.
- Auth를 이해하려는 미래 엔지니어가 컬럼 쓰기 사이트를 읽고 모순된 mental
  model을 얻을 때 (모바일은 JWT를 쓰고, 웹은 null을 보존).

## 왜 함정인가

두 가지 실패 모드가 drift를 숨겨요:

1. **테스트가 통과해요.** Auth-flow 테스트는 로그인이 성공하고 사용자가
   protected endpoint를 호출할 수 있는지 확인해요. 컬럼이 load-bearing이
   아니니까 `users.access_token IS NOT NULL`을 assert하지 않아요. Drift가
   테스트 suite에 invisible해요.
2. **"stateless" 코멘트가 반쪽만 honored 돼요.** 한 helper에 `// STATELESS
   APPROACH — 컬럼은 backward compat을 위해 유지되지만 사용 안 됨` 같은
   코멘트를 추가하면 다음 reader는 모든 쓰기가 감사됐다고 확신해요.
   안 됐어요 — 그들이 읽고 있는 helper만 업데이트됐어요.

## 수정 #1: 컬럼의 운명을 명시적으로 결정

Stateless auth로 마이그레이트할 때 두 가지 옵션:

- **쓰기 drop.** 모든 경로가 쓰기를 멈춰요. 컬럼을 default 없이 nullable로
  설정하는 마이그레이션 추가. 배포가 안정된 후 follow-up으로 컬럼 제거.
  ADR에 문서화.
- **일관되게 계속 쓰기.** 모든 issuance 경로가 새로 발급된 토큰을 persist,
  아무도 안 읽어도. 의도(audit trail / 미래 기능 / parity)를 문서화.

잘못된 선택은 "ambient" — 문서화도 안 되고 enforce도 안 됨.

## 수정 #2: 모든 쓰기 사이트 감사

컬럼 이름(`access_token`, `accessToken` 등)을 grep하고 모든 callsite를
검사해요. 쓰기를 wrap하는 helper가 semantics를 바꿨다면 — 예를 들어
`generateRefreshToken`이 이제 새로 쓰는 대신 거기 있던 걸 보존한다면 — 그
helper의 모든 호출자가 그 변경을 silently 상속해요.

## 수정 #3: 테스트로 계약을 못 박아요

컬럼이 "load-bearing이 아니"라도 선택한 계약을 assert하는 integration
테스트를 추가해요:

```sql
-- write-consistently 계약:
SELECT access_token FROM users WHERE email = 'test@example.com'  → NOT NULL

-- drop-writes 계약:
SELECT access_token FROM users WHERE email = 'test@example.com'  → NULL
```

invisible drift를 CI 실패로 변환해요. 테스트는 20줄이고 "ops가 프로덕션에서
발견" 티켓의 전체 카테고리를 제거해요.

## 프로덕션에서 drift를 발견했을 때

1. **Auth guard 먼저 확인.** Stateless라면(JWT만 복호화, DB 읽기 없음),
   drift는 contract-level이고 auth-broken이 아니에요. urgency를 그에 맞게
   triage — 보안 인시던트가 아니에요.
2. **다수 경로에 매칭하는 방향 선택.** 4개 경로 중 3개가 JWT를 쓰면, 경로
   4를 매칭하도록 수정. 1개만 쓰면 단독 writer 제거. 소수 마이그레이트가
   다수 마이그레이트보다 싸요.
3. **다운스트림 consumer가 실제로 깨지지 않으면 backfill 하지 마세요.**
   영향받은 행은 다음 로그인에서 self-heal 해요; backfill 마이그레이션은
   ops 시간과 위험을 들여요.

## 왜 조사가 처음에 잘못된 레이어에 lands하는가

첫 본능은 "auth guard가 NULL을 읽고 있을 거야" — 하지만 stateless guard는
아예 안 읽어요. Guard를 추적하는 데 보낸 시간은 낭비; drift는 auth 다운스트림이지
auth 안이 아니에요. 실제 원인으로의 가장 빠른 경로는 컬럼의 쓰기 사이트를
grep하고 경로 사이에 그들의 동작을 diff하는 거예요.

## "By-design" 코멘트가 misleading해요

한 쓰기 사이트 근처의 `// STATELESS — 컬럼 사용 안 됨` 코멘트는 전체
서브시스템이 동의한 것처럼 implies해요. 그 코멘트가 사는 helper만 실제로
그렇게 동작해요. Localized 코멘트를 로컬 코드에 대한 evidence로 다루고,
서브시스템 전체 계약으로 다루지 마세요.

## 구체적 함정: helper가 옛 값을 보존

`generateRefreshToken`은 토큰 인자를 받지 않고 `user.accessToken`(fresh
사용자에서는 NULL)을 사용해요. 호출자가 새로 생성한 JWT는 helper가 보지
못해서 절대 persist되지 않아요. 미묘함: 버그는 helper의 signature(토큰
파라미터 없음)와 source 선택(fresh JWT 대신 DB 컬럼)에 있지, 어떤 한
명백한 라인에 있지 않아요.

## 실제 예시

```ts
// auth.service.ts (mobile path) — JWT를 DB에 씀
const mAccessToken = this.getAccessToken(user); // 새 JWT
const mRefreshToken = user.refreshToken || randomUUID();
await this.usersService.updateToken(user.id, mAccessToken, mRefreshToken); // ← JWT 씀

// auth-v1.service.ts (web path, 수정 전) — JWT를 안 씀
const mAccessToken = this.getAccessToken(user); // 새 JWT (DB 목적으로는 버려짐)
const mRefreshToken = await this.usersService.generateRefreshToken(user.id);
// ↑ helper가 내부적으로 updateToken(userId, user.accessToken /* NULL */, refreshToken)을 호출.
//   웹 사용자는 users.access_token = NULL로 끝남.

// 수정: web path가 mobile pattern을 mirror.
const mAccessToken = this.getAccessToken(user);
const mRefreshToken = user.refreshToken || randomUUID();
await this.usersService.updateToken(user.id, mAccessToken, mRefreshToken); // ← 이제 JWT 씀
```

수정은 mechanical — web path가 mobile path를 명시적으로 mirror하게 만들어요.
다음 단계(ADR이 commit해야 하는 것)는 두 경로가 동의하면 컬럼이 아예
존재해야 하는지 결정하는 거예요.

## 핵심 포인트

- Stateless auth는 DB 토큰 컬럼을 **auth에 dead**로 만들지만, ops/BI/audit에
  대해서는 반드시 그렇지 않아요.
- 서브시스템은 **모든** 쓰기 사이트가 동의할 때까지 "stateless"가 아니에요.
  하나의 holdout이 path-dependent drift를 만들어요.
- 사용자 동작 테스트에 버그가 invisible해요 — auth가 작동하니까. CI는
  컬럼 계약을 명시적으로 assert해야 잡아요.
- "Backward compatibility"는 fix-direction이 아니에요 — 연기예요.
  Drop-writes 또는 write-consistently를 선택해서 ADR에 문서화해요.

## 언제 사용할까

- Partially-migrated auth 서브시스템 감사.
- Stateless JWT 검증 추가하면서 legacy DB 컬럼을 "for compat" 유지.
- 일부 경로는 토큰을 persist하고 다른 건 안 하는 auth 코드베이스 onboarding.
- 사용자가 로그인되어 있는데 NULL 토큰 컬럼을 보여주는 ops 대시보드 조사.

## 언제 사용하지 말까

- Pure greenfield stateless auth (DB 컬럼 아예 없음 — drift 불가능).
- Pure stateful auth (DB 컬럼이 load-bearing — drift가 대시보드만이 아니라
  로그인을 깸).

## 정리

Auth path에 작동하는 마이그레이션이 auth 다운스트림의 데이터 계약을 깰 수
있어요. 수정은 더 영리한 코드가 아니라 — 컬럼이 목적을 가지는지에 대한
deliberate, 문서화된 결정, 그것을 건드리는 모든 경로에 일관되게 적용,
누군가 메모를 못 받은 새 경로를 추가하는 날 실패하는 테스트로 못 박는
거예요.

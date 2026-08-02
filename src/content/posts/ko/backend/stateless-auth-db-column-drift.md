---
title: Stateless Auth DB 컬럼 Drift
description: Stateful 인증에서 stateless JWT 검증으로 마이그레이션했어요. 테스트는 통과해요. 모바일 사용자는 access_token이 채워져 있는데 웹 사용자는 NULL이에요. 이 drift는 ops가 컬럼을 쿼리하기 전까지 사용자 동작에서는 드러나지 않아요.
date: 2026-04-29T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-08-02'
---

인증은 작동해요. 모바일 사용자는 잘 로그인해요. 웹 사용자도 잘 로그인해요.
둘 다 보호된 endpoint를 호출할 수 있어요. 그런데 `users.access_token`을
쿼리해보면 절반이 NULL이에요 — 정확히 웹 경로로 들어온 절반이요. Auth
guard는 더 이상 그 컬럼을 읽지 않으니까(stateless JWT) drift가 사용자
동작에서는 드러나지 않아요. 데이터가 있을 거라 기대하고 ops나 BI가 그
컬럼을 쿼리할 때에야 표면으로 올라와요. 그리고 버그는 auth에 있는 게
아니에요 — auth는 멀쩡해요. 마이그레이션 다운스트림의 데이터 무결성 계약
drift예요.

## 누가, 언제, 어디서

이 패턴은 stateful auth(매 요청마다 DB에 저장된 토큰을 비교)에서 stateless
auth(JWT 복호화/검증, DB 조회 없음)로 마이그레이션하는 백엔드 엔지니어에게
나타나요. 일부 코드 경로만 업데이트되고 나머지는 그대로인 partial migration
중에, 또는 DB 컬럼을 "backward 호환을 위해 유지"하면서 경로마다 쓰기
semantics가 갈라질 때 물려요. 인증 자체에는 더 이상 load-bearing이 아닌
`users.access_token`(또는 동등한) 컬럼을 가진 auth 서브시스템이라면
어디든 살펴봐요.

## 무엇이 drift하나

Stateful auth(guard가 DB에서 `user.access_token`을 읽고 string-compare)에서
stateless auth(guard가 JWT를 복호화하고 컬럼은 절대 쿼리하지 않음)로
마이그레이션하면 컬럼은 기능적으로 죽어요 — 그런데 거기에 값을 채우는
쓰기는 보통 같이 감사되지 않아요. 그래서 코드 경로마다 쓰기 semantics가
달라져요:

- **경로 A**는 매 로그인마다 새로 발급된 JWT를 컬럼에 계속 써요.
- **경로 B**는 쓰기를 아예 멈춰요. 또는 더 이상 말이 안 되는 helper를 통해
  예전 null 값을 그대로 보존해요.

Auth guard는 어느 쪽이든 작동하니까(컬럼을 읽지 않으니까) drift는 **사용자
동작에는 보이지 않아요**. 다음 상황에서야 표면으로 올라와요:

- Ops/BI/Sentry가 non-null 값을 기대하고 컬럼을 쿼리할 때.
- 컬럼을 실제로 읽는 새 기능이 추가되어 사용자 절반에서 NULL을 발견할 때.
- Auth를 이해하려던 다음 엔지니어가 컬럼 쓰기 사이트를 읽고 모순된 mental
  model을 갖게 될 때 (모바일은 JWT를 쓰고, 웹은 null을 보존).

## 왜 함정인가

두 가지 실패 모드가 drift를 숨겨요:

1. **테스트가 통과해요.** Auth-flow 테스트는 로그인이 성공하는지, 사용자가
   protected endpoint를 호출할 수 있는지만 확인해요. 컬럼이 load-bearing이
   아니니까 `users.access_token IS NOT NULL`은 assert하지 않아요. 그래서
   drift가 테스트 suite에는 보이지 않아요.
2. **"stateless" 코멘트가 절반만 지켜져요.** 한 helper에 `// STATELESS
   APPROACH — 컬럼은 backward compat을 위해 유지되지만 사용 안 됨` 같은
   코멘트를 달아두면, 다음에 읽는 사람은 모든 쓰기가 감사됐다고 믿게 돼요.
   아니에요 — 그 코멘트가 붙은 helper 하나만 업데이트된 거예요.

## 수정 #1: 컬럼의 운명을 명시적으로 결정

Stateless auth로 마이그레이션할 때 선택지는 두 개예요:

- **쓰기를 없애기.** 모든 경로가 쓰기를 멈춰요. 컬럼을 default 없이
  nullable로 바꾸는 마이그레이션을 추가하고, 배포가 안정되면 follow-up에서
  컬럼을 제거해요. 그리고 ADR에 남겨요.
- **일관되게 계속 쓰기.** 아무도 읽지 않더라도 모든 issuance 경로가 새로
  발급한 토큰을 persist해요. 의도(audit trail / 미래 기능 / parity)를
  문서로 남겨요.

잘못된 선택은 "ambient" — 문서화도, enforce도 되지 않은 상태예요.

## 수정 #2: 모든 쓰기 사이트 감사

컬럼 이름(`access_token`, `accessToken` 등)을 grep해서 모든 callsite를
살펴봐요. 쓰기를 감싸는 helper가 semantics를 바꿨다면 — 예를 들어
`rotateRefreshToken` 같은 helper가 새 값을 쓰는 대신 row에 이미 있던 값을
보존하게 됐다면 — 그 helper를 부르는 모든 호출자가 그 변경을 조용히
물려받아요.

## 수정 #3: 테스트로 계약 고정

컬럼이 "load-bearing이 아니"라도, 선택한 계약을 assert하는 integration
테스트를 추가해요:

```sql
-- write-consistently 계약:
SELECT access_token FROM users WHERE email = 'test@example.com'  → NOT NULL

-- drop-writes 계약:
SELECT access_token FROM users WHERE email = 'test@example.com'  → NULL
```

보이지 않던 drift가 CI 실패로 바뀌어요. 테스트는 스무 줄이면 되고, "ops가
프로덕션에서 발견했다"는 티켓 부류를 통째로 없애줘요.

## 프로덕션에서 drift를 발견했을 때

1. **Auth guard부터 확인해요.** Stateless라면(JWT만 복호화, DB 읽기 없음)
   drift는 계약 수준의 문제지 auth가 깨진 게 아니에요. 긴급도를 거기에
   맞춰 잡아요 — 보안 인시던트가 아니에요.
2. **다수 경로와 같은 방향을 골라요.** 4개 경로 중 3개가 JWT를 쓰고 있으면
   나머지 하나를 거기에 맞춰요. 1개만 쓰고 있으면 그 하나를 없애요. 소수를
   옮기는 게 다수를 옮기는 것보다 싸요.
3. **다운스트림 consumer가 실제로 깨지지 않으면 backfill 하지 마세요.**
   영향받은 행은 다음 로그인에 스스로 채워져요. Backfill 마이그레이션은
   ops 시간과 위험을 잡아먹어요.

## 왜 조사가 처음에 엉뚱한 레이어로 향하는가

첫 본능은 "auth guard가 NULL을 읽고 있을 거야"예요 — 하지만 stateless
guard는 아예 읽지 않아요. Guard를 추적하는 시간은 낭비예요. Drift는 auth
다운스트림에 있지 auth 안에 있지 않아요. 실제 원인으로 가는 가장 빠른 길은
컬럼의 쓰기 사이트를 grep해서 경로별 동작을 비교하는 거예요.

## "By-design" 코멘트는 오해를 만들어요

쓰기 사이트 하나 옆에 붙은 `// STATELESS — 컬럼 사용 안 됨` 코멘트는
서브시스템 전체가 합의한 것처럼 보이게 해요. 실제로 그렇게 동작하는 건 그
코멘트가 붙어 있는 helper 하나뿐이에요. 국소적인 코멘트는 그 주변 코드에
대한 증거로만 받아들이고, 서브시스템 전체의 계약으로 읽지 마세요.

## 구체적 함정: helper가 옛 값을 보존해요

이 모양을 만드는 건 access token 인자를 받지 않고, 방금 로드한 row의
`user.accessToken`을 읽는 refresh-token helper예요 — 쓰는 경로를 한 번도
거치지 않은 사용자에게는 그 값이 NULL이죠. 호출자가 새로 발급한 JWT는
helper가 보지 못하니까 끝내 persist되지 않아요. 미묘한 지점은, 버그가 어느
한 줄에 있는 게 아니라 helper의 signature(토큰 파라미터 없음)와 값의 출처
선택(새 JWT 대신 DB 컬럼)에 있다는 거예요.

## 실제 예시

Mechanism이 보이는 가장 작은 형태로 줄인 asymmetry예요. 로그인 경로 두
개와, 둘이 공유하는 helper 하나예요:

```ts
// 발급한 토큰을 persist하는 경로
async function loginFromMobile(user: User) {
  const accessToken = issueAccessToken(user); // 새 JWT
  const refreshToken = user.refreshToken ?? randomUUID();
  await users.updateTokens(user.id, accessToken, refreshToken); // ← 컬럼 씀
  return { accessToken, refreshToken };
}

// persist하지 않는 경로
async function loginFromWeb(user: User) {
  const accessToken = issueAccessToken(user); // 새 JWT — 반환만 되고 저장은 안 됨
  const refreshToken = await rotateRefreshToken(user.id);
  return { accessToken, refreshToken };
}

// 두 경로가 믿고 쓰는 helper
async function rotateRefreshToken(userId: string) {
  const user = await users.findById(userId);
  const refreshToken = randomUUID();
  // 쓸 access token이 없으니 row에 이미 있던 값을 다시 써요 —
  // 웹으로만 로그인하는 사용자에겐 NULL이죠.
  await users.updateTokens(userId, user.accessToken, refreshToken);
  return refreshToken;
}
```

둘 다 로그인돼 있어요. 둘 다 protected endpoint를 호출할 수 있어요. 그런데
`users.access_token`이 non-NULL인 쪽은 하나뿐이에요.

수정은 기계적이에요 — 웹 경로가 방금 발급한 토큰을 모바일 경로와 똑같이
쓰면 돼요:

```ts
async function loginFromWeb(user: User) {
  const accessToken = issueAccessToken(user);
  const refreshToken = user.refreshToken ?? randomUUID();
  await users.updateTokens(user.id, accessToken, refreshToken); // ← 컬럼 씀
  return { accessToken, refreshToken };
}
```

그다음 단계는 — ADR이 명시해야 하는 부분인데 — 두 경로가 일치한 뒤에도 이
컬럼이 존재할 이유가 있는지 정하는 거예요.

## 핵심 포인트

- Stateless auth는 DB 토큰 컬럼을 **auth에는 죽은 값**으로 만들지만,
  ops/BI/audit에는 꼭 그렇지 않아요.
- 모든 쓰기 사이트가 합의하기 전까지 그 서브시스템은 "stateless"가
  아니에요. 하나만 남아 있어도 경로에 따라 갈리는 drift가 생겨요.
- 사용자 동작 테스트에는 버그가 보이지 않아요 — auth는 여전히 작동하니까요.
  컬럼 계약을 명시적으로 assert해야 CI가 잡아요.
- "Backward compatibility"는 수정 방향이 아니에요 — 미루기예요. 쓰기를
  없앨지 일관되게 쓸지 골라서 ADR에 남겨요.

## 언제 사용할까

- 부분적으로만 마이그레이션된 auth 서브시스템을 감사할 때.
- Stateless JWT 검증을 추가하면서 legacy DB 컬럼을 "compat용"으로 남길 때.
- 어떤 경로는 토큰을 persist하고 어떤 경로는 안 하는 auth 코드베이스에
  onboarding할 때.
- 사용자는 로그인돼 있는데 토큰 컬럼이 NULL로 보이는 ops 대시보드를 조사할
  때.

## 언제 사용하지 말까

- 완전한 greenfield stateless auth (DB 컬럼 자체가 없으니 drift도 없어요).
- 완전한 stateful auth (DB 컬럼이 load-bearing이라, drift가 대시보드가
  아니라 로그인을 깨요).

## 정리

Auth 경로에서 잘 도는 마이그레이션이 auth 다운스트림의 데이터 계약을 깰 수
있어요. 해결책은 더 영리한 코드가 아니라, 이 컬럼에 존재할 이유가 있는지에
대한 의도적이고 문서화된 결정이에요. 그 결정을 컬럼을 건드리는 모든 경로에
일관되게 적용하고, 메모를 못 받은 새 경로가 생기는 날 실패하는 테스트로 못
박아 두는 거죠.

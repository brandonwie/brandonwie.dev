---
title: Claude Code 멀티 프로필 HUD 설정
description: >-
  Claude Code를 여러 계정(개인 + 업무)으로 운영할 때 HUD 플러그인이 올바른
  계정별 사용량 통계를 표시하도록 설정하는 방법
date: 2026-02-04T00:00:00.000Z
updated: 2026-03-09T00:00:00.000Z
tags:
  - general
  - claude-code
  - hud
  - multi-account
  - devtools
category: general
draft: false
lang: ko
source_lang: en
source_slug: claude-code-multi-profile-hud
source_updated: "2026-03-09"
translation_date: "2026-03-10"
references:
  - url: "https://github.com/anthropics/claude-code"
    title: Claude Code GitHub repository
    type: official
  - url: "https://docs.anthropic.com/en/docs/claude-code"
    title: Claude Code documentation
    type: official
  - url: "https://github.com/jarrodwatts/claude-hud"
    title: Claude HUD plugin repository
    type: official
---

업무 프로필의 HUD가 개인 계정의 사용량 통계를 보여주고 있었어요. 일주일 동안
잘못된 숫자를 추적하다가 데이터가 교차되고 있다는 걸 깨달았죠. 수정에 몇 시간의
디버깅이 걸렸는데, 실패 모드가 완전히 조용했기 때문이에요 -- 에러도 없고,
그냥 잘못된 숫자만 보여줬어요.

Claude Code를 개인 계정과 업무 계정으로 분리해서 운영한다면, HUD 플러그인이
각 프로필에 맞는 통계를 보여주도록 명시적인 설정이 필요해요.

## 왜 중요한가

Claude Code는 `CLAUDE_CONFIG_DIR` 환경 변수를 통해 멀티 프로필을 지원해요.
개인용 `~/.claude`와 업무용 `~/.claude-work`를 가질 수 있어요. 각 프로필은
자체 OAuth 토큰, 설정, 플러그인을 갖죠.

문제는 Claude Code가 `CLAUDE_CONFIG_DIR`을 statusline 서브프로세스에 전달하지
않는다는 거예요. HUD 플러그인은 서브프로세스로 실행되기 때문에, 항상 기본
경로(`~/.claude`)로 폴백해요. 업무 프로필이 개인 계정 사용량을 보여주게 되는
거죠. 개인 프로필은 기본값이라 잘 동작해요.

명확한 의미에서 버그는 아니에요. HUD가 데이터를 보여주긴 해요. 단지 잘못된
데이터를 보여줄 뿐이에요. 크래시보다 발견하기 어렵게 만드는 부분이에요.

## 겪었던 어려움

**환경 변수가 서브프로세스에 전달되지 않았어요.** `CLAUDE_CONFIG_DIR`이
statusline 래퍼 스크립트까지 전파될 거라 가정했는데, Claude Code가 이를
제거해요. 래퍼가 잘못된 config 경로를 받는 것을 광범위한 디버깅 끝에야
발견했어요.

**Keychain 항목이 처음 볼 때 동일해 보였어요.** 두 프로필 모두 비슷한 서비스
이름으로 keychain 항목을 생성해요. 이들을 구분하는 접미사 해시가 명확하지
않아서, 어떤 항목이 어떤 프로필에 속하는지 혼란이 생겼어요.

**중복 keychain 항목이 예측 불가능한 읽기를 유발했어요.** macOS의
`security find-generic-password`는 첫 번째 매칭을 반환해요. 중복이 있으면
에러 없이 조용히 잘못된 자격 증명을 반환해요.

**HUD 바이너리가 프로필별로 독립적이에요.** 처음에는 symlink가 될 거라
가정했는데, 각 프로필의 플러그인 바이너리를 독립적으로 패치해야 해요.
symlink를 쓰면 두 프로필이 같은 바이너리를 공유해서 목적이 무산돼요.

**토큰 동기화는 잘못된 방향이었어요.** keychain 항목 간에 토큰을 동기화하려
시도했는데, 유효한 토큰을 오래된 것으로 덮어써 버렸어요. Claude가 프로필별로
토큰을 네이티브하게 관리해요. 수동 개입은 상황을 나쁘게 만들어요.

**두 토큰이 동시에 조용히 만료될 수 있어요.** 프로필별 keychain 항목은 세션이
정상 종료될 때(`_claude_sync_token` 훅을 통해)만 갱신돼요. 터미널 강제 종료나
크래시로 비정상 종료되면 프로필 항목은 오래된 상태로 남고, 기본 항목만 최신
상태를 유지해요. 기본 항목마저 만료되면 두 fallback 경로가 동시에 실패하고
사용량이 아무것도 표시되지 않아요. 에러도 없고, 그냥 null 데이터만 나와요.

**실패 캐시가 진짜 원인을 가려요.** `usage-api.ts`가 API 실패를 15초간
캐싱해요(`CACHE_FAILURE_TTL_MS`). 캐시 파일을 읽으면 `apiUnavailable: true`가
보이는데, API 장애처럼 보여요. 실제 원인은 만료된 자격 증명 때문에 API 호출
자체가 안 된 거예요. 이 오인 때문에 디버깅 시간이 상당히 늘어났어요.

**소스 TypeScript가 컴파일된 dist JavaScript보다 뒤처져 있어요.** HUD 플러그인에
코드 경로가 두 개 있어요 -- `src/`(TypeScript, bun으로 실행)와 `dist/`(컴파일된
JS). 플러그인 업데이트가 dist는 설치하지만 source는 갱신하지 않아요. `quotaBar`,
`showSpeed`, `contextValue`, `usageBarEnabled`, `sevenDayThreshold` 같은 기능이
dist에만 있고 source에는 하드코딩된 값과 누락된 함수가 남아있었어요. 래퍼가
`bun src/index.ts`를 실행하므로 패치는 반드시 `src/` 파일을 대상으로 해야 해요.

**파이프된 서브프로세스에는 터미널 너비가 없어요.** `|` 경계에서 자동 줄바꿈을
시도했지만, `process.stderr.columns`, `process.stdout.columns`, `$COLUMNS` 모두
파이프된 statusline 서브프로세스에서 undefined나 0을 반환해요. Claude Code의
statusline 렌더러가 최종 줄 자르기를 제어해서, HUD 쪽에서는 감지하거나 우회할
방법이 없어요.

**sed `r`이 주소 범위에서 매 줄마다 삽입해요.**
`sed "/start/,/end/r file"`을 쓰면 범위의 마지막 줄에만 삽입하는 게 아니라 범위
내 모든 줄 뒤에 파일을 삽입해요. 함수 본문 뒤에 정확히 삽입하려면, 대상 아래의
고유한 앵커 줄에 awk insert-before를 사용하는 게 대안이에요.

**lock 메커니즘 없이 429 race condition이 발생했어요.** 가장 골치 아팠던
버그예요. 프로필당 하나의 캐시 파일을 공유하는 3개 이상의 CLI 세션이 있을 때,
모든 세션이 60초 캐시를 동시에 만료시키고 병렬로 API 요청을 쐈어요. Anthropic
usage API(rate-limited)가 전부에 429를 반환했어요. rate-limit에 걸리면 3분짜리
실패 캐시가 시작됐는데, 이게 재시도 루프를 만들었어요: 캐시된 실패가 만료되면
모든 세션이 재시도하고, 또 429, 절대 복구 안 됨. 긴급 수정으로 실패 TTL을
5분으로 올렸지만, 진짜 해결책은 업스트림 저장소에서 왔어요: `O_EXCL` 원자적
생성을 사용한 파일 기반 lock으로 하나의 프로세스만 fetch하고 나머지는 새 캐시를
기다리는 방식이에요.

**`getOutputSpeed` 반환 타입 불일치.** speed-tracker가 `number | null`을 직접
반환하는데, `{ speed, outputTokens }`를 반환한다고 가정하고 코드를 작성했어요.
간헐적으로 `undefined is not an object` TypeError가 발생했는데, speed가
non-null일 때만 트리거돼서(2초 측정 윈도우 때문에 드묾) 발견이 어려웠어요.

## 해결책

각 프로필의 `settings.json` statusline 명령에 `CLAUDE_CONFIG_DIR`을 직접
포함시키세요. 이렇게 하면 환경 변수 전달 문제를 완전히 우회해요.

```json
// 개인 -- 기본값 ~/.claude, 오버라이드 불필요
"command": "/path/to/statusline-wrapper.sh"

// 업무 -- CLAUDE_CONFIG_DIR을 명시적으로 설정해야 함
"command": "CLAUDE_CONFIG_DIR=/path/to/.claude-work /path/to/statusline-wrapper.sh"
```

개인 프로필은 `~/.claude`가 기본값이므로 오버라이드가 필요 없어요. 업무
프로필은 래퍼 스크립트가 어떤 config 디렉토리(따라서 어떤 keychain 항목)를
읽어야 하는지 알도록 `CLAUDE_CONFIG_DIR`을 인라인으로 설정해야 해요.

## 프로필 아키텍처

```text
~/.claude/              (개인, 기본값)
  plugins/cache/claude-hud/   (독립 바이너리, 패치됨)
  settings.json               (statusline -> 래퍼)

~/.claude-work/         (업무)
  plugins/cache/claude-hud/   (독립 바이너리, 패치됨)
  settings.json               (statusline -> CLAUDE_CONFIG_DIR=... 래퍼)
```

각 프로필은 자체 독립 HUD 바이너리를 가져요. symlink되지 않으며 각각 별도로
패치해야 해요. 바이너리가 환경 변수를 읽어서 어떤 keychain 항목과 캐시 경로를
사용할지 결정해요.

## 필요한 패치

HUD 소스(`usage-api.ts`)에 환경 변수를 읽기 위한 패치가 필요해요:

| 패치                                   | 용도                                         |
| -------------------------------------- | -------------------------------------------- |
| `CLAUDE_HUD_KEYCHAIN_SERVICE`          | 프로필별 keychain 항목에서 읽기              |
| `CLAUDE_HUD_CONFIG_DIR` (homeDir)      | 캐시용 커스텀 기본 디렉토리                  |
| `CLAUDE_HUD_CONFIG_DIR` (getPluginDir) | 올바른 캐시, lock, backoff 경로              |
| `CLAUDE_HUD_SKIP_KEYCHAIN`             | 환경 변수 전용 인증을 위해 keychain 건너뛰기 |
| FetchResult discriminated union        | 에러 타입 전파 (429, timeout 등)             |
| File-based lock (업스트림에서 포팅)    | 여러 세션이 캐시를 공유할 때 race 방지       |

각 패치는 환경 변수를 확인하고 설정되지 않으면 기본값으로 폴백해요.
개인 프로필은 환경 변수 없이도 동작하고, 업무 프로필은 statusline 명령에
환경 변수가 설정되면 동작해요.

## 캐시 Lock 메커니즘

429 race condition을 해결하려면 동시 API 호출을 방지하는 lock 메커니즘이
필요했어요. 업스트림 저장소의 해결책은 `O_EXCL` 원자적 파일 생성을 사용하는
`tryAcquireCacheLock`이에요 -- 운영체제가 하나의 프로세스만 lock 파일을 성공적으로
생성하도록 보장해요.

흐름은 이래요: 캐시가 만료되면 첫 번째 프로세스가 lock을 획득하고 새 데이터를
fetch해요. 다른 프로세스는 lock을 보고 `busy`를 반환하며, 50ms마다(최대 2초)
새 캐시가 나타나는지 폴링해요. 크래시된 프로세스로 인한 데드락을 방지하기 위해
30초 이상 된 오래된 lock은 자동 정리돼요.

이 방식 덕에 업스트림 TTL이 안전해져요: 성공 응답은 60초, 실패는 15초. lock
없이는 캐시 만료 때마다 여러 프로세스가 API 호출을 쐈어요. lock이 있으면
만료 사이클당 정확히 하나의 프로세스만 fetch해요. 중요한 디테일: `clearCache()`가
`.usage-cache.lock`도 삭제해야 해요 -- 그렇지 않으면 참조가 끊긴 lock 파일이 모든
프로세스의 fetch를 차단해요.

## Midnight Aurora 테마

HUD는 커스텀 컬러 테마를 지원해요. Midnight Aurora는 ANSI 256-color 코드
(`\x1b[38;5;{N}m`)를 사용하는 9개 시맨틱 컬러 역할을 사용해요:

| 역할        | 코드 | 색상 이름     | 용도                |
| ----------- | ---- | ------------- | ------------------- |
| NEON_VIOLET | 135  | 비비드 퍼플   | 히어로 요소, 인용문 |
| VIOLET      | 141  | 소프트 퍼플   | 주요 텍스트 색상    |
| SOFT_CYAN   | 117  | 라이트 시안   | 기본 정보 표시      |
| WARM_AMBER  | 215  | 골드          | 악센트 하이라이트   |
| SOFT_ROSE   | 211  | 핑크          | 보조 강조           |
| MINT        | 85   | 그린          | 성공 표시           |
| PEACH       | 216  | 라이트 오렌지 | 경고                |
| CORAL       | 203  | 레드 오렌지   | 위험/에러           |
| LAVENDER    | 103  | 뮤트 퍼플     | 비활성 텍스트       |
| GRAY        | 245  | 뉴트럴        | 비활성 요소         |

컬러 함수는 리터럴 색상 이름 대신 시맨틱 이름을 사용해요(예: `green()`이
success에 매핑). 전체 팔레트를 바꾸려면 `colors.ts`만 편집하면 돼요. 인용문
줄은 `BOLD + neonViolet()`(코드 135, 비비드)로 렌더링돼요 -- 일반
`violet()`(코드 141, 소프트)와 분리해서 시각적 위계를 만들어요.

## HUD 설정

HUD 플러그인에는 알아두면 좋은 설정 옵션이 여러 가지 있어요.

**레이아웃 모드.** `"compact"`(한 줄, 좁은 터미널에서 잘림)와 `"expanded"`(여러
줄로 identity, project, environment, usage를 각각 표시) 두 가지예요.
정보 손실을 피하려면 `"expanded"`를 사용하세요.

**패치 내구성.** 플러그인 업데이트가 소스 파일을 덮어써요.
`apply-patches.sh` 스크립트를 유지해서 업데이트 후 패치를 재적용하세요 --
2026년 3월 기준으로 14개 그룹에 걸쳐 22개 패치가 있어요.

**7일 사용량 윈도우 항상 표시.** config에서 `sevenDayThreshold: 0`으로 설정하세요.
기본값(`80`)은 사용량이 80%를 넘어야만 7일 윈도우를 보여줘요.

**출력 토큰 속도.** `showSpeed`를 활성화하면 `speed-tracker.ts` 모듈을 통해
출력 토큰 속도(tok/s)를 표시해요.

**컨텍스트 표시 모드.** `contextValue` 옵션으로 compact와 expanded 레이아웃
모두에서 `'percent'`와 `'tokens'` 간 컨텍스트 표시를 전환할 수 있어요.

**expanded 레이아웃 순서.** `render/index.ts` 템플릿에서 커스터마이징 가능해요
-- project(모델 배지 포함) → 통합 context+usage → activity → environment 순이에요.

**속도 트래커 반환 타입.** `getOutputSpeed()`는 객체가 아니라 `number | null`을
직접 반환해요. 커스텀 렌더러에 속도를 통합할 때 반환 타입을 주의해서
확인하세요.

## 토큰 관리

Claude Code는 프로필별로 OAuth 토큰을 네이티브하게 관리해요:

- 로그인 시 프로필별 keychain 항목을 자동 생성
- 만료 전 토큰을 자동 갱신
- 수동 동기화 불필요

keychain 항목 간 토큰 동기화는 적극적으로 해로워요. 다른 프로필의 오래된
토큰으로 유효한 토큰을 덮어써서 인증 실패를 유발해요.

**`/login`이 필요한 경우:** refresh 토큰이 폐기된 후, 새 머신 설정, 수동
keychain 삭제 후, 또는 프로필별 토큰과 기본 토큰이 동시에 만료됐을 때예요.
동시 만료는 캐시 파일의 `apiUnavailable: true`와 keychain 항목의 만료된
`expiresAt` 타임스탬프를 함께 확인해서 진단할 수 있어요.

## 흔한 실수

제가 저질렀던(그리고 여러분은 피해야 할) 실수들이에요:

1. **keychain 항목 간 토큰을 동기화하지 마세요.** Claude가 프로필별로
   네이티브하게 관리해요. 수동 동기화는 상황을 망가뜨려요.
2. **환경 변수가 전달된다고 가정하지 마세요.** statusline 명령에
   `CLAUDE_CONFIG_DIR`을 포함시키세요.
3. **두 프로필 모두 패치하세요.** HUD 바이너리는 프로필별로 독립적이에요.
   하나를 패치해도 다른 하나는 패치되지 않아요.
4. **`.zshrc` 변경 후 셸을 리로드하세요.** 이전 함수가 메모리에 남아있어요.
   새 설정은 새 터미널을 열어야 적용돼요.
5. **중복 keychain 항목을 확인하세요.** 중복은 예측 불가능한 읽기를 유발해요.
   `security find-generic-password -a`로 항목을 나열하고 중복을 삭제하세요.

## 왜 이 방식이 효과적인가

인라인 환경 변수 접근이 전달 문제를 완전히 우회하기 때문에 동작해요.
Claude Code가 서브프로세스에 환경 변수를 전달하는 것(하지 않는)에 의존하는
대신, 명령 문자열 자체에 올바른 값을 심어놓는 거예요.

HUD 바이너리가 자신의 환경에서 `CLAUDE_CONFIG_DIR`을 읽고, 올바른 keychain
항목과 캐시 경로를 해결하고, 올바른 사용량 통계를 표시해요. 파일 기반 lock이
동시 세션의 API 스탬피드를 방지해요. 각 프로필이 완전히 독립적이에요.

## 실전 팁

**이 설정을 사용하면 좋은 경우:** Claude Code를 개인과 업무 Anthropic 계정으로
분리 운영하면서 터미널 statusline에서 정확한 계정별 사용량 추적이 필요할 때.

**넘어가도 되는 경우:** 단일 계정 설정(프로필 분리 불필요), 웹 UI만 사용하는
경우(HUD는 터미널 기능), HUD 플러그인을 아예 사용하지 않는 경우예요.
기본적인 멀티 프로필 설정(`CLAUDE_CONFIG_DIR`)은 HUD 패치 없이도 동작해요 --
패치는 정확한 statusline 통계를 위해서만 필요해요.

핵심 인사이트: Claude Code의 서브프로세스 환경은 예상과 다를 수 있어요. 확실하지
않을 때는, 환경 변수 상속에 의존하기보다 명령 문자열에 직접 값을 포함시키세요.

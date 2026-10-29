---
title: Claude Code 멀티 프로필 HUD 설정
description: >-
  Claude Code를 여러 계정(개인 + 업무)으로 운영할 때 HUD 플러그인이 올바른
  계정별 사용량 통계를 표시하도록 설정하는 방법
date: 2026-02-04T00:00:00.000Z
updated: '2026-10-29'
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
source_updated: '2026-10-29'
translation_date: '2026-10-29'
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

업무 프로필의 HUD가 개인 계정의 사용량 통계를 보여주고 있었어요. 실패는 아주
조용했어요. 에러 하나 없이 다른 계정의 숫자만 보여줬죠. 원인을 찾기까지
statusline wrapper를 꽤 오래 디버깅해야 했어요.

Claude Code를 개인 계정과 업무 계정으로 분리해서 운영한다면, HUD 플러그인이
각 프로필에 맞는 통계를 보여주도록 명시적인 설정이 필요해요.

> **업데이트 (2026-10-29).** 아래 패치 내용의 상당 부분은 claude-hud v0.0.x
> 시절 이야기예요. 그때는 플러그인 버전 하나를 고정(pin)해 두고 소스를 많이
> 패치했어요. 2026년 9월에 이 버전 고정을 폐기했어요. 고정해 둔 캐시 디렉토리가
> 두 번이나 삭제됐고, 그때마다 HUD가 아무 에러 없이 조용히 망가졌거든요. 지금은
> 커스터마이징 대부분을 플러그인의 `config.json`에 두고, 작은 소스 패치는 다섯
> 개만 남아 있어요. 현재 claude-hud는 Claude Code가 stdin으로 보내는
> `rate_limits` 데이터에서 사용량을 읽어요. 저는 이제 프로필도 하나만 써요. 다만
> 프로필을 둘 이상 쓰는 분께는 `CLAUDE_CONFIG_DIR` 전달 문제가 여전히 유효해요.
> 자세한 내용은 [지금 쓰는 구성](#지금-쓰는-구성)을 참고하세요.

## 왜 중요한가

Claude Code는 `CLAUDE_CONFIG_DIR` 환경 변수로 멀티 프로필을 지원해요.
개인용 `~/.claude`와 업무용 `~/.claude-work`를 가질 수 있어요. 각 프로필은
자체 OAuth 토큰, 설정, 플러그인을 갖죠.

문제는 Claude Code가 `CLAUDE_CONFIG_DIR`을 statusline 서브프로세스에 전달하지
않는다는 거예요. HUD 플러그인은 서브프로세스로 실행되기 때문에, 항상 기본
경로(`~/.claude`)로 폴백해요. 업무 프로필이 개인 계정 사용량을 보여주게 되는
거죠. 개인 프로필은 기본값이라 잘 동작해요.

명확한 의미에서 버그는 아니에요. HUD가 데이터를 보여주긴 해요. 단지 잘못된
데이터를 보여줄 뿐이에요. 크래시보다 발견하기 어렵게 만드는 부분이에요.

## 겪었던 어려움

모두 패치를 많이 하던 v0.0.x 시절에 겪은 문제예요. 그중 keychain 읽기, usage
캐시, lock, `usage-api.ts` 관련 내용은 현재 claude-hud에는 해당하지 않아요.
지금은 usage API를 직접 호출하지 않고 Claude Code의 stdin에서 사용량을 받거든요.

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

**lock 메커니즘 없이 429 race condition이 발생했어요.** 가장 골치 아팠던
버그예요. 프로필당 하나의 캐시 파일을 공유하는 3개 이상의 CLI 세션이 있을 때,
모든 세션이 60초 캐시를 동시에 만료시키고 병렬로 API 요청을 쐈어요. Anthropic
usage API(rate-limited)가 전부에 429를 반환했어요. rate-limit에 걸리면 3분짜리
실패 캐시가 시작됐는데, 이게 재시도 루프를 만들었어요: 캐시된 실패가 만료되면
모든 세션이 재시도하고, 또 429, 절대 복구 안 됨. 긴급 수정으로 실패 TTL을
5분으로 올렸지만, 진짜 해결책은 업스트림 저장소에서 왔어요: `O_EXCL` 원자적
생성을 사용한 파일 기반 lock으로 하나의 프로세스만 fetch하고 나머지는 새 캐시를
기다리는 방식이에요.

**sed `r`이 주소 범위에서 매 줄마다 삽입해요.**
`sed "/start/,/end/r file"`을 쓰면 범위의 마지막 줄에만 삽입하는 게 아니라 범위
내 모든 줄 뒤에 파일을 삽입해요. 함수 본문 뒤에 정확히 삽입하려면, 대상 아래의
고유한 앵커 줄에 awk insert-before를 사용하는 게 대안이에요.

**`getOutputSpeed` 반환 타입 불일치.** speed-tracker가 `number | null`을 직접
반환하는데, `{ speed, outputTokens }`를 반환한다고 가정하고 코드를 작성했어요.
간헐적으로 `undefined is not an object` TypeError가 발생했는데, speed가
non-null일 때만 트리거돼서(2초 측정 윈도우 때문에 드묾) 발견이 어려웠어요.

**프로필 이름 변경 후 marketplace 경로가 오래된 채로 남아요.** `~/.claude/plugins/known_marketplaces.json`이 marketplace clone의 절대 경로를 저장해요. `~/.claude-personal/`을 `~/.claude/`로 이름을 변경한 뒤에도 이전 경로가 그대로 남아서 `claude plugin install`이 "Source path does not exist"로 실패했어요 -- marketplace 파일을 가리키는 명확한 에러 메시지가 없었죠.

**Statusline 높이는 Claude Code가 고정해요.** HUD 플러그인이 `console.log()`로 줄을 출력하지만, Claude Code가 statusline에 할당하는 세로 영역을 제어해요. 더 많은 공간을 요청하는 API는 없어요. render 출력의 줄 순서가 곧 열화 순서를 결정해요: 첫 번째 줄이 살아남고, 마지막 줄이 잘려요.

**플러그인 업그레이드 후 오래된 usage 캐시가 남아요.** 플러그인 업그레이드 중에 이전(패치 안 된) HUD 바이너리가 실행되면서 캐시에 잘못된 프로필 데이터를 채우는 구간이 있어요. 패치 적용 후에도 패치된 HUD가 이 오래된 캐시를 무기한(60초 TTL이 읽을 때마다 갱신됨) 제공해요. 해결 방법은 패치 적용 스크립트가 두 프로필의 usage 캐시를 삭제하는 거예요.

**API 실패가 정상 캐시를 에러로 덮어써요.** usage API가 423(Locked)이나 non-200 상태를 반환하면, 원래 코드는 유효한 사용량 데이터가 들어있던 오래된 캐시 항목을 `{apiUnavailable: true}`로 덮어써요. 오래된 데이터가 불과 몇 초 전 것이어도 15초간 `Usage ⚠ (423)`이 깜빡이게 돼요. 해결 방법은 stale-while-revalidate 패턴이에요: 덮어쓰기 전에 오래된 캐시가 존재하고 실패 상태가 아닌지 확인해요.

**0-byte lock 파일이 영구적 "busy" 상태를 만들어요.** HUD 프로세스가
`fs.openSync(lockPath, 'wx')`와 `fs.writeFileSync(fd, timestamp)` 사이에서
크래시하면, lock 파일은 생성되지만 내용이 비어있어요(0 byte).
`readLockTimestamp()`가 빈 파일이면 `null`을 반환하는데, 오래된 lock 정리
로직이 `if (lockTimestamp != null && ...)`으로 체크해서 `null`인 경우를 절대
정리하지 않아요. lock이 영구적으로 "busy" 상태로 남고, HUD가 오래된 캐시
데이터를 계속 반환해요. 업스트림에 수정 PR(#203)을 보냈는데,
`lockTimestamp === null` 가드를 추가해서 `statSync().mtimeMs`로 크래시
잔여물(오래된 mtime -- 삭제)과 활성 writer(최근 mtime -- busy 반환)를 구분하는
방식이에요.

**Stale-while-revalidate에서 TTL 갱신 없이 429 재시도 폭풍이 발생해요.**
stale 캐시 fallback(Patch 9)이 API 실패 시 정상 데이터를 반환하지만, 원래는
캐시 타임스탬프를 갱신하지 않았어요. 매 render 사이클(1-2초)마다 만료된 캐시를
보고, API를 재시도하고, 429를 받고, stale을 반환하는 과정을 반복했어요. tmux
세션이 하나뿐이어도 API를 계속 두들기고 있었죠.
해결 방법은 `writeCache(homeDir, cacheState.data, now)`를 호출해서 stale
데이터에 새 60초 TTL을 주는 거예요. 재시도가 매 render가 아니라 분당 한 번으로
제한돼요.

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
├── plugins/cache/claude-hud/   (독립 바이너리, 패치됨)
└── settings.json               (statusline → 래퍼)

~/.claude-work/         (업무)
├── plugins/cache/claude-hud/   (독립 바이너리, 패치됨)
└── settings.json               (statusline → CLAUDE_CONFIG_DIR=... 래퍼)
```

처음에 만든 구조가 이랬어요. 프로필마다 HUD가 따로 설치돼 있었고, 각각 따로
패치해야 했어요. 이 구조는 오래가지 않았어요. 2026년 9월에는 업무 프로필의
`plugins/` 디렉토리가 개인 프로필 쪽을 가리키는 symlink였어요. 그래서 두 프로필이
플러그인 캐시와 HUD config를 하나씩 공유했어요. 이후에는 업무 프로필 자체를
폐기했어요.

## 지금 쓰는 구성

statusline 래퍼와 패치 스크립트가 지금 하는 일은 이래요:

- **버전 고정 없음.** 래퍼는
  `~/.claude/plugins/cache/claude-hud/claude-hud/` 아래에서 orphan 표시가 없는
  가장 최신 캐시 디렉토리를 골라요. 플러그인 매니저가 교체된 버전마다 orphan
  표시를 남기기 때문에, 이 디렉토리가 곧 설치된 버전이에요. 업스트림의 문제
  릴리스를 bisect로 원인을 좁힐 때만 `CLAUDE_HUD_VERSION` 변수로 버전을 고정할
  수 있어요.
  고정한 디렉토리가 없으면 다른 버전으로 넘어가지 않고 바로 실패해요.
- **config는 일반 파일로.** claude-hud는 config를 `O_NOFOLLOW`로 열어요.
  symlink로 연결한 `config.json`은 `ELOOP`로 실패하고, HUD는 조용히 기본값으로
  돌아가요. 그래서 config는 복사본으로 배포해요.
- **config 먼저, 패치는 마지막.** config 키가 있는 커스터마이징은
  `config.json`에 넣어요. config가 무엇을 지원하는지는 설치된 `src/config.ts`가
  기준이에요. 소스 패치는 어떤 키로도 안 되는 변경에만 써요.
- **스스로 복구하는 패치 가드.** 래퍼는 렌더링할 때마다 패치한 파일 세 개에
  서명(mtime과 크기)을 남겨요. 플러그인 업데이트가 그중 하나를 덮어쓰면 서명이
  바뀌고, 래퍼가 백그라운드에서 패치 스크립트를 다시 실행해요. 그래서 다음
  렌더링부터는 다시 패치된 상태가 돼요.

패치 스크립트는 래퍼와 같은 캐시 디렉토리를 찾아서 작은 패치 다섯 개를 적용해요.
각 패치는 정확한 표현식 하나에 앵커를 두고, 앵커가 사라지면 바로 실패해요:

| #   | 대상 파일         | 용도                                     |
| --- | ----------------- | ---------------------------------------- |
| 1   | `i18n/en.ts`      | Context 라벨을 `Ctx:`로 축약             |
| 2   | `i18n/en.ts`      | 사용량 윈도우 라벨을 `5h:` / `7d:`로 축약 |
| 3   | `render/usage.ts` | 사용량 윈도우마다 pace 표시              |
| 4   | `render/parts.ts` | 짧은 effort를 쓰는 `Opus5\|h` 배지       |
| 5   | `render/parts.ts` | 패키지 버전 텍스트에 보라색 네온 색상    |

이 다섯 가지는 지금 config로 표현할 수 없어요. 업스트림에는 언어 전체를 바꾸는
스위치만 있고 라벨별 오버라이드는 없어요. 업스트림의 pace 옵션은 윈도우 색만
바꿔요. 패치 개수는 그동안 많이 바뀌었어요. v0.0.6에서 30개, v0.0.9에서 9개,
고정했던 v0.0.12에서 13개였고, 버전 고정을 폐기한 직후 잠깐 1개였어요. 2026년
9월에 작은 패치를 다시 허용하면서 4개가 됐고, 지금은 5개예요.

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
만료 사이클당 정확히 하나의 프로세스만 fetch해요. 중요한 디테일 두 가지가
있어요: `clearCache()`가 `.usage-cache.lock`도 삭제해야 해요 -- 그렇지 않으면
참조가 끊긴 lock 파일이 모든 프로세스의 fetch를 차단해요. 그리고 0-byte lock
edge case를 주의하세요: 프로세스가 lock 파일 생성과 타임스탬프 쓰기 사이에서
크래시하면, 파일은 존재하지만 내용이 비어있어요. 오래된 lock 정리 로직이
non-null 타임스탬프만 체크하기 때문에 이 경우를 건너뛰어요. 업스트림
수정(PR #203)에서 `lockTimestamp === null` 가드를 추가했어요.
`statSync().mtimeMs`로 fallback해서 파일의 mtime이 오래됐으면 크래시
잔여물로 보고 삭제하고, 최근이면 활성 writer가 아직 진행 중일 수 있으니 busy를
반환해요.

## Midnight Aurora 테마

이 테마는 v0.0.x 시절 `colors.ts`를 통째로 복사하는 패치였고, 그 패치는
폐기했어요. 현재 claude-hud는 `config.json`의 `colors` 객체에서 역할별
truecolor hex 값(`context`, `usage`, `warning`, `critical`, `model`, `project`
등)을 받아요. 그래서 팔레트에는 이제 소스 패치가 필요 없어요. 원래 테마는 ANSI
256-color 코드(`\x1b[38;5;{N}m`)를 쓰는 9개 시맨틱 컬러 역할을 사용했어요:

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

**패치 내구성.** 플러그인 업데이트가 소스 파일을 덮어써요. 그래서
`claude-hud-post-patches.sh`가 업데이트 후 패치를 다시 적용해요. 지금은 패치가
5개이고, 업데이트가 패치한 파일을 덮어쓰면 래퍼의 패치 가드가 스크립트를
자동으로 다시 실행해요.

**7일 사용량 윈도우 항상 표시.** config에서 `sevenDayThreshold: 0`으로 설정하세요.
기본값(`80`)은 사용량이 80%를 넘어야만 7일 윈도우를 보여줘요.

**출력 토큰 속도.** `showSpeed`를 활성화하면 `speed-tracker.ts` 모듈이
출력 토큰 속도(tok/s)를 표시해요.

**컨텍스트 표시 모드.** `contextValue` 옵션으로 compact와 expanded 레이아웃
모두에서 `'percent'`와 `'tokens'` 간 컨텍스트 표시를 전환할 수 있어요.

**expanded 레이아웃 순서.** v0.0.x 시절에는 `render/index.ts` 템플릿 패치가
순서를 정하고 인용문을 마지막에 렌더링했어요. 그래서 좁은 터미널에서는 장식적인
인용문이 먼저 잘렸어요. 지금은 `config.json`의 `elementOrder`가 순서를 정하고,
인용문은 config의 `customLine`이 돼서 업스트림이 첫 번째 줄에 함께
렌더링해요. 템플릿 패치를 없애면서 이 변화는 받아들였어요.

**속도 트래커 반환 타입.** `getOutputSpeed()`는 객체가 아니라 `number | null`을
직접 반환해요. 커스텀 렌더러에 속도를 통합할 때 반환 타입을 주의해서
확인하세요.

**API 실패 시 stale-while-revalidate (v0.0.x).** usage API가 실패(423, timeout, 네트워크
에러)하면, HUD가 만료된 캐시에 유효한 데이터(`apiUnavailable`이 아닌)가 있는지
확인해요. 있으면 stale 데이터를 반환하면서 `writeCache`로 캐시 타임스탬프를
갱신해요. stale 데이터에 새 60초 TTL이 부여되기 때문에 재시도가 매 render
사이클이 아니라 분당 한 번으로 제한돼요. 타임스탬프 갱신이 없으면 1-2초마다
만료된 캐시를 보고, API를 재시도하고, 429를 받고, stale을 반환하는 연속 재시도
폭풍이 세션 하나에서도 발생해요. 이전에 정상 데이터가 전혀 없을 때만 실패
캐싱으로 넘어가요.

**재설치 워크플로우.** 상황이 꼬이면, 전체 재설치 순서는 이래요:
`claude plugin uninstall claude-hud@claude-hud` → `claude plugin install claude-hud@claude-hud`.
플러그인 설치가 소스를 깨끗한 업스트림으로 덮어써요. 다음 렌더링에서 패치 가드가
`claude-hud-post-patches.sh`를 다시 실행하고, 출력을 직접 보고 싶으면 손으로
실행해도 돼요. `known_marketplaces.json`이 marketplace clone의 절대 경로를
저장하므로, 프로필 디렉토리 이름 변경 후에는 이 파일도 갱신해야 해요.

## 토큰 관리

Claude Code는 프로필별로 OAuth 토큰을 네이티브하게 관리해요:

- 로그인 시 프로필별 keychain 항목을 자동 생성
- 만료 전 토큰을 자동 갱신
- 수동 동기화 불필요 -- 항목 간 동기화는 해로워요

**`/login`이 필요한 경우:** refresh 토큰이 폐기된 후, 새 머신 설정, 수동
keychain 삭제 후, 또는 프로필별 토큰과 기본 토큰이 동시에 만료됐을 때예요.
동시 만료는 캐시 파일의 `apiUnavailable: true`와 keychain 항목의 만료된
`expiresAt` 타임스탬프를 함께 확인해서 진단할 수 있어요.

## 흔한 실수

제가 저질렀던, 그래서 피하면 좋을 실수들이에요:

1. **keychain 항목 간 토큰을 동기화하지 마세요.** Claude가 프로필별로
   네이티브하게 관리해요. 수동 동기화는 상황을 망가뜨려요.
2. **환경 변수가 전달된다고 가정하지 마세요.** statusline 명령에
   `CLAUDE_CONFIG_DIR`을 포함시키세요.
3. **config로 되는 건 패치하지 마세요.** 설치된 플러그인의 `src/config.ts`를
   먼저 확인하세요. 패치는 플러그인 업데이트 때마다 덮어써지지만, config 키는
   그대로 남아요.
4. **`.zshrc` 변경 후 셸을 리로드하세요.** 이전 함수가 메모리에 남아있어요.
   새 설정은 새 터미널을 열어야 적용돼요.
5. **중복 keychain 항목을 확인하세요.** 중복은 예측 불가능한 읽기를 유발해요.
   `security find-generic-password -a`로 항목을 나열하고 중복을 삭제하세요.
6. **HUD config를 symlink로 연결하지 마세요.** claude-hud는 config를
   `O_NOFOLLOW`로 열기 때문에, symlink로 두면 모든 설정이 조용히 기본값으로 돌아가요.
7. **0-byte lock 파일을 주의하세요 (v0.0.x).** HUD가 lock 생성 도중 크래시하면, 빈 lock
   파일이 모든 프로세스의 fetch를 차단해요. 사용량이 멈춰있으면
   `.usage-cache.lock` 파일이 0 byte인지 확인하고 수동으로 삭제하세요.
8. **디렉토리 이름 변경 후 `known_marketplaces.json`을 갱신하세요.** 이 파일이
   marketplace clone의 절대 경로를 저장해요. 프로필 디렉토리 이름을 바꾸면
   플러그인 설치 명령이 조용히 실패해요.
9. **합성된 statusline row는 명시적으로 구분하세요.** 2026년 6월에는
   `statusline-wrapper.sh`가 Token Optimizer 상태(`CtxQ`, `Eff`, 선택적
   duration)를 3B session-state row(`3B claude·<sid> · locks:N`) 앞에
   붙였어요. 그래서 Token Optimizer filter가 trailing newline을 반드시 출력해야
   했고, 그렇지 않으면 row가 `Eff:--3B claude...` 형태로 이어졌어요. 지금
   래퍼는 claude-hud row, 선택적인 Ponytail 배지 row, 마지막에 session row를
   출력하고, 각 row는 여전히 newline으로 끝나야 해요. 예전에는 `claude-hud-pin-guard.sh` 스크립트로 이 문제를
   검사했지만, 지금은 그 스크립트를 폐기했고 다시 되살릴 생각은 없어요.
   wrapper를 점검할 때 trailing newline 조건은 여전히 지켜야 하고,
   patch-marker check만으로는 row framing이 올바르다고 보장할 수 없어요.
10. **방어책으로 플러그인 버전을 고정하지 마세요.** 플러그인 reconcile이 고정한
    캐시 디렉토리를 지울 수 있어요. 제 경우 두 번 지워졌고, 두 번 모두 HUD가
    에러 하나 없이 망가졌어요.

## 왜 이 방식이 효과적인가

인라인 환경 변수 접근이 전달 문제를 완전히 우회하기 때문에 동작해요.
Claude Code가 서브프로세스에 환경 변수를 전달하는 것(하지 않는)에 의존하는
대신, 명령 문자열 자체에 올바른 값을 심어놓는 거예요.

v0.0.x 구성에서는 HUD가 자신의 환경에서 `CLAUDE_CONFIG_DIR`을 읽고, 올바른
keychain 항목과 캐시 경로를 찾아서 올바른 사용량 통계를 표시했어요. 파일 기반
lock은 동시 세션의 API 스탬피드를 막았고요. 현재 claude-hud도
`CLAUDE_CONFIG_DIR`을 직접 읽지만, keychain 항목이나 usage 캐시는 더 이상 필요
없어요. Claude Code가 rate-limit 데이터를 stdin으로 넘겨주기 때문이에요.

## 실전 팁

**이 설정을 사용하면 좋은 경우:** Claude Code를 개인과 업무 Anthropic 계정으로
분리 운영하면서 터미널 statusline에서 정확한 계정별 사용량 추적이 필요할 때.

**넘어가도 되는 경우:** 단일 계정 설정(프로필 분리 불필요), 웹 UI만 사용하는
경우(HUD는 터미널 기능), HUD 플러그인을 아예 사용하지 않는 경우예요.
기본적인 멀티 프로필 설정(`CLAUDE_CONFIG_DIR`)은 HUD 패치 없이도 동작해요.
v0.0.x에서는 정확한 statusline 통계를 위해 패치가 필요했지만, 지금 패치는
겉모습만 바꿔요.

핵심 인사이트: Claude Code의 서브프로세스 환경은 예상과 다를 수 있어요. 확실하지
않을 때는, 환경 변수 상속에 의존하기보다 명령 문자열에 직접 값을 포함시키세요.

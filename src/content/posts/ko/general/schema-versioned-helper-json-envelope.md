---
title: 스키마 버전 관리되는 헬퍼 출력 엔벨롭
description: >-
  크로스-에이전트 헬퍼 스크립트를 위한 JSON 출력 엔벨롭 — schema_version, status, error, agent, ts.
  안정적인 모양, semver로 올릴 수 있고, 에러를 구분해 줘요.
date: 2026-05-01T00:00:00.000Z
updated: '2026-05-05'
tags:
  - general
  - json
  - schema
  - helpers
  - cross-agent
  - transferable
category: general
draft: false
lang: ko
source_lang: en
source_slug: schema-versioned-helper-json-envelope
source_updated: 2026-05-05T00:00:00.000Z
translation_date: '2026-05-05'
---

`triage-gather.js`의 첫 버전은 그냥 객체 하나를 JSON으로 내보냈어요. 출력에
필드를 하나 추가했더니 — 다운스트림 소비자가 조용히 깨졌어요. 옛날 필드만 계속
읽고, 새 필드는 놓치고, 불완전한 뷰를 렌더링하고, 그 새 필드에 의존하는 기능이
출시되기 전까지 아무도 알아채지 못했어요. 해결은 더 많은 문서가 아니었어요.
엔벨롭이었어요. 모든 헬퍼 출력이 같은 래퍼를 갖고, 그 래퍼가 스키마 버전을
실어 나르는 거예요.

이 글은 그 엔벨롭에 대한 이야기예요 — 어떤 필드들이 있고, 두 번의 반복을 거쳐
각 필드가 자리를 얻은 이유, 그리고 소비자 측 분기가 어떤 모양인지.

## 문제

스킬은 점점 더 자잘한 헬퍼 스크립트(Node, Python)에 gather/transform 작업을
위임하고, 헬퍼는 stdout으로 JSON을 내보내요. 명시적인 엔벨롭이 없으면 모든 헬퍼가
자기만의 모양, exit-code-vs-status 컨벤션, 깨짐 신호를 발명해요. 크로스-에이전트
(Claude / Codex / Gemini) 소비는 이 비용을 키워요 — 각 에이전트의 래퍼가 매번
특수 케이스 처리를 해야 하니까요.

## 컨텍스트

3B의 `project-context-loader` 스킬은 `triage-gather.js`를 호출해서 우선순위,
활성 행, 저널 Next 항목 등을 모으고 triage 뷰에 렌더링해요. 이전 반복에서는
헬퍼가 그냥 객체를 내보냈고 — 스키마 변경이 소비자를 조용히 깨뜨렸어요. 아래
엔벨롭을 더해서 그걸 막았어요.

## 해결책

스킬에서 호출되는 헬퍼는 다음 출력 모양을 표준으로 따르세요:

```json
{
  "schema_version": "1.0.0",
  "status": "ok | partial | error | tool-missing",
  "error": null,
  "agent": "claude | codex | gemini | unknown",
  "ts": "2026-05-01T...",

  "<helper-specific fields>": "..."
}
```

엔벨롭은 헬퍼 고유 페이로드를 감싸요. 다섯 개의 고정 필드가 계약이고, 헬퍼 고유
블록 안의 모든 건 스키마 버전이 그걸 반영하는 한 자유롭게 변할 수 있어요.

### 필수 엔벨롭 필드

| 필드             | 타입           | 목적                                                                                                       |
| ---------------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `schema_version` | semver 문자열  | 모양 변경 시 올려요. 소비자 스킬이 먼저 읽고, major를 못 알아보면 중단해요.                                |
| `status`         | enum           | 항상 설정되는 한 단어 상태. `ok` / `partial` / `error` / `tool-missing`이 표준 값이에요.                   |
| `error`          | object \| null | `status != "ok"`일 때 `{ code: string, message: string }`로 채워요. 그 외엔 null.                          |
| `agent`          | 문자열         | 헬퍼가 환경 변수(예: `CODEX_PROFILE`/`GEMINI_PROFILE`)에서 자동 감지해서, 소비자가 분기할 수 있어요.       |
| `ts`             | ISO 8601       | 헬퍼가 실행된 시각. 신선도 검사에 유용해요.                                                                |

### 상태 의미론

status enum이 크로스-에이전트 재사용에 가장 중요한 필드예요 — 다른 걸 파싱하기
전에 소비자가 어떻게 반응할지 알려주거든요:

| 상태           | 언제 쓰나                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ok`           | 모든 gather 단계 성공, 건너뛴 소스 없음                                                                                   |
| `partial`      | 일부 소스 읽기 실패; 출력에 `skipped_sources` 배열 포함. 스킬은 소비하되 플래그 표시.                                     |
| `error`        | 내부 실패. 출력 내용은 미정의. 소비자는 대안으로 폴백.                                                                    |
| `tool-missing` | 헬퍼 자체가 못 돔(예: 의존 CLI 부재). 소비자가 보통 다른 폴백을 쓰기 때문에 `error`와 구분.                               |

### 왜 단일 정수가 아니라 semver인가

헬퍼를 소비하는 스킬은 하위 호환성을 신경 써요. major를 올리면 소비자에게 "예전
필드가 없을 수 있다"고 말하는 거고, minor는 "새 필드가 생겼고 옛 필드는 그대로
동작한다"고 말하는 거예요. 단일 정수는 이 둘을 섞어 버려요.

실제로 소비자는 major에 핀하고 어떤 minor도 받아들일 수 있어요. 그러면 새 옵션
필드를 추가하는 건 소비자 입장에서 무사건이 돼요. major bump에서만 재테스트하면
되니까요. 단일 정수 스키마 버전은 모든 bump에서 모든 소비자가 재검증을 강제받아요.
어떤 종류의 변경인지 분간이 안 되니까요.

## 구현 스케치

```js
// helper.js
const SCHEMA_VERSION = "1.0.0";

function emit(content, { status = "ok", error = null } = {}) {
  process.stdout.write(
    JSON.stringify(
      {
        schema_version: SCHEMA_VERSION,
        status,
        error,
        agent: detectAgent(),
        ts: new Date().toISOString(),
        ...content
      },
      null,
      2
    ) + "\n"
  );
  process.exit(status === "error" ? 1 : 0);
}

function detectAgent() {
  if (process.env.CODEX_PROFILE) return "codex";
  if (process.env.GEMINI_PROFILE) return "gemini";
  return "claude";
}
```

소비자 측 분기는 status enum을 그대로 따라가요:

```text
헬퍼 실행. JSON 파싱.
schema_version major != 기대값 → 수동 gather로 폴백.
status == "error" → error.code/error.message 로깅; 폴백.
status == "tool-missing" → 사용자 대상 도구 설치 안내 출력.
status == "partial" → content 소비; "건너뛴 소스" 풋터 추가.
status == "ok" → content 소비.
```

`tool-missing`과 `error`가 다른 소비자 응답을 만든다는 점에 주목하세요. 크래시한
헬퍼는 폴백을 받을 자격이 있어요. 기반 CLI가 안 깔려서 못 도는 헬퍼는 사용자가
보는 설치 안내를 받을 자격이 있어요. 둘 다 "error"에 묶으면 그 구분이 사라지고,
소비자는 너무 조용("그냥 폴백, 사용자가 할 일 없음")하거나 너무 시끄러워져요
("이거 설치하세요!" 모든 내부 크래시마다).

## 부딪힌 어려움

- 표준 status enum을 정하는 데 두 번의 반복이 걸렸어요. 첫 버전은 `ok | error`만
  있어서 — "돌긴 했는데 일부 실패"를 표현 못했어요. `partial`을 추가해서 소비자
  측 분기를 올바르게 만들었어요. `tool-missing`을 나중에 추가해서 "기반 CLI 미설치라
  헬퍼가 못 돔"을 "헬퍼가 크래시"와 구분했어요. 소비자에게 다른 폴백이 필요한
  종류라서 다른 status가 필요했어요.
- `error` 필드 모양: 처음엔 문자열이었어요. `{ code, message }` 객체로 바꿔서
  소비자가 메시지를 파싱하지 않고 `code`로 분기하게 했어요.
- 스키마 버전을 파일 상단 상수로 저장. 상수 올리기 + 소비자의 버전 수용 목록
  업데이트가 변경 의식이에요. 헬퍼의 emit JSON을 캡처된 fixture와 단위 테스트해서
  버전 bump가 의도적으로 일어나도록 하세요.

## 핵심 포인트

- **항상 `schema_version` 포함** — 1.0.0이라도. 미래의 자신이 고마워해요.
- **`status`는 항상 설정** — 해피 패스에서도(`"ok"`). 소비자가 나머지 파싱 없이
  분기할 수 있게요.
- **에러 엔벨롭은 객체, 문자열 아님** — 소비자가 파싱한 `message`가 아니라
  `error.code`로 분기.
- **agent 자동 감지** — 크로스-에이전트로 도는 헬퍼는 감지된 에이전트를 출력에
  심어서 소비자가 분기할 수 있게.
- **안정적인 JSON 순서** — `null, 2` indent + 키 순서가 diff와 단위 테스트
  fixture에 중요해요. 릴리스마다 키 순서를 섞지 마세요.

## 언제 쓰나

- 스킬에서 호출되는 모든 Node / Python / Go 헬퍼 중 JSON을 내보내는 것.
- Claude / Codex / Gemini 모두 출력을 소비하는 크로스-에이전트 헬퍼.
- 출력 모양이 진화할 장수 헬퍼.

## 언제 쓰면 안 되나

- 미리 포맷된 텍스트를 내보내는 일회성 셸 파이프라인(소비자가 그냥 파이프).
- 출력이 데이터가 아니라 헬퍼의 동작 로그인 헬퍼(예: 설치 스크립트).

## 마무리

엔벨롭은 인상적인 게 아니에요. 헬퍼가 실제로 만드는 것 주위를 다섯 개 필드로
감싸는 거예요. 중요한 건 모든 크로스-에이전트 헬퍼가 같은 다섯 필드를 같은 모양으로
가지고 있어서, 소비자가 파서 하나를 만들고 어디서나 재사용할 수 있다는 거예요.

매번 다시 배우는 교훈은 — 생산자와 소비자 사이의 가장 작은 구조도 첫 변경에서
이미 본전을 뽑아요. 본인이 컨트롤하는 단일 소비자가 있을 때는 맨 JSON으로 충분해요.
소비자 수가 1을 넘는 순간 — 이 경우엔 세 에이전트 — "엔벨롭 없음"의 비용은
조용한 깨짐이에요. 엔벨롭은 그 깨짐을 시끄럽게 만드는 장치예요.

## 참고

- `knowledge/devops/stdlib-only-helper-portability.md` — 헬퍼가 크로스-에이전트
  호환을 유지하려면 **무엇으로 만들어져야 하는지**.
- `knowledge/ai-ml/cross-agent-skill-alias-generalization.md` — 방정식의 스킬
  측면을 위한 동반 패턴.

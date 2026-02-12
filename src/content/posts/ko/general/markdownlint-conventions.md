---
title: Markdownlint 컨벤션 가이드
description: >-
  7,500개 이상의 markdownlint 에러를 수정하며 정립한 Markdown 포맷팅 규칙과
  설정 방법을 정리합니다.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - general
  - documentation
  - markdown
  - linting
category: general
draft: false
lang: ko
source_lang: en
source_slug: markdownlint-conventions
source_updated: 2026-01-23T00:00:00.000Z
translation_date: "2026-02-12"
references:
  - url: "https://github.com/DavidAnson/markdownlint"
    title: markdownlint
    type: official
  - url: "https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md"
    title: Rules.md
    type: official
  - url: >-
      https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint
    title: items
    type: verified
---

나의 지식 베이스에 처음으로 `markdownlint`를 돌렸더니 7,500개의 에러가
나왔어요. 오타나 깨진 링크가 아니라 -- 포맷팅 불일치였습니다. 리스트 앞뒤에
빈 줄 누락, 언어 지정 없는 코드 블록, 중복 헤딩, 스페이싱 없는 테이블. 모든
파일이 자기만의 스타일을 가지고 있었고, 서로 일치하는 게 하나도 없었어요.

문제는 개별 규칙이 어렵다는 게 아니었어요. 강제되는 컨벤션 없이는 엔트로피가
이긴다는 게 문제였습니다. 파일을 건드릴 때마다 조금씩 다른 포맷팅 스타일이
쌓이고, 시간이 지나면 코드베이스 전체가 충돌하는 컨벤션의 짜깁기가 돼서
지저분한 diff를 만들고 GitHub 렌더링을 혼란스럽게 만들어요.

## Markdownlint가 중요한 이유

Markdown은 겉보기에 단순해요. 쓰고, 렌더링되고, 넘어가면 되니까요. 하지만
지식 베이스 전체에 걸쳐 수백 개의 markdown 파일을 관리하면 불일치가 누적돼요.
GitHub은 스페이싱에 따라 테이블을 다르게 렌더링하고, 언어 태그 없는 코드
블록은 구문 강조가 안 되고, 빈 줄 없는 리스트는 일부 렌더러에서 인접한
문단과 합쳐질 수 있어요.

Markdownlint는 이런 문제를 프로덕션에 도달하기 전에 잡아줘요. 모든 markdown
파일에 일관된 포맷팅 규칙을 강제하는 Node.js 스타일 체커입니다.

## 겪었던 어려움들

**에러의 절대적인 양 (7,500+).** 수동으로 고칠 수가 없었어요. 어떤 규칙이
가장 영향력이 큰지 파악해서 수정 우선순위를 정하고, 어떤 건 설정으로 무시할
수 있는지 이해해야 했습니다.

**MD060이 에러 수를 지배 (3,600+).** 테이블 스페이싱 에러가 만연했지만
기계적이었어요. 자동 수정과 컨벤션 먼저 정립하기 사이에서 결정해야 했고,
컨벤션을 먼저 정립한 뒤 수정하는 걸 택했습니다.

**규칙 충돌.** MD013(줄 길이) 같은 규칙은 테이블 가독성과 충돌해요. 80자에서
줄바꿈하는 긴 테이블 행은 읽기 어려워져요. 일괄 적용이 아닌 규칙별 설정
결정이 필요했습니다.

**기존 파일들이 다양한 컨벤션 사용.** 일부 파일은 압축된 테이블 구문을,
다른 파일은 패딩을 사용했어요. 정규화하려면 전체에 수정을 적용하기 전에 하나의
표준 스타일을 먼저 선택해야 했습니다.

## 가장 중요한 규칙들

실제 문제를 일으킨 빈도 순으로 정리한 규칙들입니다.

### MD032 -- 리스트 앞뒤 빈 줄

리스트 앞뒤에 빈 줄이 필요해요. 없으면 일부 렌더러에서 리스트 항목이 주변
문단과 합쳐질 수 있습니다.

```markdown
<!-- Bad -->

Some text before

- Item 1
- Item 2
  More text after

<!-- Good -->

Some text before

- Item 1
- Item 2

More text after
```

이 규칙은 볼드 텍스트 뒤의 리스트(`**Header:**` 뒤에 빈 줄 필요), 번호 매긴
리스트, 중첩 리스트에도 적용돼요.

### MD040 -- 코드 블록 언어 지정

모든 fenced 코드 블록에 언어를 지정해야 해요. 언어 태그 없으면 구문 강조가
안 됩니다.

````markdown
<!-- Bad -->

```
some code here
```

<!-- Good -->

```bash
some code here
```
````

자주 쓰는 언어 태그: `bash`, `yaml`, `json`, `javascript`, `typescript`,
`python`, `text`, `markdown`.

### MD060 -- 테이블 컬럼 스타일

테이블은 일관된 스페이싱을 사용해야 해요. 가독성이 가장 좋은
`leading_and_trailing`을 선택했습니다:

```markdown
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
```

이 단일 규칙이 7,500개 에러 중 3,600개 이상을 차지했어요. 수정은 기계적이었지만
컨벤션이 먼저 있어야 했습니다.

### MD024 -- 중복 헤딩 금지

헤딩 텍스트는 문서 내에서 고유해야 해요. "Overview"라는 섹션이 두 개면 탐색과
앵커 링크가 혼란스러워집니다.

```markdown
<!-- Bad -->

## Overview

...

## Overview

<!-- Good -->

## Overview

...

## Session 2 Overview
```

MD024는 `siblings_only: true`로 설정하면 다른 부모 헤딩 아래의 중복은
허용할 수 있어요.

### MD031 -- 코드 블록 앞뒤 빈 줄

Fenced 코드 블록 앞뒤에 빈 줄이 필요해요. 없으면 일부 렌더러가 코드 블록
경계를 감지하지 못할 수 있습니다.

### MD009 -- 후행 공백 금지

줄 끝에 공백이 있으면 안 돼요. 에디터에서 저장 시 자동 트림을 설정하세요.

### MD010 -- 하드 탭 금지

탭 대신 스페이스를 사용하세요. 표준은 markdown에 2스페이스, 코드 블록에
4스페이스입니다.

### MD013 -- 줄 길이

기본적으로 80자를 초과하면 안 돼요. 저는 산문에 대해 이 규칙을 비활성화해요.
문단을 강제 줄바꿈하면 오히려 diff가 더 지저분해지거든요. 테이블도 예외로
둡니다.

## 설정

프로젝트 루트에 `.markdownlint.json`을 만드세요:

```json
{
  "MD013": false,
  "MD024": {
    "siblings_only": true
  },
  "MD033": false,
  "MD041": false
}
```

| 규칙  | 설정                  | 이유                                     |
| ----- | --------------------- | ---------------------------------------- |
| MD013 | `false`               | 긴 산문 줄 허용                          |
| MD024 | `siblings_only: true` | 다른 섹션의 중복 헤딩 허용               |
| MD033 | `false`               | 인라인 HTML 허용 (배지, details 태그 등) |
| MD041 | `false`               | 최상위 헤딩 없는 문서 허용               |

## VS Code 통합

markdownlint 확장 프로그램(`DavidAnson.vscode-markdownlint`)을 설치하고
다음 설정을 추가하세요:

```json
{
  "markdownlint.config": {
    "MD013": false,
    "MD024": { "siblings_only": true }
  },
  "editor.formatOnSave": true,
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.quickSuggestions": false
  }
}
```

이렇게 하면 에디터에서 실시간 린팅을 받을 수 있어요. 에러가 노란 물결선으로
표시되고, 대부분 키 하나로 고칠 수 있습니다.

## 빠른 참조

| 문제                   | 규칙  | 해결법                           |
| ---------------------- | ----- | -------------------------------- |
| 리스트 빈 줄 누락      | MD032 | 리스트 앞뒤에 빈 줄 추가         |
| 코드 블록 언어 없음    | MD040 | 여는 fence 뒤에 언어 추가        |
| 중복 헤딩              | MD024 | 헤딩 텍스트를 고유하게 변경      |
| 테이블 스페이싱 불일치 | MD060 | `\| text \|` 형태로 통일         |
| 코드 블록 앞뒤 빈 줄   | MD031 | fence 앞뒤에 빈 줄 추가          |
| 후행 공백              | MD009 | 에디터에서 자동 트림 설정        |
| 하드 탭                | MD010 | 스페이스 사용 (md 2칸, 코드 4칸) |

## 왜 이 방법이 효과적인가

Markdownlint는 암묵적인 포맷팅 기대를 명시적이고 강제할 수 있는 규칙으로
바꿔줘요. 설정 파일에 컨벤션이 존재하면 모든 기여자가 같은 표준을 따르게
됩니다. 포맷팅 변경이 콘텐츠 변경을 오염시키지 않으니 diff가 깔끔해지고,
소스 포맷팅이 일관되니 GitHub이 테이블과 코드 블록을 일관되게 렌더링해요.

## 실전 팁

기존 파일에 `markdownlint`를 먼저 돌려보세요. 한 번에 모든 걸 고치려 하지
마세요. 가장 많은 에러를 생성하는 규칙을 파악하고, 그 규칙의 컨벤션을 먼저
정립한 뒤 대량으로 수정하세요. 프로젝트의 필요와 충돌하는 규칙은 설정으로
비활성화하세요 (산문이 많은 저장소의 MD013 같은 경우).

markdownlint를 적용할 곳:

- 모든 저장소의 문서 파일
- README 파일
- 지식 베이스 항목
- 저널 항목과 기술 가이드

적용하지 않을 곳: 코드 주석 안의 markdown이나 다른 포맷에 임베디드된
markdown은 호스트 포맷의 고유한 제약이 있을 수 있어요.

## 리소스

- [markdownlint GitHub](https://github.com/DavidAnson/markdownlint)
- [markdownlint Rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint)

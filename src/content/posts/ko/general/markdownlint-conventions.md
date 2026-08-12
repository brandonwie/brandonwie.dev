---
title: Markdownlint 컨벤션 가이드
description: >-
  200개 markdown 파일에서 쏟아진 markdownlint 에러 7,500개. 어떤 룰이 중요했는지, 어떤 설정이 끝까지 남았는지,
  nested scope에서만 드러나는 pre-commit 함정 두 가지, 그리고 18개짜리 custom config를 extends 한 줄과
  carve-out 다섯 개로 줄인 strict-preset 마이그레이션 이야기예요.
date: 2026-01-23T00:00:00.000Z
updated: '2026-08-12'
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
source_updated: '2026-08-12'
translation_date: '2026-08-12'
references:
  - url: 'https://github.com/DavidAnson/markdownlint'
    title: markdownlint
    type: official
  - url: 'https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md'
    title: markdownlint Rules
    type: official
  - url: >-
      https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint
    title: VS Code markdownlint extension
    type: verified
  - url: 'https://github.com/DavidAnson/markdownlint/blob/main/style/all.json'
    title: markdownlint built-in style/all preset
    type: official
  - url: >-
      https://www.joshuakgoldberg.com/blog/configuring-markdownlint-alongside-prettier/
    title: Configuring Markdownlint Alongside Prettier (Joshua Goldberg)
    type: authoritative
  - url: 'https://github.com/github/markdownlint-github'
    title: GitHub의 markdownlint preset (accessibility-focused)
    type: official
---

지식 베이스에 처음으로 `markdownlint`를 돌렸더니 에러 7,500개가
쏟아져 나왔어요. 오타나 깨진 링크가 아니라 전부 포맷 불일치였어요. 리스트 앞뒤
빈 줄 누락, 언어 지정 없는 코드 블록, 중복 헤딩, 스페이싱 없는 테이블. 파일마다
자기만의 스타일이 있었고, 서로 일치하는 게 하나도 없었어요.

문제는 개별 규칙이 어렵다는 게 아니었어요. 강제되는 컨벤션 없이는 엔트로피가
이긴다는 게 문제였어요. 파일을 건드릴 때마다 조금씩 다른 포맷이
쌓이고, 시간이 지나면 코드베이스 전체가 충돌하는 컨벤션의 짜깁기가 돼서
지저분한 diff를 만들고 GitHub 렌더링을 혼란스럽게 만들어요.

## Markdownlint가 중요한 이유

Markdown은 겉보기에 단순해요. 쓰고, 렌더링되고, 넘어가면 되니까요. 하지만
지식 베이스 전체에 걸쳐 수백 개의 markdown 파일을 관리하면 불일치가 누적돼요.
GitHub은 스페이싱에 따라 테이블을 다르게 렌더링하고, 언어 태그 없는 코드
블록은 구문 강조가 안 되고, 빈 줄 없는 리스트는 일부 렌더러에서 인접한
문단과 합쳐질 수 있어요.

Markdownlint는 이런 문제를 프로덕션에 도달하기 전에 잡아줘요. 모든 markdown
파일에 일관된 포맷 규칙을 강제하는 Node.js 기반 스타일 체커예요.

## 겪었던 어려움들

**에러의 절대적인 양(7,500+).** 손으로 고칠 수가 없었어요. 어떤 규칙이
가장 영향력이 큰지 파악해서 수정 우선순위를 정하고, 어떤 건 설정으로 무시할
수 있는지 이해해야 했어요.

**MD060이 에러 수를 지배(3,600+).** 테이블 스페이싱 에러가 만연했지만
기계적이었어요. 자동 수정과 컨벤션 먼저 정립하기 사이에서 결정해야 했고,
컨벤션을 먼저 정립한 뒤 수정하는 쪽을 택했어요.

**규칙 충돌.** MD013(줄 길이) 같은 규칙은 테이블 가독성과 충돌해요. 80자에서
줄바꿈하는 긴 테이블 행은 읽기 어려워져요. 일괄 적용이 아니라 규칙별로
따로 정해야 했어요.

**기존 파일들이 다양한 컨벤션 사용.** 어떤 파일은 압축된 테이블 구문을,
어떤 파일은 패딩을 썼어요. 정규화하려면 전체에 수정을 적용하기 전에 하나의
표준 스타일을 먼저 골라야 했어요.

## 가장 중요한 규칙들

실제 문제를 일으킨 빈도 순으로 정리한 규칙들이에요.

### MD032 -- 리스트 앞뒤 빈 줄

리스트 앞뒤에 빈 줄이 필요해요. 없으면 일부 렌더러에서 리스트 항목이 주변
문단과 합쳐질 수 있어요.

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

모든 fenced 코드 블록에 언어를 지정해야 해요. 언어 태그가 없으면 구문 강조가
안 돼요.

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

### MD055와 MD060 -- 헷갈리기 쉬운 두 개의 테이블 룰

테이블 포맷은 두 개의 룰로 나뉘어 있어요. 둘 다 pipe 문자를 다루다 보니
섞이기 쉬운데, 이 글의 이전 버전도 MD055의 설정값을 MD060 heading 아래에
적어놨었어요. 딱 피해야 할 실수예요.

`MD055`/table-pipe-style은 **pipe의 위치**를 다뤄요. 각 행에 leading pipe가
있는지, trailing pipe가 있는지, 둘 다인지, 아니면 둘 다 없는지요. markdownlint
v0.41.1 기준으로 `style` 값은 `consistent`(기본값이고, 문서의 첫 번째 테이블이
나머지 스타일을 정해요)와 명시적인 네 가지예요.

| `style` 값               | 행 모양              |
| ------------------------ | -------------------- |
| `leading_and_trailing`   | `\| Cell \| Cell \|` |
| `leading_only`           | `\| Cell \| Cell`    |
| `trailing_only`          | `Cell \| Cell \|`    |
| `no_leading_or_trailing` | `Cell \| Cell`       |

`MD060`/table-column-style은 **셀 안쪽의 padding**을 다뤄요. 나중에(v0.39.0)
추가됐고, 받는 값이 MD055와 하나도 겹치지 않아요. `any`(기본값), `aligned`,
`compact`, `tight` 중에서 고르면 돼요.

| `style` 값 | 요구하는 것                                        |
| ---------- | -------------------------------------------------- |
| `aligned`  | pipe가 수직으로 정렬되고, 셀은 컬럼 폭까지 padding |
| `compact`  | 셀 양옆에 정확히 한 칸, pipe는 들쭉날쭉해도 됨     |
| `tight`    | padding 없음, `\|Y\|Yes\|`                          |
| `any`      | 위 셋 중 아무거나, 테이블 단위로 판정              |

저는 컬럼을 aligned로 맞추고, 행 앞뒤에 pipe를 넣는 쪽으로 정착했어요.

```markdown
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
```

깊이 고민해서 고른 건 아니고, 이미 Prettier를 쓰고 있었던 결과예요. Prettier의
markdown formatter가 aligned 테이블을 뽑아내니까, 다른 걸 골랐으면 저장할 때마다
formatter랑 싸워야 했을 거예요.

컬럼 스타일 룰 하나가 7,500개 에러 중 3,600개, 거의 절반을 차지했어요. 고치는
일 자체는 기계적이고 자동으로도 됐지만, 양이 워낙 많아서 자동 수정을 돌리기 전에
기준 스타일부터 정해야 했어요.

### MD024 -- 중복 헤딩 금지

헤딩 텍스트는 문서 안에서 고유해야 해요. "Overview"라는 섹션이 두 개면 탐색도
앵커 링크도 헷갈려요.

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
경계를 감지하지 못할 수 있어요.

### MD009 -- 후행 공백 금지

줄 끝에 공백이 있으면 안 돼요. 에디터에서 저장 시 자동 트림을 설정하세요.

### MD010 -- 하드 탭 금지

탭 대신 스페이스를 쓰세요. 표준은 markdown에 2스페이스, 코드 블록에
4스페이스예요.

### MD013 -- 줄 길이

기본적으로 80자를 초과하면 안 돼요. 저는 산문에서는 이 규칙을 꺼둬요.
문단을 강제 줄바꿈하면 오히려 diff가 더 지저분해지거든요. 테이블도 예외로
둬요.

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
| MD033 | `false`               | 인라인 HTML 허용(배지, details 태그 등)  |
| MD041 | `false`               | 최상위 헤딩 없는 문서 허용               |

## Strict preset 채택하기 (`style/all` + Carve-Outs)

위에 적은 18개짜리 custom config는 시간이 지나면 아무 일도 안 하거나, 중복이거나, 조용히 망가진 항목이 쌓여요. 몇 달 써보고 나서 저는 upstream `style/all` preset에 carve-out 몇 개만 얹는 쪽으로 옮겼어요. 룰마다 흩어져 있던 설정이 `extends:` 한 줄과 예외 몇 개로 줄었고, 효과 없는 override 뒤에 숨어 있던 MD040 에러 36개가 그제야 드러났어요.

### Recipe

```json
{
  "config": {
    "extends": "markdownlint/style/all",

    // Carve-out — 각각 reason과 함께 documented
    "MD013": false, // prettier가 wrapping 처리
    "MD024": { "siblings_only": true }, // sibling section repetition 허용
    "MD025": { "front_matter_title": "" }, // frontmatter 아래 H1 없음
    "MD036": false, // **Bold:** 패턴이 의도적
    "MD060": false // table column style이 다양함
  },
  "ignores": [
    /* ... */
  ]
}
```

### `style/all`이 실제로 뭔지

markdownlint가 기본으로 들고 있는 [style/all.json](https://github.com/DavidAnson/markdownlint/blob/main/style/all.json)의 내용은 사실 이게 전부예요.

```json
{
  "comment": "All rules",
  "default": true
}
```

그래서 `extends: "markdownlint/style/all"`은 `{"default": true}`와 같은 뜻이에요. 모든 룰이 기본 설정으로 켜져요. 둘 중 어느 쪽을 baseline으로 잡아도 되지만, 이름 없는 `default: true`보다는 `extends:` 쪽이 의도를 드러내서 더 나아요.

### 다른 built-in preset

같은 `style/` 디렉토리에 세 가지 옵션이 더 있어요. 셋 다 빼는 방향이라, 단독으로 쓰기보다는 extend해두고 그 위에 custom 룰을 얹으라고 만들어진 것들이에요.

| Preset                    | 비활성화                                                                                                                       | Use case                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `style/all.json`          | nothing (`{default: true}`)                                                                                                    | 가장 strict한 baseline, 필요한 만큼 carve out        |
| `style/relaxed.json`      | line-length, ul-indent, no-inline-html, no-bare-urls, fenced-code-language, first-line-h1, whitespace                          | 산문 위주의 GitHub README에 permissive default       |
| `style/prettier.json`     | 23개 formatting 룰(blanks-around-fences, code-fence-style, hr-style, line-length, list-indent, no-trailing-spaces, etc.)       | prettier와 공존, Joshua Goldberg의 recipe           |
| `style/cirosantilli.json` | Ciro Santilli의 personal style                                                                                                 | 참조용                                                |

### 제안한 config는 먼저 돌려보고 약속하기

config 단순화를 제안할 때는, 제안한 config를 손대지 않은 콘텐츠에 먼저 돌려봐요. 지금 config의 출력만 보고 추정하면 안 돼요. 기존 override들이 "pure default"로 바꾸는 순간 그대로 쏟아질 실패 수천 개를 막고 있을 수도 있거든요. 3B 테스트(2026-05-01) 결과는 이렇게 나왔어요.

| Config                                | Failure (보고됨)                  |
| ------------------------------------- | --------------------------------- |
| 기존 18-rule custom                    | 131                               |
| `extends: "markdownlint/style/all"`   | **11,398** (MD013 만: 10,491)     |
| `extends: "style/all"` + 5 carve-out  | 36 (MD040만, sweepable)           |

위 두 줄은 18개 custom 설정이 "default 대비 no-op"이었다면 결과가 같아야 했어요. 그런데 기존 config가 MD013 false(line-length), MD024 siblings_only=true, MD025 front_matter_title=""로 약 11,000개 실패를 막고 있었어요. 군더더기라고 생각했던 override 세 개가 사실은 무게를 받치고 있었던 거예요.

순서는 이래요. 먼저 temp config 파일을 만드는데, 파일명에 `markdownlint-cli2` prefix가 들어가야 해요(예: `pure-default.markdownlint-cli2.jsonc`). CLI가 아무 이름이나 받아주지 않거든요. 그다음 `npx markdownlint-cli2 --config <temp-file> '<glob>'`을 돌리고, 실패를 `MD###/rule-name`별로 묶은 뒤에 뭘 carve out하고 뭘 고칠지 정하면 돼요.

### config-theater 함정

override가 linter를 조종하는 것처럼 보이지만 실제로는 의도한 일을 아무것도 안 할 수 있어요. 경고도 안 떠요. 파일은 잘 파싱되고, 실행도 성공하고, config는 config처럼 읽혀요. 제 마이그레이션 이전 config에 이런 게 두 개 있었어요.

| Override                  | 실제로 한 일                            | Fix                                             |
| ------------------------- | --------------------------------------- | ----------------------------------------------- |
| `MD060: { style: "any" }` | 없음. `any`가 MD060의 기본값            | 삭제. 진짜 끄려면 `MD060: false`                |
| `MD###: true` entry 10개  | 없음. `default: true`와 정확히 일치      | 삭제하고 preset에 의존                          |

MD060 entry가 가장 명확한 케이스예요. "테이블마다 consistent한 스타일이면 accept"라는 주석을 달아뒀는데, `any`가 뭘 하는지 설명하는 문장으로는 맞아요. 다만 제가 **바꾸고 있는** 게 뭔지는 하나도 설명하지 못했어요. 아무것도 안 썼어도 어차피 `any`였을 테니까요.

더 고약한 변종이 하나 더 있어요. 인식되지 않는 값이에요. 저는 인식 안 되는 값이면 룰의 기본값으로 fall back할 거라고 생각했는데, 아니었어요. markdownlint-cli2 v0.23.1(markdownlint v0.41.1)에서 일부러 들쭉날쭉하게 만든 테이블 하나로 테스트한 결과예요.

| `MD060` config            | 결과                  |
| ------------------------- | --------------------- |
| `{ style: "aligned" }`    | violation 6개         |
| `{ style: "any" }`        | violation 1개(기본값)  |
| `{ style: "consistant" }` | violation 0개         |

`consistant`는 이 룰에 아예 존재하지도 않는 값의 오타예요. MD060은 `aligned`/`any`/`compact`/`tight`를 받고, `consistent`는 MD055 쪽 값이거든요. 실행은 깨끗하게 끝나고, 아무것도 보고하지 않고, 룰은 사실상 꺼져 있어요. 중복 override는 한 줄 낭비지만, 인식 안 되는 override는 아무것도 검사하지 않는 green build를 안겨줘요.

둘 다 알아채는 방법은 하나고, 비용도 싸요. Diff 테스트 규칙은 이래요. override를 켠 채로 한 번, 끈 채로 한 번 lint를 돌려서 실패 건수와 분포가 똑같이 나오면 그 override는 아무 일도 안 하고 있어요. 0으로 떨어지면 기뻐하지 말고 의심하세요.

### `@github/markdownlint-github`와 비교

DavidAnson의 lib 위에 얹은 third-party preset인데, 겨냥하는 독자가 달라요. 이미지가 들어가는 접근성 중심 OSS 문서를 위한 preset이에요. `base.js`와 `accessibility.js`, 자체 `GH001-003` 룰을 합쳐서 써요.

- `ul-style: { style: "asterisk" }`를 강제해서 `-` bullet이 전부 걸려요
- `no-emphasis-as-heading: true`를 강제해요
- `no-duplicate-heading`을 `siblings_only: false`로 강제해요
- GH001 (no-default-alt-text), GH002 (no-generic-link-text), GH003 (no-empty-alt-text) 세 개를 추가해요
- 함수 기반 설정인 `.markdownlint-cli2.mjs`를 써야 하고, `@github/markdownlint-github`와 `markdownlint-cli2-formatter-pretty`를 npm으로 설치해야 해요

이미지가 들어가는 public OSS 문서를 내면서 접근성까지 강제해야 하는 상황이 아니면 그냥 넘어가도 돼요. 산문 위주의 사내 지식 베이스라면 마이그레이션 비용(3B 콘텐츠 기준으로 수천 개 rewrite 에러 예상)이 얻는 것보다 커요.

## Scope 경고: 루트 설정이 항상 이기는 건 아니에요

나중에야 알게 된 건데, 프로젝트 루트에서 룰을 껐다고 해서 nested config
scope까지 **따라가지는 않아요**. `.claude/skills/**`, `.codex/skills/**`,
기타 tool-managed 디렉토리는 보통 자기만의 `.markdownlint.json`(또는
markdownlint-cli2 glob 필터) 아래에서 lint되고, 레포 루트가 MD033을
껐어도 거기선 그대로 켜져 있을 수 있어요.

다음 두 섹션은 이 scoping 때문에 드러나는 함정 두 가지예요. 둘 다 루트에서
"그 룰 껐는데"라는 말이 왜 안 통하는지 깨닫기 전까지 commit을 잡아먹었어요.

## MD033 함정: CJK 텍스트와 angle bracket placeholder

`MD033/no-inline-html`는 `<word>` 패턴을 HTML element로 flag해요. 함정은
markdownlint의 HTML detector가 진짜 HTML element인지 아닌지를 따지지 않는다는
거예요. 산문 어디에 있든 `<identifier>` 모양이면 룰이 걸려요. angle bracket을
문서용 placeholder 문법으로 쓰고 있는 게 뻔한 CJK 텍스트 안에서도요.

```markdown
<!-- 둘 다 MD033/no-inline-html [Element: id] / [Element: choice]로 flag됨 -->

투표하고 싶다고 하면 node ~/.config/ainc/anc-hook.js vote <id> "<choice>"
node ~/.config/ainc/anc-hook.js profile edit <필드> "<값>"
node ~/.config/ainc/anc-hook.js suggest "<내용>"
```

**Fix:** CLI snippet을 inline backtick으로 감싸서 angle bracket이 HTML이
아니라 코드로 렌더되게 해요. "이건 교체할 placeholder예요"라는 시각적 의미는
그대로 남아요.

```markdown
투표하고 싶다고 하면 `node ~/.config/ainc/anc-hook.js vote <id> "<choice>"`
`node ~/.config/ainc/anc-hook.js profile edit <필드> "<값>"`
`node ~/.config/ainc/anc-hook.js suggest "<내용>"`
```

왜 놀라운가:

- 한국어처럼 라틴 문자가 아닌 문장은 읽는 사람에게 "딱 봐도 산문"으로
  느껴지니까, angle bracket placeholder가 시각적으로 안전해 보여요.
- bracket 안의 CJK 글자(`<필드>`, `<내용>`)는 `<id>`보다 덜 HTML 같아
  보이지만, markdownlint의 lexer는 둘을 똑같이 다뤄요.
- 함정은 보통 nested scope(skills 디렉토리, plugin 패키지)에서만 드러나요.
  거기서는 MD033이 여전히 켜져 있는데, "MD033은 글로벌로 껐는데?"라는 잘못된
  mental model이 남아 있거든요.

## `*.me.md` 폴더 이름 변경 시 Pre-Commit 함정

Pre-commit lint는 폴더 이름 변경을 "newly added" 파일로 봐요. 이름 변경된
폴더가 인라인 HTML(`<aside>`, `<details>`)이나 중복 헤딩이 있는 human-authored
`.me.md` 파일(Notion export, brain dump, PRD seed)을 포함하면, 콘텐츠가
이전 경로에서 unchanged여도 markdownlint가 commit을 막아요.

4월 말에 실제로 겪었어요. 태스크 폴더를 `actives/onboarding/`에서
`actives/frontend-onboarding/`로 이름 변경하니 pre-commit lint가
`notion-requirements.me.md`(인라인 `<aside>` HTML과 중복 한국어 헤딩이
있는 Notion export)를 트리거했어요. lint-staged가 콘텐츠가 unchanged여도
파일을 "newly added"로 봤어요.

```bash
git add actives/onboarding/ actives/frontend-onboarding/
git commit
# → markdownlint-cli2가 notion-requirements.me.md에서 실패:
#   MD041 first-line-heading
#   MD033 inline HTML [Element: aside]  (×3)
#   MD024 duplicate headings (×3)
```

**Fix:** `**/*.me.md`를 `.markdownlint-cli2.jsonc`의 `ignores` 배열에
추가하세요. `.me.md`는 AI나 도구가 건드리면 안 되는, 사람이 직접 쓴 seed
파일에 붙이는 컨벤션이에요. Lint가 그 콘텐츠로 commit을 막으면 안 돼요.

```json
"ignores": [
  // ...
  "**/*.me.md"
]
```

왜 놀라운가:

- 폴더 이름 변경은 직관적으로 "내용은 그대로"인 작업처럼 느껴지니까, lint가
  끼어들 이유가 없어 보여요. lint-staged 생각은 달라요. 이름만 바뀐 경로까지
  staged된 건 전부 lint하거든요.
- `.me.md` 확장자 자체가 "수정하지 마세요"라는 신호인데, markdownlint는
  그런 컨벤션을 알 리가 없어요.
- 원래 자리에 있던 `notion-requirements.me.md`도 처음 commit할 때 똑같이
  막혔을 거예요. 이름 변경이 그동안 숨어 있던 구멍을 드러낸 것뿐이에요.

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

이렇게 하면 에디터에서 실시간으로 린트 결과를 받을 수 있어요. 에러가 노란 물결선으로
표시되고, 대부분은 키 하나로 고칠 수 있어요.

## 빠른 참조

| 문제                   | 규칙  | 해결법                           |
| ---------------------- | ----- | -------------------------------- |
| 리스트 빈 줄 누락      | MD032 | 리스트 앞뒤에 빈 줄 추가         |
| 코드 블록 언어 없음    | MD040 | 여는 fence 뒤에 언어 추가        |
| 중복 헤딩              | MD024 | 헤딩 텍스트를 고유하게 변경      |
| leading/trailing pipe 누락 | MD055 | 모든 행의 앞뒤에 pipe 넣기   |
| 셀 padding 불일치      | MD060 | 컬럼 스타일 하나(`aligned`)로 통일 |
| 코드 블록 앞뒤 빈 줄   | MD031 | fence 앞뒤에 빈 줄 추가          |
| 후행 공백              | MD009 | 에디터에서 자동 트림 설정        |
| 하드 탭                | MD010 | 스페이스 사용(md 2칸, 코드 4칸)  |
| `<id>`가 HTML로 flag  | MD033 | backtick으로 감싸기: `` `<id>` `` |
| `.me.md`가 commit 막음 | n/a   | `**/*.me.md`를 ignores에 추가     |

## 왜 이 방법이 효과적인가

Markdownlint는 암묵적인 포맷 기대치를 명시적이고 강제할 수 있는 규칙으로
바꿔줘요. 설정 파일에 컨벤션이 적혀 있으면 모든 기여자가 같은 표준을 따르게
돼요. 포맷 변경이 콘텐츠 변경을 오염시키지 않으니 diff가 깔끔해지고,
소스 포맷이 일관되니 GitHub도 테이블과 코드 블록을 일관되게 렌더링해요.

## 실전 팁

기존 파일에 `markdownlint`를 먼저 돌려보세요. 한 번에 다 고치려고 하지 마시고요.
에러를 가장 많이 만들어내는 규칙부터 찾아서, 그 규칙의 컨벤션을 정한 다음
한꺼번에 수정하는 게 나아요. 프로젝트 사정과 충돌하는 규칙은 설정에서 꺼두면
돼요(산문이 많은 저장소의 MD013처럼요). 뒤이어 진행한 `style/all`
마이그레이션에서는 흩어져 있던 18개짜리 custom config가 `extends:` 한 줄과
carve-out 다섯 개로 줄었어요. 그러면서 예전 override들이 덮어두고 있던 실패
약 11,000개가 드러났는데, 알고 보니 군더더기가 아니라 정말 덮어둘 만한
것들이었어요.

markdownlint를 적용하면 좋은 곳이에요.

- 모든 저장소의 문서 파일
- README 파일
- 지식 베이스 항목
- 저널 항목과 기술 가이드

반대로 코드 주석 안의 markdown이나 다른 포맷 안에 끼워 넣은 markdown은 굳이
안 해도 돼요. 호스트 포맷 나름의 제약이 있거든요.

## 리소스

- [markdownlint GitHub](https://github.com/DavidAnson/markdownlint)
- [markdownlint Rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint)

---
title: GitHub PR Review API - 인라인 코멘트
description: GitHub API와 gh CLI로 PR 리뷰에 인라인 코멘트를 다는 방법
date: 2026-02-04T00:00:00.000Z
updated: "2026-08-02"
tags:
  - devops
  - github
  - api
  - pr-review
category: devops
draft: false
lang: ko
source_lang: en
source_slug: github-pr-review-api-inline-comments
source_updated: "2026-08-02"
translation_date: "2026-02-12"
references:
  - url: >-
      https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request
    title: GitHub REST API - Create a review for a pull request
    type: official
  - url: https://cli.github.com/manual/gh_api
    title: gh api - GitHub CLI manual
    type: official
---

커맨드라인에서 PR에 인라인 리뷰 코멘트 여러 개를 한 번에 달고 싶었어요.
가장 먼저 떠오른 방법 -- `gh api`에 배열용 숫자 인덱스 대괄호 표기법 --
을 쓰니 422 에러가 났어요. 대괄호 안의 숫자가 배열 인덱스가 아니라는 걸
깨닫는 데 생각보다 오래 걸렸어요.

## 왜 중요한가

특정 코드 라인에 고정된 인라인 PR 코멘트는 긴 텍스트의 PR 설명보다 훨씬
유용해요. 리뷰어(그리고 미래의 나)가 왜 그 라인이 그렇게 작성됐는지 이해할
수 있게 해줘요. 셀프 리뷰, CI lint 결과, 보안 발견 사항을 자동화한다면
GitHub PR Review API로 프로그래밍 방식으로 게시해야 해요.

---

## 겪었던 어려움

- **대괄호 표기법이 배열 문법처럼 보임** -- `gh api`는 중첩 객체에
  `key[subkey]=value` 문법을 지원해서 `comments[0][path]`가 배열
  인덱싱처럼 보여요. 하지만 아니에요. 로컬에서는 아무 경고도 없이 요청이
  나가고 GitHub이 거절해요.
- **422 에러가 도움이 안 됨** -- 응답은 "is not an array"라고만 하고 실제로
  받은 페이로드를 보여주지 않아요. `--verbose`를 붙여서 직렬화된 JSON을
  직접 읽기 전까지는 뭐가 어긋났는지 안 보여요.
- **라인 번호가 diff에 있어야 함** -- JSON 형식을 고쳐도, PR diff에 없는
  라인을 겨냥한 코멘트는 대충 비슷한 위치에 붙는 게 아니라 또 다른 422로
  거절돼요. diff를 교차 확인해서 라인 번호를 골라야 해요.
- **Heredoc 따옴표의 미묘함** -- 따옴표 없는 heredoc 구분자를 쓰면 JSON
  본문 안의 백틱과 `$variables`에 쉘 확장이 적용돼요. 코멘트 텍스트에 코드
  스니펫이 있으면 내용이 깨져요.

---

## 잘못된 방법

```bash
# 틀림 - HTTP 422 에러 발생
gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST \
  -f event="COMMENT" \
  -f body="Review body" \
  -f "comments[0][path]=file.ts" \
  -f "comments[0][line]=123" \
  -f "comments[0][body]=Comment text"

# Error: "For 'properties/comments', {...} is not an array. (HTTP 422)"
```

`gh api --verbose`로 실제 요청 본문을 보면 이유가 드러나요 (gh 2.97.0 기준):

```json
{
  "body": "Review body",
  "comments": {
    "0": {
      "body": "Comment text",
      "line": "123",
      "path": "file.ts"
    }
  },
  "event": "COMMENT"
}
```

대괄호 안의 숫자는 그냥 또 하나의 중첩 객체 키예요. 그래서 `comments`가
`"0"` 키를 가진 객체가 돼버려요. API는 진짜 JSON 배열을 원해요.

---

## 진짜 배열을 보내는 두 가지 방법

### 1. 숫자 인덱스 대신 빈 대괄호

`gh api` 매뉴얼은 배열 문법을 명시적으로 문서화하고 있어요. "To pass nested
values as arrays, declare multiple fields with the syntax `key[]=value1`,
`key[]=value2`." 매뉴얼의 예제 자체가 `properties[][property_name]=...`로
_객체 배열_ 을 만들고 있고, 여기서도 같은 모양이 통해요. 같은 subkey를
다시 쓰면 새 배열 요소가 시작돼요:

```bash
gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST \
  -f event="COMMENT" \
  -f body="Review body" \
  -F "comments[][path]=src/lib/calendar/normalize-timezone.ts" \
  -F "comments[][line]=244" \
  -F "comments[][side]=RIGHT" \
  -F "comments[][body]=TZID normalization: non-standard values are mapped to IANA identifiers first." \
  -F "comments[][path]=src/lib/calendar/normalize-timezone.ts" \
  -F "comments[][line]=307" \
  -F "comments[][side]=RIGHT" \
  -F "comments[][body]=DST gap detection: the date library silently shifts times that do not exist."
```

여기서 두 가지가 중요해요. `line`에는 `-f`가 아니라 `-F`를 쓰세요. `-f`는
모든 값을 문자열로 보내서 `line`이 `244`가 아니라 `"244"`로 도착해요.
그리고 대괄호는 반드시 비어 있어야 해요 -- `comments[]`이지 `comments[0]`이
아니에요.

저는 매뉴얼의 그 문단을 그냥 지나치고 습관대로 인덱스 형태를 썼어요. 422는
정확했고, 플래그에 대한 제 이해가 틀렸던 거예요.

### 2. Heredoc과 `--input -`

코멘트 본문이 여러 문단짜리 Markdown이 되면 플래그 목록이 길어지고 읽기
어려워져요. 그래서 저는 JSON을 직접 파이프하는 쪽을 계속 쓰고 있어요:

```bash
cat << 'REVIEW_JSON' | gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST --input -
{
  "event": "COMMENT",
  "body": "## Self Review\n\nKey implementation points explained below.",
  "comments": [
    {
      "path": "src/utils/calendar.ts",
      "line": 244,
      "side": "RIGHT",
      "body": "### TZID Normalization\n\nExplanation here..."
    },
    {
      "path": "src/utils/calendar.ts",
      "line": 307,
      "side": "RIGHT",
      "body": "### DST Gap Detection\n\nExplanation here..."
    }
  ]
}
REVIEW_JSON
```

두 방법 모두 같은 페이로드를 만들어요. Heredoc은 스크립트로 생성하기 쉽고
보내기 전에 눈으로 확인하기 좋아요. 짧은 코멘트 한두 개라면 플래그 방식이
더 간결해요. 어느 한쪽이 더 "정답"인 건 아니에요.

작은따옴표로 감싼 heredoc 구분자(`'REVIEW_JSON'`)는 JSON 본문 안의 백틱과
`$variables`에 대한 쉘 확장을 막아줘요. 코멘트 텍스트에 코드 스니펫이 있을
때 필수예요.

---

## 주요 레퍼런스

### 코멘트 구조

| 필드   | 필수   | 설명                                  |
| ------ | ------ | ------------------------------------- |
| `path` | 예     | repo 루트 기준 파일 경로              |
| `body` | 예     | 코멘트 내용 (Markdown 지원)           |
| `line` | 아니오 | 파일 NEW 버전의 라인 번호             |
| `side` | 아니오 | `"RIGHT"` 새 코드, `"LEFT"` 삭제 코드 |

REST 레퍼런스 기준으로 코멘트 하나에 필수인 건 `path`와 `body`뿐이에요.
`line`과 `side`는 선택이고, `side`의 기본값은 `"RIGHT"`예요. 다만 실제로는
`line`(또는 대안인 `position` 필드)이 있어야 코멘트가 diff의 특정 위치에
고정되니 사실상 넣게 돼요. 최상위 `body`는 `event`가 `COMMENT`나
`REQUEST_CHANGES`일 때 필수예요.

### 라인 번호 요구사항

`line`은 PR diff에 나타나는 라인이어야 해요. 이게 가장 흔한 실패 원인이에요.

- `+` 접두사가 있는 라인(추가된 라인)은 `side: "RIGHT"` 사용
- 삭제된 라인(`-` 접두사)은 `side: "LEFT"` 사용
- 컨텍스트 라인(접두사 없음)은 코멘트가 가능할 수도 있고 아닐 수도 있음

유효한 라인 번호를 찾으려면:

```bash
# PR diff를 확인해서 실제로 변경된 라인 확인
gh pr diff {PR_NUMBER} -- {file_path}
```

### JSON 이스케이핑

| 문자     | 이스케이프                   |
| -------- | ---------------------------- |
| 큰따옴표 | `\"`                         |
| 줄바꿈   | `\n`                         |
| 역슬래시 | `\\`                         |
| 탭       | `\t` (피하고, 스페이스 사용) |

### 이벤트 유형

| 이벤트            | 설명                         |
| ----------------- | ---------------------------- |
| `COMMENT`         | 일반 코멘트 (승인 상태 없음) |
| `APPROVE`         | PR 승인                      |
| `REQUEST_CHANGES` | 머지 전 변경 요청            |

`event`를 아예 빼면 나중에 제출할 수 있는 PENDING 리뷰가 만들어져요.

---

## 완전한 작동 예제

```bash
PR_NUMBER=123
OWNER=example-org
REPO=example-repo

cat << 'REVIEW_JSON' | gh api repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews -X POST --input -
{
  "event": "COMMENT",
  "body": "## Self Review\n\nKey implementation points explained below.",
  "comments": [
    {
      "path": "src/lib/calendar/normalize-timezone.ts",
      "line": 244,
      "side": "RIGHT",
      "body": "### TZID Normalization\n\n**Why this implementation:**\n\nConverts non-standard TZID to IANA format."
    },
    {
      "path": "src/lib/calendar/normalize-timezone.ts",
      "line": 307,
      "side": "RIGHT",
      "body": "### DST Gap Detection\n\n**Problem:**\n\nDuring a DST transition the date library adjusts non-existent times."
    }
  ]
}
REVIEW_JSON
```

성공 시 API가 생성된 리뷰 객체를 반환해요:

```json
{
  "id": 1234567890,
  "html_url": "https://github.com/example-org/example-repo/pull/123#pullrequestreview-1234567890",
  "state": "COMMENTED",
  "submitted_at": "2026-01-15T09:00:00Z"
}
```

---

## 실전 팁

`-f`와 `-F` 플래그로도 배열을 만들 수 있어요 -- 다만 대괄호를 비워야
해요(`comments[]`). 숫자 인덱스(`comments[0]`)를 쓰는 순간 배열이 아니라
객체가 돼요. 본문이 길어지면 heredoc이 읽기 편하고요. 다음 주의사항을
기억하세요:

- 코멘트 게시 전에 항상 `gh pr diff`로 라인 번호를 확인하세요
- JSON에 코드가 포함될 때 항상 작은따옴표 heredoc 구분자를 사용하세요
- 정수여야 하는 값(`line`)에는 `-f` 대신 `-F`를 쓰세요
- API rate limit이 적용돼요; 코멘트를 하나의 리뷰 호출로 묶으세요

### 사용하기 좋은 경우

- 자기 PR에 셀프 리뷰 코멘트 자동화
- CI/CD 파이프라인에서 인라인 리뷰 코멘트 게시 (lint, 커버리지, 보안)
- 여러 파일/라인에 한 번의 API 호출로 일괄 코멘트

### 사용하면 안 되는 경우

- **단순한 PR 설명** -- PR 본문이나 단일 최상위 코멘트를 사용하세요
- **diff에 없는 라인** -- API는 diff에 있는 라인만 받아들여요
- **고빈도 자동화** -- GitHub이 API 호출을 rate-limit해요; 매 커밋마다
  게시하면 빠르게 한도에 도달해요
- **다시 작성할 Draft PR** -- 인라인 코멘트는 특정 diff 라인 번호에
  묶여 있어서 force-push하면 참조가 끊긴 상태가 돼요

### 흔한 에러

| 에러                        | 원인                       | 수정                                 |
| --------------------------- | -------------------------- | ------------------------------------ |
| HTTP 422 "not an array"     | `-f comments[0][...]` 사용 | `comments[][...]` 또는 heredoc 사용  |
| HTTP 422 "line not in diff" | 잘못된 라인 번호           | PR diff에서 라인 확인                |
| HTTP 404                    | 잘못된 PR 번호 또는 repo   | PR 존재 여부 확인                    |
| HTTP 403                    | 쓰기 권한 없음             | 권한 확인                            |
